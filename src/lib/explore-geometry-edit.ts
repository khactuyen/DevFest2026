import type { TwoDVisualSpec } from "./contracts";
import { validateVisual } from "./validation";

/** Resolve every movable ancestor once. Never flatten a construction into free points. */
export function groupTranslationRoots(spec: TwoDVisualSpec, ids: string[]): string[] {
  if (!ids.length) throw Error("Chọn một nhóm hình trước khi kéo.");
  const objects = new Map(spec.objects.map(o => [o.id, o]));
  const roots = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const o = objects.get(id);
    if (!o) throw Error("Đối tượng đã thay đổi. Hãy chọn lại nhóm.");
    if (o.type === "point" && o.free && !o.offset && !o.construction && typeof o.x === "number" && typeof o.y === "number") { roots.add(id); return; }
    if (!o.parents.length || o.type === "functionGraph" || o.type === "text" || o.type === "glider" && o.edgeRatio === undefined)
      throw Error("Nhóm có điểm cố định, biểu thức hoặc điểm trượt tự do. Hãy dùng tham số/tọa độ của mô hình thay vì kéo nhóm này.");
    o.parents.forEach(visit);
  };
  ids.forEach(visit);
  // Moving one corner of a constrained rectangle must move the entire frame.
  let previousSize: number;
  do {
    previousSize = roots.size;
    for (const polygon of spec.objects.filter(o => o.constraint)) {
      if (polygon.parents.some(p => roots.has(p))) polygon.parents.forEach(visit);
    }
  } while (roots.size !== previousSize);
  if (!roots.size) throw Error("Nhóm chưa có điểm gốc có thể di chuyển.");
  return [...roots];
}

export function translateExploreGroup(spec: TwoDVisualSpec, ids: string[], dx: number, dy: number): TwoDVisualSpec {
  if (![dx, dy].every(Number.isFinite)) throw Error("Độ dời không hợp lệ.");
  const roots = new Set(groupTranslationRoots(spec, ids));
  const next = structuredClone(spec);
  for (const o of next.objects) if (roots.has(o.id)) {
    o.x = (o.x as number) + dx; o.y = (o.y as number) + dy;
    if (Math.abs(o.x) > 1e6 || Math.abs(o.y) > 1e6) throw Error("Nhóm đã ra ngoài giới hạn tọa độ.");
  }
  return validateVisual(next) as TwoDVisualSpec;
}

export function moveExploreLabel(spec: TwoDVisualSpec, id: string, offset: [number, number]): TwoDVisualSpec {
  if (!offset.every(v => Number.isFinite(v) && Math.abs(v) <= 2000)) throw Error("Độ dời nhãn tối đa 2000 px mỗi chiều.");
  const next = structuredClone(spec), target = next.objects.find(o => o.id === id);
  if (!target) throw Error("Nhãn không còn tồn tại. Hãy chọn lại.");
  target.labelOffset = [...offset];
  return validateVisual(next) as TwoDVisualSpec;
}
