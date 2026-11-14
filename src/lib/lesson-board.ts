import { z } from "zod";
import { GraphInkDraftSchema } from "./graph-ink-draft";

export const LessonBoardSchema = z.object({
  version: z.literal(1),
  options: z.object({
    axes: z.boolean(),
    grid: z.boolean(),
    snap: z.boolean(),
    labels: z.boolean(),
  }).strict(),
  size: z.object({
    width: z.number().finite().positive().max(10000),
    height: z.number().finite().positive().max(10000),
  }).strict().optional(),
  ink: GraphInkDraftSchema.optional(),
  blankView: z.tuple([
    z.number().finite().min(-1e6).max(1e6),
    z.number().finite().min(-1e6).max(1e6),
    z.number().finite().min(-1e6).max(1e6),
    z.number().finite().min(-1e6).max(1e6),
  ]).refine(([left, top, right, bottom]) => left < right && bottom < top).optional(),
}).strict();

export type LessonBoard = z.infer<typeof LessonBoardSchema>;
export const newLessonBoard: LessonBoard = {
  version: 1,
  options: { axes: false, grid: true, snap: false, labels: true },
};

export const lessonBoardTransferKey = "math-studio:lesson-board-transfer";
