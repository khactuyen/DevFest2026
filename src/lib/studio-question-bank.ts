import type { Material, VisualSpec } from "./contracts";
import { createExamQuestion, type ExamKind } from "./exam-document";
import { uploadStudioSourceImage } from "./studio-source-client";

type Block = Material["blocks"][number];
type Entry = { id: string; question: Block; figures: Block[]; visuals: VisualSpec[]; files: Record<string, Blob> };
const newId = () => crypto.randomUUID().replace(/-/g, "");
const asset = /^\/api\/material-assets\//;

async function transact<T>(scope: string, operation: "list" | "put" | "delete", entry?: Entry, id?: string): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mathcos-question-bank", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("questions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("questions", operation === "list" ? "readonly" : "readwrite");
      const store = tx.objectStore("questions");
      const key = `${scope}:${entry?.id || id || ""}`;
      const result = operation === "put" ? store.put(entry, key) : operation === "delete" ? store.delete(key)
        : store.getAll(IDBKeyRange.bound(`${scope}:`, `${scope}:\uffff`));
      tx.oncomplete = () => resolve(result.result as T);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function listBankQuestions(scope: string) { return transact<Entry[]>(scope, "list"); }
export function deleteBankQuestion(scope: string, id: string) { return transact<void>(scope, "delete", undefined, id); }

export async function saveBankQuestion(scope: string, material: Material, question: Block, figures: Block[]) {
  if (!question.content.trim() || question.examQuestion?.useSourceLayout !== false && question.examQuestion?.sourceImages?.length)
    throw Error("Câu hỏi cần có nội dung chỉnh sửa trước khi đưa vào ngân hàng.");
  const visuals = material.visuals.filter(({ id }) => figures.some((figure) => figure.visualId === id));
  const urls = new Set([
    ...figures.filter(({ authorKind }) => authorKind === "image").map(({ content }) => content),
    ...visuals.flatMap((visual) => visual.boardItems?.flatMap(({ assetUrl }) => assetUrl || []) || []),
  ].filter((url) => asset.test(url)));
  const files: Record<string, Blob> = {};
  for (const url of urls) {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw Error("Không đọc được một ảnh để sao lưu câu hỏi.");
    files[url] = await response.blob();
  }
  const examQuestion = question.examQuestion ? { ...question.examQuestion, sourceImages: undefined, sourceWarnings: undefined,
    reviewFlags: undefined, reviewNote: undefined, matrixId: undefined, shuffleGroup: undefined } : undefined;
  await transact(scope, "put", { id: `${material.id}_${question.id}`, question: { ...question, examQuestion }, figures, visuals, files });
}

export async function copyBankQuestion(entry: Entry, target: Material, stepId?: string, signal?: AbortSignal) {
  const source = entry.question;
  const kind: ExamKind = source.examQuestion?.kind ?? (source.assessment?.type === "multiple" && source.assessment.options?.length === 4 ? "multiple" : "short");
  const examEntry = target.exam ? createExamQuestion(kind, source.content, source.assessment) : undefined;
  const question: Block = examEntry ? {
    ...examEntry.question, examQuestion: { ...examEntry.question.examQuestion!, prompt: source.examQuestion?.prompt, keepOptionOrder: source.examQuestion?.keepOptionOrder },
  } : { ...source, id: `q_${newId()}`, examQuestion: undefined };
  if (target.blocks.length + entry.figures.length + 1 > 100 || target.visuals.length + entry.visuals.length > 30
    || target.exam && target.learningSteps.length >= 50) throw Error("Học liệu không còn đủ chỗ cho câu và hình.");
  if (!examEntry && !target.learningSteps.some(({ id }) => id === stepId)) throw Error("Hãy chọn hoạt động để chèn câu hỏi.");
  const urls = new Map<string, string>();
  for (const [source, blob] of Object.entries(entry.files)) urls.set(source, await uploadStudioSourceImage(target.id, blob, signal));
  signal?.throwIfAborted();
  const visualIds = new Map(entry.visuals.map(({ id }) => [id, `visual_${newId()}`]));
  const visuals = entry.visuals.map((visual): VisualSpec => ({
    ...visual, id: visualIds.get(visual.id)!,
    ...(visual.boardItems ? { boardItems: visual.boardItems.map((item) => item.assetUrl ? { ...item, assetUrl: urls.get(item.assetUrl) || item.assetUrl } : item) } : {}),
  }));
  const figures = entry.figures.map((figure): Block => ({
    ...figure, id: `block_${newId()}`, ...(figure.authorKind === "image" ? { content: urls.get(figure.content) || figure.content } : {}),
    ...(figure.visualId ? { visualId: visualIds.get(figure.visualId) } : {}), examFigure: target.exam ? figure.examFigure : undefined,
  }));
  return { question, figures, visuals, step: examEntry?.step, stepId };
}
