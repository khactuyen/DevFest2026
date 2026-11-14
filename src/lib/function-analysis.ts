import { compileExpression, polynomialCoefficients } from "./expression";
type ExpressionNode = Parameters<
  NonNullable<Parameters<typeof compileExpression>[2]>
>[0];
function expressionSource(node: ExpressionNode): string {
  if (node.kind === "number" || node.kind === "name") return String(node.value);
  if (node.kind === "unary")
    return `(${node.value}${expressionSource(node.child)})`;
  if (node.kind === "call")
    return `${node.value}(${expressionSource(node.child)})`;
  return `(${expressionSource(node.left)}${node.value}${expressionSource(node.right)})`;
}
export function functionBoundaries(
  expression: string,
  a: number,
  b: number,
  parameters: Record<string, number> = {},
) {
  const result: number[] = [],
    add = (x: number) => {
      if (x >= a && x <= b && !result.some((v) => Math.abs(v - x) < 1e-5))
        result.push(x);
    };
  for (const branch of expression.split(";").filter((s) => s.trim())) {
    const [source, condition] = branch.split("@");
    if (condition) {
      const match = /^\s*x\s*(?:<=|>=|<|>)\s*(.+)$/.exec(condition);
      if (match)
        add(compileExpression(match[1], Object.keys(parameters))(parameters));
    }
    compileExpression(source, Object.keys(parameters), (root) => {
      const visit = (node: ExpressionNode) => {
        let boundary: ExpressionNode | undefined;
        if (node.kind === "binary") {
          if (node.value === "/") boundary = node.right;
          visit(node.left);
          visit(node.right);
        }
        if (node.kind === "call") {
          if (["log", "sqrt", "abs"].includes(node.value))
            boundary = node.child;
          if (node.value === "tan") {
            const g = compileExpression(
              `cos(${expressionSource(node.child)})`,
              Object.keys(parameters),
            );
            rootsInInterval((x) => g({ ...parameters, x }), a, b).forEach(add);
          }
          visit(node.child);
        }
        if (node.kind === "unary") visit(node.child);
        if (boundary) {
          const g = compileExpression(
              expressionSource(boundary),
              Object.keys(parameters),
            ),
            f = (x: number) => g({ ...parameters, x });
          rootsInInterval(f, a, b).forEach(add);
          rootsInInterval((x) => derivative(f, x), a, b)
            .filter((x) => Math.abs(f(x)) < 1e-10)
            .forEach(add);
        }
      };
      visit(root);
    });
  }
  return result.sort((a, b) => a - b);
}
export function compileRegionExpression(
  source: string,
  parameters: string[] = [],
) {
  const parts = source.split(";").filter((s) => s.trim());
  if (!parts.length || parts.length > 8)
    throw Error("Hệ hỗ trợ từ một đến tám điều kiện F(x,y) ≤ 0.");
  const compiled = parts.map((p) => compileExpression(p, ["y", ...parameters]));
  return (v: Record<string, number>) => Math.max(...compiled.map((f) => f(v)));
}
export function compileGraphExpression(
  source: string,
  parameters: string[] = [],
) {
  const parts = source
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const branches = parts.map((part) => {
    const [expression, condition] = part.split("@").map((s) => s.trim());
    if (!expression) throw Error("Thiếu biểu thức hàm.");
    const f = compileExpression(expression, parameters);
    if (!condition) return { f, test: (_v: Record<string, number>) => true };
    const m = /^x\s*(<=|>=|<|>)\s*(.+)$/.exec(condition);
    if (!m)
      throw Error("Điều kiện nhánh dùng x < a, x <= a, x > a hoặc x >= a.");
    const bound = compileExpression(m[2], parameters);
    return {
      f,
      test: (v: Record<string, number>) => {
        const b = bound(v);
        return m[1] === "<"
          ? v.x < b
          : m[1] === "<="
            ? v.x <= b
            : m[1] === ">"
              ? v.x > b
              : v.x >= b;
      },
    };
  });
  return (v: Record<string, number>) =>
    branches.find((b) => b.test(v))?.f(v) ?? NaN;
}
export function graphParameters(source: string) {
  return [
    ...new Set(
      source
        .replace(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g, " ")
        .match(/[a-zA-Z_]\w*/g) || [],
    ),
  ].filter(
    (n) =>
      ![
        "x",
        "y",
        "t",
        "pi",
        "sin",
        "cos",
        "tan",
        "sqrt",
        "abs",
        "exp",
        "log",
      ].includes(n),
  );
}
export function derivative(f: (x: number) => number, x: number) {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}
export function tangentSlope(f: (x: number) => number, x: number) {
  const h = 1e-5 * Math.max(1, Math.abs(x)),
    value = f(x),
    left = (value - f(x - h)) / h,
    right = (f(x + h) - value) / h;
  if (
    ![value, left, right].every(Number.isFinite) ||
    Math.abs(left - right) > 1e-3 * Math.max(1, Math.abs(left), Math.abs(right))
  )
    throw Error("Hàm chưa có đạo hàm hữu hạn tại điểm tiếp xúc này.");
  return (left + right) / 2;
}
export function rootsInInterval(
  f: (x: number) => number,
  a: number,
  b: number,
  samples = 1200,
) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b)
    throw Error("Khoảng khảo sát phải có a < b.");
  const roots: number[] = [],
    add = (x: number) => {
      if (
        Number.isFinite(x) &&
        Math.abs(f(x)) < 1e-6 &&
        !roots.some((r) => Math.abs(r - x) < 1e-4)
      )
        roots.push(x);
    };
  let previous = a,
    fp = f(a);
  add(a);
  for (let i = 1; i <= samples; i++) {
    const x = a + ((b - a) * i) / samples,
      fx = f(x);
    if (Math.abs(fx) < 1e-8 && Math.abs(fp) >= 1e-8) add(x);
    if (Number.isFinite(fp) && Number.isFinite(fx) && fp * fx < 0) {
      let l = previous,
        r = x,
        fl = fp;
      for (let j = 0; j < 60; j++) {
        const m = (l + r) / 2,
          fm = f(m);
        if (!Number.isFinite(fm)) break;
        if (fl * fm <= 0) r = m;
        else {
          l = m;
          fl = fm;
        }
      }
      add((l + r) / 2);
    }
    previous = x;
    fp = fx;
  }
  return roots.sort((a, b) => a - b);
}
export function analyzeFunction(
  expression: string,
  a: number,
  b: number,
  parameters: Record<string, number> = {},
) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b)
    throw Error("Khoảng khảo sát phải có a < b.");
  const evaluate = compileGraphExpression(expression, Object.keys(parameters)),
    f = (x: number) => evaluate({ ...parameters, x });
  if (
    !Array.from({ length: 101 }, (_, i) => f(a + ((b - a) * i) / 100)).some(
      Number.isFinite,
    )
  )
    throw Error("Hàm không có giá trị thực trong miền khảo sát.");
  const coefficients = polynomialCoefficients(expression, parameters),
    constant = coefficients?.length === 1;
  const critical = (
    coefficients
      ? (polynomialCriticalPoints(coefficients) ??
        rootsInInterval((x) => derivative(f, x), a, b))
      : rootsInInterval((x) => derivative(f, x), a, b)
  ).filter((x) => x > a && x < b);
  const roots = constant ? [] : rootsInInterval(f, a, b);
  critical
    .filter(
      (x) =>
        Math.abs(f(x)) < 1e-10 && !roots.some((r) => Math.abs(r - x) < 1e-4),
    )
    .forEach((x) => roots.push(x));
  roots.sort((a, b) => a - b);
  const boundaries = functionBoundaries(expression, a, b, parameters);
  const intervals = [
    ...new Set([
      a,
      ...critical,
      ...boundaries.filter((x) => x > a && x < b),
      b,
    ]),
  ]
    .sort((a, b) => a - b)
    .map((x, i, all) =>
      i < all.length - 1
        ? {
            from: x,
            to: all[i + 1],
            direction: constant
              ? "→"
              : derivative(f, (x + all[i + 1]) / 2) > 0
                ? "↗"
                : "↘",
          }
        : null,
    )
    .filter(Boolean);
  return {
    roots,
    boundaries,
    allRealRoots: constant && coefficients[0] === 0,
    critical: critical
      .filter((x) => Number.isFinite(f(x)))
      .map((x) => ({ x, y: f(x) })),
    intervals,
  };
}

