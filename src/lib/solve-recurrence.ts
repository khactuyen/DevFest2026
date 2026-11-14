import { quadraticField } from "./exact-solver/quadratic-field";
import { analyzeExtended } from "./exact-solver";
import { calculateConstantAnswer } from "./solve-engine";
import {
  GuidedProblemSchema,
  GuidedSolutionSchema,
  type GuidedProblem,
} from "./solve-guided-contracts";
import { questionAssessment } from "./solve-question";
import type { SolveMode } from "./solve-mode";

// Exact arithmetic; no evaluation of user code and no floating point proof checks.
type Q = { n: bigint; d: bigint };
const abs = (n: bigint) => (n < 0n ? -n : n);
function q(n: bigint, d = 1n): Q {
  if (!d) throw Error("Mẫu số bằng 0");
  let a = abs(n),
    b = abs(d);
  while (b) [a, b] = [b, a % b];
  const result = { n: (n / a) * (d < 0n ? -1n : 1n), d: abs(d) / a };
  if (abs(result.n).toString().length > 100 || result.d.toString().length > 100)
    throw Error("Số vượt giới hạn");
  return result;
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = (a: Q) => q(-a.n, a.d);
const sub = (a: Q, b: Q) => add(a, neg(b));
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const zero = q(0n),
  one = q(1n);
const tex = (a: Q): string =>
  a.d === 1n ? `${a.n}` : `${a.n < 0n ? "-" : ""}\\frac{${abs(a.n)}}{${a.d}}`;
const par = (a: Q) =>
  a.n < 0n || a.d !== 1n ? `\\left(${tex(a)}\\right)` : tex(a);
function expression(terms: [Q, string][]) {
  return (
    terms
      .filter(([c]) => c.n !== 0n)
      .map(([c, body], i) => {
        const magnitude = q(abs(c.n), c.d);
        const coefficient = body && eq(magnitude, one) ? "" : tex(magnitude);
        return `${c.n < 0n ? "-" : i ? "+" : ""}${coefficient}${coefficient && body ? "\\," : ""}${body}`;
      })
      .join("") || "0"
  );
}
function number(s: string): Q {
  if (!/^[+-]?\d{1,8}(?:\/\d{1,8})?$/.test(s))
    throw Error("Hệ số không hỗ trợ");
  const [n, d] = s.split("/");
  return q(BigInt(n), d ? BigInt(d) : 1n);
}
function sqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  let a = 0n,
    b = n + 1n;
  while (b - a > 1n) {
    const c = (a + b) / 2n;
    if (c * c <= n) a = c;
    else b = c;
  }
  return a * a === n ? a : null;
}
const power = (base: Q, exponent: number) =>
  q(base.n ** BigInt(exponent), base.d ** BigInt(exponent));

type Recurrence = {
  symbol: string;
  start: number;
  order: number;
  p: Q;
  second: Q;
  values: Q[];
  answer: string;
  formula: string;
  characteristic: string;
  constants: string;
  checks: string[];
  verification: string;
  evaluate(k: number): Q;
};

/** Only a complete, unambiguous first-order affine or second-order homogeneous
 * recurrence with fixed rational coefficients, real nonzero characteristic roots and consecutive initial values is accepted.
 * Additional mathematical requests are left to the broader solver. */
