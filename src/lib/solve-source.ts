import { z } from "zod";
import { readQuestionParts } from "./solve-question";

export const SourceReviewSchema = z
  .object({
    needsReview: z.boolean().default(false),
    ambiguities: z.array(z.string().max(300)).max(12).default([]),
    confirmed: z.boolean().default(false),
  })
  .strict();
export type SourceReview = z.infer<typeof SourceReviewSchema>;
export function normalizeSolveSource(source: string) {
  // Normalize encoding/spacing only; never repair a mathematical symbol by guessing.
  return source
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
export function unresolvedSourceMarks(source: string) {
  return [
    ...source.matchAll(
      /\[(?:không\s*rõ|không\s*đọc\s*được|mờ|unreadable)[^\]]*\]|\?{2,}|\uFFFD/giu,
    ),
  ].map((match) => ({
    text: match[0],
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}
export function sourceOutline(source: string) {
  const parts = readQuestionParts(normalizeSolveSource(source));
  return { common: parts.stem, items: parts.items };
}
