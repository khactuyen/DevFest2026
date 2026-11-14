import {
  Q,
  Z,
  O,
  q,
  add,
  sub,
  mul,
  div,
  neg,
  eq,
  cmp,
  pow,
  tex,
  readQ,
  txt,
} from "./arithmetic";
import {
  Node,
  parseExpression,
  evaluate,
  relation,
  math,
  mathText,
} from "./expression";
import { polynomial, degree, peval, ptex } from "./polynomial";
import { result, ExactResult } from "./types";
function factorInteger(n: bigint): Map<bigint, number> {
  if (n < 1n || n > 1000000000n) throw Error("Cơ số quá lớn.");
  const out = new Map<bigint, number>();
  for (let p = 2n; p * p <= n; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (n % p === 0n) {
      n /= p;
      e++;
    }
    if (e) out.set(p, e);
  }
  if (n > 1n) out.set(n, (out.get(n) || 0) + 1);
  return out;
}
function factorQ(a: Q): Map<bigint, number> {
  if (a.n <= 0n) throw Error("Cần số dương.");
  const out = factorInteger(a.n);
  for (const [p, e] of factorInteger(a.d)) out.set(p, (out.get(p) || 0) - e);
  for (const [p, e] of out) if (!e) out.delete(p);
  return out;
}
function exactLog(base: Q, value: Q): Q | null {
  if (base.n <= 0n || eq(base, O) || value.n <= 0n) return null;
  const b = factorQ(base),
    v = factorQ(value),
    [p, e] = b.entries().next().value!;
  const ratio = q(v.get(p) || 0, e);
  for (const prime of new Set([...b.keys(), ...v.keys()]))
    if (!eq(mul(q(b.get(prime) || 0), ratio), q(v.get(prime) || 0)))
      return null;
  return ratio;
}
function solveLinearArgument(arg: Node, target: Q): { x: Q; poly: Q[] } | null {
  const p = polynomial(arg);
  if (degree(p) !== 1 || !p[1].n) return null;
  const x = div(sub(target, p[0]), p[1]);
  if (!eq(peval(p, x), target)) throw Error("Thế lại biểu thức không khớp.");
  return { x, poly: p };
}
export function transcendental(source: string): ExactResult | null {
  const body = source
    .trim()
    .replace(/^(?:giải\s+(?:phương\s+trình)?\s*)[:：]?\s*/iu, "");
  const log = /^log_\(?([\d./+-]+)\)?\((.*)\)\s*=\s*(.+)$/u.exec(
    mathText(body),
  );
  if (log) {
    const base = evaluate(parseExpression(log[1])),
      exponent = evaluate(parseExpression(log[3]));
    if (base.n <= 0n || eq(base, O) || exponent.d !== 1n) return null;
    const target = pow(base, Number(exponent.n)),
      solved = solveLinearArgument(parseExpression(log[2]), target);
    if (!solved || peval(solved.poly, solved.x).n <= 0n) return null;
    return result(
      "logarithmic-equation",
      "Phương trình logarit cơ số hữu tỉ",
      `${ptex(solved.poly)}>0`,
      math(`S=\\{${tex(solved.x)}\\}`),
      "Đưa logarit về dạng mũ",
      [
        {
          title: "Kiểm tra cơ số và điều kiện đối số",
          content: math(
            `${tex(base)}>0,\\quad ${tex(base)}\\ne1,\\quad ${ptex(solved.poly)}>0`,
          ),
        },
        {
          title: "Biến đổi tương đương theo định nghĩa logarit",
          content: math(
            `${ptex(solved.poly)}=${tex(base)}^{${tex(exponent)}}=${tex(target)}`,
          ),
        },
        {
          title: "Giải và thế lại đối số",
          content: math(
            `x=${tex(solved.x)},\\quad ${ptex(solved.poly)}=${tex(target)}>0`,
          ),
        },
      ],
      [
        "Cơ số dương khác 1, đối số tại nghiệm dương và bằng chính xác cơ số lũy thừa vế phải. Tính đơn ánh của logarit chứng minh không có nghiệm khác.",
      ],
    );
  }
  const r = relation(body);
  if (r.op !== "=") return null;
  if (r.left.type === "op" && r.left.op === "^") {
    const base = evaluate(r.left.a),
      value = evaluate(r.right);
    if (base.n <= 0n || eq(base, O)) return null;
    if (value.n <= 0n)
      return result(
        "exponential-equation",
        "Phương trình mũ",
        "x\\in\\mathbb R",
        math("S=\\varnothing"),
        "Xét tính dương của hàm mũ",
        [
          {
            title: "Kiểm tra dấu hai vế",
            content: math(`${tex(base)}^u>0,\\quad ${tex(value)}\\le0`),
          },
        ],
        [
          "Lũy thừa thực của cơ số dương luôn dương; do đó không thể bằng vế phải không dương.",
        ],
      );
    const logarithm = exactLog(base, value);
    if (!logarithm) return null;
    const solved = solveLinearArgument(r.left.b, logarithm);
    if (!solved) return null;
    return result(
      "exponential-equation",
      "Phương trình mũ cùng cơ sở",
      "x\\in\\mathbb R",
      math(`S=\\{${tex(solved.x)}\\}`),
      "So khớp số mũ bằng phân tích nguyên tố",
      [
        {
          title: "Biểu diễn vế phải theo cơ số",
          content: math(`${tex(value)}=${tex(base)}^{${tex(logarithm)}}`),
        },
        {
          title: "Dùng tính đơn ánh để đồng nhất số mũ",
          content: math(`${ptex(solved.poly)}=${tex(logarithm)}`),
        },
        {
          title: "Thế lại nghiệm",
          content: math(
            `x=${tex(solved.x)}\\Rightarrow ${tex(base)}^{${tex(peval(solved.poly, solved.x))}}=${tex(value)}`,
          ),
        },
      ],
      [
        "Đẳng thức lũy thừa được chứng nhận bằng vector số mũ nguyên tố trên tử và mẫu, không dùng logarit dấu phẩy động. Hàm mũ cơ số dương khác 1 là đơn ánh.",
      ],
    );
  }
  if (r.left.type === "fn" && r.left.name === "ln") {
    let target: Q;
    if (r.right.type === "fn" && r.right.name === "ln")
      target = evaluate(r.right.arg);
    else if (eq(evaluate(r.right), Z)) target = O;
    else return null;
    if (target.n <= 0n) return null;
    const solved = solveLinearArgument(r.left.arg, target);
    if (!solved) return null;
    return result(
      "natural-log-equation",
      "Phương trình logarit tự nhiên",
      `${ptex(solved.poly)}>0`,
      math(`S=\\{${tex(solved.x)}\\}`),
      "Tính đơn ánh của ln",
      [
        {
          title: "Giữ điều kiện đối số dương",
          content: math(`${ptex(solved.poly)}>0`),
        },
        {
          title: "Đồng nhất đối số",
          content: math(`${ptex(solved.poly)}=${tex(target)}`),
        },
        {
          title: "Thế lại và kết luận",
          content: math(`S=\\{${tex(solved.x)}\\}`),
        },
      ],
      [
        "Đối số tại nghiệm dương và bằng đúng đối số vế phải; ln là đơn ánh trên (0,+∞), với ln(1)=0.",
      ],
    );
  }
  if (r.left.type !== "fn" || !["sin", "cos", "tan"].includes(r.left.name))
    return null;
  const fn = r.left.name,
    p = polynomial(r.left.arg);
  if (degree(p) !== 1) return null;
  const c = evaluate(r.right),
    key = txt(c);
  const tables: Record<string, Record<string, string[]>> = {
    sin: {
      "0": ["0", "1"],
      "1": ["\\frac12"],
      "-1": ["-\\frac12"],
      "1/2": ["\\frac16", "\\frac56"],
      "-1/2": ["-\\frac16", "\\frac76"],
    },
    cos: {
      "0": ["\\frac12", "\\frac32"],
      "1": ["0"],
      "-1": ["1"],
      "1/2": ["\\frac13", "-\\frac13"],
      "-1/2": ["\\frac23", "-\\frac23"],
    },
    tan: { "0": ["0"], "1": ["\\frac14"], "-1": ["-\\frac14"] },
  };
  const entries = tables[fn][key];
  if (!entries) {
    if (fn !== "tan" && (cmp(c, O) > 0 || cmp(c, neg(O)) < 0))
      return result(
        "trigonometric-equation",
        "Phương trình lượng giác",
        "x\\in\\mathbb R",
        math("S=\\varnothing"),
        "Kiểm tra miền giá trị sin/cos",
        [{ title: "Xét miền giá trị", content: math(`-1\\le\\${fn}(u)\\le1`) }],
        ["Vế phải nằm ngoài [-1,1], nên sin/cos không thể nhận giá trị đó."],
      );
    return null;
  }
  const period = fn === "tan" ? "k\\pi" : "2k\\pi",
    solutions = entries.map(
      (t) => `x=\\frac{(${t})\\pi+${period}-(${tex(p[0])})}{${tex(p[1])}}`,
    );
  return result(
    "trigonometric-equation",
    "Phương trình lượng giác cơ bản",
    fn === "tan" ? `${ptex(p)}\\ne\\frac\\pi2+k\\pi` : "x\\in\\mathbb R",
    math(
      `${solutions.join("\\quad\\text{hoặc}\\quad")},\\quad k\\in\\mathbb Z`,
    ),
    "Góc đặc biệt và chu kỳ đầy đủ",
    [
      {
        title: "Nhận diện giá trị góc đặc biệt",
        content: math(`\\${fn}(${ptex(p)})=${tex(c)}`),
      },
      {
        title: "Liệt kê đủ nhánh trong một chu kỳ",
        content: math(entries.map((t) => `u=(${t})\\pi`).join(",\\quad ")),
      },
      {
        title: "Thêm chu kỳ và giải biểu thức góc",
        content: math(`${solutions.join(",\\quad ")},\\quad k\\in\\mathbb Z`),
      },
    ],
    [
      "Các góc là giá trị chính xác từ đường tròn đơn vị; đã lấy đủ nhánh trong một chu kỳ và thêm mọi chu kỳ nguyên. Biểu thức góc bậc nhất có hệ số khác 0 nên phép chuyển về x là song ánh.",
    ],
  );
}
