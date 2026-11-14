import type { TwoDVisualSpec, VisualStateSummary } from "./contracts";
import { constructionPoint } from "./geometry-construction-point";
import { relationMarkGeometry } from "./geometry-relation-mark";

type P = { x: number; y: number };
const diff = (a: P, b: P): P => ({ x: b.x - a.x, y: b.y - a.y });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const cross = (a: P, b: P) => a.x * b.y - a.y * b.x;
const length = (a: P) => Math.hypot(a.x, a.y);

/** Numeric checks on supported constructed relations after a parameter edit or drag.
 * This is deliberately a verifier, not a solver for arbitrary geometry. */
export function verifyVisualGeometry(spec: TwoDVisualSpec, state: VisualStateSummary): string[] {
  if (state.visualId !== spec.id) return ["Trạng thái không thuộc hình đang hiển thị."];
  const byId = new Map(spec.objects.map((object) => [object.id, object]));
  const point = (id: string): P | null => {
    const item = state.objects[id];
    return item && Number.isFinite(item.x) && Number.isFinite(item.y) ? { x: item.x!, y: item.y! } : null;
  };
  const line = (id: string): [P, P] | null => {
    const item = byId.get(id);
    if (!item) return null;
    if (["line", "segment", "arrow"].includes(item.type)) {
      const a = point(item.parents[0]), b = point(item.parents[1]);
      return a && b ? [a, b] : null;
    }
    if (item.type === "perpendicular" || item.type === "parallel") {
      const base = line(item.parents[0]), through = point(item.parents[1]);
      if (!base || !through) return null;
      const v = diff(base[0], base[1]);
      return [through, item.type === "perpendicular"
        ? { x: through.x - v.y, y: through.y + v.x }
        : { x: through.x + v.x, y: through.y + v.y }];
    }
    return null;
  };
  const onLine = (p: P, [a, b]: [P, P]) => {
    const v = diff(a, b);
    return length(v) > 1e-8 && Math.abs(cross(v, diff(a, p))) / length(v) < 1e-4;
  };
  const problems: string[] = [];
  for (const item of spec.objects) {
    if (item.type === "relationMark") {
      const count = item.markKind === "equal-length" ? 4 : item.markKind === "equal-angle" ? 6 : Math.min(4, item.parents.length);
      const points = item.parents.slice(0, count).map(point);
      const status = relationMarkGeometry(item.markKind!, points.map(p => p || { x: NaN, y: NaN }));
      if (!status.valid) problems.push(`${item.label || "Ký hiệu"}: ${status.reason} Đã ẩn ký hiệu; kéo hình về cấu hình hợp lệ để khôi phục.`);
    } else if (item.type === "point" && item.construction) {
      const parents = item.parents.map(point), actual = point(item.id);
      const expected = parents.every(Boolean) ? constructionPoint(item.construction, parents as P[]) : null;
      if (!expected) problems.push(`${item.label || item.id}: phép dựng không xác định khi các điểm trùng hoặc thẳng hàng.`);
      else if (actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) > 1e-4) problems.push(`${item.label || item.id} không còn thỏa quan hệ dựng.`);
    } else if (item.type === "midpoint") {
      const p = point(item.id), a = point(item.parents[0]), b = point(item.parents[1]);
      if (p && a && b && Math.hypot(p.x - (a.x + b.x) / 2, p.y - (a.y + b.y) / 2) > 1e-4)
        problems.push(`${item.label || item.id} không còn là trung điểm.`);
    } else if (item.type === "projection") {
      const p = point(item.id), from = point(item.parents[0]), base = line(item.parents[1]);
      if (!p || !from || !base) problems.push("Hình chiếu chưa xác định: kiểm tra đường nguồn suy biến.");
      if (p && from && base && (!onLine(p, base) || Math.abs(dot(diff(base[0], base[1]), diff(from, p))) /
        Math.max(1e-8, length(diff(base[0], base[1])) * length(diff(from, p))) > 1e-4))
        problems.push(`${item.label || item.id} không còn là hình chiếu vuông góc.`);
    } else if (item.type === "intersection") {
      const p = point(item.id), first = line(item.parents[0]), second = line(item.parents[1]);
      if (!p || !first || !second) problems.push("Giao điểm chưa xác định: kiểm tra hai đường trùng/song song hoặc nguồn suy biến.");
      if (p && first && second && (!onLine(p, first) || !onLine(p, second)))
        problems.push(`${item.label || item.id} không còn là giao điểm của hai đường.`);
    } else if (["parallel", "perpendicular"].includes(item.type)) {
      const base = line(item.parents[0]);
      if (!base || length(diff(base[0], base[1])) < 1e-8) problems.push("Đường tham chiếu suy biến: dời hai đầu mút ra xa nhau để khôi phục phép dựng.");
    } else if (["line", "segment", "arrow"].includes(item.type)) {
      const p = line(item.id);
      if (!p || length(diff(p[0], p[1])) < 1e-8) problems.push("Đường/đoạn có hai đầu trùng hoặc chưa xác định; dời điểm gốc để khôi phục.");
    } else if (item.type === "angle") {
      const [a, b, c] = item.parents.map(point);
      if (!a || !b || !c || length(diff(a, b)) < 1e-8 || length(diff(b, c)) < 1e-8) problems.push("Góc chưa xác định do trùng đỉnh; dời điểm nguồn để khôi phục.");
    } else if (item.type === "polygon" && item.parents.join("") === "ABCD") {
      const corners = item.parents.map(point);
      if (corners.every((p): p is P => !!p)) {
        const [a, b, c, d] = corners as P[];
        const ab = diff(a, b), bc = diff(b, c), cd = diff(c, d), da = diff(d, a);
        const scale = Math.max(length(ab), length(bc), 1e-8);
        if (Math.abs(dot(ab, bc)) / (scale * scale) > 1e-4 ||
          Math.abs(cross(ab, cd)) / (scale * scale) > 1e-4 ||
          Math.abs(cross(bc, da)) / (scale * scale) > 1e-4)
          problems.push("ABCD không còn là hình chữ nhật.");
        if (spec.parameters.some((p) => p.id === "heightRatio") && length(ab) <= length(bc) + 1e-7)
          problems.push("AB phải dài hơn BC.");
      }
    }
  }
  return problems;
}