export function analyzeRecurrence(source: string): Recurrence | null {
  try {
    if (
      source.length > 8000 ||
      /\p{L}[au](?:_|\(|[₀₁₂₃₄₅₆₇₈₉ₙ])/u.test(source) ||
      /tổng(?!\s+quát)|tích\s+(?:các|của|n|số)|sum|chứng minh|đơn điệu|hội tụ|phân kỳ|tăng|giảm|chẵn|lẻ|giới hạn|limit|chia hết|modulo|bất đẳng|tìm\s+n|tính\s+(?:giá trị|số hạng)|a_?\{?\d{2}|u_?\{?\d{2}/iu.test(
        source,
      )
    )
      return null;
    let s = source
      .normalize("NFC")
      .replace(
        /([au])([₀₁₂₃₄₅₆₇₈₉ₙ₋₊]+)/gu,
        (_, symbol: string, subscript: string) => {
          const from = "₀₁₂₃₄₅₆₇₈₉ₙ₋₊",
            to = "0123456789n-+";
          return `${symbol}_{${[...subscript].map((c) => to[from.indexOf(c)]).join("")}}`;
        },
      )
      .replace(/[−–]/g, "-")
      .replace(/\\(?:d?frac)\s*\{([+-]?\d+)\}\s*\{(\d+)\}/g, "$1/$2")
      .replace(
        /\\(?:left|right|quad|qquad|cdot|times)|\\[,;!]|\\[()[\]]|\$/g,
        "",
      )
      .replace(/([au])_\{(n(?:\s*[+-]\s*\d+)?|\d+)\}/g, "$1_$2")
      .replace(/([au])_?\((n(?:\s*[+-]\s*\d+)?|\d+)\)/g, "$1_$2")
      .replace(/\s/g, "");
    const matches = [
      ...s.matchAll(
        /([au])_n=([+-]?(?:\d{1,8}(?:\/\d{1,8})?\*?)?)\1_n-1(?:(\+|-)((?:\d{1,8}(?:\/\d{1,8})?\*?)?)\1_n-2|([+-]\d{1,8}(?:\/\d{1,8})?))?/g,
      ),
    ];
    if (matches.length !== 1) return null;
    const m = matches[0],
      symbol = m[1],
      order = m[3] ? 2 : 1;
    const allowedBoundary =
      /^(?:$|[,;.:]|(?:với|và|cho|điều|tìm|giải|trong|khi)|[au]_\d+=|n(?:>=|≥|\\geq?|>|\\gt))/iu;
    if (!allowedBoundary.test(s.slice(m.index! + m[0].length))) return null;
    const coefficient = (v: string) =>
      number(
        v.replace(/\*/g, "") === "-"
          ? "-1"
          : v.replace(/\*/g, "").replace(/^\+$/, "") || "1",
      );
    const p = coefficient(m[2]);
    const second =
      order === 2
        ? mul(number(m[3] + "1"), coefficient(m[4]))
        : m[5]
          ? number(m[5])
          : zero;
    s = s.slice(0, m.index) + s.slice(m.index! + m[0].length);
    const initial = [
      ...s.matchAll(
        new RegExp(`${symbol}_(\\d+)=([+-]?\\d{1,8}(?:/\\d{1,8})?)`, "g"),
      ),
    ];
    if (initial.length !== order) return null;
    if (
      initial.some(
        (v) => !allowedBoundary.test(s.slice(v.index! + v[0].length)),
      )
    )
      return null;

    const entries = initial
      .map((v) => ({ i: Number(v[1]), value: number(v[2]) }))
      .sort((a, b) => a.i - b.i);
    const start = entries[0].i;
    if (![0, 1].includes(start) || entries.some((v, i) => v.i !== start + i))
      return null;
    for (const v of initial) s = s.replace(v[0], "");
    const domain = [...s.matchAll(/n(?:>=|≥|\\geq?|>|\\gt)(\d+)/g)];
    if (
      domain.some(
        (v) =>
          Number(v[1]) !==
          (v[0].includes(">") && !v[0].includes("=")
            ? start + order - 1
            : start + order),
      )
    )
      return null;
    s = s.replace(/n(?:>=|≥|\\geq?|>|\\gt)\d+/g, "");
    // Never discard another equation, index request, inequality or nonlinear term.
    if (
      /[=<>≥≤^+*/\d²³⁰¹⁴⁵⁶⁷⁸⁹×÷√∞∑-]|[au]_|\\(?:sum|sqrt|frac)|[()[\]{}]/u.test(
        s,
      )
    )
      return null;
    const values = entries.map((v) => v.value),
      variable = start ? "n-1" : "n";
    let formula: string,
      characteristic = "",
      constants: string,
      evaluate: (k: number) => Q,
      verification: string;
    if (order === 1) {
      if (eq(p, one)) {
        formula = expression([
          [values[0], ""],
          [second, `(${variable})`],
        ]);
        evaluate = (k) => add(values[0], mul(second, q(BigInt(k))));
        constants = `${symbol}_{${start}}=${tex(values[0])},\\quad d=${tex(second)}`;
        verification = `Sai phân của công thức luôn bằng ${tex(second)}, đúng bằng số hạng cộng trong hệ thức.`;
      } else if (!p.n) {
        formula = `\\begin{cases}${tex(values[0])}&n=${start}\\\\${tex(second)}&n\\ge${start + 1}\\end{cases}`;
        evaluate = (k) => (k === 0 ? values[0] : second);
        constants = `${symbol}_{${start}}=${tex(values[0])},\\quad p=0,\\quad c=${tex(second)}`;
        verification =
          "Khi p=0, mọi số hạng sau chỉ số đầu đều bằng c. Công thức từng đoạn giữ nguyên điều kiện đầu và thỏa hệ thức ở mọi chỉ số sau đó, không dùng quy ước 0^0.";
      } else {
        const fixed = div(second, sub(one, p)),
          a = sub(values[0], fixed);
        formula = expression([
          [a, `${par(p)}^{${variable}}`],
          [fixed, ""],
        ]);
        evaluate = (k) => add(mul(a, power(p, k)), fixed);
        constants = `L=${tex(fixed)},\\quad A=${tex(a)},\\quad L=${tex(p)}L+${tex(second)}`;
        verification = `Công thức có dạng A p^{n-${start}}+L; L=pL+c nên thế vào hệ thức cho phần dư đồng nhất bằng 0.`;
      }
    } else if (!second.n) {
      characteristic = `r^2-(${tex(p)})r=0`;
      constants = `${symbol}_{${start}}=${tex(values[0])},\\quad ${symbol}_{${start + 1}}=${tex(values[1])}`;
      if (p.n) {
        formula = `\\begin{cases}${tex(values[0])}&n=${start}\\\\${tex(values[1])}\\,${par(p)}^{n-${start + 1}}&n\\ge${start + 1}\\end{cases}`;
        evaluate = (k) =>
          k === 0 ? values[0] : mul(values[1], power(p, k - 1));
      } else {
        formula = `\\begin{cases}${tex(values[0])}&n=${start}\\\\${tex(values[1])}&n=${start + 1}\\\\0&n\\ge${start + 2}\\end{cases}`;
        evaluate = (k) => (k === 0 ? values[0] : k === 1 ? values[1] : zero);
      }
      verification =
        "Khi hệ số của số hạng n−2 bằng 0, từ số hạng thứ hai dãy là cấp số nhân công bội p. Công thức từng đoạn giữ đủ hai điều kiện đầu; nếu p=0, mọi số hạng từ chỉ số đầu+2 bằng 0. Không tính 0^0.";
    } else {
      const delta = add(mul(p, p), mul(q(4n), second)),
        sn = sqrt(delta.n),
        sd = sqrt(delta.d);
      if (sn === null || sd === null) {
        if (delta.n <= 0n) return null;
        const f = quadraticField(delta),
          fzero = f.from(zero);
        const r1 = { a: div(p, q(2n)), b: q(1n, 2n) };
        const r2 = { a: div(p, q(2n)), b: q(-1n, 2n) };
        const A = f.div(
          f.sub(f.from(values[1]), f.mul(f.from(values[0]), r2)),
          f.sub(r1, r2),
        );
        const B = f.sub(f.from(values[0]), A);
        for (const root of [r1, r2]) {
          if (
            !f.eq(
              f.sub(
                f.sub(f.mul(root, root), f.mul(f.from(p), root)),
                f.from(second),
              ),
              fzero,
            )
          )
            throw Error("Căn thức không thỏa phương trình đặc trưng.");
        }
        evaluate = (k) => {
          const value = f.add(f.mul(A, f.pow(r1, k)), f.mul(B, f.pow(r2, k)));
          if (value.b.n) throw Error("Phần căn thức không triệt tiêu.");
          return value.a;
        };
        characteristic = `r^2-(${tex(p)})r-(${tex(second)})=0,\\quad r_1=${f.tex(r1)},\\ r_2=${f.tex(r2)}`;
        constants = `A=${f.tex(A)},\\quad B=${f.tex(B)}`;
        formula = `\\left(${f.tex(A)}\\right)\\left(${f.tex(r1)}\\right)^{${variable}}+\\left(${f.tex(B)}\\right)\\left(${f.tex(r2)}\\right)^{${variable}}`;
        verification =
          "Hai nghiệm và hằng số được tính trong trường căn thức Q(√Δ). Thế vào phương trình đặc trưng cho cả hệ số hữu tỉ và hệ số căn bằng 0. Điều kiện đầu được kiểm tra chính xác; tính duy nhất của truy hồi xác định toàn bộ dãy.";
      } else {
        const d = q(sn, sd),
          r1 = div(add(p, d), q(2n)),
          r2 = div(sub(p, d), q(2n));
        if (!r1.n || !r2.n) return null;
        characteristic = `r^2-(${tex(p)})r-(${tex(second)})=0,\\quad r_1=${tex(r1)},\\ r_2=${tex(r2)}`;
        if (eq(r1, r2)) {
          const a = values[0],
            b = sub(div(values[1], r1), a);
          formula = `\\left(${expression([
            [a, ""],
            [b, `(${variable})`],
          ])}\\right)${par(r1)}^{${variable}}`;
          evaluate = (k) => mul(add(a, mul(b, q(BigInt(k)))), power(r1, k));
          constants = `A=${tex(a)},\\quad B=${tex(b)}`;
          verification = `Nghiệm kép r thỏa r²-pr-q=0 và 2r-p=0; thế (A+Bk)r^k vào hệ thức có cả hai hệ số phần dư bằng 0.`;
          if (!eq(sub(mul(q(2n), r1), p), zero)) throw Error("Nghiệm kép sai");
        } else {
          const a = div(sub(values[1], mul(values[0], r2)), sub(r1, r2)),
            b = sub(values[0], a);
          formula = expression([
            [a, `${par(r1)}^{${variable}}`],
            [b, `${par(r2)}^{${variable}}`],
          ]);
          evaluate = (k) => add(mul(a, power(r1, k)), mul(b, power(r2, k)));
          constants = `A+B=${tex(values[0])},\\quad ${par(r1)}A+${par(r2)}B=${tex(values[1])}\\Rightarrow A=${tex(a)},\\ B=${tex(b)}`;
          verification = `Mỗi nghiệm đặc trưng thỏa r²-pr-q=0 bằng số học hữu tỉ chính xác. Thế A r₁^k+B r₂^k vào hệ thức có phần dư đồng nhất bằng 0 với mọi chỉ số thuộc miền xét.`;
        }
        if (
          !eq(sub(sub(mul(r1, r1), mul(p, r1)), second), zero) ||
          !eq(sub(sub(mul(r2, r2), mul(p, r2)), second), zero)
        )
          throw Error("Nghiệm sai");
      }
    }
    if (values.some((value, k) => !eq(evaluate(k), value)))
      throw Error("Sai điều kiện đầu");
    // Independent term generation is a regression cross-check, not the proof of identity above.
    const terms = [...values];
    for (let k = order; k < 8; k++) {
      terms[k] = add(
        mul(p, terms[k - 1]),
        order === 2 ? mul(second, terms[k - 2]) : second,
      );
      if (!eq(terms[k], evaluate(k))) throw Error("Không khớp truy hồi");
    }
    const checks = values.map(
      (value, k) =>
        `\\[${symbol}_{${start + k}}=${tex(evaluate(k))}=${tex(value)}\\]`,
    );
    return {
      symbol,
      start,
      order,
      p,
      second,
      values,
      formula,
      answer: `\\[${symbol}_n=${formula},\\quad n\\ge ${start}\\]`,
      characteristic,
      constants,
      checks,
      verification,
      evaluate,
    };
  } catch {
    return null;
  }
}

export function directSolverFor(
  prompt: string,
): "recurrence" | "arithmetic" | "extended" | undefined {
  if (analyzeRecurrence(prompt)) return "recurrence";
  if (analyzeExtended(prompt)) return "extended";
  try {
    calculateConstantAnswer(prompt);
    return "arithmetic";
  } catch {
    return undefined;
  }
}

export function recurrenceProblem(
  prompt: string,
  type: "essay" | "short_answer",
): GuidedProblem | null {
  const r = analyzeRecurrence(prompt);
  if (!r) return null;
  return GuidedProblemSchema.parse({
    kind: "ai",
    directSolver: "recurrence",
    sourcePrompt: prompt,
    assessment: questionAssessment(prompt, type),
    topic: `Hệ thức truy hồi bậc ${r.order}`,
    summary:
      "Tìm công thức tổng quát bằng bộ giải trực tiếp.",
    givens: [`Hệ thức bậc ${r.order} có hệ số hữu tỉ cố định.`, ...r.checks],
    goals: ["Tìm công thức tổng quát của dãy và kiểm tra với dữ kiện ban đầu."],
    status: "ready",
    warnings: [],
    methods: [
      {
        id: "ai-0",
        label:
          r.order === 2
            ? "Phương trình đặc trưng"
            : "Tách điểm bất động / sai phân",
        description:
          "Tính chính xác hệ số, dựng công thức và kiểm tra đồng nhất thức bằng bộ giải trực tiếp.",
        coversGoals: [0],
      },
    ],
  });
}
export function solveRecurrence(
  prompt: string,
  problem: GuidedProblem,
  method: string,
  solveMode: SolveMode,
) {
  const r = analyzeRecurrence(prompt);
  if (!r) return null;
  const parts = [
    ...(r.characteristic
      ? [
          {
            title: "Lập và giải phương trình đặc trưng",
            content: `\\[${r.characteristic}\\]`,
          },
        ]
      : []),
    {
      title: "Xác định hằng số từ điều kiện đầu",
      content: `\\[${r.constants}\\]`,
    },
    { title: "Viết công thức tổng quát", content: r.answer },
    {
      title: "Kiểm tra điều kiện đầu và hệ thức",
      content: r.checks.join("\n") + "\n" + r.verification,
    },
  ];
  return GuidedSolutionSchema.parse({
    kind: "ai",
    origin: "solver",
    problem,
    method,
    solveMode,
    answer: r.answer,
    steps: parts.map((v, i) => ({
      ...v,
      id: `ai-step-${i}`,
      hint: "Đối chiếu hệ số và điều kiện đầu trong đề.",
      explanation:
        "Các phép tính dùng phân số chính xác. Có thể yêu cầu AI giải thích thêm khi cần.",
      targets: [],
      completesGoals: i === parts.length - 1 ? [0] : [],
    })),
    resultKind: "complete",
    assumptions: [],
    unresolvedGoals: [],
    warning: "",
    visual: null,
    visualWarning:
      "Kết quả được kiểm tra bằng hệ thức và điều kiện đầu; không cần đồ thị.",
    verification:
      "Đáp án được tính và kiểm tra bằng bộ giải xác định trong phạm vi hỗ trợ.",
    resultReview: {
      source: "solver",
      status: "answer_verified",
      summary:
        "Đã kiểm tra điều kiện đầu và đồng nhất thức truy hồi bằng số học chính xác trên phân số và căn thức bậc hai.",
      checks: [
        { itemId: "answer", status: "verified", detail: r.verification },
      ],
      disputes: [],
      unresolvedItems: [],
    },
  });
}
