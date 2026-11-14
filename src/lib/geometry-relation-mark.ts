import type { TwoDVisualSpec } from "./contracts";

export type MarkPoint = { x: number; y: number };
export type RelationMarkKind = "equal-length" | "equal-angle" | "right-angle";
type Stroke = MarkPoint[];
export function nextRelationMarkCount(objects: Array<{ markKind?: RelationMarkKind; markCount?: number }>, kind: RelationMarkKind): number {
  if (kind === "right-angle") return 1;
  const used = new Set(objects.filter(o => o.markKind === kind).map(o => o.markCount || 1));
  for (let n = 1; n <= 8; n++) if (!used.has(n)) return n;
  throw Error("Bảng đã có 8 nhóm ký hiệu cùng loại. Xóa bớt nhóm trước khi thêm để tránh ký hiệu trùng gây hiểu nhầm.");
}
export function relationMarkSourcesVisible(spec: TwoDVisualSpec, mark: TwoDVisualSpec["objects"][number]): boolean {
  const count = mark.markKind === "equal-length" ? 4 : mark.markKind === "equal-angle" ? 6 : 3;
  return mark.parents.slice(count).every(id => {
    const source = spec.objects.find(o => o.id === id); if (!source) return false;
    if (["point", "midpoint", "projection", "intersection", "glider"].includes(source.type)) return true;
    if (!source.visible || source.strokeOpacity === 0) return false;
    if (source.type === "polygon" && mark.markKind === "equal-length") {
      for (const [a, b] of [[mark.parents[0], mark.parents[1]], [mark.parents[2], mark.parents[3]]]) {
        const index = source.parents.findIndex((id, i) => id === a && source.parents[(i + 1) % source.parents.length] === b || id === b && source.parents[(i + 1) % source.parents.length] === a);
        if (index >= 0 && source.edgeStyles?.some(s => s.edgeIndex === index && s.hidden)) return false;
      }
    }
    return true;
  });
}
const distance = (a: MarkPoint, b: MarkPoint) => Math.hypot(a.x - b.x, a.y - b.y);
function angle(p: MarkPoint[]) {
  const [a, o, b] = p, u = { x: a.x - o.x, y: a.y - o.y }, v = { x: b.x - o.x, y: b.y - o.y };
  const n = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  return n > 1e-16 ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / n))) : NaN;
}
/** Observational annotations: never a constraint or a mathematical proof. */
export function relationMarkGeometry(kind: RelationMarkKind, p: MarkPoint[], size = .15, count = 1): { valid: boolean; reason: string; strokes: Stroke[] } {
  // Automatic altitude marks carry the other endpoint of the base as a fallback.
  if (kind === "right-angle" && p[3] && distance(p[0], p[1]) < 1e-8 && Number.isFinite(p[3].x) && Number.isFinite(p[3].y)) p = [p[3], p[1], p[2]];
  const needed = kind === "equal-length" ? 4 : kind === "equal-angle" ? 6 : 3;
  const fail = (reason: string) => ({ valid: false, reason, strokes: [] as Stroke[] });
  if (p.length < needed || p.slice(0, needed).some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return fail("Dữ liệu nguồn chưa xác định.");
  const strokes: Stroke[] = [];
  if (kind === "equal-length") {
    const a = distance(p[0], p[1]), b = distance(p[2], p[3]);
    if (Math.min(a, b) < 1e-8) return fail("Cạnh nguồn bị trùng hai đầu.");
    if (Math.abs(a - b) > Math.max(a, b) * 1e-5) return fail("Hai cạnh không còn bằng nhau theo tọa độ hiện tại.");
    for (const [a, b] of [[p[0], p[1]], [p[2], p[3]]]) {
      const length = distance(a, b), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      const r = Math.min(size, length / (12 * count));
      for (let i = 0; i < count; i++) {
        const shift = (i - (count - 1) / 2) * r;
        const center = { x: (a.x + b.x) / 2 + ux * shift, y: (a.y + b.y) / 2 + uy * shift };
        strokes.push([{ x: center.x - uy * r, y: center.y + ux * r }, { x: center.x + uy * r, y: center.y - ux * r }]);
      }
    }
  } else {
    const first = angle(p.slice(0, 3)), second = kind === "equal-angle" ? angle(p.slice(3, 6)) : Math.PI / 2;
    if (!Number.isFinite(first) || !Number.isFinite(second)) return fail("Góc nguồn bị trùng đỉnh hoặc chưa xác định.");
    if (Math.abs(first - second) > 1e-5) return fail(kind === "right-angle" ? "Góc không còn vuông theo tọa độ hiện tại." : "Hai góc không còn bằng nhau theo tọa độ hiện tại.");
    for (const [a, o, b] of kind === "equal-angle" ? [p.slice(0, 3), p.slice(3, 6)] : [p.slice(0, 3)]) {
      const r = Math.min(size * 2, distance(a, o) / 5, distance(b, o) / 5);
      const start = Math.atan2(a.y - o.y, a.x - o.x), end = Math.atan2(b.y - o.y, b.x - o.x);
      const sweep = Math.atan2(Math.sin(end - start), Math.cos(end - start));
      if (kind === "right-angle") {
        const u = { x: Math.cos(start) * r, y: Math.sin(start) * r }, v = { x: Math.cos(end) * r, y: Math.sin(end) * r };
        strokes.push([{ x: o.x + u.x, y: o.y + u.y }, { x: o.x + u.x + v.x, y: o.y + u.y + v.y }, { x: o.x + v.x, y: o.y + v.y }]);
      } else for (let j = 0; j < count; j++) strokes.push(Array.from({ length: 25 }, (_, i) => ({ x: o.x + (r + j * size * .6) * Math.cos(start + sweep * i / 24), y: o.y + (r + j * size * .6) * Math.sin(start + sweep * i / 24) })));
    }
  }
  return { valid: true, reason: "Ký hiệu theo tọa độ, không phải chứng minh.", strokes };
}
