import { ObjectSchema, type TwoDVisualSpec } from "./contracts";
import { validateVisual } from "./validation";
import type { LineHit, VertexHit } from "./runtime";
import type { DrawingStyle } from "./explore-drawing-constructions";
import { relationMarkGeometry, nextRelationMarkCount } from "./geometry-relation-mark";

export type DirectTool = "parallel" | "perpendicular" | "intersection" | "markLength";
const uid = () => `direct_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
export function applyDirectConstruction(input: TwoDVisualSpec, tool: DirectTool, lines: LineHit[], through: VertexHit | null, style: DrawingStyle): TwoDVisualSpec {
  if (lines.length !== (["intersection", "markLength"].includes(tool) ? 2 : 1)) throw Error("Chọn đủ đường/cạnh trước khi dựng.");
  const next = structuredClone(input);
  const { autoMarks: _auto, factor: _factor, ...stroke } = style;
  const put = (data: Record<string, unknown>) => { const o = ObjectSchema.parse({ id: uid(), free: false, visible: true, ...stroke, ...data }); next.objects.push(o); return o.id; };
  for (const line of lines) {
    const source = next.objects.find(o => o.id === line.sourceId);
    if (!source || !source.visible || source.strokeOpacity === 0 || line.edgeIndex !== undefined && (source.type !== "polygon" || source.edgeStyles?.some(s => s.edgeIndex === line.edgeIndex && s.hidden))) throw Error("Cạnh nguồn không còn tồn tại/đã ẩn. Hãy chọn lại.");
    if (line.coordinates.flat().some(v => !Number.isFinite(v)) || Math.hypot(line.coordinates[1][0] - line.coordinates[0][0], line.coordinates[1][1] - line.coordinates[0][1]) < 1e-8) throw Error("Đường nguồn bị suy biến.");
  }
  const reference = (line: LineHit) => {
    if (line.objectId) return line.objectId;
    if (!line.pointIds) throw Error("Không đọc được đầu mút cạnh nguồn.");
    return put({ type: "line", parents: line.pointIds, visible: false, annotationKind: "helper" });
  };
  if (tool === "markLength") {
    if (lines.some(l => !l.pointIds || !["segment", "arrow", "polygon"].includes(next.objects.find(o => o.id === l.sourceId)!.type))) throw Error("Hãy chọn hai đoạn/cạnh hữu hạn, không chọn đường dựng vô hạn.");
    const p = lines.flatMap(l => l.coordinates.map(([x, y]) => ({ x, y })));
    const status = relationMarkGeometry("equal-length", p); if (!status.valid) throw Error(status.reason);
    if (lines[0].sourceId === lines[1].sourceId && lines[0].edgeIndex === lines[1].edgeIndex) throw Error("Chọn hai cạnh khác nhau.");
    put({ type: "relationMark", markKind: "equal-length", markCount: nextRelationMarkCount(next.objects, "equal-length"), parents: [...lines.flatMap(l => l.pointIds!), ...new Set(lines.map(l => l.sourceId))], annotationKind: "length", label: "Cạnh bằng nhau · quan sát" });
  } else if (tool === "intersection") {
    const [a, b] = lines.map(l => [l.coordinates[1][0] - l.coordinates[0][0], l.coordinates[1][1] - l.coordinates[0][1]]);
    if (Math.abs(a[0] * b[1] - a[1] * b[0]) < 1e-9 * Math.hypot(...a) * Math.hypot(...b)) throw Error("Hai đường trùng/song song, không có giao điểm duy nhất.");
    put({ type: "intersection", parents: lines.map(reference), label: "I", annotationKind: "vertex" });
  } else {
    if (!through) throw Error("Chọn điểm đi qua sau đường tham chiếu.");
    let point = through.objectId;
    if (through.free || through.edge) {
      if (through.edge) {
        const carrier = through.edge.parents ? put({ type: "line", parents: through.edge.parents, visible: false, annotationKind: "helper" }) : through.edge.objectId;
        point = put({ type: "glider", parents: [carrier], edgeRatio: through.edge.ratio, x: through.position[0], y: through.position[1], label: "P", annotationKind: "vertex" });
      } else point = put({ type: "point", free: true, parents: [], x: through.position[0], y: through.position[1], label: "P", annotationKind: "vertex" });
    }
    if (!next.objects.some(o => o.id === point && ["point", "midpoint", "projection", "intersection", "glider"].includes(o.type))) throw Error("Điểm đi qua không còn tồn tại.");
    put({ type: tool, parents: [reference(lines[0]), point], annotationKind: "helper" });
  }
  if (next.objects.length > 80) throw Error("Bảng tối đa 80 đối tượng.");
  return validateVisual(next) as TwoDVisualSpec;
}
