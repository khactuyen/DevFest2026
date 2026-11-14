import { AppError } from "./app-error";
import {
  ThreeVisualSpecSchema,
  TwoDVisualSpecSchema,
  type ThreeVisualSpec,
  type ThreeVisualObject,
  type TwoDVisualSpec,
} from "./contracts";

const GREEN = "#17835e";
const ACCENT = "#e28b20";
const UNIT_SCALE: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  dm: 0.1,
  m: 1,
};

type FrustumDimensions = {
  bottom: number;
  top: number;
  lateral: number;
  height: number;
  display: { bottom: string; top: string; lateral: string };
  unit: string;
};

function normalize(text: string) {
  return text
    .replace(/\\(?:text|mathrm)\s*\{([^}]*)\}/g, "$1")
    .replace(/\^\s*\{?\\(?:prime|circ)\}?/g, "'")
    .replace(/[′’`]/g, "'")
    .replace(/\\,/g, " ")
    .replace(/\s+/g, " ");
}

function readLength(text: string, edgePattern: string) {
  const match = new RegExp(
    `(?:^|[^A-Za-z0-9'])${edgePattern}\\s*(?:=|\\b(?:bằng|dài)\\b)\\s*([+−-]?\\d+(?:[.,]\\d+)?)\\s*(mm|cm|dm|m)?\\b(?!\\s*a\\b)`,
    "i",
  ).exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(",", ".").replace("−", "-"));
  if (!Number.isFinite(value) || value <= 0) throw new AppError(422, "Độ dài cạnh của hình chóp cụt phải dương và hữu hạn.", "needs_review");
  return { value, unit: match[2]?.toLowerCase() || "" };
}

function displayNumber(value: number) {
  return Number(value.toPrecision(6)).toString();
}

export function readRegularSquareFrustumDimensions(source: string, allowLayout = false): FrustumDimensions | null {
  const text = normalize(source);
  if (!/ch[oó]p\s*c[uụ]t\s*(?:tứ\s*giác|đáy\s*v[uô]ng|vu[oô]ng)\s*đều/i.test(text)) return null;
  const bottom = readLength(text, "A\\s*B");
  const top = readLength(text, "A\\s*'\\s*B\\s*'");
  const lateral = readLength(text, "A\\s*A\\s*'");
  if ((!bottom || !top || !lateral) && !allowLayout)
    throw new AppError(
      422,
      "Đã nhận ra hình chóp cụt tứ giác đều nhưng chưa đọc đủ AB, A′B′ và AA′. Hãy kiểm tra cách ghi ba độ dài cạnh trong đề.",
      "unsupported",
    );
  const units = [bottom?.unit, top?.unit, lateral?.unit].filter(Boolean);
  const unit = units[0] || "";
  if (units.some((item) => item !== unit))
    throw new AppError(422, "Ba cạnh của hình chóp cụt đang dùng đơn vị khác nhau; hãy quy đổi về cùng đơn vị.", "unsupported");
  const scale = unit ? UNIT_SCALE[unit] : 1;
  if (!scale) throw new AppError(422, "Đơn vị cạnh chưa được hỗ trợ. Dùng mm, cm, dm hoặc m.", "unsupported");
  const reference = bottom?.value ?? top?.value ?? lateral?.value ?? 4;
  const gap = Math.min(reference * .45, lateral ? lateral.value * .65 : Infinity);
  const a = bottom?.value ?? (top ? top.value + gap : reference);
  const b = top?.value ?? a - gap;
  const edge = lateral?.value ?? Math.hypot(a * .78, (a - b) / Math.SQRT2);
  if (a <= b)
    throw new AppError(422, "Cạnh đáy nhỏ phải ngắn hơn cạnh đáy lớn của hình chóp cụt.", "unsupported");
  const offset = (a - b) / 2;
  const heightSquared = edge * edge - 2 * offset * offset;
  if (heightSquared <= Math.max(1, edge * edge) * 1e-10)
    throw new AppError(422, "Độ dài cạnh bên không tạo được hình chóp cụt có chiều cao dương; hãy đối chiếu lại các số đo.", "unsupported");
  return {
    bottom: a,
    top: b,
    lateral: edge,
    height: Math.sqrt(heightSquared),
    unit,
    display: {
      bottom: bottom ? `${displayNumber(bottom.value)}${unit ? ` ${unit}` : ""}` : "",
      top: top ? `${displayNumber(top.value)}${unit ? ` ${unit}` : ""}` : "",
      lateral: lateral ? `${displayNumber(lateral.value)}${unit ? ` ${unit}` : ""}` : "",
    },
  };
}

export function squareFrustumVisuals(
  dimensions: FrustumDimensions,
  highlightSkewLines = false,
): { visual: TwoDVisualSpec; visual3d: ThreeVisualSpec; note: string } {
  const { bottom: a, top: b, height: h, display, unit } = dimensions;
  const vertices: Record<string, [number, number, number]> = {
    A: [-a / 2, -a / 2, 0], B: [a / 2, -a / 2, 0],
    C: [a / 2, a / 2, 0], D: [-a / 2, a / 2, 0],
    "A'": [-b / 2, -b / 2, h], "B'": [b / 2, -b / 2, h],
    "C'": [b / 2, b / 2, h], "D'": [-b / 2, b / 2, h],
  };
  const edges: Array<[string, string]> = [
    ["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"],
    ["A'", "B'"], ["B'", "C'"], ["C'", "D'"], ["D'", "A'"],
    ["A", "A'"], ["B", "B'"], ["C", "C'"], ["D", "D'"],
  ];
  const measurements: Record<string, string> = {
    AB: display.bottom,
    "A'B'": display.top,
    "AA'": display.lateral,
  };
  const projection = ([x, y, z]: [number, number, number]): [number, number] =>
    [x - y * 0.48, z + (x + y) * 0.24];
  const projected = Object.fromEntries(Object.entries(vertices).map(([id, p]) => [id, projection(p)]));
  const radius = a / 2 + h * 0.3;
  const objects2d: Array<Partial<TwoDVisualSpec["objects"][number]> & { id: string; type: TwoDVisualSpec["objects"][number]["type"] }> = Object.entries(vertices).map(([id, p]) => ({
    id: `point_${id.replace("'", "p")}`,
    type: "point" as const,
    label: id,
    x: projected[id][0],
    y: projected[id][1],
    free: false,
    visible: true,
    color: GREEN,
    annotationKind: "vertex" as const,
  }));
  for (const [first, second] of edges) {
    const label = `${first}${second}`;
    const emphasized = highlightSkewLines && (label === "AA'" || label === "CD");
    objects2d.push({
      id: `edge_${label.replaceAll("'", "p")}`,
      type: "segment",
      parents: [`point_${first.replace("'", "p")}`, `point_${second.replace("'", "p")}`],
      label,
      ...(measurements[label] ? { measurement: measurements[label], annotationKind: "length" as const } : {}),
      color: emphasized ? ACCENT : GREEN,
      strokeWidth: emphasized ? 3 : 2,
      visible: true,
    });
  }
  const note = Object.values(display).every(Boolean)
    ? `Hình chóp cụt tứ giác đều dựng theo AB = ${display.bottom}, A′B′ = ${display.top}, AA′ = ${display.lateral}. Chiều cao suy ra là ${displayNumber(h)}${unit ? ` ${unit}` : ""}; các cạnh AA′ và CD ${highlightSkewLines ? "được tô màu để đối chiếu câu hỏi" : "được giữ đúng vị trí hình học"}.`
    : "Hình chóp cụt tứ giác đều. Các kích thước còn thiếu được chọn để minh họa; hình chỉ ghi số đo có trong đề.";
  const visual = TwoDVisualSpecSchema.parse({
    id: "solve_square_frustum_projection", version: 1, dimension: "2d", engine: "jsxgraph",
    source: { key: "solve-square-frustum", version: 1 }, kind: "geometry", surfaceFill: false, projectionOf3d: true,
    viewport: { x: [-radius * 1.35, radius * 1.35], y: [-radius * 0.45, radius * 1.45] },
    parameters: [], objects: objects2d,
    accessibility: { description: `${note} Đây là hình chiếu xiên; chuyển sang 3D để xoay khối.` },
  });

  const objects3d: Array<Partial<ThreeVisualObject> & { id: string; type: ThreeVisualObject["type"] }> = [];
  const faceColor = "#27a879";
  for (const [index, [first, second]] of edges.entries()) {
    const label = `${first}${second}`;
    const emphasized = highlightSkewLines && (label === "AA'" || label === "CD");
    objects3d.push({
      id: `edge_${index}`, type: "curve3d", points3d: [vertices[first], vertices[second]],
      color: emphasized ? ACCENT : GREEN, strokeWidth: emphasized ? 3.5 : 2,
      visible: true, label,
    });
    if (measurements[label]) {
      const p = vertices[first], q = vertices[second];
      objects3d.push({
        id: `measure_${index}`, type: "label3d", text: `${label} = ${measurements[label]}`,
        color: emphasized ? ACCENT : GREEN,
        position: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + a * 0.045],
        annotationKind: "length", visible: true,
      });
    }
  }
  for (const [id, position] of Object.entries(vertices)) {
    objects3d.push({ id: `point_${id.replace("'", "p")}`, type: "sphere", marker: true,
      radius: a * 0.018, position, color: GREEN, label: id, annotationKind: "vertex" });
    objects3d.push({ id: `label_${id.replace("'", "p")}`, type: "label3d", text: id,
      position: [position[0] * 1.04, position[1] * 1.04, position[2] + a * 0.035], color: GREEN, annotationKind: "vertex" });
  }
  const faces: string[][] = [
    ["A", "B", "B'", "A'"], ["B", "C", "C'", "B'"],
    ["C", "D", "D'", "C'"], ["D", "A", "A'", "D'"],
    ["A", "D", "C", "B"], ["A'", "B'", "C'", "D'"],
  ];
  for (const [i, face] of faces.entries()) {
    const p = face.map((id) => vertices[id]);
    objects3d.push({ id: `face_${i}_a`, type: "face3d", points3d: [p[0], p[1], p[2]], color: faceColor, visible: true });
    objects3d.push({ id: `face_${i}_b`, type: "face3d", points3d: [p[0], p[2], p[3]], color: faceColor, visible: true });
  }
  const visual3d = ThreeVisualSpecSchema.parse({
    id: "solve_square_frustum_3d", version: 1, dimension: "3d", engine: "threejs",
    kind: "solid", source: { key: "solve-square-frustum", version: 1 }, surfaceFill: true,
    parameters: [], objects: objects3d,
    camera: { position: [a * 2, h * 1.6 + a, a * 2.3], target: [0, 0, h / 2] },
    accessibility: { description: note },
  });
  return { visual, visual3d, note };
}
