import { AgentResultSchema, VisualSpecSchema, type AgentResult, type ThreeVisualObject } from "./contracts";
import { AppError } from "./app-error";

type Point3 = [number, number, number];
type AngleFact = { points: [string, string, string]; degrees: number };

const pointNames = new Set(["A", "B", "C", "D"]);
const edgeKey = (edge: string) => edge.toUpperCase().split("").sort().join("");
const angleKey = ([first, vertex, second]: [string, string, string]) => {
  const endpoints = [first, second].sort();
  return `${endpoints[0]}${vertex}${endpoints[1]}`;
};
const cleanMathText = (text: string) => text
  .replace(/\\(?:left|right|widehat|angle|measuredangle|mathrm|text)\b/g, " ")
  .replace(/\\circ|°/gi, " độ ")
  .replace(/\\,/g, " ")
  .replace(/[{}$_^∠]/g, " ")
  .replace(/\b(?:góc|angle)\s*/gi, " ")
  .replace(/\bbằng\b/gi, "=")
  .replace(/\s+/g, " ")
  .toUpperCase();

function numberText(value: number) {
  return Number(value.toFixed(3)).toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

function parseLengths(text: string, excludedRange?: [number, number]) {
  const parsed: Array<{ edge: string; rawValue: string; value: number; unit?: string }> = [];
  const pattern = /(?:CẠNH\s*)?\b([A-D]{2})\b\s*(?:=|BẰNG)\s*(\d+(?:[.,]\d+)?)\s*(CM|MM|DM|M)?\b/gi;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? -1;
    if (excludedRange && start >= excludedRange[0] && start < excludedRange[1]) continue;
    const trailing = text.slice(start + match[0].length);
    if (/^\s*(?:°|\\circ\b|độ\b|deg\b)/i.test(trailing)) continue;
    const value = Number(match[2].replace(",", "."));
    if (Number.isFinite(value) && value > 0 && pointNames.has(match[1][0]) && pointNames.has(match[1][1]))
      parsed.push({ edge: match[1].toUpperCase(), rawValue: match[2], value, unit: match[3]?.toLowerCase() });
  }
  const assumedUnit = parsed.find((item) => item.unit)?.unit || "cm";
  const toCentimeters: Record<string, number> = { mm: 0.1, cm: 1, dm: 10, m: 100 };
  const lengths = new Map<string, { value: number; label: string }>();
  for (const item of parsed) {
    const unit = item.unit || "";
    const calculationUnit = item.unit || assumedUnit;
    lengths.set(edgeKey(item.edge), {
      value: item.value * toCentimeters[calculationUnit],
      label: `${item.edge} = ${item.rawValue}${unit ? ` ${unit}` : ""}`,
    });
  }
  return lengths;
}

function parseAngleFacts(raw: string): AngleFact[] {
  const text = cleanMathText(raw);
  const facts = new Map<string, AngleFact>();
  const chains = /(?:\b[A-D]{3}\s*=\s*){1,5}90(?:\s*(?:ĐỘ|DEG))?/gi;
  for (const match of text.matchAll(chains)) {
    const names = match[0].match(/[A-D]{3}/g) || [];
    for (const name of names) {
      const points = [...name] as [string, string, string];
      facts.set(name, { points, degrees: 90 });
    }
  }
  const direct = /\b([A-D]{3})\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:ĐỘ|DEG)?/gi;
  for (const match of text.matchAll(direct)) {
    const points = [...match[1]] as [string, string, string];
    const degrees = Number(match[2].replace(",", "."));
    if (degrees > 0 && degrees < 180) facts.set(match[1], { points, degrees });
  }
  const triangleRight = /TAM GIÁC\s*([A-D]{3})[^.\n]{0,40}?VUÔNG\s*TẠI\s*([A-D])/gi;
  for (const match of raw.toUpperCase().matchAll(triangleRight)) {
    const triangle = [...match[1]], vertex = match[2];
    if (!triangle.includes(vertex)) continue;
    const other = triangle.filter((name) => name !== vertex);
    facts.set(`${other[0]}${vertex}${other[1]}`, { points: [other[0], vertex, other[1]], degrees: 90 });
  }
  const namedVertex = /(?:GÓC|∠)\s*([A-D])\s*(?:(?:=|BẰNG|LÀ)\s*)?\d/i.exec(raw);
  if (namedVertex) throw new AppError(422, `Đề chỉ ghi góc ${namedVertex[1]} nên chưa xác định được hai tia tạo góc. Hãy ghi rõ, ví dụ ∠BAC = 30° hoặc ∠BAD = 30°.`, "geometry_ambiguous");
  return [...facts.values()];
}