function polynomialCriticalPoints(
  coefficients: number[],
): number[] | undefined {
  if (coefficients.length <= 2) return [];
  const [, linear, quadratic, cubic] = coefficients;
  if (coefficients.length === 3) return [-linear / (2 * quadratic)];
  if (coefficients.length > 4) return undefined;
  const discriminant = (2 * quadratic) ** 2 - 12 * cubic * linear;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [
    ...new Set([
      (-2 * quadratic - root) / (6 * cubic),
      (-2 * quadratic + root) / (6 * cubic),
    ]),
  ];
}
export function functionTable(
  expression: string,
  a: number,
  b: number,
  parameters: Record<string, number>,
  mode: "variation" | "sign",
) {
  const report = analyzeFunction(expression, a, b, parameters),
    f = compileGraphExpression(expression, Object.keys(parameters)),
    critical =
      mode === "variation" ? report.critical.map((p) => p.x) : report.roots,
    breaks = [
      ...new Set([
        a,
        ...critical.filter(
          (x) =>
            x > a &&
            x < b &&
            !report.boundaries.some(
              (boundary) => Math.abs(x - boundary) < 1e-5,
            ),
        ),
        ...report.boundaries.filter((x) => x > a && x < b),
        b,
      ]),
    ].sort((a, b) => a - b);
  if (mode === "variation") {
    if (breaks.length > 10)
      throw Error(
        "Miền có quá nhiều điểm đặc biệt để lập bảng. Hãy thu hẹp khoảng khảo sát.",
      );
    const coefficients = polynomialCoefficients(expression, parameters);
    const evaluate = (x: number) => f({ ...parameters, x });
    const slope = (x: number) =>
      coefficients
        ? coefficients.reduceRight(
            (sum, c, i) => (i ? sum * x + i * c : sum),
            0,
          )
        : derivative(evaluate, x);
    const format = (value: number) =>
      Number.isFinite(value)
        ? String(Number(value.toPrecision(7)))
        : "Không xác định";
    const positions = ["x"],
      signs = ["f′(x)"],
      values = ["f(x)"];
    breaks.forEach((x, i) => {
      const boundary = report.boundaries.some((v) => Math.abs(v - x) < 1e-5);
      const y = evaluate(x);
      positions.push(format(x) + (boundary ? " · biên miền/nhánh" : ""));
      signs.push(boundary ? "‖" : critical.includes(x) ? "0" : "");
      values.push(format(y));
      if (i === breaks.length - 1) return;
      const middle = (x + breaks[i + 1]) / 2;
      const d = slope(middle);
      positions.push("");
      const sign =
        !Number.isFinite(evaluate(middle)) || !Number.isFinite(d)
          ? "‖"
          : d === 0
            ? "0"
            : d > 0
              ? "+"
              : "−";
      signs.push(sign);
      values.push(
        sign === "‖"
          ? "Không xác định"
          : sign === "0"
            ? "→"
            : sign === "+"
              ? "↗"
              : "↘",
      );
    });
    return [positions, signs, values];
  }
  if (breaks.length > 19)
    throw Error(
      "Miền có quá nhiều điểm đặc biệt để lập bảng. Hãy thu hẹp khoảng khảo sát.",
    );
  return [
    [
      "x",
      ...breaks.map(
        (x) =>
          String(Number(x.toFixed(5))) +
          (report.boundaries.some((v) => Math.abs(v - x) < 1e-5)
            ? " · biên miền/nhánh"
            : ""),
      ),
    ],
    [
      "Dấu",
      ...breaks.map((x, i) =>
        !Number.isFinite(
          f({
            ...parameters,
            x: (x + breaks[Math.min(i + 1, breaks.length - 1)]) / 2,
          }),
        )
          ? "Không xác định"
          : i === breaks.length - 1
            ? ""
            : f({ ...parameters, x: (x + breaks[i + 1]) / 2 }) === 0
              ? "0"
              : f({ ...parameters, x: (x + breaks[i + 1]) / 2 }) >= 0
                ? "+"
                : "−",
      ),
    ],
  ];
}
export function integrateFunction(
  expression: string,
  a: number,
  b: number,
  parameters: Record<string, number> = {},
  absolute = false,
) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b)
    throw Error("Khoảng tích phân cần a < b.");
  const evaluate = compileGraphExpression(expression, Object.keys(parameters)),
    f = (x: number) => {
      const y = evaluate({ ...parameters, x });
      if (!Number.isFinite(y))
        throw Error(
          "Hàm không hữu hạn trên đoạn; chưa tính tích phân suy rộng.",
        );
      return absolute ? Math.abs(y) : y;
    };
  if (
    functionBoundaries(expression, a, b, parameters).some(
      (x) =>
        x > a &&
        x < b &&
        (!Number.isFinite(evaluate({ ...parameters, x })) ||
          Math.abs(evaluate({ ...parameters, x })) > 1e8),
    )
  )
    throw Error("Có điểm gián đoạn trong đoạn. Chưa tính tích phân suy rộng.");
  const n = 2000,
    h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  const result = (sum * h) / 3;
  if (!Number.isFinite(result)) throw Error("Tích phân không hữu hạn.");
  return result;
}
/** Marching squares: each cell emits its own segment, never joins across a pole. */
export function implicitSegments(
  expression: string,
  bounds: [number, number, number, number],
  parameters: Record<string, number> = {},
  resolution = 70,
) {
  const f = compileExpression(expression, ["y", ...Object.keys(parameters)]),
    [xmin, xmax, ymin, ymax] = bounds,
    segments: [number, number][][] = [];
  for (let i = 0; i < resolution; i++)
    for (let j = 0; j < resolution; j++) {
      const corners: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ] = [
        [
          xmin + ((xmax - xmin) * i) / resolution,
          ymin + ((ymax - ymin) * j) / resolution,
        ],
        [
          xmin + ((xmax - xmin) * (i + 1)) / resolution,
          ymin + ((ymax - ymin) * j) / resolution,
        ],
        [
          xmin + ((xmax - xmin) * (i + 1)) / resolution,
          ymin + ((ymax - ymin) * (j + 1)) / resolution,
        ],
        [
          xmin + ((xmax - xmin) * i) / resolution,
          ymin + ((ymax - ymin) * (j + 1)) / resolution,
        ],
      ];
      const values = corners.map(([x, y]) => f({ ...parameters, x, y })),
        hits: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const l = (k + 1) % 4,
          va = values[k],
          vb = values[l];
        if (
          Number.isFinite(va) &&
          Number.isFinite(vb) &&
          ((va <= 0 && vb > 0) || (va > 0 && vb <= 0))
        ) {
          const t = va / (va - vb);
          hits.push([
            corners[k][0] + t * (corners[l][0] - corners[k][0]),
            corners[k][1] + t * (corners[l][1] - corners[k][1]),
          ]);
        }
      }
      for (let k = 0; k + 1 < hits.length; k += 2)
        segments.push([hits[k], hits[k + 1]]);
    }
  return segments;
}
