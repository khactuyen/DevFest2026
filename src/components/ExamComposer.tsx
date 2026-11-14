"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImagePlus, PenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import { request } from "@/lib/client";
import { VisualSpecSchema, type Material, type VisualSpec } from "@/lib/contracts";
import { createExamQuestion, examBoardDragType, examHasOptions, examKinds, examPartLabels, examPromptText, examQuestions, examSourceFigures, maxExamQuestions, parseExamQuestion, type ExamKind, type ExamSettings } from "@/lib/exam-document";
import { examQuestionFromProposal, examQuestionKey } from "@/lib/exam-question-generation";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import { extractEditablePdfQuestion } from "@/lib/studio-source-client";
import { ExamFigure, type ExamBlock } from "./ExamSheet";
import { ExamPromptDisplay, ExamPromptEditor } from "./ExamPromptEditor";
import { ExamQuestionAssistant } from "./ExamQuestionAssistant";
import { ExamPdfReview } from "./ExamPdfReview";
import { ExamMatrix, type MatrixProposal } from "./ExamMatrix";
import { ExamCodeGenerator } from "./ExamCodeGenerator";

type Update = (material: Material) => Material;

async function readPdfQuestionForDrawing(images: ExamBlock[], signal: AbortSignal): Promise<{ prompt: string; warning?: string }> {
  const descriptions: string[] = [];
  const warnings: string[] = [];
  for (const image of images) {
    const response = await fetch(image.content, { signal, credentials: "same-origin" });
    if (!response.ok) throw Error("Không mở được ảnh câu hỏi từ PDF. Hãy thử lại hoặc soạn lại câu dưới dạng văn bản.");
    const blob = await response.blob();
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("Không đọc được ảnh câu hỏi."));
      reader.readAsDataURL(blob);
    });
    signal.throwIfAborted();
    const read = await request<ProblemRecognition>("/api/problem-recognition", {
      method: "POST", signal, body: JSON.stringify({ mode: "photo", imageDataUrl,
        prompt: "Chép nguyên phần dữ kiện và yêu cầu của câu, kể cả phần tiếp trang. Bỏ các phương án trả lời. Giữ đúng tên đỉnh, dấu phẩy trên, số đo và ký hiệu mặt phẳng. Nếu có hình gốc, mô tả các nhãn và quan hệ nhìn rõ." }),
    });
    warnings.push(...read.ambiguities);
    if (read.transcription && !/^không thấy chữ/iu.test(read.transcription)) descriptions.push(read.transcription);
    if (read.containsDiagram && read.figureDescription) descriptions.push(`Hình trong đề: ${read.figureDescription}`);
  }
  const prompt = descriptions.join("\n").trim();
  if (!prompt || prompt.length > 20_000) throw Error("Chưa đọc được phần đề phù hợp để dựng hình. Hãy soạn lại câu dưới dạng văn bản.");
  return { prompt, warning: warnings[0] };
}

