import { ObjectSchema, TwoDVisualSpecSchema, type TwoDVisualSpec } from "./contracts";
import type { VertexHit } from "./runtime";
import { validateVisual } from "./validation";
import { constructionPoint, type ConstructionKind } from "./geometry-construction-point";
import { relationMarkGeometry, nextRelationMarkCount, type RelationMarkKind } from "./geometry-relation-mark";
import { EXTENDED_PLANAR_TOOLS, extendPlanarConstruction } from "./planar-extensions";

export const DRAWING_TOOLS = {
  ...EXTENDED_PLANAR_TOOLS,
  point: { label: "Điểm", count: 1, help: "Bấm vị trí tự do hoặc trên cạnh để đặt điểm." },
  segment: { label: "Đoạn", count: 2, help: "Chọn hai đầu mút; bắt vào đỉnh, cạnh hoặc vị trí tự do." },
  line: { label: "Đường", count: 2, help: "Chọn hai điểm phân biệt xác định đường thẳng." },
  ray: { label: "Tia", count: 2, help: "Chọn gốc tia rồi một điểm chỉ hướng." },
  circle: { label: "Tròn", count: 2, help: "Chọn tâm rồi một điểm trên đường tròn." },
  triangle: { label: "Tam giác", count: 3, help: "Chọn ba đỉnh không thẳng hàng để dựng tam giác." },
  polygon: { label: "Đa giác", count: 12, help: "Chọn ít nhất 3 đỉnh, bấm lại đỉnh đầu hoặc nút Khép hình." },
  midpoint: { label: "Trung điểm", count: 2, help: "Chọn hai đầu mút." },
  perpendicularBisector: { label: "Trung trực", count: 2, help: "Chọn hai đầu mút của đoạn cần dựng trung trực." },
  angle: { label: "Đo góc", count: 3, help: "Chọn điểm trên cạnh thứ nhất → đỉnh góc → điểm trên cạnh thứ hai. Đo góc nhỏ 0–180°." },
  orthocenter: { label: "Trực tâm và 3 đường cao", count: 3, help: "Chọn ba đỉnh tam giác; dựng cả ba đường cao và trực tâm." },
  medians: { label: "Trọng tâm và 3 trung tuyến", count: 3, help: "Chọn ba đỉnh tam giác; dựng ba trung tuyến và trọng tâm." },
  altitude: { label: "Đường cao / hình chiếu", count: 3, help: "Chọn điểm cần chiếu, rồi hai điểm trên đường đích." },
  median: { label: "Trung tuyến", count: 3, help: "Chọn đỉnh xuất phát, rồi hai đầu của cạnh đối diện." },
  bisector: { label: "Phân giác", count: 3, help: "Chọn đỉnh góc trước, rồi một điểm trên mỗi cạnh góc." },
  parallel: { label: "Song song", count: 3, help: "Chọn điểm đi qua, rồi hai điểm xác định đường tham chiếu." },
  perpendicular: { label: "Vuông góc", count: 3, help: "Chọn điểm đi qua, rồi hai điểm xác định đường tham chiếu." },
  intersection: { label: "Giao hai đường", count: 4, help: "Chọn hai điểm đường thứ nhất, rồi hai điểm đường thứ hai." },
  centroid: { label: "Trọng tâm", count: 3, help: "Chọn ba đỉnh tam giác không thẳng hàng." },
  circumcircle: { label: "Đường tròn ngoại tiếp", count: 3, help: "Chọn ba đỉnh tam giác không thẳng hàng." },
  incircle: { label: "Đường tròn nội tiếp", count: 3, help: "Chọn ba đỉnh tam giác không thẳng hàng." },
  markAngle: { label: "Đánh dấu 2 góc bằng nhau", count: 6, help: "Chọn cạnh 1 → đỉnh → cạnh 2 của góc thứ nhất, rồi tương tự góc thứ hai. Chỉ đánh dấu khi tọa độ phù hợp." },
  markLength: { label: "Đánh dấu 2 cạnh bằng nhau", count: 4, help: "Chọn hai đầu cạnh thứ nhất, rồi hai đầu cạnh thứ hai. Chỉ đánh dấu khi tọa độ phù hợp." },
  markRight: { label: "Đánh dấu góc vuông", count: 3, help: "Chọn cạnh 1 → đỉnh góc → cạnh 2. Ký hiệu không phải chứng minh." },
} as const;
export type DrawingTool = keyof typeof DRAWING_TOOLS;
export type DrawingStyle = { color: string; strokeWidth: number; lineStyle: "solid" | "dashed"; autoMarks?: boolean; factor?: number };
const pointTypes = ["point", "glider", "intersection", "midpoint", "projection"];
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

