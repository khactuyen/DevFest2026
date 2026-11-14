import { AppError } from "./app-error";
import type { TwoDVisualSpec } from "./contracts";
import { readMidpointRelations } from "./geometry-relations";
import { validateVisual } from "./validation";

const pairKey = (a: string, b: string) => [a, b].sort().join("");
const sameCycle = (actual: string[], expected: string[]) =>
  [expected, expected.slice().reverse()].some((order) =>
    order.some((_, offset) =>
      actual.every(
        (point, index) => point === order[(index + offset) % order.length],
      ),
    ),
  );

/** Orthographic illustration of a rectangle revolving about its midpoint axis. */
export function rectangleRevolutionVisual(
  prompt: string,
  givens: string[],
): TwoDVisualSpec | null {
  const source = prompt.replace(/https?:\/\/\S+/giu, "");
  const facts = `${source}\n${givens.join("\n")}`;
  if (!/hình\s*trụ/iu.test(source) || !/quay/iu.test(source)) return null;
  const rectangle =
    /hình\s*chữ\s*nhật\s*([A-Z]{4})(?![\p{L}\p{N}_])/u.exec(source) ||
    /(?<![\p{L}\p{N}_])([A-Z]{4})\s+là\s+hình\s*chữ\s*nhật/iu.exec(source);
  const axis =
    /(?:chứa\s+cạnh\s+|quanh\s+(?:(?:trục|cạnh|đường\s*thẳng)\s+)?|trục\s+)([A-Z]\s*[A-Z])(?![\p{L}\p{N}_])/u.exec(
      source,
    );
  const rotating =
    /quay\s+hình\s*chữ\s*nhật\s*([A-Z]{4})(?![\p{L}\p{N}_])/u.exec(source);
  if (!rectangle || !axis || !rotating) return null;
  const names = rectangle[1].toUpperCase().split("");
  if (new Set(names).size !== 4) return null;
  const midpoints = readMidpointRelations(facts);
  if (midpoints.issues.length || midpoints.relations.length !== 2) return null;
  const axisNames = axis[1].replace(/\s/g, "").split("");
  const bottom = midpoints.relations.find(
    (relation) => relation.point === axisNames[0],
  );
  const top = midpoints.relations.find(
    (relation) => relation.point === axisNames[1],
  );
  if (!bottom || !top || axisNames.some((name) => names.includes(name)))
    return null;
  const rectangleEdges = names.map((name, index) =>
    pairKey(name, names[(index + 1) % 4]),
  );
  const bottomEdge = rectangleEdges.indexOf(pairKey(...bottom.ends));
  const topEdge = rectangleEdges.indexOf(pairKey(...top.ends));
  if (bottomEdge < 0 || (bottomEdge + 2) % 4 !== topEdge) return null;
  const [a, d] = bottom.ends;
  const b = top.ends.find((name) => rectangleEdges.includes(pairKey(a, name)))!;
  const c = top.ends.find((name) => name !== b)!;
  const [o, i] = axisNames;
  const rotatedNames = rotating[1].split("");
  const generatingRectangle = [[a, o, i, b], [d, o, i, c], names].find(
    (cycle) => sameCycle(rotatedNames, cycle),
  );
  if (!generatingRectangle) return null;
  // Extra incidence/angle constraints require another construction, not a
  // silent substitution of this reviewed diagram for a more involved problem.
  if (
    /giao\s*điểm|tiếp\s*tuyến|thiết\s*diện|đường\s*chéo|vuông\s*góc|song\s*song|⊥|\/\/|góc\s*\w+\s*=|[A-Z]{2}\s*=\s*\d+(?:[.,]\d+)?\s*[A-Z]{2}/u.test(
      facts,
    )
  )
    return null;
  const roles = new Map<
    string,
    { dimension: "radius" | "height"; factor: number }
  >();
  for (const ends of [
    [o, a],
    [o, d],
    [i, b],
    [i, c],
  ])
    roles.set(pairKey(ends[0], ends[1]), { dimension: "radius", factor: 1 });
  for (const ends of [
    [a, d],
    [b, c],
  ])
    roles.set(pairKey(ends[0], ends[1]), { dimension: "radius", factor: 2 });
  for (const ends of [
    [o, i],
    [a, b],
    [d, c],
  ])
    roles.set(pairKey(ends[0], ends[1]), { dimension: "height", factor: 1 });
  const recognizedMeasurements = new Set<number>();
  for (const match of facts.matchAll(
    /(?<![\p{L}\p{N}_])([A-Z])([A-Z])\s*=\s*([A-Z])([A-Z])(?![\p{L}\p{N}_])/gu,
  )) {
    const first = roles.get(pairKey(match[1], match[2])),
      second = roles.get(pairKey(match[3], match[4]));
    if (
      !first ||
      !second ||
      first.dimension !== second.dimension ||
      first.factor !== second.factor
    )
      return null;
    recognizedMeasurements.add(match.index!);
  }
  const dimensions: Partial<Record<"radius" | "height", number>> = {};
  const measurements = new Map<
    string,
    { label: string; value: number; unit: string }
  >();
  const values = [
    ...facts.matchAll(
      /(?<![\p{L}\p{N}_])([A-Z])([A-Z])\s*(?:=|bằng)\s*([+-]?\d+(?:[.,]\d+)?)\s*(cm|mm|m)?(?![\p{L}\p{N}_]|[.,]\d)/gu,
    ),
  ];
  const units = new Set(values.map((match) => match[4]).filter(Boolean));
  if (units.size > 1) return null;
  for (const match of values) {
    if (
      /^\s*(?:[+*/^√×÷\\-]|sqrt\b|pi\b|(?:cm|mm|m)[²³])/u.test(
        facts.slice(match.index! + match[0].length),
      )
    )
      return null;
    recognizedMeasurements.add(match.index!);
    const role = roles.get(pairKey(match[1], match[2]));
    if (!role) return null;
    const value = Number(match[3].replace(",", ".")),
      dimension = value / role.factor;
    if (dimension <= 0 || dimension > 1000)
      throw new AppError(
        422,
        "Kích thước hình trụ phải dương và nằm trong phạm vi dựng hình.",
        "needs_review",
      );
    const previous = dimensions[role.dimension];
    if (
      previous !== undefined &&
      Math.abs(previous - dimension) > 1e-8 * Math.max(1, previous, dimension)
    )
      throw new AppError(
        422,
        `Các số đo ${role.dimension === "radius" ? "bán kính/đường kính" : "chiều cao"} trong đề chưa nhất quán.`,
        "needs_review",
      );
    dimensions[role.dimension] = dimension;
    const unit = match[4] || "";
    const key = pairKey(match[1], match[2]);
    const old = measurements.get(key);
    measurements.set(key, {
      label: match[1] + match[2],
      value,
      unit: unit || old?.unit || "",
    });
  }
  for (const assignment of facts.matchAll(
    /(?<![\p{L}\p{N}_])[A-Z]{2}\s*(?:=|bằng)\s*/gu,
  ))
    if (!recognizedMeasurements.has(assignment.index!)) return null;
  if (
    /(?:bán\s*kính|chiều\s*cao|(?<!\p{L})[rh])\s*(?:=|bằng)\s*\d/iu.test(facts)
  )
    return null;
  const radius = dimensions.radius ?? 2,
    height = dimensions.height ?? 5;
  const minor = Math.min(radius * 0.32, height * 0.16);
  const objects: Record<string, unknown>[] = [
    { id: a, type: "point", label: a, x: -radius, y: 0, color: "#17835e" },
    { id: d, type: "point", label: d, x: radius, y: 0, color: "#17835e" },
    { id: b, type: "point", label: b, x: -radius, y: height, color: "#17835e" },
    { id: c, type: "point", label: c, x: radius, y: height, color: "#17835e" },
    {
      id: o,
      type: "midpoint",
      label: o,
      parents: bottom.ends,
      color: "#17835e",
    },
    { id: i, type: "midpoint", label: i, parents: top.ends, color: "#17835e" },
    {
      id: "generating_rectangle",
      type: "polygon",
      parents: generatingRectangle,
      color: "#17835e",
      strokeOpacity: 0,
    },
  ];
  for (const [id, y, sign, dashed] of [
    ["bottom_back", 0, 1, true],
    ["bottom_front", 0, -1, false],
    ["top_back", height, 1, false],
    ["top_front", height, -1, false],
  ] as const)
    objects.push({
      id,
      type: "functionGraph",
      expression: `(${y})+(${sign * minor})*sqrt(abs(1-(x/(${radius}))^2))`,
      domain: [-radius, radius],
      color: "#17835e",
      strokeWidth: 2.5,
      ...(dashed ? { lineStyle: "dashed" } : {}),
    });
  for (const [first, second] of [
    [a, b],
    [d, c],
    [o, a],
    [o, d],
    [i, b],
    [i, c],
    [o, i],
  ]) {
    const axisSegment = first === o && second === i;
    const measurement = measurements.get(pairKey(first, second));
    objects.push({
      id: `edge_${first}_${second}`,
      type: "segment",
      parents: [first, second],
      color: axisSegment ? "#607d71" : "#17835e",
      ...(axisSegment ? { lineStyle: "dashed", label: `Trục ${o}${i}` } : {}),
      ...(measurement
        ? {
            label: axisSegment ? `Trục ${o}${i}` : measurement.label,
            measurement: `${measurement.value}${measurement.unit ? ` ${measurement.unit}` : ""}`,
          }
        : {}),
    });
  }
  // A specified full diameter has its own dimension label; unprovided lengths
  // have no label, because the renderer otherwise prints illustrative values.
  for (const ends of [bottom.ends, top.ends]) {
    const measurement = measurements.get(pairKey(...ends));
    if (measurement)
      objects.push({
        id: `dimension_${ends.join("")}`,
        type: "segment",
        parents: ends,
        label: measurement.label,
        measurement: `${measurement.value}${measurement.unit ? ` ${measurement.unit}` : ""}`,
        strokeOpacity: 0,
      });
  }
  return validateVisual({
    id: "solve_cylinder_revolution",
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    source: { key: "solve-cylinder-revolution", version: 1 },
    kind: "geometry",
    surfaceFill: true,
    parameters: [],
    viewport: {
      x: [-radius * 1.7, radius * 1.7],
      y: [-minor - radius * 0.4, height + minor + radius * 0.4],
    },
    accessibility: {
      description: `Hình chiếu 2D của hình trụ tạo bởi hình chữ nhật ${rotating[1]} quay quanh ${o}${i}. Hai đường tròn đáy được biểu diễn bằng elip. ${o} và ${i} là trung điểm hai cạnh đối diện; các đoạn và điểm được giữ theo đề.`,
    },
    objects,
  }) as TwoDVisualSpec;
}
