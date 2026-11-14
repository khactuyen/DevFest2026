import type { SolveRecommendation } from "./solve-recommendation";
import { AppError } from "./app-error";
import { SolveModeSchema, type SolveMode } from "./solve-mode";
import { validateVisual } from "./validation";
import type { TwoDVisualSpec } from "./contracts";

type Q = { n: bigint; d: bigint };
const abs = (n: bigint) => (n < 0n ? -n : n);
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return abs(a);
}
function q(n: bigint, d = 1n): Q {
  if (!d) throw Error("Không được chia cho 0.");
  const g = gcd(n, d),
    sign = d < 0n ? -1n : 1n;
  n = (n / g) * sign;
  d = abs(d / g);
  if (abs(n).toString().length > 80 || d.toString().length > 80)
    throw Error("Hệ số quá lớn để xử lý an toàn.");
  return { n, d };
}
const zero = q(0n),
  one = q(1n);
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = (a: Q) => q(-a.n, a.d);
const sub = (a: Q, b: Q) => add(a, neg(b));
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const num = (a: Q) => Number(a.n) / Number(a.d);
const text = (a: Q) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);
const tex = (a: Q) =>
  a.d === 1n ? `${a.n}` : `${a.n < 0n ? "-" : ""}\\frac{${abs(a.n)}}{${a.d}}`;
type Poly = [Q, Q, Q]; // constant, linear, quadratic
const constant = (value: Q): Poly => [value, zero, zero];
function combine(a: Poly, b: Poly, sign = 1): Poly {
  return a.map((v, i) => add(v, sign === 1 ? b[i] : neg(b[i]))) as Poly;
}
function product(a: Poly, b: Poly): Poly {
  const result = Array.from({ length: 5 }, () => zero);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      result[i + j] = add(result[i + j], mul(a[i], b[j]));
  if (result[3].n || result[4].n)
    throw Error("Hiện hỗ trợ đa thức tối đa bậc hai.");
  return result.slice(0, 3) as Poly;
}

/** Deliberately restricted algebra: variable denominators/functions are rejected,
 * not sampled or cancelled (which could lose domain exclusions). No eval/LLM. */
function polynomial(source: string): Poly {
  const raw = source.match(/\d+(?:\.\d*)?|\.\d+|x|[+\-*/^()]/g) || [];
  if (raw.join("") !== source || !raw.length || raw.length > 160)
    throw Error(
      "Chỉ hỗ trợ đa thức theo x với hệ số số; hãy kiểm tra lại công thức.",
    );
  const tokens: string[] = [];
  raw.forEach((t, i) => {
    const before = raw[i - 1];
    if (before && /^(?:x|\)|\d|\.)/.test(before) && /^(?:x|\(|\d|\.)/.test(t))
      tokens.push("*");
    tokens.push(t);
  });
  let cursor = 0;
  function primary(): Poly {
    const t = tokens[cursor++];
    if (t === "+" || t === "-") {
      const p = parse(3);
      return t === "-" ? (p.map(neg) as Poly) : p;
    }
    if (t === "(") {
      const p = parse(0);
      if (tokens[cursor++] !== ")") throw Error("Thiếu dấu đóng ngoặc.");
      return p;
    }
    if (t === "x") return [zero, one, zero];
    if (t && /^(?:\d|\.)/.test(t)) {
      const [whole, fraction = ""] = t.split(".");
      if (fraction.length > 8 || whole.length > 10)
        throw Error("Hệ số vượt giới hạn (10 chữ số, 8 số thập phân).");
      return constant(
        q(BigInt((whole || "0") + fraction), 10n ** BigInt(fraction.length)),
      );
    }
    throw Error("Thiếu số, biến x hoặc ngoặc hợp lệ.");
  }
  function parse(min: number): Poly {
    let a = primary();
    while (cursor < tokens.length) {
      const op = tokens[cursor],
        rank =
          op === "+" || op === "-"
            ? 1
            : op === "*" || op === "/"
              ? 2
              : op === "^"
                ? 4
                : 0;
      if (!rank || rank < min) break;
      cursor++;
      const b = parse(op === "^" ? rank : rank + 1);
      if (op === "+" || op === "-") a = combine(a, b, op === "+" ? 1 : -1);
      else if (op === "*") a = product(a, b);
      else if (op === "/") {
        if (b[1].n || b[2].n)
          throw Error(
            "Mẫu chứa x chưa được hỗ trợ; không được tự bỏ điều kiện xác định.",
          );
        a = a.map((v) => div(v, b[0])) as Poly;
      } else {
        if (b[1].n || b[2].n || b[0].d !== 1n || b[0].n < 0n || b[0].n > 2n)
          throw Error("Chỉ hỗ trợ lũy thừa 0, 1 hoặc 2.");
        if (b[0].n === 0n && (a[1].n || a[2].n || !a[0].n))
          throw Error(
            "Lũy thừa mũ 0 cần cơ số khác 0; bộ giải chưa hỗ trợ miền xác định này.",
          );
        a = b[0].n === 0n ? constant(one) : b[0].n === 1n ? a : product(a, a);
      }
    }
    return a;
  }
  const value = parse(0);
  if (cursor !== tokens.length)
    throw Error("Biểu thức có ngoặc hoặc phép toán không hợp lệ.");
  return value;
}

