import { AppError } from "./app-error";
import { validateVisual } from "./validation";
import type { ThreeVisualObject, ThreeVisualSpec, TwoDVisualSpec, VisualObject } from "./contracts";

export type SpatialPoint = [number, number, number];
export type SpatialScene = {
  key: string;
  points: Record<string, SpatialPoint>;
  edges: Array<{ ends: [string, string]; label?: string; measurement?: string; helper?: boolean }>;
  faces: string[][];
  midpoints?: Array<{ point: string; ends: [string, string] }>;
  note: string;
};

/** Names are visible labels. Renderer IDs are generated independently of primes/LaTeX. */
export function compileSpatialScene(scene: SpatialScene) {
  const entries = Object.entries(scene.points);
  const ids = new Map(entries.map(([name], i) => [name, `point_${i}`]));
  const get = (name: string) => {
    const point = scene.points[name];
    if (!point || !point.every(Number.isFinite)) throw new AppError(422, `Điểm ${name} chưa có tọa độ hợp lệ.`, "spatial_invalid");
    return point;
  };
  const all = entries.map(([name]) => get(name));
  const ranges = [0, 1, 2].map(axis => [Math.min(...all.map(p => p[axis])), Math.max(...all.map(p => p[axis]))]);
  const span = Math.max(...ranges.map(([min, max]) => max - min));
  if (!(span > 0) || span > 3000 || entries.length > 24) throw new AppError(422, "Hình vượt phạm vi dựng hoặc bị suy biến.", "spatial_invalid");
  const center = ranges.map(([min, max]) => (min + max) / 2) as SpatialPoint;
  // Three.js uses y for vertical; both views share exactly these spatial points.
  const project = ([x, y, z]: SpatialPoint): [number, number] => [x - z * 0.55, y + (x + z) * 0.22];
  const projected = all.map(project);
  const midpointMap = new Map(scene.midpoints?.map(relation => [relation.point, relation]));
  const planar: Array<Partial<VisualObject> & Pick<VisualObject, "id" | "type">> = [];
  const spatial: Array<Partial<ThreeVisualObject> & Pick<ThreeVisualObject, "id" | "type">> = [];
  for (const [i, [name, position]] of entries.entries()) {
    const relation = midpointMap.get(name);
    if (relation) {
      const p = get(relation.ends[0]), q = get(relation.ends[1]);
      if (position.some((v, axis) => Math.abs(v - (p[axis] + q[axis]) / 2) > span * 1e-9))
        throw new AppError(422, `Trung điểm ${name} không khớp cạnh nguồn.`, "spatial_invalid");
    }
    planar.push({ id: ids.get(name)!, label: name, color: "#17835e", annotationKind: "vertex",
      ...(relation ? { type: "midpoint", parents: relation.ends.map(end => ids.get(end)!) }
        : { type: "point", x: projected[i][0], y: projected[i][1] }), free: false });
    spatial.push({ id: ids.get(name)!, type: "sphere", marker: true, radius: span * 0.012,
      position, color: "#17835e", label: name, annotationKind: "vertex" });
    spatial.push({ id: `label_${i}`, type: "label3d", text: name, color: "#17835e",
      position: [position[0] + span * 0.025, position[1] + span * 0.025, position[2]], annotationKind: "vertex" });
  }
  const seen = new Set<string>();
  for (const [i, edge] of scene.edges.entries()) {
    const [first, second] = edge.ends, p = get(first), q = get(second);
    const key = [...edge.ends].sort().join("|");
    if (first === second || seen.has(key)) throw new AppError(422, "Cạnh dựng bị trùng hoặc suy biến.", "spatial_invalid");
    seen.add(key);
    const label = edge.label || first + second;
    planar.push({ id: `edge_${i}`, type: "segment", parents: edge.ends.map(name => ids.get(name)!),
      ...(edge.measurement ? { label } : { ariaLabel: label }), color: "#17835e", lineStyle: edge.helper ? "dashed" : "solid",
      ...(edge.measurement ? { measurement: edge.measurement, annotationKind: "length" } : {}) });
    spatial.push({ id: `edge_${i}`, type: "curve3d", points3d: [p, q], label, color: "#17835e",
      lineStyle: edge.helper ? "dashed" : "solid", strokeWidth: 2 });
    if (edge.measurement) spatial.push({ id: `measure_${i}`, type: "label3d", text: `${label} = ${edge.measurement}`,
      position: [(p[0] + q[0]) / 2 + span * 0.025, (p[1] + q[1]) / 2 + span * 0.03, (p[2] + q[2]) / 2],
      color: "#17835e", annotationKind: "length" });
  }
  for (const [i, face] of scene.faces.entries()) {
    const polygon = face.map(get);
    for (let j = 1; j < polygon.length - 1; j++) spatial.push({ id: `face_${i}_${j}`, type: "face3d",
      points3d: [polygon[0], polygon[j], polygon[j + 1]], color: "#27a879", annotationKind: "face" });
  }
  const padding = span * 0.15;
  const visual = validateVisual({ id: `${scene.key}_2d`, version: 1, dimension: "2d", engine: "jsxgraph",
    source: { key: scene.key, version: 1 }, kind: "geometry", surfaceFill: false, projectionOf3d: true, parameters: [], objects: planar,
    viewport: { x: [Math.min(...projected.map(p => p[0])) - padding, Math.max(...projected.map(p => p[0])) + padding],
      y: [Math.min(...projected.map(p => p[1])) - padding, Math.max(...projected.map(p => p[1])) + padding] },
    accessibility: { description: `${scene.note} Bản 2D là hình chiếu; số đo ghi theo đề, không đo trên hình chiếu.` },
  }) as TwoDVisualSpec;
  const visual3d = validateVisual({ id: `${scene.key}_3d`, version: 1, dimension: "3d", engine: "threejs",
    source: { key: scene.key, version: 1 }, kind: "solid", surfaceFill: true, parameters: [], objects: spatial,
    camera: { position: [center[0] + span * 1.7, center[1] + span * 1.3, center[2] + span * 2], target: center },
    accessibility: { description: scene.note },
  }) as ThreeVisualSpec;
  return { visual, visual3d, note: scene.note };
}
