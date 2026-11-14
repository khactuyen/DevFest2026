import { z } from "zod";
import { fitInkLine } from "./ink-line-fit";
import { VisualProgramSchema, type VisualProgram } from "./contracts";
import { compileExpression, polynomialCoefficients } from "./expression";

// Small, auditable image-to-geometry contract. No generated JS is ever executed.
export const SketchPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(1000),
    transcription: z.string().max(2000).default(""),
    ambiguities: z.array(z.string().max(300)).max(12).default([]),
    points: z
      .array(
        z
          .object({
            x: z.number().finite().min(-20).max(20),
            y: z.number().finite().min(-20).max(20),
            label: z.string().max(40).default(""),
          })
          .strict(),
      )
      .max(32),
    edges: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      )
      .max(40),
    dashedEdges: z.array(z.number().int().nonnegative()).max(40).optional(),
    circles: z
      .array(
        z
          .object({
            center: z.number().int().nonnegative(),
            through: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(8),
    dashedCircles: z.array(z.number().int().nonnegative()).max(8).optional(),
    polygons: z
      .array(z.array(z.number().int().nonnegative()).min(3).max(12))
      .max(8)
      .default([]),
    expression: z.string().max(220).default(""),
  })
  .strict()
  .superRefine((plan, context) => {
    for (const index of plan.dashedEdges || [])
      if (index >= plan.edges.length) context.addIssue({ code: "custom", path: ["dashedEdges"], message: "Chỉ số cạnh nét đứt không tồn tại." });
    for (const index of plan.dashedCircles || [])
      if (index >= plan.circles.length) context.addIssue({ code: "custom", path: ["dashedCircles"], message: "Chỉ số đường tròn nét đứt không tồn tại." });
  });
export type SketchPlan = z.infer<typeof SketchPlanSchema>;
export type InkPoint = { x: number; y: number };
export type InkStroke = { points: InkPoint[]; color: string; lineStyle?: "solid" | "dashed" };
export const INK_WIDTH = 1120;
export const INK_HEIGHT = 320;

export function normalizeFunctionExpression(source: string) {
  return source
    .toLocaleLowerCase("vi")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/[×·]/g, "*")
    .replace(/[−–]/g, "-")
    .replace(/÷/g, "/")
    .replace(/[{}]/g, "")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/^[fy]\s*=\s*/i, "")
    .replace(/(\d)(x)/g, "$1*$2")
    .replace(/(x|\))\(/g, "$1*(")
    .replace(/\)(x|\d)/g, ")*$1")
    .replace(/\s+/g, "");
}

function quadraticCoefficients(expression: string): [number, number, number] | null {
  try {
    const structural=polynomialCoefficients(expression);
    if(!structural || structural.length>3)return null;
    const evaluate = compileExpression(expression);
    const at = (x: number) => evaluate({ x });
    const c = at(0), a = (at(1) + at(-1) - 2 * c) / 2, b = (at(1) - at(-1)) / 2;
    if (![a, b, c].every(Number.isFinite) || Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) > 1e4) return null;
    for (const x of [-3.17, -1.4, -0.37, 0.23, 1.8, 4.13]) {
      const actual = at(x), expected = a * x * x + b * x + c;
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-7 * Math.max(1, Math.abs(expected))) return null;
    }
    return [a, b, c];
  } catch {
    return null;
  }
}

function coefficientParameter(id: string, value: number) {
  const span = Math.max(5, Math.abs(value) * 1.5);
  return { id, label: id, min: -span, max: span, value, step: Math.max(0.01, span / 100) };
}

function functionViewport(expression: string, coefficients: [number, number, number] | null) {
  const center = coefficients && Math.abs(coefficients[0]) > 1e-8
    ? -coefficients[1] / (2 * coefficients[0])
    : 0;
  const halfWidth = coefficients && Math.abs(coefficients[0]) > 1e-8
    ? Math.min(12, Math.max(2.5, 4 / Math.sqrt(Math.abs(coefficients[0]))))
    : 8;
  const xMin = center - halfWidth, xMax = center + halfWidth;
  let evaluate: (variables: Record<string, number>) => number;
  try { evaluate = compileExpression(expression); } catch { return { x: [-8, 8], y: [-5, 5] }; }
  const values = Array.from({ length: 161 }, (_, index) => {
    const x = xMin + (xMax - xMin) * index / 160;
    return evaluate({ x });
  }).filter(Number.isFinite);
  if (!values.length) return { x: [-8, 8], y: [-5, 5] };
  const minY = Math.min(0, ...values), maxY = Math.max(0, ...values);
  const padding = Math.max((maxY - minY) * 0.1, 0.7);
  return { x: [xMin, xMax], y: [minY - padding, maxY + padding] };
}