export function ExamComposer({
  material, onChange, activeBlockId, onSelect, onBoard, onDrawBoard, onDropBoard, boardPanel, pendingTransfer, onImage, onPdfExtracted, initialAiOpen, sourceReview, questionBank, onCodeSaved,
}: {
  material: Material;
  onChange: (change: Update) => void;
  activeBlockId: string;
  onSelect: (stepId: string, blockId: string) => void;
  onBoard: (stepId: string, block?: ExamBlock, useTransfer?: boolean) => void;
  onDrawBoard: (stepId: string, question: ExamBlock, visual: VisualSpec, note: string) => boolean;
  onDropBoard: (stepId: string) => void;
  boardPanel?: ReactNode;
  pendingTransfer?: boolean;
  onImage: (stepId: string, file: File, replaceId?: string) => Promise<boolean>;
  onPdfExtracted: (stepId: string, question: ExamBlock, result: Awaited<ReturnType<typeof extractEditablePdfQuestion>>, signal: AbortSignal) => Promise<void>;
  initialAiOpen?: boolean;
  sourceReview?: ReactNode;
  questionBank?: ReactNode;
  onCodeSaved: (draft: Material) => void;
}) {
  const [quick, setQuick] = useState("");
  const [kind, setKind] = useState<ExamKind>("multiple");
  const [uploading, setUploading] = useState("");
  const [over, setOver] = useState("");
  const [drawingStep, setDrawingStep] = useState("");
  const [readingPdf, setReadingPdf] = useState(false);
  const [drawError, setDrawError] = useState<{ stepId: string; message: string; useSource?: boolean }>();
  const pendingDraw = useRef<AbortController | null>(null);
  const pendingExtraction = useRef<AbortController | null>(null);
  const [extracting, setExtracting] = useState("");
  const [shownPdfSource, setShownPdfSource] = useState("");
  const [extractedEditor, setExtractedEditor] = useState({ id: "", revision: 0 });
  const [extractError, setExtractError] = useState<{ id: string; message: string }>();
  const boardUnavailable = !!boardPanel || !!drawingStep || !!extracting;
  const rows = examQuestions(material);
  const remaining = Math.min(maxExamQuestions - material.learningSteps.length, 100 - material.blocks.length);
  const exam = material.exam!;

  useEffect(() => () => { pendingDraw.current?.abort(); pendingExtraction.current?.abort(); }, []);

  async function extractQuestion(stepId: string, question: ExamBlock) {
    if (pendingExtraction.current || !question.examQuestion?.sourceImages?.length) return;
    const controller = new AbortController();
    pendingExtraction.current = controller;
    setExtracting(question.id);
    setExtractError(undefined);
    try {
      const images = await Promise.all(question.examQuestion.sourceImages.map(async (url) => {
        const response = await fetch(url, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw Error("Không mở được ảnh câu hỏi gốc.");
        return response.blob();
      }));
      const result = await extractEditablePdfQuestion(images, question.examQuestion.kind, controller.signal);
      await onPdfExtracted(stepId, question, result, controller.signal);
      if (!controller.signal.aborted) {
        setExtractedEditor((current) => ({ id: question.id, revision: current.revision + 1 }));
        onSelect(stepId, question.id);
      }
    } catch (error) {
      if (!controller.signal.aborted) setExtractError({ id: question.id, message: error instanceof Error ? error.message : "Chưa trích xuất được nội dung câu." });
    } finally {
      if (pendingExtraction.current === controller) { pendingExtraction.current = null; setExtracting(""); }
    }
  }

  function cancelDrawing() {
    pendingDraw.current?.abort();
    pendingDraw.current = null;
    setDrawingStep("");
    setReadingPdf(false);
  }

  async function drawFromQuestion(stepId: string, question: ExamBlock) {
    const images = examSourceFigures(question);
    if (boardPanel || pendingDraw.current || (!images.length && !question.content.trim())) return;
    const controller = new AbortController();
    pendingDraw.current = controller;
    setDrawingStep(stepId);
    setDrawError(undefined);
    try {
      setReadingPdf(images.length > 0);
      const source: { prompt: string; warning?: string } = images.length
        ? await readPdfQuestionForDrawing(images, controller.signal) : { prompt: question.content.trim() };
      controller.signal.throwIfAborted();
      setReadingPdf(false);
      const result = await request<{ visual: unknown; note: string }>("/api/studio-generate", {
        method: "POST", signal: controller.signal, body: JSON.stringify({ mode: "examFigure", prompt: source.prompt }),
      });
      if (controller.signal.aborted) return;
      const visual = VisualSpecSchema.safeParse(result.visual);
      if (!visual.success || typeof result.note !== "string") throw Error("Hình trả về chưa hợp lệ. Hãy thử lại hoặc tự vẽ.");
      const note = source.warning ? `${result.note} Phần đọc từ ảnh cần đối chiếu: ${source.warning}` : result.note;
      if (!onDrawBoard(stepId, question, visual.data, note)) {
        throw Error("Nội dung câu đã thay đổi. Hãy bấm AI vẽ từ đề để dựng lại.");
      }
    } catch (reason) {
      if (!controller.signal.aborted) setDrawError({ stepId,
        message: reason instanceof Error ? reason.message : "Chưa dựng được hình. Hãy thử lại hoặc tự vẽ.",
        useSource: (reason as { code?: string } | null)?.code === "needs_source_figure",
      });
    } finally {
      if (pendingDraw.current === controller) {
        pendingDraw.current = null;
        setDrawingStep("");
        setReadingPdf(false);
      }
    }
  }
  function changeExam(patch: Partial<ExamSettings>) {
    onChange((source) => ({ ...source, exam: { ...source.exam!, ...patch } }));
  }
  function insertQuestions(items: MatrixProposal[], replaceId?: string) {
    const added = items.map(({ question, matrixId }) => {
      const entry = examQuestionFromProposal(question);
      if (matrixId) entry.question.examQuestion!.matrixId = matrixId;
      return entry;
    });
    if (!added.length) return;
    let selectedStep = added[0].step.id;
    onChange((source) => {
      if (source.id !== material.id || source.status !== "draft" || !source.exam) throw Error("Đề đang mở đã thay đổi.");
      const currentRows = examQuestions(source);
      const replacement = replaceId ? currentRows.find(({ question }) => question.id === replaceId) : undefined;
      if (replaceId && (!replacement || added.length !== 1 || replacement.question.examQuestion?.sourceImages?.length
        || replacement.kind !== added[0].question.examQuestion?.kind)) throw Error("Câu cần tạo lại đã thay đổi.");
      const delta = added.length - (replacement ? 1 : 0);
      if (source.learningSteps.length + delta > maxExamQuestions || source.blocks.length + delta > 100) throw Error("Đề không còn đủ chỗ.");
      const seen = new Set(currentRows.map(({ question }) => examQuestionKey(question.content)));
      for (const { question } of added) {
        const key = examQuestionKey(question.content);
        if (seen.has(key)) throw Error("Có câu trùng với đề đang soạn.");
        const matrixId = question.examQuestion?.matrixId;
        if (matrixId && !source.exam.matrix?.some((row) => row.id === matrixId && row.kind === question.examQuestion?.kind))
          throw Error("Ô ma trận đã thay đổi.");
        seen.add(key);
      }
      if (replacement) {
        const next = added[0].question;
        const { shuffleGroup, keepOptionOrder } = replacement.question.examQuestion!;
        next.examQuestion = { ...next.examQuestion!, shuffleGroup, keepOptionOrder };
        selectedStep = replacement.step.id;
        const removed = new Set(replacement.step.blockIds.filter((id) => id !== replaceId));
        const blocks = source.blocks.filter((block) => !removed.has(block.id)).map((block) => block.id === replaceId ? next : block);
        const steps = source.learningSteps.map((step) => step.id === selectedStep
          ? { ...step, blockIds: [next.id], visualId: undefined, visualActions: [], actionLabels: [] } : step);
        const formerVisuals = new Set(replacement.figures.map(({ visualId }) => visualId).filter(Boolean));
        return { ...source, blocks, learningSteps: steps,
          visuals: source.visuals.filter((visual) => !formerVisuals.has(visual.id) || blocks.some(({ visualId }) => visualId === visual.id) || steps.some(({ visualId }) => visualId === visual.id)) };
      }
      return { ...source, blocks: [...source.blocks, ...added.map(({ question }) => question)],
        learningSteps: [...source.learningSteps, ...added.map(({ step }) => step)] };
    });
    onSelect(selectedStep, added[0].question.id);
  }
  function patchBlock(blockId: string, patch: Partial<ExamBlock>) {
    onChange((source) => ({ ...source, blocks: source.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block) }));
  }
  function addQuestion(questionKind: ExamKind, raw = "") {
    if (remaining <= 0) return;
    const parsed = parseExamQuestion(raw);
    const content = (questionKind === "multiple" ? parsed.prompt : raw.trim().replace(/^Câu\s*\d+\s*[.:)]\s*/iu, "")).slice(0, 18000);
    const { question, step } = createExamQuestion(questionKind, content,
      questionKind === "multiple" && parsed.choices.length ? { options: parsed.choices.map((choice) => choice.slice(0, 400)) } : {});
    onChange((source) => ({
      ...source,
      blocks: [...source.blocks, question],
      learningSteps: [...source.learningSteps, step],
    }));
    onSelect(step.id, question.id);
    setQuick("");
  }
  function moveQuestion(stepId: string, direction: -1 | 1) {
    const row = rows.find((item) => item.step.id === stepId);
    if (!row) return;
    const group = rows.filter((item) => item.kind === row.kind);
    const target = group[group.indexOf(row) + direction];
    if (!target) return;
    onChange((source) => {
      const learningSteps = [...source.learningSteps];
      const a = learningSteps.findIndex((item) => item.id === stepId);
      const b = learningSteps.findIndex((item) => item.id === target.step.id);
      if (a < 0 || b < 0) return source;
      [learningSteps[a], learningSteps[b]] = [learningSteps[b], learningSteps[a]];
      return { ...source, learningSteps };
    });
  }
  function removeQuestion(stepId: string, blockId?: string) {
    if (!window.confirm(blockId ? "Xóa hình minh họa này?" : "Xóa câu hỏi cùng các hình minh họa?")) return;
    if (!blockId && drawingStep === stepId) cancelDrawing();
    onChange((source) => {
      const step = source.learningSteps.find((item) => item.id === stepId);
      if (!step) return source;
      const removed = new Set(blockId ? [blockId] : step.blockIds);
      const blocks = source.blocks.filter((block) => !removed.has(block.id));
      const visuals = new Set(blocks.map((block) => block.visualId));
      return {
        ...source, blocks, visuals: source.visuals.filter((visual) => visuals.has(visual.id)),
        learningSteps: blockId ? source.learningSteps.map((item) => item.id !== stepId ? item : {
          ...item, blockIds: item.blockIds.filter((value) => value !== blockId),
          visualId: item.visualId && visuals.has(item.visualId) ? item.visualId : undefined,
          visualActions: [], actionLabels: [],
        }) : source.learningSteps.filter((item) => item.id !== stepId),
      };
    });
  }

  return <div className={`exam-composer${boardPanel ? " exam-split" : ""}`}>
    <div className="exam-compose-main">
      <div className="exam-document-tools">
        <strong>Soạn đề thi</strong>
        <label>Phông chữ<select value={exam.font} onChange={(event) => changeExam({ font: event.target.value as ExamSettings["font"] })}>
          <option>Times New Roman</option><option>Arial</option>
        </select></label>
        <label>Cỡ chữ<select value={exam.fontSize} onChange={(event) => changeExam({ fontSize: Number(event.target.value) })}>
          {[10, 11, 12, 13, 14, 16, 18, 20].map((size) => <option key={size}>{size}</option>)}
        </select></label>
      <ExamQuestionAssistant subject={exam.subject} grade={material.metadata.grade} initialOpen={initialAiOpen}
        existing={rows.map(({ question }) => question.content.slice(0, 600))}
        remaining={remaining} disabled={!!boardPanel}
        onInsert={(questions) => insertQuestions(questions.map((question) => ({ question, matrixId: "" })))} />
      </div>
      <ExamMatrix material={material} remaining={remaining} disabled={!!boardPanel} onChange={(matrix) => changeExam({ matrix })} onInsert={insertQuestions} />
      {exam.difficulty && <p className="exam-code-level">Mức độ khi soạn · {exam.difficulty}</p>}
      <ExamCodeGenerator material={material} disabled={!!boardPanel || material.status !== "draft"} onSaved={onCodeSaved} />
      {questionBank}
      {sourceReview && <div className="exam-source-review">{sourceReview}</div>}
      <article className="exam-paper exam-paper-edit" style={{ fontFamily: exam.font, fontSize: `${exam.fontSize}pt` }}>
        <header className="exam-paper-header">
          <div><label>Tên trường<input value={exam.school} onChange={(event) => changeExam({ school: event.target.value })} maxLength={160} placeholder="TRƯỜNG …" /></label>
            <label>Mã đề<input value={exam.code} onChange={(event) => changeExam({ code: event.target.value })} maxLength={24} /></label></div>
          <div><label>Tiêu đề đề thi<input value={material.title} onChange={(event) => onChange((source) => ({ ...source, title: event.target.value || "Đề kiểm tra" }))} maxLength={200} /></label>
            <div className="exam-header-fields">
              <label>Môn<input value={exam.subject} onChange={(event) => changeExam({ subject: event.target.value })} maxLength={80} /></label>
              <label>Lớp<input value={material.metadata.grade} onChange={(event) => onChange((source) => ({ ...source, metadata: { ...source.metadata, grade: event.target.value } }))} maxLength={60} /></label>
              <label>Phút<input type="number" min={1} max={360} value={exam.duration} onChange={(event) => changeExam({ duration: Math.max(1, Math.min(360, Math.trunc(Number(event.target.value) || 1))) })} /></label>
            </div></div>
          <p>Họ và tên ........................................................ Lớp ............... Số báo danh ...............</p>
        </header>
        {examKinds.map((section) => {
          const group = rows.filter((row) => row.kind === section);
          return <section key={section} className="exam-part">
            <h2>{examPartLabels[section]}</h2>
            {group.map(({ number, step, question, figures }, index) => {
              const assessment = question.assessment!;
              const config = question.examQuestion!;
              const sourceFigures = examSourceFigures(question);
              const sourceLayout = sourceFigures.length > 0;
              const needsExtraction = !!config.sourceImages?.length && (sourceLayout || !question.content.trim());
              const edit = activeBlockId === question.id;
              const select = () => onSelect(step.id, question.id);
              const updateAnswer = (patch: Partial<typeof assessment>) => patchBlock(question.id, { assessment: { ...assessment, ...patch } });
              return <section id={`gs-block-${question.id}`} key={question.id} className={`exam-edit-question${edit ? " is-active" : ""}${over === step.id ? " is-drop-target" : ""}`}
                tabIndex={-1}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(examBoardDragType)) {
                    event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setOver(step.id);
                  }
                }}
                onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(""); }}
                onDrop={(event) => {
                  if (!event.dataTransfer.types.includes(examBoardDragType)) return;
                  event.preventDefault(); setOver(""); onDropBoard(step.id);
                }}>
                <div className="exam-question-bar">
                  <button type="button" onClick={select}><strong>Câu {number}.</strong></button>
                  {config.origin === "ai" && <small className="exam-ai-label">AI đề xuất</small>}
                  <div>
                    <button type="button" title="Đưa câu lên" aria-label={`Đưa câu ${number} lên`} disabled={!index || !!boardPanel} onClick={() => moveQuestion(step.id, -1)}><ArrowUp size={14} /></button>
                    <button type="button" title="Đưa câu xuống" aria-label={`Đưa câu ${number} xuống`} disabled={index === group.length - 1 || !!boardPanel} onClick={() => moveQuestion(step.id, 1)}><ArrowDown size={14} /></button>
                    <button type="button" title="Xóa câu" aria-label={`Xóa câu ${number}`} disabled={!!boardPanel} onClick={() => removeQuestion(step.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                {!!exam.matrix?.length && <label className="exam-question-matrix">Ô ma trận
                  <select aria-label={`Ô ma trận câu ${number}`} value={exam.matrix.some((row) => row.id === config.matrixId) ? config.matrixId : ""}
                    onChange={(event) => patchBlock(question.id, { examQuestion: { ...config, matrixId: event.target.value || undefined } })}>
                    <option value="">Chưa gán</option>
                    {exam.matrix.filter((row) => row.kind === section).map((row) => <option key={row.id} value={row.id}>{row.topic || "Chưa đặt chủ đề"} · {row.level}</option>)}
                  </select>
                </label>}
                {edit && <details className="exam-shuffle-settings"><summary>Thiết lập mã đề</summary>
                  <label>Nhóm câu dùng chung dữ kiện<input maxLength={60} value={config.shuffleGroup || ""}
                    placeholder="Nhập cùng tên nhóm cho các câu liên quan"
                    onChange={(event) => patchBlock(question.id, { examQuestion: { ...config, shuffleGroup: event.target.value } })} /></label>
                  {section === "multiple" && <label><input type="checkbox" checked={config.keepOptionOrder ?? false}
                    onChange={(event) => patchBlock(question.id, { examQuestion: { ...config, keepOptionOrder: event.target.checked } })} /> Giữ thứ tự phương án</label>}
                </details>}
                {needsExtraction && <div className="exam-inline-tools exam-source-layout-note">
                  <span>Chưa có nội dung chỉnh sửa</span>
                  <button type="button" disabled={!!extracting || !!boardPanel} onClick={() => void extractQuestion(step.id, question)}>
                    <Sparkles size={14} /> {extracting === question.id ? "Đang trích xuất…" : "Trích xuất nội dung"}
                  </button>
                  {sourceLayout && <button type="button" disabled={!!extracting || !!boardPanel} onClick={() => {
                    patchBlock(question.id, { content: /^Câu \d+ trong PDF gốc$/.test(question.content) ? "" : question.content,
                      examQuestion: { ...config, useSourceLayout: false } });
                    select();
                  }}>Nhập thủ công</button>}
                </div>}
                {extractError?.id === question.id && <p className="exam-ai-error" role="alert">{extractError.message}</p>}
                {!sourceLayout && !!config.sourceImages?.length && <div className="exam-source-compare">
                  <button type="button" aria-expanded={shownPdfSource === question.id} onClick={() => setShownPdfSource(shownPdfSource === question.id ? "" : question.id)}>Đối chiếu ảnh câu gốc</button>
                  {!!config.reviewFlags?.length && <small> Cần rà soát {config.reviewFlags.length} mục</small>}
                  {shownPdfSource === question.id && <ExamPdfReview key={question.id} question={question} figures={figures}
                    onFlags={(reviewFlags) => patchBlock(question.id, { examQuestion: { ...config, reviewFlags } })}
                    onNote={(reviewNote) => patchBlock(question.id, { examQuestion: { ...config, reviewNote } })}
                    onCrop={(file, replaceId) => onImage(step.id, file, replaceId)} />}
                </div>}
                {sourceLayout ? sourceFigures.map((figure) => <ExamFigure key={figure.id} material={material} block={figure} />)
                  : edit ? <ExamPromptEditor key={extractedEditor.id === question.id ? `${question.id}:${extractedEditor.revision}` : question.id} prompt={config.prompt} content={question.content} label={`Nội dung câu ${number}`}
                  onChange={(prompt) => patchBlock(question.id, { content: examPromptText(prompt), examQuestion: { ...config, prompt } })} />
                  : <div className="exam-inactive-prompt" onClick={select}>
                    <ExamPromptDisplay prompt={config.prompt} content={question.content || "Bấm Câu để nhập nội dung"} />
                  </div>}
                {figures.map((figure) => <div className="exam-edit-figure" key={figure.id}>
                  <ExamFigure material={material} block={figure} />
                  <div className="exam-inline-tools">
                    <label>Cỡ hình <input type="range" min={20} max={100} value={figure.examFigure?.width || 65}
                      onChange={(event) => patchBlock(figure.id, { examFigure: { align: "center", ...figure.examFigure, width: Number(event.target.value) } })} /></label>
                    <label>Căn hình<select value={figure.examFigure?.align || "center"} onChange={(event) => patchBlock(figure.id, { examFigure: { width: 65, ...figure.examFigure, align: event.target.value as "left" | "center" | "right" } })}>
                      <option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option>
                    </select></label>
                    <label><input type="checkbox" checked={figure.examFigure?.keepBackground ?? false}
                      onChange={(event) => patchBlock(figure.id, { examFigure: { width: 65, align: "center", ...figure.examFigure, keepBackground: event.target.checked } })} />
                      {figure.type === "visual" ? "Giữ nền bảng" : "Giữ nền ảnh"}</label>
                    {figure.type === "visual" && <button type="button" disabled={boardUnavailable} onClick={() => onBoard(step.id, figure)}>Sửa trên bảng</button>}
                    <button type="button" disabled={!!boardPanel} onClick={() => removeQuestion(step.id, figure.id)}>Xóa hình</button>
                  </div>
                </div>)}
                <div className="exam-inline-tools">
                  <button type="button" disabled={boardUnavailable} onClick={() => onBoard(step.id)}><PenLine size={14} /> Vẽ hình cho câu {number}</button>
                  <button type="button" className="exam-ai-draw" disabled={boardUnavailable || (!sourceLayout && !question.content.trim())}
                    title={boardPanel ? "Chèn hình đang vẽ hoặc đóng bảng để dùng AI" : sourceLayout ? "Đọc ảnh của câu trong PDF rồi dựng hình" : "Dựng hình từ nội dung câu hỏi"}
                    aria-label={`AI vẽ từ đề câu ${number}`}
                    onClick={() => void drawFromQuestion(step.id, question)}><Sparkles size={14} /> AI vẽ từ đề</button>
                  {drawingStep === step.id && <>
                    <span role="status">{readingPdf ? "AI đang đọc câu từ PDF…" : "Đang dựng hình…"}</span>
                    <button type="button" onClick={cancelDrawing}>Hủy dựng hình</button>
                  </>}
                  {pendingTransfer && <button type="button" disabled={boardUnavailable} onClick={() => onBoard(step.id, undefined, true)}>Nhập hình từ Khám phá</button>}
                  <label className="exam-upload"><ImagePlus size={14} /> {uploading === step.id ? "Đang tải ảnh…" : "Thêm ảnh"}
                    <input type="file" aria-label={`Thêm ảnh câu ${number}`} accept="image/png,image/jpeg,image/webp" disabled={!!uploading || !!boardPanel} onChange={(event) => {
                      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
                      if (!file) return;
                      setUploading(step.id);
                      void onImage(step.id, file).finally(() => setUploading(""));
                    }} />
                  </label>
                  {boardPanel && <small>Thả hình vào vùng câu này</small>}
                </div>
                {drawError?.stepId === step.id && <p className={drawError.useSource ? "exam-figure-review" : "exam-ai-error"}
                  role={drawError.useSource ? "status" : "alert"}>{drawError.message}</p>}
                {examHasOptions(section) && <>
                  {!sourceLayout && <div className="exam-inline-tools"><label>Bố cục phương án<select value={config.columns} onChange={(event) => patchBlock(question.id, { examQuestion: { ...config, columns: Number(event.target.value) as 1 | 2 | 4 } })}>
                    <option value={4}>Một hàng · 4 cột</option><option value={2}>Hai hàng · 2 cột</option><option value={1}>Bốn hàng · 1 cột</option>
                  </select></label></div>}
                  <div className="exam-edit-options" style={{ "--exam-columns": config.columns } as React.CSSProperties}>
                    {(assessment.options || []).map((value, option) => <div key={option}>
                      {section === "multiple" ? <button type="button" aria-label={`Chọn đáp án ${"ABCD"[option]} cho câu ${number}`}
                        aria-pressed={assessment.correctIndex === option} onClick={() => updateAnswer({ correctIndex: option })}>{"ABCD"[option]}.</button> : <strong>{"abcd"[option]})</strong>}
                      {!sourceLayout && <textarea rows={1} aria-label={`Phương án ${option + 1} câu ${number}`} maxLength={400} value={value}
                        onChange={(event) => updateAnswer({ options: assessment.options!.map((item, i) => i === option ? event.target.value : item) })} />}
                      {section === "true-false" && <select aria-label={`Kết luận ý ${"abcd"[option]} câu ${number}`} value={assessment.answer?.split(" ")[option] || "?"}
                        onChange={(event) => updateAnswer({ answer: Array.from({ length: 4 }, (_, i) => i === option ? event.target.value : assessment.answer?.split(" ")[i] || "?").join(" ") })}>
                        <option value="?">Chưa chọn</option><option value="Đ">Đúng</option><option value="S">Sai</option>
                      </select>}
                    </div>)}
                  </div>
                </>}
                <details className="exam-answer-editor" open>
                  <summary>Đáp án và lời giải của giáo viên</summary>
                  {section === "multiple" && <p>{assessment.correctIndex === undefined ? "Chưa chọn đáp án. Chọn chữ A, B, C hoặc D ở phương án đúng." : `Đáp án đã chọn: ${"ABCD"[assessment.correctIndex]}`}</p>}
                  {section === "true-false" && <p>Chọn Đúng hoặc Sai cho từng ý ở phía trên.</p>}
                  {!examHasOptions(section) && <>
                    <label>Điểm<input type="number" min={0} max={100} value={assessment.points} onChange={(event) => updateAnswer({ points: Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))) })} /></label>
                    <label>Đáp án tham khảo<textarea value={assessment.answer || ""} maxLength={400} onChange={(event) => updateAnswer({ answer: event.target.value })} /></label>
                  </>}
                  <label>Lời giải<textarea value={assessment.explanation || ""} maxLength={1200} onChange={(event) => updateAnswer({ explanation: event.target.value })} /></label>
                </details>
              </section>;
            })}
            <button type="button" className="exam-add-question" disabled={remaining <= 0} onClick={() => addQuestion(section)}><Plus size={14} /> Thêm câu {examPartLabels[section].toLowerCase()}</button>
          </section>;
        })}
      </article>
      <form className="exam-quick-add" onSubmit={(event) => { event.preventDefault(); if (quick.trim()) addQuestion(kind, quick); }}>
        <label>Nhập nhanh một câu<textarea rows={2} maxLength={20000} value={quick} onChange={(event) => {
          const value = event.target.value;
          if (/^\s*Câu\s*\d+[.:)]\s*$/iu.test(value) && remaining > 0) addQuestion(kind);
          else setQuick(value);
        }}
          placeholder="Câu 1. Tính 2 + 2. A. 2 B. 3 C. 4 D. 5" /></label>
        <label>Loại câu<select value={kind} onChange={(event) => setKind(event.target.value as ExamKind)}>{examKinds.map((item) => <option key={item} value={item}>{examPartLabels[item]}</option>)}</select></label>
        <button type="submit" disabled={!quick.trim() || remaining <= 0}>Thêm vào đề</button>
      </form>
    </div>
    {boardPanel && <aside className="exam-board-panel" aria-label="Bảng vẽ của đề">{boardPanel}</aside>}
  </div>;
}