function parseLineAngle(raw: string) {
  const plain = raw.replace(/\\(?:left|right|mathrm|text)\b/g, " ").replace(/[{}]/g, " ");
  const match = /\b([A-D]{2})\s*(?:và|,|;|\s+với\s+)\s*([A-D]{2})\s*(?:bằng|=)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)?/i.exec(plain);
  if (!match) return null;
  const first = match[1].toUpperCase(), second = match[2].toUpperCase();
  if ([...first, ...second].some((name) => !pointNames.has(name))) return null;
  const degrees = Number(match[3].replace(",", "."));
  return degrees > 0 && degrees < 90 ? { first, second, degrees, range: [match.index, match.index + match[0].length] as [number, number] } : null;
}

function dot(a: Point3, b: Point3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function subtract(a: Point3, b: Point3): Point3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a: Point3, b: Point3): Point3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: Point3, factor: number): Point3 { return [a[0] * factor, a[1] * factor, a[2] * factor]; }
function cross(a: Point3, b: Point3): Point3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: Point3) { return Math.hypot(...a); }
function unit(a: Point3): Point3 { const length = norm(a); return length ? scale(a, 1 / length) : [0, 0, 0]; }
function distance(a: Point3, b: Point3) { return norm(subtract(a, b)); }
function roundedPosition(a: Point3): Point3 { return a.map((value) => Number(value.toFixed(8))) as Point3; }
function exactCosineAsSimpleRadical(sideBC: number, sideCD: number, angleDegrees: number) {
  if (Math.abs(angleDegrees - 60) > 1e-8) return null;
  const b = Math.round(sideBC), d = Math.round(sideCD);
  if (Math.abs(sideBC - b) > 1e-8 || Math.abs(sideCD - d) > 1e-8 || b <= 0 || d <= 0) return null;
  const radicand = 3 * b * b + d * d;
  if (!Number.isSafeInteger(radicand) || radicand > 1_000_000) return null;
  let squareFree = radicand, squareFactor = 1;
  for (let factor = 2; factor * factor <= squareFree; factor++) {
    while (squareFree % (factor * factor) === 0) {
      squareFree /= factor * factor;
      squareFactor *= factor;
    }
  }
  const denominator = 2 * squareFactor;
  if (d % denominator !== 0 || squareFree === 1) return null;
  return { a: d / denominator, b: squareFree };
}
export function deriveTetrahedronResult(sideBC: number, sideCD: number, angleDegrees: number, rightAtD: boolean) {
  const theta = angleDegrees * Math.PI / 180;
  const heightSquared = sideBC * sideBC * Math.tan(theta) ** 2 - (rightAtD ? 0 : sideCD * sideCD);
  if (!(sideBC > 0 && sideCD > 0 && heightSquared > 1e-8))
    throw new AppError(422, "Các tham số không tạo được tứ diện thỏa mãn các góc đã cho.", "geometry_inconsistent");
  const height = Math.sqrt(heightSquared);
  const points: Record<string, Point3> = {
    A: rightAtD ? [sideBC, sideCD, height] : [sideBC, 0, height],
    B: [sideBC, 0, 0], C: [0, 0, 0], D: [0, sideCD, 0],
  };
  const normalABC = cross(subtract(points.B, points.A), subtract(points.C, points.A));
  const normalACD = cross(subtract(points.C, points.A), subtract(points.D, points.A));
  const cosine = Math.abs(dot(normalABC, normalACD) / (norm(normalABC) * norm(normalACD)));
  return {
    points,
    cosine,
    degrees: Math.acos(Math.min(1, Math.max(0, cosine))) * 180 / Math.PI,
    exact: rightAtD ? exactCosineAsSimpleRadical(sideBC, sideCD, angleDegrees) : null,
  };
}
function lineObject(id: string, label: string, points: Point3[], annotationKind: "structure" | "angle" | "helper", color = "#188563"): ThreeVisualObject {
  return { id, type: "curve3d", label, visible: true, marker: false, color, points3d: points.map(roundedPosition), position: [0, 0, 0], rotation: [0, 0, 0], annotationKind };
}
function textObject(id: string, text: string, position: Point3, annotationKind: "vertex" | "length" | "angle" | "helper", color = "#173d31"): ThreeVisualObject {
  return { id, type: "label3d", label: text, text, visible: true, marker: false, color, position: roundedPosition(position), rotation: [0, 0, 0], annotationKind };
}
function arcPoints(center: Point3, first: Point3, second: Point3, radius: number, segments = 18): Point3[] {
  const start = unit(first), end = unit(second);
  const axis = unit(cross(start, end));
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(start, end))));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = angle * index / segments;
    const rotated = add(add(scale(start, Math.cos(t)), scale(cross(axis, start), Math.sin(t))), scale(axis, dot(axis, start) * (1 - Math.cos(t))));
    return add(center, scale(rotated, radius));
  });
}

