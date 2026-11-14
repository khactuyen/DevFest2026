import { type TwoDVisualSpec } from "./contracts";
import { readIsoscelesMedian, stripGeometryProofHeading } from "./solve-isosceles-relations";
import { validateVisual } from "./validation";

/** Equality is a relation, not a numerical length inferred from sketch pixels. */
export function isoscelesRelationVisual(
  prompt: string,
  givens: string[] = [],
  interactive = false,
): TwoDVisualSpec | null {
  const withoutHeading = stripGeometryProofHeading(prompt);
  const sourceFacts =
    interactive && !givens.length
      ? [withoutHeading.split(/chứng\s*(?:minh|tỏ)/iu)[0]]
      : givens;
  const relation = readIsoscelesMedian(prompt, sourceFacts);
  if (!relation) return null;
  const {
    vertex: a,
    base: [b, c],
    midpoint: m,
  } = relation;
  const s = (v: number): number | string => (interactive ? `${v}*scale` : v);
  const objects: Record<string, unknown>[] = [
    { id: a, type: "point", label: a, x: s(0), y: s(4) },
    { id: b, type: "point", label: b, x: s(-3), y: s(0) },
    { id: c, type: "point", label: c, x: s(3), y: s(0) },
    { id: m, type: "midpoint", label: m, parents: [b, c] },
    { id: `${a}${b}`, type: "segment", parents: [a, b] },
    { id: `${a}${c}`, type: "segment", parents: [a, c] },
    { id: `${b}${c}`, type: "segment", parents: [b, c] },
    { id: `${a}${m}`, type: "segment", parents: [a, m], lineStyle: "dashed" },
    {
      id: "given_sides",
      type: "text",
      x: s(-3),
      y: s(-0.55),
      text: `${a}${b} = ${a}${c} · ${b}${m} = ${m}${c}`,
      annotationKind: "length",
    },
  ];
  // One hatch on each equal side; two hatches on each equal half of the base.
  const tick = (id: string, x: number, y: number, dx: number, dy: number) => {
    objects.push(
      {
        id: `${id}_p`,
        type: "point",
        x: s(x - dx),
        y: s(y - dy),
        visible: false,
      },
      {
        id: `${id}_q`,
        type: "point",
        x: s(x + dx),
        y: s(y + dy),
        visible: false,
      },
      {
        id,
        type: "segment",
        parents: [`${id}_p`, `${id}_q`],
        strokeWidth: 2,
        annotationKind: "length",
      },
    );
  };
  tick("equal_left", -1.5, 2, 0.096, -0.072);
  tick("equal_right", 1.5, 2, 0.096, 0.072);
  for (const [id, x] of [
    ["base_left", -1.5],
    ["base_right", 1.5],
  ] as const) {
    tick(`${id}_1`, x - 0.05, 0, 0, 0.12);
    tick(`${id}_2`, x + 0.05, 0, 0, 0.12);
  }
  return validateVisual({
    id: "solve_triangle_median",
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    source: { key: "solve-illustration", version: 1 },
    kind: "geometry",
    surfaceFill: false,
    viewport: { x: [-4.5, 4.5], y: [-1, 5] },
    parameters: interactive
      ? [
          {
            id: "scale",
            label: "Tỉ lệ hiển thị (không phải độ dài đề cho)",
            value: 1,
            min: 0.5,
            max: 1.5,
            step: 0.05,
          },
        ]
      : [],
    accessibility: {
      description: `Tam giác ${a}${b}${c} cân tại ${a}; ký hiệu ${a}${b} = ${a}${c} và ${b}${m} = ${m}${c}. Không có số đo cạnh trong đề; không đánh dấu sẵn góc vuông cần chứng minh.`,
    },
    objects: objects.map((o) => ({ color: "#17835e", ...o })),
  }) as TwoDVisualSpec;
}
