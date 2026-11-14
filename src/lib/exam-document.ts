import { z } from "zod";
import type { Material } from "./contracts";

export const examKinds = ["multiple", "true-false", "short", "written"] as const;
export const maxExamQuestions = 50;
export const examBoardDragType = "application/x-mathcos-exam-board";
export type ExamKind = (typeof examKinds)[number];
export const examLevels = ["Nhận biết", "Thông hiểu", "Vận dụng", "Vận dụng cao"] as const;
export const examReviewFlags = ["Dấu và số liệu", "Công thức", "Phương án / đáp án", "Hình minh họa"] as const;
export const examPartLabels: Record<ExamKind, string> = {
  multiple: "Trắc nghiệm",
  "true-false": "Đúng – Sai",
  short: "Trả lời ngắn",
  written: "Tự luận",
};

export const ExamSettingsSchema = z.object({
  school: z.string().max(160),
  subject: z.string().max(80),
  duration: z.number().int().min(1).max(360),
  code: z.string().max(24),
  font: z.enum(["Times New Roman", "Arial"]),
  fontSize: z.number().int().min(10).max(20),
  difficulty: z.enum(examLevels).optional(),
  matrix: z.array(z.object({
    id: z.string().min(1).max(80), topic: z.string().max(120), level: z.enum(examLevels), kind: z.enum(examKinds),
    count: z.number().int().min(1).max(maxExamQuestions), points: z.number().int().min(1).max(100),
  }).strict()).max(20).optional(),
}).strict();

const TextRunSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(12000),
  marks: z.array(z.enum(["bold", "italic", "underline"])).max(3).optional(),
}).strict();
const FormulaRunSchema = z.object({ type: z.literal("formula"), latex: z.string().min(1).max(2000) }).strict();
export const ExamPromptSchema = z.array(z.array(z.union([TextRunSchema, FormulaRunSchema])).max(150)).min(1).max(30)
  .refine((paragraphs) => paragraphs.flat().reduce((size, run) => size + (run.type === "text" ? run.text.length : run.latex.length), 0) <= 18000);
export type ExamPrompt = z.infer<typeof ExamPromptSchema>;
export const ExamQuestionSchema = z.object({
  kind: z.enum(examKinds),
  origin: z.literal("ai").optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  prompt: ExamPromptSchema.optional(),
  sourceImages: z.array(z.string().regex(/^\/api\/material-assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i)).min(1).max(10).optional(),
  useSourceLayout: z.boolean().optional(),
  reviewFlags: z.array(z.enum(examReviewFlags)).max(4).optional(),
  sourceWarnings: z.array(z.string().max(220)).max(6).optional(),
  reviewNote: z.string().max(500).optional(),
  matrixId: z.string().max(80).optional(),
  shuffleGroup: z.string().trim().max(60).optional(),
  keepOptionOrder: z.boolean().optional(),
}).strict();
export const ExamFigureSchema = z.object({
  width: z.number().int().min(20).max(100),
  align: z.enum(["left", "center", "right"]),
  keepBackground: z.boolean().optional(),
}).strict();

export type ExamSettings = z.infer<typeof ExamSettingsSchema>;
export const defaultExamSettings: ExamSettings = {
  school: "", subject: "Toán", duration: 45, code: "", font: "Times New Roman", fontSize: 12,
};

export function examPromptText(prompt: ExamPrompt) {
  return prompt.map((paragraph) => paragraph.map((run) => run.type === "text" ? run.text : `$${run.latex}$`).join("")).join("\n");
}

export function examHasOptions(kind: ExamKind) {
  return kind === "multiple" || kind === "true-false";
}

export function examSourceFigures(question: Material["blocks"][number]): Material["blocks"] {
  if (question.examQuestion?.useSourceLayout === false) return [];
  return (question.examQuestion?.sourceImages || []).map((content, index) => ({
    id: `${question.id}_pdf_${index}`, type: "paragraph", authorKind: "image", content,
    examFigure: { width: 100, align: "center", keepBackground: true },
  }));
}

export function pdfQuestionFigure(content: string): Material["blocks"][number] {
  return { id: `image_${crypto.randomUUID().replace(/-/g, "")}`, type: "paragraph", authorKind: "image", content,
    examFigure: { width: 65, align: "center", keepBackground: true } };
}

export function editablePdfQuestion(question: Material["blocks"][number], result: { stem: string; options: string[] }) {
  const content = result.stem.replace(/^(?:câu|bài)\s+\d{1,3}\s*[.:)]\s*/iu, "").trim();
  if (!content || !question.examQuestion || !question.assessment) throw Error("Chưa trích xuất được nội dung câu hỏi.");
  return { ...question, content, examQuestion: { ...question.examQuestion, useSourceLayout: false, prompt: undefined },
    assessment: { ...question.assessment, ...(examHasOptions(question.examQuestion.kind) ? { options: result.options } : {}) } };
}

export function createExamQuestion(
  kind: ExamKind,
  content: string,
  answers: Omit<Partial<NonNullable<Material["blocks"][number]["assessment"]>>, "type"> = {},
  origin?: "ai",
) {
  const questionId = `q_${crypto.randomUUID().replace(/-/g, "")}`;
  const question: Material["blocks"][number] = {
    id: questionId, type: "exercise", authorKind: "question", title: examPartLabels[kind], content,
    examQuestion: { kind, columns: kind === "multiple" ? 4 : 1, origin },
    assessment: {
      type: kind === "multiple" ? "multiple" : "short", points: 1,
      ...(examHasOptions(kind) ? { options: ["", "", "", ""] } : {}),
      ...answers,
    },
  };
  const step: Material["learningSteps"][number] = {
    id: `exam_${crypto.randomUUID().replace(/-/g, "")}`, title: examPartLabels[kind],
    description: "", objective: "", estimatedMinutes: 0, phase: "assess",
    blockIds: [questionId], visualActions: [], actionLabels: [],
  };
  return { question, step };
}

export function examQuestions(material: Material) {
  const blocks = new Map(material.blocks.map((block) => [block.id, block]));
  const rows = material.learningSteps.flatMap((step) => {
    const children = step.blockIds.flatMap((id) => {
      const block = blocks.get(id);
      return block ? [block] : [];
    });
    const question = children.find((block) => block.examQuestion);
    return question?.examQuestion ? [{
      step, question, kind: question.examQuestion.kind,
      figures: children.filter((block) => block.type === "visual" || block.authorKind === "image"),
    }] : [];
  });
  return examKinds.flatMap((kind) => rows.filter((row) => row.kind === kind))
    .map((row, index) => ({ ...row, number: index + 1 }));
}

export function parseExamQuestion(input: string) {
  const normalized = input.trim().replace(/^Câu\s*\d+\s*[.:)]\s*/iu, "");
  const markers = [...normalized.matchAll(/(?:^|\s)([A-D])[.)]\s+(?=\S)/g)];
  const choices = markers.length === 4 && markers.map((marker) => marker[1]).join("") === "ABCD"
    ? markers.map((marker, index) => normalized.slice(marker.index! + marker[0].length, markers[index + 1]?.index).trim())
    : [];
  return { prompt: choices.length ? normalized.slice(0, markers[0].index).trim() : normalized, choices };
}

export function examSourceQuestionStarts(source: string) {
  const named = [...source.matchAll(/^[ \t]*(?:Câu|Bài)\s+\d+\s*[.:)]/gim)];
  const matches = named.length ? named : [...source.matchAll(/^[ \t]*\d{1,3}[.)][ \t]+(?=\S)/gm)];
  return matches.map((match) => match.index!);
}