export function isConstrainedTetrahedronProblem(prompt: string) {
  return /(?:tứ\s*diện|tetrahedron)/i.test(prompt) &&
    /(?:\b[A-D]{2}\s*(?:=|bằng)\s*\d|90\s*(?:°|độ)|vuông\s*tại|góc\s*giữa\s*(?:hai\s*)?(?:đường|mặt))/i.test(prompt);
}

export function buildConstrainedTetrahedron(prompt: string, dimensions?: { BC: number; CD: number }): AgentResult {
  const lineAngle = parseLineAngle(prompt);
  const lengths = parseLengths(prompt, lineAngle?.range);
  const rightAngles = parseAngleFacts(prompt);
  const rightKeys = new Set(rightAngles.filter((fact) => fact.degrees === 90).map((fact) => angleKey(fact.points)));
  const hasRightABC = rightKeys.has("ABC");
  const hasRightBCD = rightKeys.has("BCD");
  const hasRightACD = rightKeys.has("ACD");
  const hasRightADC = rightKeys.has("ADC");
  const missing: string[] = [];
  if (!lengths.has("BC")) missing.push("độ dài BC");
  if (!lengths.has("CD")) missing.push("độ dài CD");
  if (!hasRightABC || !hasRightBCD || (!hasRightACD && !hasRightADC)) missing.push("các góc vuông ∠ABC, ∠BCD và một trong hai góc ∠ACD hoặc ∠ADC");
  if (!lineAngle || edgeKey(lineAngle.first) !== "AD" || edgeKey(lineAngle.second) !== "BC") missing.push("góc giữa hai đường thẳng AD và CB");
  if (missing.length) throw new AppError(422, `Đã nhận ra bài toán tứ diện nhưng chưa đủ dữ kiện để dựng đúng hình. Cần xác nhận: ${missing.join("; ")}.`, "geometry_incomplete");
  if (hasRightACD && hasRightADC) throw new AppError(422, "Đề đang có cả ∠ACD = 90° và ∠ADC = 90°. Hai dữ kiện này không phù hợp với tứ diện không suy biến; hãy kiểm tra lại ảnh nhận diện.", "geometry_inconsistent");

  if (dimensions) for (const edge of ["BC", "CD"] as const) {
    const original = lengths.get(edge)!;
    const value = dimensions[edge];
    if (!Number.isFinite(value) || value <= 0) throw new AppError(422, `Độ dài ${edge} phải dương.`, "geometry_inconsistent");
    const unit = /\b(mm|cm|dm|m)\b/i.exec(original.label)?.[1];
    lengths.set(edge, { value, label: `${edge} = ${numberText(value)}${unit ? " cm" : ""}` });
  }
  const sideBC = lengths.get("BC")!.value, sideCD = lengths.get("CD")!.value;
  const theta = lineAngle!.degrees * Math.PI / 180;
  const rightAtD = hasRightADC;
  const derived = deriveTetrahedronResult(sideBC, sideCD, lineAngle!.degrees, rightAtD);
  const { points } = derived;

  // Deterministically check every parsed constraint before constructing a scene.
  for (const fact of rightAngles) {
    const [u, vertex, w] = fact.points;
    const first = subtract(points[u], points[vertex]), second = subtract(points[w], points[vertex]);
    const actual = Math.acos(Math.min(1, Math.max(-1, dot(first, second) / (norm(first) * norm(second))))) * 180 / Math.PI;
    if (Math.abs(actual - fact.degrees) > 1e-5) throw new AppError(422, `Các dữ kiện không đồng thời thỏa mãn ∠${fact.points.join("")} = ${numberText(fact.degrees)}°.`, "geometry_inconsistent");
  }
  const vectorAD = subtract(points.D, points.A), vectorCB = subtract(points.C, points.B);
  const lineCosine = Math.abs(dot(vectorAD, vectorCB) / (norm(vectorAD) * norm(vectorCB)));
  if (Math.abs(lineCosine - Math.cos(theta)) > 1e-7)
    throw new AppError(422, "Không dựng được góc giữa AD và CB theo số đo đã nhận diện.", "geometry_inconsistent");

  const objects: ThreeVisualObject[] = [];
  const edges: Array<[string, string]> = [["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"], ["C", "D"]];
  for (const [first, second] of edges)
    objects.push(lineObject(`edge_${first.toLowerCase()}${second.toLowerCase()}`, `${first}${second}`, [points[first], points[second]], "structure"));
  const labelOffsets: Record<string, Point3> = { A: [0.15, 0.1, 0.18], B: [0.12, 0.08, -0.15], C: [-0.18, 0.08, -0.14], D: [-0.18, 0.08, 0.12] };
  for (const name of Object.keys(points)) {
    objects.push({ id: `vertex_${name.toLowerCase()}`, type: "sphere", label: name, visible: true, marker: true, annotationKind: "vertex", color: "#147b59", radius: 0.085, position: points[name], rotation: [0, 0, 0] });
    objects.push(textObject(`label_${name.toLowerCase()}`, name, add(points[name], labelOffsets[name]), "vertex"));
  }

  const faces: Array<[string, string, string]> = [["A", "B", "C"], ["A", "C", "D"], ["A", "B", "D"], ["B", "C", "D"]];
  for (const [index, face] of faces.entries()) objects.push({
    id: `face_${face.map((name) => name.toLowerCase()).join("")}`, type: "face3d", label: `Mặt (${face.join("")})`, visible: true,
    annotationKind: "face", marker: false, color: index === 0 ? "#4d79d8" : index === 1 ? "#e48748" : "#67a792",
    points3d: face.map((name) => points[name]), position: [0, 0, 0], rotation: [0, 0, 0],
  });

  for (const fact of rightAngles) {
    const [firstName, vertexName, secondName] = fact.points;
    const vertex = points[vertexName];
    const firstRay = unit(subtract(points[firstName], vertex));
    const secondRay = unit(subtract(points[secondName], vertex));
    const markSize = Math.min(0.28, distance(points[firstName], vertex) * 0.18, distance(points[secondName], vertex) * 0.18);
    if (fact.degrees === 90) {
      const mark = [add(vertex, scale(firstRay, markSize)), add(add(vertex, scale(firstRay, markSize)), scale(secondRay, markSize)), add(vertex, scale(secondRay, markSize))];
      objects.push(lineObject(`right_angle_${fact.points.join("").toLowerCase()}`, `∠${fact.points.join("")} = 90°`, mark, "angle", "#dc7138"));
    } else {
      objects.push(lineObject(`angle_arc_${fact.points.join("").toLowerCase()}`, `∠${fact.points.join("")} = ${numberText(fact.degrees)}°`, arcPoints(vertex, firstRay, secondRay, markSize), "angle", "#dc7138"));
    }
    objects.push(textObject(`angle_label_${fact.points.join("").toLowerCase()}`, `${numberText(fact.degrees)}°`, add(add(vertex, scale(firstRay, markSize * 1.25)), scale(secondRay, markSize * 1.25)), "angle", "#a64d1a"));
  }

  for (const [edge, dimension] of lengths) {
    if (!["BC", "CD"].includes(edge)) continue;
    const [first, second] = edge.split("");
    objects.push(textObject(`length_${edge.toLowerCase()}`, dimension.label, scale(add(points[first], points[second]), 0.5), "length", "#244f9e"));
  }

  // Lines AD and CB are skew. Draw their direction vectors from a shared helper
  // origin so the conventional acute angle between their directions is clear.
  const helperOrigin = add(scale(add(add(points.A, points.B), add(points.C, points.D)), 0.25), [0, 0.35, 0]);
  const directionAD = unit(subtract(points.D, points.A));
  const directionCB = unit(subtract(points.C, points.B));
  const directionLength = 0.78;
  objects.push(lineObject("helper_ad_direction", "Hướng AD", [helperOrigin, add(helperOrigin, scale(directionAD, directionLength))], "helper", "#7a8793"));
  objects.push(lineObject("helper_cb_direction", "Hướng CB", [helperOrigin, add(helperOrigin, scale(directionCB, directionLength))], "helper", "#7a8793"));
  objects.push(lineObject("angle_lines_ad_cb", `Góc giữa AD và CB = ${numberText(lineAngle!.degrees)}°`, arcPoints(helperOrigin, directionCB, directionAD, 0.3), "angle", "#df7136"));
  objects.push(textObject("angle_lines_ad_cb_label", `${numberText(lineAngle!.degrees)}° · (AD, CB)`, add(helperOrigin, [0.32, 0.25, 0.12]), "angle", "#a64d1a"));

  const exactCosine = derived.exact;

  const dimensionParameter = (edge: "BC" | "CD", value: number) => ({
    id: `side_${edge.toLowerCase()}`, label: `Cạnh ${edge}`, min: Math.max(0.001, Math.floor(value * 250) / 1000),
    max: Math.ceil(value * 2500) / 1000, value, step: 0.001,
  });

  const visual = VisualSpecSchema.parse({
    id: "visual_tetrahedron_problem", version: 1, dimension: "3d", engine: "threejs", kind: "solid",
    source: { key: "geometry-problem", version: 1 }, surfaceFill: true,
    construction: { kind: "tetrahedron-problem", prompt, rightAtD, lineAngleDegrees: lineAngle!.degrees },
    parameters: [dimensionParameter("BC", sideBC), dimensionParameter("CD", sideCD)], objects,
    camera: { position: [9, 8, -8], target: [1.5, 2, 1.5] },
    accessibility: { description: "Tứ diện ABCD dựng từ độ dài và góc được nêu trong đề; bật tắt đỉnh, cạnh, số đo, ký hiệu góc và mặt." },
  });
  const threeVisual = visual as Extract<typeof visual, { dimension: "3d" }>;
  const result = AgentResultSchema.parse({
    title: "Tứ diện ABCD theo dữ kiện đề bài",
    explanation: `Đã dựng hình theo BC = ${lengths.get("BC")!.label.split("=")[1].trim()} và CD = ${lengths.get("CD")!.label.split("=")[1].trim()}; góc vuông ∠${rightAtD ? "ADC" : "ACD"} tại ${rightAtD ? "D" : "C"} được giữ đúng như đề. Trên hình chỉ hiển thị đỉnh, cạnh, độ dài và góc đã cho; phần suy ra nằm ở bảng thông tin bên phải.${exactCosine ? ` Với dữ kiện này, cos φ = ${exactCosine.a}/√${exactCosine.b}, nên a + b = ${exactCosine.a + exactCosine.b}.` : ""} Thay đổi BC hoặc CD vẫn giữ nguyên các góc đã cho.`,
    visual: threeVisual,
    entities: objects.map((object) => ({ id: object.id, type: object.type === "label3d" ? "derived" : object.annotationKind === "vertex" ? "point" : object.annotationKind === "angle" ? "derived" : object.annotationKind === "length" ? "derived" : "derived", label: object.label || object.id, role: object.annotationKind === "length" || object.annotationKind === "angle" ? "given" : "derived" })),
    methods: [],
    steps: [
      { id: "read_geometry_data", title: "Đọc dữ kiện hình học", content: "Đối chiếu BC, CD và từng ký hiệu góc với đề. Các nhóm chú thích có thể bật/tắt ở thanh điều khiển của bảng.", visualId: threeVisual.id, visualActions: [] },
      { id: "inspect_tetrahedron", title: "Quan sát tứ diện trong không gian", content: `Xoay mô hình để quan sát các mặt ABC, ACD và cạnh chung AC. Thay đổi hai cạnh ở thanh dưới bảng để kiểm tra cấu trúc hình.${exactCosine ? ` Kết quả ban đầu: cos φ = ${exactCosine.a}/√${exactCosine.b}, a + b = ${exactCosine.a + exactCosine.b}.` : ""}`, visualId: threeVisual.id, visualActions: [] },
    ],
    suggestions: ["Kiểm tra dữ kiện", "Quan sát góc nhị diện", "Tính cos φ"],
    exploration: { detected: "Nhận diện bài toán dựng tứ diện có các ràng buộc góc và độ dài.", question: "Hai mặt phẳng (ABC) và (ACD) giao nhau theo cạnh nào? Góc phẳng nào biểu diễn góc nhị diện này?", alternatives: [] },
    source: "template",
  });
  return result;
}
