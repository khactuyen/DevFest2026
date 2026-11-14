import { z } from "zod";

export const HandwritingDraftSchema = z
  .array(
    z
      .object({
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        points: z
          .array(
            z
              .object({
                x: z.number().finite().min(0).max(1120),
                y: z.number().finite().min(0).max(320),
              })
              .strict(),
          )
          .min(1)
          .max(1600),
      })
      .strict(),
  )
  .max(40)
  .superRefine((strokes, ctx) => {
    if (strokes.reduce((n, s) => n + s.points.length, 0) > 6000)
      ctx.addIssue({
        code: "custom",
        message: "Bảng viết vượt 6.000 điểm nét.",
      });
  });
export type HandwritingDraft = z.infer<typeof HandwritingDraftSchema>;
export const HandwritingUndoSchema = z
  .array(HandwritingDraftSchema)
  .max(8)
  .superRefine((history, ctx) => {
    if (
      history.reduce(
        (total, snapshot) =>
          total +
          snapshot.reduce((count, stroke) => count + stroke.points.length, 0),
        0,
      ) > 10_000
    )
      ctx.addIssue({
        code: "custom",
        message: "Lịch sử hoàn tác vượt giới hạn điểm nét.",
      });
  });