function normalize(source: string) {
  let s = source
    .trim()
    .replace(/^trả\s*lời\s*ngắn\s*[:：]?\s*/iu, "")
    .replace(
      /^(?:giải\s+(?:(?:bất\s+)?phương\s+trình\s*)?|tìm\s+x\s*)[:：]?\s*/i,
      "",
    )
    .replace(/[.;]\s*$/, "")
    .replace(/²/g, "^2")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/\\(?:left|right|displaystyle)/g, "")
    .replace(/\\(?:leq?|geq?)/g, (m) => (m.startsWith("\\le") ? "<=" : ">="))
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/\\(?:times|cdot)/g, "*")
    .replace(/\\[()[\]]/g, "")
    .replace(/\$/g, "")
    .replace(/\s/g, "");
  // Replace innermost fractions first; at most 10 levels.
  for (let i = 0; i < 10 && /\\(?:d?frac)/.test(s); i++)
    s = s.replace(/\\(?:d?frac)\{([^{}]*)\}\{([^{}]*)\}/g, "(($1)/($2))");
  return s
    .replace(/\^\{([012])\}/g, "^$1")
    .replace(/[{}]/g, (m) => (m === "{" ? "(" : ")"));
}

export type SolveMethod = "formula" | "square" | "isolate" | "sign-chart";
export type SolveProblem = {
  recommendation?: SolveRecommendation;
  source: string;
  normalized: string;
  equationLatex: string;
  relation: "=" | "<" | ">" | "<=" | ">=";
  degree: number;
  coefficients: { a: string; b: string; c: string };
  values: [number, number, number];
  methods: { id: SolveMethod; label: string; description: string }[];
  domain: string;
  goal: string;
};
export type SolveStep = {
  id: string;
  title: string;
  content: string;
  hint: string;
  explanation: string;
  targets: string[];
};
export type SolveVerification = {
  status: "verified";
  scope: "roots" | "sign-analysis" | "classification";
  originalEquationLatex: string;
  checks: {
    root: string;
    substitutionLatex: string;
    leftValue: string;
    rightValue: string;
    equal: boolean;
    included: boolean;
  }[];
};
export type SolveSolution = {
  solveMode: SolveMode;
  problem: SolveProblem;
  method: SolveMethod;
  steps: SolveStep[];
  answer: string;
  exactRoots: string[];
  approximateRoots: number[];
  verification: string;
  verificationReport: SolveVerification;
  visual: TwoDVisualSpec | null;
  visualWarning: string;
};
const relationTex = (s: string) =>
  s === "<=" ? "\\le" : s === ">=" ? "\\ge" : s;
