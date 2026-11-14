import { z } from "zod";
import type { InkStroke } from "./sketch-geometry";

const point = z.object({ x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) }).strict();
const stroke = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), lineStyle: z.enum(["solid", "dashed"]).optional(), points: z.array(point).min(1).max(240) }).strict();
const snapshot = z.array(stroke).max(30);
export const GraphInkDraftSchema = z.object({
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  strokes: snapshot,
  selection: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative(), height: z.number().nonnegative() }).strict().nullable(),
  past: z.array(snapshot).max(6),
  future: z.array(snapshot).max(6),
}).strict().superRefine((draft, context) => {
  const count = [draft.strokes, ...draft.past, ...draft.future].reduce((sum, state) =>
    sum + state.reduce((points, item) => points + item.points.length, 0), 0);
  if (count > 18000) context.addIssue({ code: "custom", message: "Lịch sử nét vẽ vượt giới hạn lưu trữ." });
});
export type GraphInkDraft = z.infer<typeof GraphInkDraftSchema>;

export function compactInkStrokes(strokes: InkStroke[]): InkStroke[] {
  return strokes.slice(0, 30).map((item) => {
    const step = Math.max(1, Math.ceil(item.points.length / 239));
    const points = item.points.filter((_, index) => index % step === 0).slice(0, 239);
    const last = item.points.at(-1);
    if (last && points.at(-1) !== last) points.push(last);
    return { color: item.color, lineStyle: item.lineStyle, points };
  });
}

export function resizeInkDraft(draft: GraphInkDraft, width: number, height: number): GraphInkDraft {
  const sx = width / draft.width, sy = height / draft.height;
  const resize = (states: InkStroke[]) => states.map((item) => ({ ...item,
    points: item.points.map((p) => ({ x: p.x * sx, y: p.y * sy })),
  }));
  return GraphInkDraftSchema.parse({ ...draft, width, height,
    strokes: resize(draft.strokes), past: draft.past.map(resize), future: draft.future.map(resize),
    selection: draft.selection && { x: draft.selection.x * sx, y: draft.selection.y * sy,
      width: draft.selection.width * sx, height: draft.selection.height * sy },
  });
}