export function sketchProgram(raw: unknown): VisualProgram {
  const plan = normalizeClosedShapes(SketchPlanSchema.parse(raw));
  const normalizedExpression = plan.expression ? normalizeFunctionExpression(plan.expression) : "";
  const coefficients = normalizedExpression ? quadraticCoefficients(normalizedExpression) : null;
  if (
    !plan.edges.length &&
    !plan.circles.length &&
    !plan.polygons.length &&
    !plan.expression
  )
    throw Error(
      "Chưa nhận diện được cạnh, đường tròn hoặc công thức. Hãy vẽ thêm nét rõ hơn.",
    );
  const pair = (a: number, b: number) => {
    if (
      !plan.points[a] ||
      !plan.points[b] ||
      a === b ||
      Math.hypot(
        plan.points[a].x - plan.points[b].x,
        plan.points[a].y - plan.points[b].y,
      ) < 0.001
    )
      throw Error("Hai đầu của cạnh hoặc bán kính không hợp lệ.");
    return [`p${a}`, `p${b}`];
  };
  const primitives: unknown[] = plan.points.map((p, i) => ({
    op: "point",
    id: `p${i}`,
    ...p,
    free: true,
    color: "#168265",
  }));
  plan.edges.forEach(([a, b], i) =>
    primitives.push({
      op: "segment",
      id: `edge${i}`,
      parents: pair(a, b),
      label: "",
      color: "#168265",
      lineStyle: plan.dashedEdges?.includes(i) ? "dashed" : "solid",
    }),
  );
  plan.polygons.forEach((vertices, i) =>
    primitives.push({
      op: "polygon",
      id: `shape${i}`,
      parents: vertices.map((index) => `p${index}`),
      ...(vertices.length === 4 && isRectangle(plan.points, vertices) ? {constraint:isSquare(plan.points,vertices) ? "square" : "rectangle"} : {}),
      label:
        vertices.length === 4 && isRectangle(plan.points, vertices)
          ? "Hình chữ nhật"
          : "Đa giác chuẩn hóa",
      color: "#35a781",
      visible: true,
      strokeOpacity: vertices.every((a, index) => plan.edges.some(([x, y]) => {
        const b = vertices[(index + 1) % vertices.length];
        return x === a && y === b || x === b && y === a;
      })) ? 0 : 1,
    }),
  );
  plan.circles.forEach((c, i) =>
    primitives.push({
      op: "circle",
      id: `circle${i}`,
      parents: pair(c.center, c.through),
      label: "",
      color: "#2563eb",
      lineStyle: plan.dashedCircles?.includes(i) ? "dashed" : "solid",
    }),
  );
  if (plan.expression)
    primitives.push({
      op: "functionGraph",
      id: "graph",
      expression: coefficients ? "a*x^2+b*x+c" : `(${normalizedExpression})+offset`,
      label: plan.transcription.slice(0, 100),
      color: "#168265",
    });
  // Fit complete circles too, not only their center and radius endpoint.
  const bounds = [...plan.points];
  for (const c of plan.circles) {
    const p = plan.points[c.center],
      q = plan.points[c.through],
      r = Math.hypot(q.x - p.x, q.y - p.y);
    bounds.push(
      { x: p.x - r, y: p.y - r, label: "" },
      { x: p.x + r, y: p.y + r, label: "" },
    );
  }
  const xs = bounds.map((p) => p.x),
    ys = bounds.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const pad = Math.max(1, (maxX - minX) * 0.15, (maxY - minY) * 0.15);
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: plan.expression ? "cartesian" : "geometry",
    title: plan.title,
    description: plan.description,
    viewport: plan.expression
      ? functionViewport(coefficients ? `(${normalizedExpression})` : `(${normalizedExpression})+0`, coefficients)
      : { x: [minX - pad, maxX + pad], y: [minY - pad, maxY + pad] },
    parameters: coefficients
      ? [coefficientParameter("a", coefficients[0]), coefficientParameter("b", coefficients[1]), coefficientParameter("c", coefficients[2])]
      : plan.expression
        ? [{ id: "offset", label: "Dịch theo Oy", min: -5, max: 5, value: 0, step: 0.1 }]
      : [],
    primitives,
  });
}

