import {
  type AgentResult,
  type ThreeVisualSpec,
  type TwoDVisualSpec,
} from "./contracts";
import { validateVisual, validateAgent } from "./validation";
import { AppError } from "./app-error";
import { readTunnelSource } from "./tunnel-source";

export const TUNNEL_NOTE =
  "Mô hình theo mặt cắt trong hình nguồn: trục parabol SH vuông góc đáy. Nếu chỉ nhập chữ, cần đối chiếu hướng trục với hình. B được đặt ở giữa AC để minh họa một thiết diện bất kỳ, không phải giả thiết B là trung điểm.";
export function isTunnelProblem(prompt: string) {
  return (
    /đường\s*hầm/iu.test(prompt.normalize("NFC")) &&
    /parabol/iu.test(prompt.normalize("NFC"))
  );
}

/** Bounded family from the supplied source, not a universal solid recogniser. */
export function readTunnelDimensions(prompt: string) {
  if (!isTunnelProblem(prompt)) return null;
  return readTunnelSource(prompt);
}

export function tunnelPlan(
  length: number,
  wide: number,
  narrow: number,
): TwoDVisualSpec {
  const x = length / 2,
    width = (wide + narrow) / 2,
    sectionX = length + wide * 0.8;
  const objects: Record<string, unknown>[] = [];
  const point = (id: string, px: number, py: number, label = id) =>
    objects.push({ id, type: "point", x: px, y: py, label });
  const edge = (
    id: string,
    a: string,
    b: string,
    measurement?: string,
    dashed = false,
  ) =>
    objects.push({
      id,
      type: "segment",
      parents: [a, b],
      ...(measurement ? { label: a + b, measurement } : {}),
      ...(dashed ? { lineStyle: "dashed" } : {}),
    });
  point("A", 0, 0);
  point("C", length, 0);
  point("D", length, narrow);
  point("F", 0, wide);
  point("B", x, 0);
  point("E", x, width);
  point("H", x, width / 3);
  edge("AC", "A", "C", `${length} m`);
  edge("AF", "A", "F", `${wide} m`);
  edge("CD", "C", "D", `${narrow} m`);
  edge("DF", "D", "F");
  edge("BE", "B", "E", undefined, true);
  point("section_B", sectionX, 0, "B");
  point("section_E", sectionX + width, 0, "E");
  point("section_H", sectionX + width / 3, 0, "H");
  point("section_S", sectionX + width / 3, (4 * width) / 3, "S");
  point("section_G", sectionX, width, "G");
  edge("section_BE", "section_B", "section_E");
  edge("section_BG", "section_B", "section_G");
  edge("section_SH", "section_S", "section_H", undefined, true);
  objects.push({
    id: "section_roof",
    type: "functionGraph",
    expression: `${width}+2*(x-${sectionX})-3*(x-${sectionX})^2/${width}`,
    domain: [sectionX, sectionX + width],
  });
  objects.push(
    {
      id: "floor_title",
      type: "text",
      x: 0,
      y: -wide * 0.28,
      text: "Mặt đáy ACDF (m)",
    },
    {
      id: "section_title",
      type: "text",
      x: sectionX,
      y: -wide * 0.28,
      text: "Thiết diện bất kỳ: BE = BG; SH = 2EH",
    },
  );
  return validateVisual({
    id: "solve_tunnel_section",
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "geometry",
    source: { key: "tunnel-parabolic", version: 1 },
    parameters: [],
    viewport: {
      x: [-wide * 0.3, sectionX + width + wide * 0.3],
      y: [-wide * 0.5, wide * 1.5],
    },
    accessibility: { description: TUNNEL_NOTE },
    surfaceFill: false,
    objects: objects.map((o) => ({ color: "#17835e", ...o })),
  }) as TwoDVisualSpec;
}
export function tunnelFromPlan(source: TwoDVisualSpec): ThreeVisualSpec {
  const point = (id: string) => source.objects.find((o) => o.id === id);
  const length = Number(point("C")?.x),
    wide = Number(point("F")?.y),
    narrow = Number(point("D")?.y);
  if (
    ![length, wide, narrow].every((n) => Number.isFinite(n) && n > 0) ||
    Math.abs(wide - 2 * narrow) > 1e-8
  )
    throw Error("Mặt đáy đường hầm không khớp bộ dựng.");
  const objects: Record<string, unknown>[] = [];
  type P = [number, number, number];
  const w = (x: number) => wide + ((narrow - wide) * x) / length;
  const roof = (x: number, t: number): P => [
    x,
    w(x) * (1 + 2 * t - 3 * t * t),
    w(x) * t,
  ];
  const curve = (id: string, points: P[], dashed = false, kind = "structure") =>
    objects.push({
      id,
      type: "curve3d",
      points3d: points,
      lineStyle: dashed ? "dashed" : "solid",
      annotationKind: kind,
      strokeWidth: 2,
    });
  const label = (id: string, text: string, position: P, kind = "vertex") =>
    objects.push({ id, type: "label3d", text, position, annotationKind: kind });
  curve("base", [
    [0, 0, 0],
    [length, 0, 0],
    [length, 0, narrow],
    [0, 0, wide],
    [0, 0, 0],
  ]);
  const arc = (x: number) =>
    Array.from({ length: 41 }, (_, i) => roof(x, i / 40));
  curve("roof_AF", arc(0));
  curve("roof_CD", arc(length));
  curve("wall_top", [roof(0, 0), roof(length, 0)]);
  curve("ridge", [roof(0, 1 / 3), roof(length, 1 / 3)], true);
  curve("wall_A", [[0, 0, 0], roof(0, 0)]);
  curve("wall_C", [[length, 0, 0], roof(length, 0)]);
  const x = length / 2,
    width = w(x);
  const points: Record<string, P> = {
    A: [0, 0, 0],
    C: [length, 0, 0],
    D: [length, 0, narrow],
    F: [0, 0, wide],
    B: [x, 0, 0],
    E: [x, 0, width],
    H: [x, 0, width / 3],
    S: roof(x, 1 / 3),
    G: roof(x, 0),
  };
  for (const [id, p] of Object.entries(points)) {
    objects.push({
      id: `point_${id}`,
      type: "label3d",
      text: id,
      position: p,
      marker: true,
      annotationKind: "vertex",
    });
  }
  curve("section_roof", arc(x));
  curve("section_BE", [points.B, points.E]);
  curve("section_BG", [points.B, points.G]);
  curve("section_SH", [points.S, points.H], true);
  label(
    "length_AC",
    `AC = ${length} m`,
    [length / 2, 0, -wide * 0.12],
    "length",
  );
  label("length_AF", `AF = ${wide} m`, [-wide * 0.1, 0, wide / 2], "length");
  label(
    "length_CD",
    `CD = ${narrow} m`,
    [length + wide * 0.1, 0, narrow / 2],
    "length",
  );
  label("equal_BE_BG", "BE = BG", [x, width * 0.5, -wide * 0.1], "length");
  label("ratio_SH_EH", "SH = 2EH", [x, width * 1.1, width * 0.45], "length");
  // Actual roof strip, not a pyramid/wireframe of guessed straight edges.
  for (let i = 0; i < 12; i++) {
    const p = roof(0, i / 12),
      q = roof(0, (i + 1) / 12),
      r = roof(length, i / 12),
      s = roof(length, (i + 1) / 12);
    objects.push(
      {
        id: `roof_face_${i}_a`,
        type: "face3d",
        points3d: [p, r, q],
        annotationKind: "face",
      },
      {
        id: `roof_face_${i}_b`,
        type: "face3d",
        points3d: [q, r, s],
        annotationKind: "face",
      },
    );
  }
  return validateVisual({
    id: "tunnel_parabolic_3d",
    version: 1,
    dimension: "3d",
    engine: "threejs",
    source: { key: "tunnel-parabolic", version: 1 },
    kind: "solid",
    parameters: [],
    surfaceFill: true,
    camera: {
      position: [-length * 0.8, wide * 2.5, -length * 0.8],
      target: [length / 2, wide * 0.4, wide * 0.35],
    },
    accessibility: { description: TUNNEL_NOTE },
    objects: objects.map((o) => ({ color: "#17835e", ...o })),
  }) as ThreeVisualSpec;
}
export function tunnelResult(prompt: string): AgentResult | null {
  const data = readTunnelDimensions(prompt);
  if (!data) return null;
  const visual = tunnelFromPlan(
    tunnelPlan(data.length, data.wide, data.narrow),
  );
  return validateAgent({
    title: "Đường hầm có mặt cắt parabol",
    explanation: TUNNEL_NOTE,
    visual,
    entities: [],
    methods: [],
    steps: [],
    suggestions: [
      "Xoay hình để xem thiết diện",
      "Đối chiếu các số đo và hướng trục với hình nguồn",
    ],
    source: "template",
  });
}
