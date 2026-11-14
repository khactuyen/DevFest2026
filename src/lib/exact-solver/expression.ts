import {
  Q,
  Z,
  O,
  add,
  sub,
  mul,
  div,
  neg,
  pow,
  readQ,
  sqrtQ,
  tex,
} from "./arithmetic";
export type Node =
  | { type: "num"; value: Q }
  | { type: "var"; name: string }
  | { type: "op"; op: string; a: Node; b: Node }
  | { type: "fn"; name: string; arg: Node };
/** Decode only understood LaTeX. Unknown commands stay in the input and are rejected. */
export function mathText(source: string): string {
  if (source.length > 4000) throw Error("Biểu thức quá dài.");
  let s = source
    .normalize("NFC")
    .replace(/[−–]/g, "-")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/gu, (value) => {
      const from = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺",
        to = "0123456789-+";
      return `^(${[...value].map((c) => to[from.indexOf(c)]).join("")})`;
    })
    .replace(
      /log([₀₁₂₃₄₅₆₇₈₉]+)/gu,
      (_, digits: string) =>
        `log_(${[...digits].map((c) => "₀₁₂₃₄₅₆₇₈₉".indexOf(c)).join("")})`,
    )
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\[lr]vert/g, "|")
    .replace(/\|([^|]+)\|/g, "abs($1)")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\\(?:leq?|geq?)/g, (v) => (v.includes("le") ? "<=" : ">="))
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/\\(?:ln|sin|cos|tan|exp|log)/g, (v) => v.slice(1))
    .replace(/\\(?:,|;|!|quad|qquad)/g, " ")
    .replace(/\\[()[\]]|\$/g, "");
  function group(at: number): [string, number] {
    while (/\s/.test(s[at] || "")) at++;
    if (s[at] !== "{") throw Error("Thiếu nhóm LaTeX.");
    let depth = 1,
      end = at + 1;
    for (; end < s.length && depth; end++) {
      if (s[end] === "{") depth++;
      if (s[end] === "}") depth--;
    }
    if (depth) throw Error("Nhóm chưa đóng.");
    return [s.slice(at + 1, end - 1), end];
  }
  for (let count = 0; /\\(?:d?frac|sqrt)/.test(s); count++) {
    if (count > 80) throw Error("Quá nhiều nhóm.");
    const m = /\\(?:d?frac|sqrt)/.exec(s)!;
    const [a, end] = group(m.index + m[0].length);
    if (m[0].includes("frac")) {
      const [b, last] = group(end);
      s = s.slice(0, m.index) + `((${a})/(${b}))` + s.slice(last);
    } else s = s.slice(0, m.index) + `sqrt(${a})` + s.slice(end);
  }
  return s.replace(/\{/g, "(").replace(/\}/g, ")").trim();
}
export function parseExpression(source: string): Node {
  const s = mathText(source),
    tokens = s.match(/\d+(?:\.\d+)?|[A-Za-z]+|[+\-*/^(),!]|\S/g) || [];
  if (tokens.length > 350) throw Error("Quá nhiều token.");
  let i = 0,
    depth = 0;
  const isPrimary = (t: string | undefined) =>
    !!t && /^(?:\d|[A-Za-z]|\()/.test(t);
  function atom(): Node {
    if (++depth > 40) throw Error("Biểu thức quá sâu.");
    let result: Node;
    const t = tokens[i++];
    if (t === "(") {
      result = addition();
      if (tokens[i++] !== ")") throw Error("Thiếu dấu đóng.");
    } else if (t && /^\d/.test(t)) result = { type: "num", value: readQ(t) };
    else if (t && /^[xyzt]$/.test(t)) result = { type: "var", name: t };
    else if (t && /^(?:sqrt|abs|sin|cos|tan|exp|ln|log)$/.test(t)) {
      if (tokens[i++] !== "(") throw Error("Hàm cần ngoặc.");
      const arg = addition();
      if (tokens[i++] !== ")") throw Error("Thiếu dấu đóng hàm.");
      result = { type: "fn", name: t, arg };
    } else throw Error("Ký hiệu chưa hỗ trợ.");
    depth--;
    return result;
  }
  function exponent(): Node {
    const a = atom();
    if (tokens[i] === "^") {
      i++;
      return { type: "op", op: "^", a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const b = unary();
      return op === "+"
        ? b
        : { type: "op", op: "*", a: { type: "num", value: readQ("-1") }, b };
    }
    return exponent();
  }
  function product(): Node {
    let a = unary();
    while (tokens[i] === "*" || tokens[i] === "/" || isPrimary(tokens[i])) {
      if (/^\d/.test(tokens[i]) && /^\d/.test(tokens[i - 1]))
        throw Error("Thiếu phép toán giữa hai số.");
      const op = tokens[i] === "/" ? "/" : "*";
      if (tokens[i] === "*" || tokens[i] === "/") i++;
      a = { type: "op", op, a, b: unary() };
    }
    return a;
  }
  function addition(): Node {
    let a = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      a = { type: "op", op, a, b: product() };
    }
    return a;
  }
  const result = addition();
  if (i !== tokens.length) throw Error("Còn ký hiệu chưa xử lý.");
  return result;
}
export function evaluate(n: Node, values: Record<string, Q> = {}): Q {
  if (n.type === "num") return n.value;
  if (n.type === "var") {
    if (!values[n.name]) throw Error("Thiếu giá trị biến.");
    return values[n.name];
  }
  if (n.type === "fn") {
    const a = evaluate(n.arg, values);
    if (n.name === "abs") return a.n < 0n ? neg(a) : a;
    if (n.name === "sqrt") {
      const r = sqrtQ(a);
      if (r) return r;
    }
    throw Error("Hàm không cho giá trị hữu tỉ chính xác.");
  }
  const a = evaluate(n.a, values),
    b = evaluate(n.b, values);
  if (n.op === "+") return add(a, b);
  if (n.op === "-") return sub(a, b);
  if (n.op === "*") return mul(a, b);
  if (n.op === "/") return div(a, b);
  if (b.d !== 1n) throw Error("Số mũ không nguyên.");
  return pow(a, Number(b.n));
}
export function variables(n: Node): string[] {
  return [
    ...new Set(
      n.type === "var"
        ? [n.name]
        : n.type === "num"
          ? []
          : n.type === "fn"
            ? variables(n.arg)
            : [...variables(n.a), ...variables(n.b)],
    ),
  ].sort();
}
export function nodeTex(n: Node): string {
  if (n.type === "num") return tex(n.value);
  if (n.type === "var") return n.name;
  if (n.type === "fn")
    return n.name === "sqrt"
      ? `\\sqrt{${nodeTex(n.arg)}}`
      : `\\operatorname{${n.name}}\\left(${nodeTex(n.arg)}\\right)`;
  const a = nodeTex(n.a),
    b = nodeTex(n.b);
  return n.op === "/"
    ? `\\frac{${a}}{${b}}`
    : n.op === "^"
      ? `\\left(${a}\\right)^{${b}}`
      : `\\left(${a}${n.op === "*" ? "\\cdot" : n.op}${b}\\right)`;
}
export type Relation = { left: Node; right: Node; op: string };
export function relation(source: string): Relation {
  const s = mathText(source),
    m = s.match(/<=|>=|=|<|>/g);
  if (m?.length !== 1) throw Error("Cần đúng một quan hệ.");
  const op = m[0],
    at = s.indexOf(op);
  return {
    left: parseExpression(s.slice(0, at)),
    right: parseExpression(s.slice(at + op.length)),
    op,
  };
}
export function command(source: string, pattern: RegExp): string | null {
  const m = pattern.exec(source.trim());
  return m
    ? source
        .trim()
        .slice(m[0].length)
        .replace(/[.。]\s*$/, "")
        .trim()
    : null;
}
export const math = (s: string) => `\\[${s}\\]`;