const distance = (a: InkPoint, b: InkPoint) => Math.hypot(a.x - b.x, a.y - b.y);
function isRectangle(points: InkPoint[], ids: number[]) {
  if (ids.length !== 4 || ids.some((i) => !points[i])) return false;
  const [a, b, c, d] = ids.map((i) => points[i]);
  const vec = (p: InkPoint, q: InkPoint) => ({ x: q.x - p.x, y: q.y - p.y });
  const dot = (u: InkPoint, v: InkPoint) => u.x * v.x + u.y * v.y;
  const parallel = (u: InkPoint, v: InkPoint) =>
    Math.abs(u.x * v.y - u.y * v.x) /
    (distance({ x: 0, y: 0 }, u) * distance({ x: 0, y: 0 }, v));
  const u = vec(a, b),
    v = vec(b, c),
    w = vec(c, d),
    z = vec(d, a);
  const [lu, lv, lw, lz] = [
    distance(a, b),
    distance(b, c),
    distance(c, d),
    distance(d, a),
  ];
  if (Math.min(lu, lv, lw, lz) < 0.1) return false;
  return (
    Math.abs(dot(u, v)) / (lu * lv) < 0.5 &&
    Math.abs(dot(w, z)) / (lw * lz) < 0.5 &&
    parallel(u, w) < 0.45 &&
    parallel(v, z) < 0.45 &&
    Math.abs(lu - lw) / Math.max(lu, lw) < 0.45 &&
    Math.abs(lv - lz) / Math.max(lv, lz) < 0.45
  );
}
function isSquare(points: InkPoint[], ids: number[]) {
  if (ids.length !== 4) return false;
  const side = ids.map((id, i) =>
    distance(points[id], points[ids[(i + 1) % 4]]),
  );
  return Math.max(...side) - Math.min(...side) < 0.16 * Math.max(...side);
}