export function applyExploreConstruction(input: TwoDVisualSpec | null, tool: DrawingTool, hits: VertexHit[], style: DrawingStyle, bounds: [number, number, number, number] = [-10, 7, 10, -7]): TwoDVisualSpec {
  if (tool === "polygon" ? hits.length < 3 || hits.length > 12 : hits.length !== DRAWING_TOOLS[tool].count) throw Error("Chưa chọn đủ điểm cho phép dựng.");
  if (hits.some(h => h.position.some(v => !Number.isFinite(v) || Math.abs(v) > 1e6))) throw Error("Vị trí chọn không hợp lệ.");
  const spec = input ? structuredClone(input) : TwoDVisualSpecSchema.parse({ id: id("drawing"), version: 1, dimension: "2d", engine: "jsxgraph", kind: "geometry", source: { key: "generated", version: 1 }, viewport: { x: [bounds[0], bounds[2]], y: [bounds[3], bounds[1]] }, parameters: [], objects: [{ id: "temporary", type: "point", x: 0, y: 0 }] });
  if (!input) spec.objects = [];
  const { autoMarks = true, factor = 1, ...stroke } = style;
  const endpointOptions = tool === "circle" ? { removeWhenUnused: true } : {};
  const object = (data: Record<string, unknown>) => { const parsed = ObjectSchema.parse({ free: false, visible: true, ...stroke, ...data }); spec.objects.push(parsed); return parsed.id; };
  const mark = (kind: RelationMarkKind, parents: string[]) => object({ id: id("mark"), type: "relationMark", markKind: kind, markCount: nextRelationMarkCount(spec.objects, kind), parents, annotationKind: kind === "equal-length" ? "length" : "angle", label: "Ký hiệu quan sát" });
  const pointLabel = () => { for (let n = 0; n < 1000; n++) { const label = String.fromCharCode(65 + n % 26) + (n >= 26 ? Math.floor(n / 26) : ""); if (!spec.objects.some(o => o.label === label)) return label; } return "P"; };
  const baseLine = (a: string, b: string) => spec.objects.find(o => o.type === "line" && !o.ray && o.parents.length === 2 && o.parents.includes(a) && o.parents.includes(b))?.id || object({ id: id("reference"), type: "line", parents: [a, b], visible: false, annotationKind: "helper" });
  const endpoint = (hit: VertexHit) => {
    if (!hit.free && !hit.edge) { if (!spec.objects.some(o => o.id === hit.objectId && pointTypes.includes(o.type))) throw Error("Điểm đã không còn tồn tại. Hãy chọn lại."); return hit.objectId; }
    if (hit.edge) {
      const target = hit.edge.parents ? baseLine(...hit.edge.parents) : hit.edge.objectId;
      if (!target || !spec.objects.some(o => o.id === target)) throw Error("Cạnh đã không còn tồn tại.");
      const same = spec.objects.find(o => o.type === "glider" && o.parents[0] === target && o.edgeRatio !== undefined && Math.abs(o.edgeRatio - hit.edge!.ratio) < 1e-7);
      return same?.id || object({ id: id("attached"), type: "glider", parents: [target], x: hit.position[0], y: hit.position[1], edgeRatio: hit.edge.ratio, label: pointLabel(), ...endpointOptions });
    }
    const same = spec.objects.find(o => o.type === "point" && typeof o.x === "number" && typeof o.y === "number" && !o.construction && !o.offset && Math.hypot(o.x - hit.position[0], o.y - hit.position[1]) < 1e-7);
    return same?.id || object({ id: id("point"), type: "point", x: hit.position[0], y: hit.position[1], parents: [], free: true, label: pointLabel(), annotationKind: "vertex", ...endpointOptions });
  };
  const refs = hits.map(endpoint), coords = hits.map(h => ({ x: h.position[0], y: h.position[1] }));
  const apart = (a: number, b: number) => { if (Math.hypot(coords[a].x - coords[b].x, coords[a].y - coords[b].y) < 1e-7) throw Error("Hai điểm xác định cạnh đang trùng nhau."); };
  const segment = (a: string, b: string, label = "") => {
    if (a === b) throw Error("Đường dựng có hai đầu trùng nhau.");
    if (spec.objects.some(o => o.visible && ["segment", "line"].includes(o.type) && o.parents.length === 2 && o.parents.includes(a) && o.parents.includes(b))) throw Error("Hai điểm đã có đường nối. Hãy chọn cạnh để đổi kiểu nét.");
    return object({ id: id("segment"), type: "segment", parents: [a, b], label, annotationKind: "helper" });
  };
  const derived = (kind: ConstructionKind) => {
    const p = constructionPoint(kind, coords); if (!p) throw Error("Ba điểm trùng hoặc thẳng hàng; phép dựng này chưa xác định.");
    return object({ id: id("derived"), type: "point", parents: refs, construction: kind, x: p.x, y: p.y, label: pointLabel(), annotationKind: "vertex" });
  };
  if (tool === "point") { /* endpoint materialized above */ }
  else if (tool === "segment" || tool === "line" || tool === "ray" || tool === "circle") {
    apart(0, 1);
    if (tool === "segment") segment(refs[0], refs[1]);
    else object({ id: id(tool), type: tool === "ray" ? "line" : tool, parents: refs, ...(tool === "ray" ? { ray: true } : {}), annotationKind: "structure" });
  } else if (tool === "polygon" || tool === "triangle") {
    if (new Set(refs).size !== refs.length) throw Error("Các đỉnh đa giác phải khác nhau.");
    const area = coords.reduce((sum, p, n) => { const q = coords[(n + 1) % coords.length]; return sum + p.x * q.y - p.y * q.x; }, 0);
    if (Math.abs(area) < 1e-8) throw Error("Đa giác suy biến hoặc các cạnh tự cắt. Hãy chọn lại thứ tự đỉnh.");
    object({ id: id("polygon"), type: "polygon", parents: refs, annotationKind: "structure" });
  } else if (tool === "midpoint") { apart(0, 1); const mid = object({ id: id("midpoint"), type: "midpoint", parents: refs, label: pointLabel(), annotationKind: "vertex" }); if (autoMarks) mark("equal-length", [refs[0], mid, mid, refs[1]]); }
  else if (tool === "perpendicularBisector") {
    apart(0, 1);
    const mid = object({ id: id("midpoint"), type: "midpoint", parents: refs, label: pointLabel(), annotationKind: "vertex" });
    object({ id: id("bisector"), type: "perpendicular", parents: [baseLine(refs[0], refs[1]), mid], annotationKind: "helper" });
    if (autoMarks) mark("equal-length", [refs[0], mid, mid, refs[1]]);
  } else if (tool === "angle") {
    apart(0, 1); apart(1, 2);
    object({ id: id("angle"), type: "angle", parents: refs, label: "Góc", annotationKind: "angle" });
  } else if (tool === "markAngle" || tool === "markRight" || tool === "markLength") {
    const kind = tool === "markAngle" ? "equal-angle" : tool === "markLength" ? "equal-length" : "right-angle";
    const status = relationMarkGeometry(kind, coords); if (!status.valid) throw Error(status.reason);
    mark(kind, refs);
  } else if (tool === "orthocenter" || tool === "medians") {
    if (!constructionPoint("centroid", coords)) throw Error("Tam giác trùng điểm hoặc thẳng hàng; chưa xác định được tâm.");
    for (let i = 0; i < 3; i++) {
      const a = refs[i], b = refs[(i + 1) % 3], c = refs[(i + 2) % 3];
      const foot = object({ id: id("foot"), type: tool === "medians" ? "midpoint" : "projection", parents: tool === "medians" ? [b, c] : [a, baseLine(b, c)], label: pointLabel(), annotationKind: "vertex" });
      object({ id: id("helper"), type: "segment", parents: [a, foot], annotationKind: "helper" });
      if (autoMarks && tool === "medians") mark("equal-length", [b, foot, foot, c]);
      if (autoMarks && tool === "orthocenter") mark("right-angle", [b, foot, a, c]);
    }
    derived(tool === "medians" ? "centroid" : "orthocenter");
  }
  else if (tool === "median") {
    if (!constructionPoint("centroid", coords)) throw Error("Tam giác đang suy biến.");
    const mid = object({ id: id("midpoint"), type: "midpoint", parents: refs.slice(1), label: pointLabel(), annotationKind: "vertex" }); segment(refs[0], mid); if (autoMarks) mark("equal-length", [refs[1], mid, mid, refs[2]]);
  } else if (tool === "altitude") {
    apart(1, 2); const line = baseLine(refs[1], refs[2]);
    const cross = (coords[0].x - coords[1].x) * (coords[2].y - coords[1].y) - (coords[0].y - coords[1].y) * (coords[2].x - coords[1].x);
    if (Math.abs(cross) < 1e-9) throw Error("Điểm đã nằm trên đường đích; đường cao có độ dài bằng 0.");
    const foot = object({ id: id("foot"), type: "projection", parents: [refs[0], line], label: pointLabel(), annotationKind: "vertex" });
    segment(refs[0], foot); if (autoMarks) mark("right-angle", [refs[1], foot, refs[0], refs[2]]);
  } else if (tool === "parallel" || tool === "perpendicular") { apart(1, 2); object({ id: id(tool), type: tool, parents: [baseLine(refs[1], refs[2]), refs[0]], annotationKind: "helper" }); }
  else if (tool === "intersection") {
    apart(0, 1); apart(2, 3);
    const a = coords[1].x - coords[0].x, b = coords[1].y - coords[0].y, c = coords[3].x - coords[2].x, d = coords[3].y - coords[2].y;
    if (Math.abs(a * d - b * c) < 1e-9 * Math.hypot(a, b) * Math.hypot(c, d)) throw Error("Hai đường song song hoặc trùng nhau, không có giao điểm duy nhất.");
    object({ id: id("intersection"), type: "intersection", parents: [baseLine(refs[0], refs[1]), baseLine(refs[2], refs[3])], label: pointLabel(), annotationKind: "vertex" });
  } else if (tool === "bisector") { const foot = derived("angle-bisector"); segment(refs[0], foot); if (autoMarks) mark("equal-angle", [refs[1], refs[0], foot, foot, refs[0], refs[2]]); }
  else if (tool === "centroid") derived("centroid");
  else if (tool === "circumcircle") { const center = derived("circumcenter"); object({ id: id("circle"), type: "circle", parents: [center, refs[0]], annotationKind: "helper" }); }
  else if (tool === "incircle") {
    const center = derived("incenter"), line = baseLine(refs[1], refs[2]);
    const foot = object({ id: id("radiusfoot"), type: "projection", parents: [center, line], visible: false });
    object({ id: id("circle"), type: "circle", parents: [center, foot], annotationKind: "helper" });
  }
  extendPlanarConstruction(spec,tool,refs,coords,factor,object,pointLabel,baseLine);
  if (spec.objects.length > 80) throw Error("Bảng tối đa 80 đối tượng. Hãy xóa bớt hình trước khi dựng thêm.");
  return validateVisual(spec) as TwoDVisualSpec;
}
