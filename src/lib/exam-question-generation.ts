import { z } from "zod";
import { createExamQuestion, examKinds, examLevels, maxExamQuestions } from "./exam-document";

export const examAiKinds = examKinds;
export const maxExamAiSource = 24_000;
export type ExamAiKind = (typeof examAiKinds)[number];
export type ExamQuestionCounts = Record<ExamAiKind, number>;

export function examQuestionKey(prompt: string) {
  return prompt.normalize("NFC")
    .replace(/^\s*Câu\s*\d+\s*[.:)]\s*/iu, "")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
}

const count = z.number().int().min(0).max(maxExamQuestions);
export const ExamQuestionRequestSchema = z.object({
  mode: z.literal("examQuestions"),
  source: z.string().trim().min(12).max(maxExamAiSource),
  subject: z.string().trim().max(80),
  grade: z.string().trim().max(60),
  counts: z.object({ multiple: count, "true-false": count.default(0), short: count, written: count }).strict(),
  existing: z.array(z.string().trim().max(600)).max(maxExamQuestions),
  exclude: z.array(z.string().trim().min(1).max(600)).max(maxExamQuestions).optional(),
  replacementReferences: z.array(z.object({
    kind: z.enum(examKinds), prompt: z.string().trim().min(1).max(600),
  }).strict()).max(maxExamQuestions).optional(),
  replacementMode: z.enum(["numbers", "equivalent"]).optional(),
  difficulty: z.enum(examLevels).optional(),
  matrixTarget: z.object({ topic: z.string().trim().min(1).max(120), level: z.enum(examLevels) }).strict().optional(),
}).strict().refine(({ counts, existing }) => {
  const total = examAiKinds.reduce((sum, kind) => sum + counts[kind], 0);
  return total >= 1 && existing.length + total <= maxExamQuestions;
}, `Chọn ít nhất một câu và bảo đảm đề có tối đa ${maxExamQuestions} câu.`);

const shared = {
  prompt: z.string().trim().min(5).max(2500)
    .transform((value) => value.replace(/^Câu\s*\d+\s*[.:)]\s*/iu, "").trim())
    .refine((value) => value.length >= 5, "Câu hỏi thiếu nội dung."),
  explanation: z.string().trim().min(1).max(1200),
  points: z.number().int().min(1).max(100),
};
const options = z.array(z.string().trim().min(1).max(400)).length(4)
  .refine((choices) => new Set(choices.map(examQuestionKey)).size === 4, "Các phương án phải khác nhau.");
const answer = z.string().trim().min(1).max(400);

export const ExamQuestionProposalSchema = z.object({
  questions: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("multiple"), ...shared, options, correctIndex: z.number().int().min(0).max(3) }).strict(),
    z.object({ kind: z.literal("true-false"), ...shared, options,
      verdicts: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
    }).strict(),
    z.object({ kind: z.literal("short"), ...shared, answer }).strict(),
    z.object({ kind: z.literal("written"), ...shared, answer }).strict(),
  ])).min(1).max(maxExamQuestions),
}).strict();

export type ProposedExamQuestion = z.infer<typeof ExamQuestionProposalSchema>["questions"][number];

export function examVersionQuestionKey(prompt: string) {
  return examQuestionKey(prompt)
    .replace(/\$|\\[()[\]]|\s+/g, "")
    .replace(/\^\{(\d+)\}/g, "^$1")
    .replace(/²/g, "^2").replace(/³/g, "^3")
    .replace(/[.?!]+$/, "");
}

export function examNumericForm(prompt: string) {
  const values: number[] = [];
  const shape = examVersionQuestionKey(prompt).replace(
    /[\^_](?:\{[^{}]+\}|[+-]?\d+)|\d+(?:[.,]\d+)?/g,
    (token) => {
      if (token[0] === "^" || token[0] === "_") return token;
      values.push(Number(token.replace(",", ".")));
      return "#";
    },
  );
  return { shape, values };
}

export function matchNumericReplacements(original: ProposedExamQuestion[], generated: ProposedExamQuestion[]) {
  const remaining = [...generated];
  const result: ProposedExamQuestion[] = [];
  for (const source of original) {
    const form = examNumericForm(source.prompt);
    const index = remaining.findIndex((candidate) => {
      if (candidate.kind !== source.kind) return false;
      const next = examNumericForm(candidate.prompt);
      return next.shape === form.shape && next.values.some((value, position) => value !== form.values[position]);
    });
    if (index < 0) return undefined;
    result.push(remaining.splice(index, 1)[0]);
  }
  return remaining.length ? undefined : result;
}

export function examQuestionFromProposal(question: ProposedExamQuestion) {
  const answers = question.kind === "multiple" ? { options: question.options, correctIndex: question.correctIndex }
    : question.kind === "true-false" ? { options: question.options, answer: question.verdicts.map((verdict) => verdict ? "Đ" : "S").join(" ") }
    : { answer: question.answer };
  return createExamQuestion(question.kind, question.prompt, { ...answers, points: question.points, explanation: question.explanation }, "ai");
}