function normalizeClosedShapes(plan: SketchPlan): SketchPlan {
  const adjacency = plan.points.map(() => [] as number[]);
  for (const [a, b] of plan.edges)
    if (adjacency[a] && adjacency[b] && a !== b) {
      adjacency[a].push(b);
      adjacency[b].push(a);
    }
  const cycleKey = (cycle: number[]) => {
    const variants = [cycle, cycle.slice().reverse()];
    return variants
      .flatMap((v) =>
        v.map((_, i) => v.slice(i).concat(v.slice(0, i)).join(",")),
      )
      .sort()[0];
  };
  const known = new Set(plan.polygons.map(cycleKey)),
    candidates = new Map<string, number[]>();
  let explored = 0;
  function walk(start: number, current: number, path: number[]) {
    if (++explored > 5000) return;
    if (path.length > 10) return;
    for (const next of adjacency[current]) {
      if (next === start && path.length >= 3 && !known.has(cycleKey(path)))
        candidates.set(cycleKey(path), path.slice());
      else if (next > start && !path.includes(next))
        walk(start, next, [...path, next]);
    }
  }
  for (let i = 0; i < plan.points.length; i++) walk(i, i, [i]);
  const polygons = plan.polygons.map((p) => p.slice());
  const sortedCycles = [...candidates.values()].sort(
    (a, b) => b.length - a.length,
  );
  for (const cycle of sortedCycles) {
    if (polygons.length >= 8) break;
    if (polygons.some((existing) => cycle.every((id) => existing.includes(id))))
      continue;
    const area =
      Math.abs(
        cycle.reduce((sum, id, i) => {
          const a = plan.points[id],
            b = plan.points[cycle[(i + 1) % cycle.length]];
          return sum + a.x * b.y - b.x * a.y;
        }, 0),
      ) / 2;
    if (area < 0.15) continue;
    if (!isSimpleCycle(plan.points, cycle)) continue;
    if (cycle.length === 4 && isRectangle(plan.points, cycle)) {
      const square = isSquare(plan.points, cycle);
      const [a, b, c, d] = cycle.map((i) => plan.points[i]);
      const center = {
        x: (a.x + b.x + c.x + d.x) / 4,
        y: (a.y + b.y + c.y + d.y) / 4,
      };
      let u = {
        x: (b.x - a.x + (c.x - d.x)) / 2,
        y: (b.y - a.y + (c.y - d.y)) / 2,
      };
      let v = {
        x: (d.x - a.x + (c.x - b.x)) / 2,
        y: (d.y - a.y + (c.y - b.y)) / 2,
      };
      const uu = u.x * u.x + u.y * u.y;
      if (uu > 1e-6) {
        const t = (u.x * v.x + u.y * v.y) / uu;
        v = { x: v.x - t * u.x, y: v.y - t * u.y };
      }
      if (square) {
        const lu = Math.hypot(u.x, u.y),
          lv = Math.hypot(v.x, v.y),
          side = (lu + lv) / 2;
        if (lu > 1e-6 && lv > 1e-6) {
          u = { x: (u.x * side) / lu, y: (u.y * side) / lu };
          v = { x: (v.x * side) / lv, y: (v.y * side) / lv };
        }
      }
      plan.points[cycle[0]] = {
        x: center.x - u.x / 2 - v.x / 2,
        y: center.y - u.y / 2 - v.y / 2,
        label: a.label,
      };
      plan.points[cycle[1]] = {
        x: center.x + u.x / 2 - v.x / 2,
        y: center.y + u.y / 2 - v.y / 2,
        label: b.label,
      };
      plan.points[cycle[2]] = {
        x: center.x + u.x / 2 + v.x / 2,
        y: center.y + u.y / 2 + v.y / 2,
        label: c.label,
      };
      plan.points[cycle[3]] = {
        x: center.x - u.x / 2 + v.x / 2,
        y: center.y - u.y / 2 + v.y / 2,
        label: d.label,
      };
      const note = square ? "chuẩn hóa hình vuông" : "chuẩn hóa hình chữ nhật";
      if (!plan.description.includes(note))
        plan.description += square
          ? " Đã chuẩn hóa hình vuông: bốn cạnh bằng nhau, bốn góc vuông."
          : " Đã chuẩn hóa hình chữ nhật: bốn góc vuông, hai cặp cạnh đối song song.";
    }
    polygons.push(cycle);
    known.add(cycleKey(cycle));
  }
  plan.polygons = polygons;
  return plan;
}

function isSimpleCycle(points: InkPoint[], cycle: number[]) {
  const orient = (p: InkPoint, q: InkPoint, r: InkPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const cross = (a: InkPoint, b: InkPoint, c: InkPoint, d: InkPoint) =>
    orient(a, b, c) * orient(a, b, d) < -1e-8 &&
    orient(c, d, a) * orient(c, d, b) < -1e-8;
  for (let i = 0; i < cycle.length; i++)
    for (let j = i + 1; j < cycle.length; j++) {
      if (j === i + 1 || (i === 0 && j === cycle.length - 1)) continue;
      if (
        cross(
          points[cycle[i]],
          points[cycle[(i + 1) % cycle.length]],
          points[cycle[j]],
          points[cycle[(j + 1) % cycle.length]],
        )
      )
        return false;
    }
  return true;
}

function simplify(points: InkPoint[], tolerance: number): InkPoint[] {
  if (points.length < 3) return points;
  const a = points[0],
    b = points[points.length - 1],
    length2 = distance(a, b) ** 2;
  let farthest = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      t = length2
        ? Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2,
            ),
          )
        : 0;
    const d = distance(p, {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
    });
    if (d > farthest) {
      farthest = d;
      index = i;
    }
  }
  if (farthest <= tolerance) return [a, b];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