function polyTex(p: Poly) {
  const terms = [2, 1, 0]
    .filter((i) => p[i].n)
    .map(
      (i) =>
        `${i && p[i].d === 1n && abs(p[i].n) === 1n ? (p[i].n < 0n ? "-" : "") : tex(p[i])}${i === 2 ? "x^2" : i === 1 ? "x" : ""}`,
    );
  return (terms.join("+") || "0").replace(/\+\-/g, "-");
}
function parseSource(source: string) {
  const s = normalize(source);
  if (!s || s.length > 500)
    throw Error(
      "Chọn một phương trình hoặc bất phương trình, tối đa 500 ký tự.",
    );
  const parts = s.split(/(<=|>=|=|<|>)/);
  if (parts.length !== 3 || !parts[0] || !parts[2])
    throw Error(
      "Nhập đúng một phương trình/bất phương trình có hai vế (ví dụ x² − 5x + 6 = 0).",
    );
  const left = polynomial(parts[0]),
    right = polynomial(parts[2]);
  const p = combine(left, right, -1);
  const degree = p[2].n ? 2 : p[1].n ? 1 : 0;
  const values = [num(p[2]), num(p[1]), num(p[0])] as [number, number, number];
  if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
    throw Error("Hệ số sau thu gọn vượt giới hạn 10⁶.");
  const relation = parts[1] as SolveProblem["relation"];
  return {
    p,
    left,
    right,
    problem: {
      source,
      normalized: `${text(p[2])}*x^2+(${text(p[1])})*x+(${text(p[0])})${relation}0`,
      equationLatex: `${polyTex(p)} ${relationTex(relation)} 0`,
      relation,
      degree,
      coefficients: { a: text(p[2]), b: text(p[1]), c: text(p[0]) },
      values,
      methods:
        relation !== "="
          ? [
              {
                id: "sign-chart" as const,
                label: "Xét dấu",
                description: "Tìm các mốc nghiệm và xét dấu trên từng khoảng.",
              },
            ]
          : degree === 2
            ? [
                {
                  id: "formula" as const,
                  label: "Công thức nghiệm",
                  description: "Tính Δ và dùng công thức nghiệm.",
                },
                {
                  id: "square" as const,
                  label: "Hoàn thành bình phương",
                  description:
                    "Biến đổi về một bình phương và xét dấu vế phải.",
                },
              ]
            : [
                {
                  id: "isolate" as const,
                  label:
                    degree === 1 ? "Chuyển vế, chia hệ số" : "Kiểm tra mệnh đề",
                  description:
                    "Thu gọn đúng bậc thực tế, không chia cho hệ số bằng 0.",
                },
              ],
      domain:
        "Số thực ℝ (đa thức; các mẫu số được kiểm tra là hằng số khác 0).",
      goal:
        relation === "="
          ? "Tìm tập nghiệm thực của phương trình."
          : "Tìm các khoảng giá trị x thỏa bất phương trình.",
    } satisfies SolveProblem,
  };
}
export function analyzeSolveProblem(source: string): SolveProblem {
  try {
    return parseSource(source).problem;
  } catch (e) {
    throw new AppError(
      422,
      e instanceof Error ? e.message : "Chưa hỗ trợ đề này.",
      "solve_unsupported",
    );
  }
}
function sqrtFloor(n: bigint) {
  if (n < 2n) return n;
  let x = n,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
function roots(p: Poly): {
  exact: string[];
  approx: number[];
  delta: Q;
  rational: Q[];
} {
  const [c, b, a] = p,
    delta = sub(mul(b, b), mul(q(4n), mul(a, c)));
  if (!a.n) {
    if (!b.n) return { exact: [], approx: [], delta, rational: [] };
    const r = div(neg(c), b);
    return { exact: [tex(r)], approx: [num(r)], delta, rational: [r] };
  }
  if (delta.n < 0n) return { exact: [], approx: [], delta, rational: [] };
  const dn = sqrtFloor(delta.n),
    dd = sqrtFloor(delta.d);
  if (dn * dn === delta.n && dd * dd === delta.d) {
    const s = q(dn, dd),
      rr = [
        div(sub(neg(b), s), mul(q(2n), a)),
        div(add(neg(b), s), mul(q(2n), a)),
      ];
    rr.sort((u, v) =>
      u.n * v.d < v.n * u.d ? -1 : u.n * v.d > v.n * u.d ? 1 : 0,
    );
    const rational = delta.n === 0n ? rr.slice(0, 1) : rr;
    return {
      exact: rational.map(tex),
      approx: rational.map(num),
      delta,
      rational,
    };
  }
  // Clear fractional denominators and extract bounded square factors. The
  // expression remains exact even if a large square factor is not simplified.
  const lcm = (u: bigint, v: bigint) => (u / gcd(u, v)) * v;
  const denominator = lcm(lcm(a.d, b.d), c.d);
  let A = a.n * (denominator / a.d),
    B = b.n * (denominator / b.d),
    C = c.n * (denominator / c.d);
  const common = gcd(gcd(abs(A), abs(B)), abs(C));
  A /= common;
  B /= common;
  C /= common;
  let inside = B * B - 4n * A * C,
    outside = 1n;
  for (
    let factor = 2n;
    factor <= 10_000n && factor * factor <= inside;
    factor++
  ) {
    const square = factor * factor;
    while (inside % square === 0n) {
      inside /= square;
      outside *= factor;
    }
  }
  let center = -B * (A < 0n ? -1n : 1n),
    divisor = abs(2n * A);
  const reduce = gcd(gcd(abs(center), outside), divisor);
  center /= reduce;
  outside /= reduce;
  divisor /= reduce;
  const radical = `${outside === 1n ? "" : outside}\\sqrt{${inside}}`;
  const exact = ["-", "+"].map((sign) => {
    const numerator = center
      ? `${center}${sign}${radical}`
      : `${sign === "-" ? "-" : ""}${radical}`;
    return divisor === 1n ? numerator : `\\frac{${numerator}}{${divisor}}`;
  });
  // Avoid cancellation for a small root when |b| dwarfs the discriminant gap.
  const stable = -0.5 * (num(b) + (b.n < 0n ? -1 : 1) * Math.sqrt(num(delta)));
  const approx = [stable / num(a), num(c) / stable].sort((u, v) => u - v);
  return { exact, approx, delta, rational: [] };
}
/** Evaluate both original sides in Q(sqrt(delta)); no floating-point
 * tolerance is used to mark a root as verified. */
function verifyOriginalSides(
  left: Poly,
  right: Poly,
  p: Poly,
  problem: SolveProblem,
  rr: ReturnType<typeof roots>,
): SolveVerification {
  type Surd = { u: Q; v: Q };
  const evaluate = (poly: Poly, x: Surd): Surd => ({
    u: add(
      add(poly[0], mul(poly[1], x.u)),
      mul(poly[2], add(mul(x.u, x.u), mul(mul(x.v, x.v), rr.delta))),
    ),
    v: add(mul(poly[1], x.v), mul(q(2n), mul(poly[2], mul(x.u, x.v)))),
  });
  const latex = ({ u, v }: Surd) =>
    !v.n
      ? tex(u)
      : `${u.n ? tex(u) : ""}${v.n > 0n && u.n ? "+" : ""}${tex(v)}\\sqrt{${tex(rr.delta)}}`;
  const candidates: Surd[] = rr.rational.length
    ? rr.rational.map((u) => ({ u, v: zero }))
    : rr.exact.length
      ? [-1n, 1n].map((sign) => ({
          u: div(neg(p[1]), mul(q(2n), p[2])),
          // Match the ascending exact roots even for a negative leading coefficient.
          v: div(q(sign), mul(q(2n), q(abs(p[2].n), p[2].d))),
        }))
      : [];
  const substitute = (poly: Poly, root: string) =>
    polyTex(poly).replace(/x/g, `\\left(${root}\\right)`);
  return {
    status: "verified",
    scope:
      problem.relation !== "="
        ? "sign-analysis"
        : problem.degree
          ? "roots"
          : "classification",
    originalEquationLatex: `${polyTex(left)} ${relationTex(problem.relation)} ${polyTex(right)}`,
    checks: candidates.map((x, i) => {
      const lhs = evaluate(left, x),
        rhs = evaluate(right, x);
      const equal = sub(lhs.u, rhs.u).n === 0n && sub(lhs.v, rhs.v).n === 0n;
      if (!equal) throw Error("Thay nghiệm vào hai vế ban đầu không đạt.");
      return {
        root: rr.exact[i],
        substitutionLatex: `L=${substitute(left, rr.exact[i])}=${latex(lhs)}\\qquad R=${substitute(right, rr.exact[i])}=${latex(rhs)}`,
        leftValue: latex(lhs),
        rightValue: latex(rhs),
        equal,
        included: satisfies(0, problem.relation),
      };
    }),
  };
}
function satisfies(sign: number, r: SolveProblem["relation"]) {
  return r === "<"
    ? sign < 0
    : r === ">"
      ? sign > 0
      : r === "<="
        ? sign <= 0
        : r === ">="
          ? sign >= 0
          : sign === 0;
}
function intervalAnswer(
  problem: SolveProblem,
  p: Poly,
  rr: ReturnType<typeof roots>,
): string {
  const inclusive = problem.relation.endsWith("="),
    sign = Number(
      (p[2].n || p[1].n || p[0].n) > 0n
        ? 1
        : (p[2].n || p[1].n || p[0].n) < 0n
          ? -1
          : 0,
    );
  if (!problem.degree)
    return satisfies(sign, problem.relation)
      ? "S=\\mathbb{R}"
      : "S=\\varnothing";
  const positive = satisfies(1, problem.relation);
  const l = inclusive ? "[" : "(",
    r = inclusive ? "]" : ")";
  if (problem.degree === 1) {
    const right = sign > 0 === positive;
    return `S=${right ? `${l}${rr.exact[0]},+\\infty)` : `(-\\infty,${rr.exact[0]}${r}`}`;
  }
  if (rr.delta.n < 0n)
    return satisfies(sign, problem.relation)
      ? "S=\\mathbb{R}"
      : "S=\\varnothing";
  if (!rr.delta.n) {
    const root = rr.exact[0];
    return satisfies(sign, problem.relation)
      ? inclusive
        ? "S=\\mathbb{R}"
        : `S=\\mathbb{R}\\setminus\\{${root}\\}`
      : inclusive
        ? `S=\\{${root}\\}`
        : "S=\\varnothing";
  }
  const [x1, x2] = rr.exact,
    outside = sign > 0 === positive;
  return outside
    ? `S=(-\\infty,${x1}${r}\\cup${l}${x2},+\\infty)`
    : `S=${l}${x1},${x2}${r}`;
}
function makeVisual(
  problem: SolveProblem,
  rr: ReturnType<typeof roots>,
): TwoDVisualSpec | null {
  if (!problem.degree) return null;
  const [a, b, c] = problem.values,
    h = a ? -b / (2 * a) : rr.approx[0],
    k = a ? c - (b * b) / (4 * a) : 0;
  const points = [0, h, ...rr.approx];
  let xmin = Math.min(...points),
    xmax = Math.max(...points),
    pad = Math.max(2, (xmax - xmin) * 0.25);
  xmin -= pad;
  xmax += pad;
  const ymin = Math.min(0, k, c) - Math.max(2, Math.abs(k) * 0.25),
    ymax = Math.max(0, k, c) + Math.max(3, Math.abs(k) * 0.25);
  if (
    [xmin, xmax, ymin, ymax, ...rr.approx].some(
      (v) => !Number.isFinite(v) || Math.abs(v) > 1e6,
    )
  )
    return null;
  return validateVisual({
    id: "visual_solve",
    version: 1,
    kind: "cartesian",
    viewport: { x: [xmin, xmax], y: [ymin, ymax] },
    parameters: [],
    accessibility: {
      description: `Đồ thị đa thức đã thu gọn; dữ kiện được khóa trong khi xem lời giải.`,
    },
    objects: [
      {
        id: "graph",
        type: "functionGraph",
        expression: `(${a})*x^2+(${b})*x+(${c})`,
        label: "f(x)",
        color: "#07885f",
      },
      ...(a
        ? [
            {
              id: "vertex",
              type: "point",
              x: h,
              y: k,
              label: "Đỉnh",
              visible: false,
              color: "#9070c6",
            },
          ]
        : []),
      ...rr.approx.map((x, i) => ({
        id: `root_${i}`,
        type: "point",
        x,
        y: 0,
        label: `x${i + 1} ≈ ${Number(x.toFixed(4))}`,
        visible: false,
        color: "#dc913d",
      })),
    ],
  }) as TwoDVisualSpec;
}
export function solveProblem(
  source: string,
  method: SolveMethod,
  solveMode: SolveMode = "standard",
): SolveSolution {
  SolveModeSchema.parse(solveMode);
  analyzeSolveProblem(source); // user-facing bounded error
  const { p, left, right, problem } = parseSource(source);
  if (!problem.methods.some((m) => m.id === method))
    throw new AppError(
      422,
      "Phương pháp không phù hợp với đề đã kiểm tra.",
      "solve_method_invalid",
    );
  const [c, b, a] = p,
    rr = roots(p),
    { delta } = rr;
  const step = (
    id: string,
    title: string,
    content: string,
    hint: string,
    explanation: string,
    targets: string[] = ["graph"],
  ): SolveStep => ({ id, title, content, hint, explanation, targets });
  const first = step(
    "reduce",
    "Thu gọn và xác định bậc",
    `Chuyển tất cả về vế trái: \\[${problem.equationLatex}\\]\nHệ số: \\(a=${tex(a)},\\ b=${tex(b)},\\ c=${tex(c)}\\). Bậc thực tế: ${problem.degree}.`,
    "Chuyển hai vế về cùng một phía và gộp các hạng tử đồng dạng.",
    "Trừ hai vế cùng một biểu thức giữ nguyên tập nghiệm. Xác định bậc sau thu gọn để không chia cho a khi a = 0.",
  );
  let answer =
    problem.relation !== "="
      ? intervalAnswer(problem, p, rr)
      : !problem.degree
        ? c.n === 0n
          ? "S=\\mathbb{R}"
          : "S=\\varnothing"
        : rr.exact.length
          ? `S=\\{${rr.exact.join(",")}\\}`
          : "S=\\varnothing";
  const steps: SolveStep[] = [first];
  if (problem.degree === 2 && method === "formula") {
    steps.push(
      step(
        "delta",
        "Tính biệt thức",
        `\\[\\Delta=b^2-4ac=${tex(delta)}\\]\n${delta.n < 0n ? "Δ < 0: Không có nghiệm thực." : delta.n === 0n ? "Δ = 0: Nghiệm kép." : "Δ > 0: Hai nghiệm thực phân biệt."}`,
        "Tính b² − 4ac, cẩn thận dấu của a và c.",
        "Hoàn thành bình phương cho (2ax+b)² = Δ. Bình phương không âm; dấu Δ quyết định số nghiệm thực.",
      ),
    );
    steps.push(
      step(
        "compute",
        "Áp dụng công thức nghiệm",
        delta.n < 0n
          ? "Không lấy căn bậc hai thực của một số âm."
          : `\\[x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}\\]\n${rr.exact.map((x, i) => `\\(x_${i + 1}=${x}\\)`).join("; ")}`,
        "Khi Δ ≥ 0, thay các hệ số vào công thức nghiệm.",
        "Công thức chỉ áp dụng vì đã kiểm tra a ≠ 0; các căn và phân số được giữ chính xác.",
      ),
    );
  } else if (problem.degree === 2 && method === "square") {
    const shift = div(b, mul(q(2n), a)),
      rhs = div(delta, mul(q(4n), mul(a, a)));
    steps.push(
      step(
        "square",
        "Hoàn thành bình phương",
        `Chia cho \\(a=${tex(a)}\\ne0\\), bổ sung cùng một hằng số vào hai vế:\n\\[(x+(${tex(shift)}))^2=${tex(rhs)}\\]`,
        "Dùng (x + b/(2a))² và bổ sung b²/(4a²).",
        "Đẳng thức (x+b/(2a))² = (b²−4ac)/(4a²) tương đương phương trình gốc khi a ≠ 0.",
        ["graph", "vertex"],
      ),
    );
    steps.push(
      step(
        "sqrt",
        "Xét dấu và lấy căn",
        rhs.n < 0n
          ? "Vế trái không âm, vế phải âm. Không có nghiệm thực."
          : `Lấy cả hai dấu của căn:\n\\[x=-(${tex(shift)})\\pm\\sqrt{${tex(rhs)}}\\]\n${!rhs.n ? "Nghiệm kép." : "Hai nghiệm thực phân biệt."}`,
        "Kiểm tra dấu vế phải trước khi lấy căn; đừng quên dấu ±.",
        "Bình phương một số thực không âm. Nếu vế phải bằng 0 chỉ có một nghiệm; nếu dương phải lấy cả hai căn.",
      ),
    );
  } else if (method === "isolate") {
    steps.push(
      step(
        "isolate",
        problem.degree ? "Cô lập ẩn x" : "Kiểm tra đẳng thức",
        problem.degree
          ? `\\[${tex(b)}x=${tex(neg(c))}\\]\n\\[x=${rr.exact[0]}\\]`
          : `${c.n === 0n ? "0 = 0 luôn đúng: mọi số thực là nghiệm." : "Hằng số khác 0 không thể bằng 0: vô nghiệm."}`,
        "Kiểm tra hệ số của x có bằng 0 không trước khi chia.",
        "Nếu b ≠ 0 có thể chia hai vế cho b. Khi cả a và b bằng 0, bài toán là một mệnh đề hằng.",
      ),
    );
  } else {
    steps.push(
      step(
        "zeros",
        "Tìm mốc đổi dấu",
        rr.exact.length
          ? `Nghiệm của đa thức:\n${rr.exact.map((x, i) => `\\(x_${i + 1}=${x}\\)`).join("; ")}`
          : "Đa thức không có nghiệm thực hoặc là hằng số.",
        "Giải phương trình tương ứng trước khi xét dấu.",
        "Đa thức liên tục; chỉ có thể đổi dấu qua một nghiệm. Nghiệm kép không làm đổi dấu.",
      ),
    );
    steps.push(
      step(
        "signs",
        "Xét dấu trên các khoảng",
        problem.degree === 2
          ? `Hệ số đầu \\(a=${tex(a)}\\). ${delta.n > 0n ? "Ngoài hai nghiệm: cùng dấu a. Giữa hai nghiệm: trái dấu a." : delta.n === 0n ? "Cùng dấu a ở mọi x trừ nghiệm kép, nơi giá trị bằng 0." : "Cùng dấu a tại mọi x thực."}`
          : problem.degree === 1
            ? `Hệ số \\(b=${tex(b)}\\). Bên phải nghiệm cùng dấu b; bên trái trái dấu b.`
            : `Giá trị hằng: \\(${tex(c)}\\).`,
        "Lưu ý có lấy các đầu mút khi dấu là ≤ hoặc ≥ không.",
        "Dấu tại các khoảng xuất phát từ phân tích nhân tử và tính liên tục, không từ việc đoán trên ảnh đồ thị.",
      ),
    );
  }
  const verificationReport = verifyOriginalSides(left, right, p, problem, rr);
  const verification = rr.rational.length
    ? `Đã thế ${rr.rational.length} nghiệm hữu tỉ vào đa thức bằng số học phân số chính xác; đều cho giá trị 0.`
    : problem.degree === 2 && delta.n > 0n
      ? "Nghiệm căn thức được dựng chính xác từ đồng nhất thức (2ax+b)² = Δ; số thập phân chỉ dùng để vẽ."
      : "Đã phân loại bằng bậc thực tế và dấu hệ số/biệt thức bằng số học phân số chính xác.";
  for (const root of rr.rational)
    if (add(add(mul(a, mul(root, root)), mul(b, root)), c).n !== 0n)
      throw Error("Kiểm tra nghiệm không đạt.");
  const desc =
    problem.relation === "=" && problem.degree === 2
      ? delta.n < 0n
        ? "Không có nghiệm thực."
        : !delta.n
          ? "Nghiệm kép."
          : "Hai nghiệm thực phân biệt."
      : "Tập nghiệm thực:";
  steps.push(
    step(
      "conclusion",
      "Kết luận và kiểm tra",
      `${desc}\n\\[${answer}\\]\n${rr.approx.length && !rr.rational.length ? `Giá trị gần đúng: ${rr.approx.map((x) => Number(x.toPrecision(8))).join("; ")}.\n` : ""}${verification}`,
      "Đối chiếu lại phương trình gốc và điều kiện miền số thực.",
      verification,
      rr.approx.map((_, i) => `root_${i}`),
    ),
  );
  const visual = makeVisual(problem, rr);
  const rootTargets = rr.approx.map((_, i) => `root_${i}`);
  for (const item of steps) {
    if (["compute", "sqrt", "isolate", "zeros"].includes(item.id))
      item.targets = ["graph", ...rootTargets];
  }
  const detailed: SolveStep[] = [];
  if (solveMode === "detailed") {
    const micro = (
      id: string,
      title: string,
      content: string,
      explanation: string,
      targets = ["graph"],
    ) =>
      detailed.push(
        step(
          id,
          title,
          `${content}\n\nVì sao: ${explanation}`,
          explanation,
          explanation,
          targets,
        ),
      );
    micro(
      "domain",
      "Xác định miền và yêu cầu",
      `Xét trên ${problem.domain}. ${problem.goal}`,
      "Đa thức xác định với mọi số thực; không cần thêm điều kiện mẫu số hoặc căn thức.",
    );
    micro(
      "reduce",
      "Chuyển vế và thu gọn",
      `\\[${problem.equationLatex}\\]`,
      first.explanation,
    );
    micro(
      "coefficients",
      "Đọc hệ số và chọn đúng bậc",
      `\\(a=${tex(a)},\\ b=${tex(b)},\\ c=${tex(c)}\\). Bậc thực tế: ${problem.degree}.`,
      "Hệ số có thể bằng 0 sau thu gọn. Chỉ dùng công thức bậc hai khi a khác 0; chỉ chia cho hệ số của x khi hệ số đó khác 0.",
    );
    if (
      problem.degree === 2 &&
      (method === "formula" || method === "sign-chart")
    ) {
      micro(
        "delta-substitute",
        "Thay hệ số vào biệt thức",
        `\\[\\Delta=(${tex(b)})^2-4\\cdot(${tex(a)})\\cdot(${tex(c)})\\]`,
        "Đặt hệ số âm trong ngoặc để giữ đúng dấu khi bình phương và nhân.",
      );
      micro(
        "delta-evaluate",
        "Tính từng phần của biệt thức",
        `\\[b^2=${tex(mul(b, b))},\\quad 4ac=${tex(mul(q(4n), mul(a, c)))}\\]\n\\[\\Delta=${tex(delta)}\\]`,
        "Tính bình phương và tích trước, rồi lấy b² trừ 4ac bằng số học phân số chính xác.",
      );
      micro(
        "delta",
        "Xác định số nghiệm thực",
        delta.n < 0n
          ? "Δ < 0: không có nghiệm thực."
          : delta.n === 0n
            ? "Δ = 0: có một nghiệm kép."
            : "Δ > 0: có hai nghiệm thực phân biệt.",
        "Đồng nhất thức (2ax+b)² = Δ cho thấy bình phương không thể bằng một số âm.",
      );
      if (delta.n >= 0n) {
        micro(
          "compute-substitute",
          "Thay vào công thức nghiệm",
          `\\[x=\\frac{-(${tex(b)})\\pm\\sqrt{${tex(delta)}}}{2\\cdot(${tex(a)})}\\]`,
          "a khác 0 nên mẫu 2a khác 0. Khi Δ dương xét cả hai dấu; khi Δ bằng 0 hai giá trị trùng nhau.",
        );
        rr.exact.forEach((root, i) =>
          micro(
            `compute-${i}`,
            `Rút gọn nghiệm ${i + 1}`,
            `\\[x_${i + 1}=${root}\\]`,
            "Giữ phân số và căn thức chính xác, không dùng số gần đúng để kết luận.",
          ),
        );
      }
    } else if (problem.degree === 2 && method === "square") {
      const shift = div(b, mul(q(2n), a));
      const rhs = div(delta, mul(q(4n), mul(a, a)));
      micro(
        "divide",
        "Chia hai vế cho hệ số bậc hai",
        `\\[x^2+(${tex(div(b, a))})x=${tex(neg(div(c, a)))}\\]`,
        `Đã kiểm tra a = ${tex(a)} khác 0 nên phép chia giữ nguyên tập nghiệm.`,
      );
      micro(
        "complete",
        "Bổ sung để tạo bình phương",
        `\\[x^2+(${tex(div(b, a))})x+${tex(mul(shift, shift))}=${tex(rhs)}\\]`,
        "Cộng (b/(2a))² vào cả hai vế; đây là hạng tử còn thiếu của bình phương một tổng.",
      );
      micro(
        "square",
        "Viết thành bình phương",
        `\\[(x+(${tex(shift)}))^2=${tex(rhs)}\\]`,
        "Dùng hằng đẳng thức (x+t)² = x² + 2tx + t².",
        ["graph", "vertex"],
      );
      micro(
        "sqrt",
        "Xét dấu trước khi lấy căn",
        steps.find((s) => s.id === "sqrt")!.content,
        steps.find((s) => s.id === "sqrt")!.explanation,
      );
      rr.exact.forEach((root, i) =>
        micro(
          `compute-${i}`,
          `Rút gọn nghiệm ${i + 1}`,
          `\\[x_${i + 1}=${root}\\]`,
          "Chuyển hằng số sang vế phải và rút gọn chính xác.",
        ),
      );
    } else if (problem.degree === 1) {
      micro(
        "isolate-transfer",
        "Chuyển hằng số sang vế phải",
        `\\[${tex(b)}x${relationTex(problem.relation)}${tex(neg(c))}\\]`,
        "Trừ cùng một hằng số ở hai vế giữ nguyên quan hệ.",
      );
      if (problem.relation === "=")
        micro(
          "isolate",
          "Chia cho hệ số của x",
          `\\[x=\\frac{${tex(neg(c))}}{${tex(b)}}=${rr.exact[0]}\\]`,
          "Hệ số của x khác 0. Chia hai vế cho cùng hệ số để cô lập x.",
        );
      else
        micro(
          "zeros",
          "Tìm mốc và xét chiều bất đẳng thức",
          `Nghiệm của đa thức: \\(x=${rr.exact[0]}\\).`,
          b.n < 0n
            ? "Chia bất đẳng thức cho hệ số âm phải đổi chiều dấu; mốc nghiệm dùng để phân chia trục số."
            : "Chia bất đẳng thức cho hệ số dương giữ nguyên chiều dấu; mốc nghiệm dùng để phân chia trục số.",
        );
    } else {
      micro(
        "constant",
        "Kiểm tra mệnh đề hằng",
        `Giá trị vế trái: \\(${tex(c)}\\); so sánh với 0 theo dấu \\(${relationTex(problem.relation)}\\).`,
        "Không còn ẩn x: nếu mệnh đề đúng thì mọi số thực là nghiệm, nếu sai thì tập nghiệm rỗng. Không được chia cho 0.",
      );
    }
    if (problem.relation !== "=") {
      const signs = steps.find((s) => s.id === "signs")!;
      micro("signs", signs.title, signs.content, signs.explanation);
      micro(
        "endpoints",
        "Kiểm tra dấu và đầu mút",
        problem.relation === "<=" || problem.relation === ">="
          ? "Dấu không nghiêm ngặt: nhận cả điểm tại đó đa thức bằng 0."
          : "Dấu nghiêm ngặt: loại điểm tại đó đa thức bằng 0.",
        "Chọn các khoảng có dấu thỏa đề gốc. Không tự đưa nghiệm của phương trình vào bất phương trình có dấu < hoặc >.",
      );
    }
    for (const item of detailed) {
      const rootIndex = /^compute-(\d+)$/.exec(item.id)?.[1];
      if (rootIndex !== undefined) item.targets = [`root_${rootIndex}`];
      else if (["sqrt", "isolate", "zeros"].includes(item.id))
        item.targets = ["graph", ...rootTargets];
    }
    micro(
      "verify",
      "Đối chiếu kết quả",
      verification,
      "Kiểm tra theo đề đã thu gọn tương đương với đề gốc; hình minh họa và số thập phân không thay thế chứng minh.",
    );
    detailed.push({ ...steps.at(-1)!, content: `${desc}\n\\[${answer}\\]` });
  }
  return {
    solveMode,
    problem,
    method,
    steps: solveMode === "detailed" ? detailed : steps,
    answer,
    exactRoots: rr.exact,
    approximateRoots: rr.approx,
    verification,
    verificationReport,
    visual,
    visualWarning: visual
      ? ""
      : problem.degree
        ? "Nghiệm nằm ngoài phạm vi hiển thị an toàn; lời giải chính xác vẫn được giữ."
        : "Phương trình hằng không cần đồ thị minh họa.",
  };
}

/** Exact, bounded checks reused by the workflow. No sampling or generated code. */
export function checkRationalRelation(source: string, valueSource?: string) {
  const { p, problem } = parseSource(source);
  let value = zero;
  if (valueSource !== undefined) {
    const parsed = polynomial(normalize(valueSource));
    if (parsed[1].n || parsed[2].n) throw Error("Giá trị thế phải là hằng số.");
    value = parsed[0];
  } else if (problem.degree !== 0) throw Error("Chưa có giá trị của x.");
  const result = add(add(mul(p[2], mul(value, value)), mul(p[1], value)), p[0]);
  const holds = satisfies(
    result.n < 0n ? -1 : result.n > 0n ? 1 : 0,
    problem.relation,
  );
  return {
    holds,
    detail: `Thay giá trị bằng số học phân số chính xác: hiệu hai vế = ${text(result)}; quan hệ ${problem.relation} ${holds ? "đúng" : "sai"}.`,
  };
}

export function calculateConstantAnswer(source: string) {
  const expression = source
    .trim()
    .replace(/^(?:trả\s*lời\s*ngắn\s*[:：]?\s*)/iu, "")
    .replace(/^(?:tính(?:\s*giá\s*trị)?\s*(?:biểu\s*thức)?\s*[:：]?\s*)/iu, "")
    .replace(/[.;]\s*$/, "");
  if (!expression || expression.length > 500 || /x/.test(expression))
    throw Error("Chưa hỗ trợ tính trực tiếp biểu thức này.");
  const p = polynomial(normalize(expression));
  if (p[1].n || p[2].n) throw Error("Biểu thức còn chứa ẩn.");
  return {
    expression,
    answer: tex(p[0]),
    detail:
      "Đã tính biểu thức hằng bằng số học phân số chính xác; kiểm tra mẫu số khác 0 và giới hạn phép toán.",
  };
}