/** Fast geometric approximation only; not AI and not a proof of constraints. */
export function normalizeInk(strokes: InkStroke[]): SketchPlan | null {
  let straightened = 0;
  const plan: SketchPlan = {
    title: "Hình phác trực tiếp",
    description:
      "Bản chuẩn hóa nét vẽ tại máy. Các quan hệ hình học chưa được xác nhận.",
    transcription: "",
    ambiguities: [],
    points: [],
    edges: [],
    circles: [],
    polygons: [],
    expression: "",
  };
  function point(p: InkPoint) {
    const found = plan.points.findIndex((q) => distance(p, q) < 0.22);
    if (found >= 0) return found;
    if (plan.points.length >= 32) {
      if (!plan.ambiguities.length)
        plan.ambiguities.push(
          "Nét vẽ phức tạp: bản xem trước chỉ hiển thị một phần; cần AI nhận diện toàn bộ ảnh.",
        );
      return -1;
    }
    plan.points.push({ ...p, label: "" });
    return plan.points.length - 1;
  }
  for (const stroke of strokes.slice(0, 80)) {
    const ps = stroke.points.map((p) => ({
      x: (p.x / INK_WIDTH - 0.5) * 20,
      y: (0.5 - p.y / INK_HEIGHT) * (INK_HEIGHT / INK_WIDTH) * 20,
    }));
    if (ps.length < 2) continue;
    const xs = ps.map((p) => p.x),
      ys = ps.map((p) => p.y),
      w = Math.max(...xs) - Math.min(...xs),
      h = Math.max(...ys) - Math.min(...ys);
    if (Math.max(w, h) < 0.06) continue;
    const center = {
        x: (Math.max(...xs) + Math.min(...xs)) / 2,
        y: (Math.max(...ys) + Math.min(...ys)) / 2,
      },
      r = (w + h) / 4;
    const closed =
      ps.length > 12 && distance(ps[0], ps[ps.length - 1]) < r * 0.35;
    const meanRadius =
      ps.reduce((sum, p) => sum + distance(p, center), 0) / ps.length;
    const radialRms = Math.sqrt(
      ps.reduce((sum, p) => sum + (distance(p, center) - meanRadius) ** 2, 0) /
        ps.length,
    );
    if (
      closed &&
      ps.length >= 16 &&
      Math.min(w, h) / Math.max(w, h) > 0.66 &&
      radialRms / Math.max(meanRadius, 0.01) < 0.29 &&
      Math.max(...ps.map((p) => Math.abs(distance(p, center) - meanRadius))) /
        Math.max(meanRadius, 0.01) <
        0.22 &&
      plan.circles.length < 8 &&
      plan.points.length <= 28
    ) {
      // A drawing often repeats its first point at closure; the bounding box
      // center avoids shifting the fitted circle toward that duplicated end.
      const fittedCenter = center;
      const radius =
        ps.reduce((sum, p) => sum + distance(p, fittedCenter), 0) / ps.length;
      const a = point(fittedCenter),
        b = point({ x: fittedCenter.x + radius, y: fittedCenter.y });
      if (stroke.lineStyle === "dashed") {
        plan.dashedCircles ??= [];
        plan.dashedCircles.push(plan.circles.length);
      }
      plan.circles.push({ center: a, through: b });
      plan.description +=
        " Đã nhận diện nét cong khép kín và dựng thành đường tròn chuẩn.";
      continue;
    }
    // Offer a clean straight segment when the user meant a line but drew a
    // slightly wobbly stroke. Closed/curved strokes keep their own shape.
    let vertices: InkPoint[];
    const fitted = fitInkLine(ps);
    if (fitted?.confident) {
      vertices = fitted.endpoints;
      straightened++;
    } else {
      if (fitted?.likelyLine)
        plan.ambiguities.push("Nét gần thẳng nhưng còn mơ hồ. Hãy chọn Đoạn thẳng để khớp thành một nét, hoặc giữ bản phác nếu đây là đường gấp khúc.");
      vertices = simplify(ps, 0.16);
    }
    if (
      plan.edges.length + vertices.length - 1 > 40 &&
      !plan.ambiguities.length
    )
      plan.ambiguities.push(
        "Nét vẽ phức tạp: bản xem trước được rút gọn; cần AI nhận diện toàn bộ ảnh.",
      );
    for (let i = 1; i < vertices.length && plan.edges.length < 40; i++) {
      const a = point(vertices[i - 1]),
        b = point(vertices[i]);
      if (
        a >= 0 &&
        b >= 0 &&
        a !== b &&
        !plan.edges.some(
          ([x, y]) => (x === a && y === b) || (x === b && y === a),
        )
      ) {
        if (stroke.lineStyle === "dashed") {
          plan.dashedEdges ??= [];
          plan.dashedEdges.push(plan.edges.length);
        }
        plan.edges.push([a, b]);
      }
    }
  }
  if (straightened)
    plan.description += ` Đã tự nắn ${straightened} nét gần thẳng thành đoạn thẳng.`;
  return plan.edges.length || plan.circles.length
    ? normalizeClosedShapes(plan)
    : null;
}
