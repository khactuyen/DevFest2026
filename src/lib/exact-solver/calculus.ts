import { Q, Z, O, q, add, sub, mul, div, eq, tex, wrap } from "./arithmetic";
import { parseExpression, command, math, variables } from "./expression";
import {
  P,
  polynomial,
  rational,
  derivative,
  integral,
  peval,
  peq,
  degree,
  ptex,
  pmul,
  psub,
  pdiv,
  isZero,
} from "./polynomial";
import { ExactResult, result } from "./types";
function body(source: string, pattern: RegExp): string | null {
  const s = command(source, pattern);
  return (
    s?.replace(
      /^(?:của\s+)?(?:hàm\s+số\s+)?(?:[fy]\s*(?:\(x\))?\s*=\s*)/iu,
      "",
    ) ?? null
  );
}
export function calculus(source: string): ExactResult | null {
  let expr = body(
    source,
    /^(?:tính\s+)?(?:đạo\s+hàm|derivative)\s*[:：]?\s*/iu,
  );
  if (expr !== null) {
    const ast = parseExpression(expr),
      vars = variables(ast);
    if (vars.some((v) => v !== "x")) return null;
    const r = rational(ast),
      n = psub(pmul(derivative(r.n), r.d), pmul(r.n, derivative(r.d))),
      d = pmul(r.d, r.d);
    const domain =
      [...r.guards, r.d]
        .filter((p) => degree(p) > 0)
        .map((p) => `${ptex(p)}\\ne0`)
        .join(",\\quad ") || "x\\in\\mathbb R";
    const answer =
      degree(d) === 0
        ? ptex(n.map((c) => div(c, d[0])))
        : `\\frac{${ptex(n)}}{${ptex(d)}}`;
    return result(
      "derivative",
      "Đạo hàm đa thức / phân thức",
      domain,
      math(`f'(x)=${answer},\\quad ${domain}`),
      "Quy tắc lũy thừa và thương",
      [
        {
          title: "Xác định hàm và miền ban đầu",
          content: math(
            `f(x)=\\frac{${ptex(r.n)}}{${ptex(r.d)}},\\quad ${domain}`,
          ),
        },
        {
          title: "Áp dụng quy tắc đạo hàm",
          content: math(`f'=\\frac{N'D-ND'}{D^2}`),
        },
        { title: "Gom hệ số chính xác", content: math(`f'(x)=${answer}`) },
      ],
      [
        "Đạo hàm từng đơn thức theo hệ số hữu tỉ, rồi áp dụng quy tắc thương; các tích và hiệu được tính theo hệ số, giữ mọi điều kiện mẫu gốc.",
      ],
    );
  }
  expr = body(
    source,
    /^(?:tìm|tính)?\s*(?:nguyên\s+hàm|integrate|antiderivative)\s*[:：]?\s*/iu,
  );
  if (expr !== null) {
    expr = expr.replace(/\s*dx\s*$/, " ").trim();
    const p = polynomial(parseExpression(expr)),
      f = integral(p);
    if (!peq(derivative(f), p)) throw Error("Kiểm tra đạo hàm thất bại.");
    return result(
      "antiderivative",
      "Nguyên hàm đa thức",
      "x\\in\\mathbb R",
      math(`F(x)=${ptex(f)}+C,\\quad C\\in\\mathbb R`),
      "Tăng số mũ rồi kiểm tra đạo hàm",
      [
        {
          title: "Tích phân từng đơn thức",
          content: math(`\\int x^k\\,dx=\\frac{x^{k+1}}{k+1}+C\\quad(k\\ge0)`),
        },
        { title: "Gom các nguyên hàm", content: math(`F(x)=${ptex(f)}+C`) },
        {
          title: "Lấy đạo hàm để kiểm tra",
          content: math(`F'(x)=${ptex(derivative(f))}=${ptex(p)}`),
        },
      ],
      [
        "Đạo hàm của đa thức kết quả được so sánh theo từng hệ số với toàn bộ biểu thức nguồn. Hằng số tích phân C được giữ.",
      ],
    );
  }
  // Explicit endpoints prevent a natural-language parser from discarding bounds.
  const definite =
    /^(?:tính\s+)?tích\s+phân\s+từ\s+(.+?)\s+đến\s+(.+?)\s*:\s*(.+)$/iu.exec(
      source.trim(),
    );
  const latex =
    /^\\int_\{([^{}]+)\}\^\{([^{}]+)\}\s*(.+?)\s*(?:\\,)?d\s*x\s*$/u.exec(
      source.trim(),
    );
  const m = definite || latex;
  if (m) {
    const a = constant(m[1]),
      b = constant(m[2]),
      p = polynomial(parseExpression(m[3].replace(/\s*dx\s*$/, ""))),
      f = integral(p);
    if (!peq(derivative(f), p)) throw Error("Sai nguyên hàm.");
    const fa = peval(f, a),
      fb = peval(f, b),
      answer = sub(fb, fa);
    return result(
      "definite-integral",
      "Tích phân xác định của đa thức",
      "Đa thức liên tục trên đoạn giữa hai cận.",
      math(`I=${tex(answer)}`),
      "Newton–Leibniz với cận chính xác",
      [
        { title: "Tìm nguyên hàm", content: math(`F(x)=${ptex(f)}`) },
        {
          title: "Thế đúng thứ tự hai cận",
          content: math(`I=F(${tex(b)})-F(${tex(a)})=${wrap(fb)}-${wrap(fa)}`),
        },
        {
          title: "Kiểm tra đạo hàm và kết luận",
          content: math(`F'(x)=${ptex(p)},\\quad I=${tex(answer)}`),
        },
      ],
      [
        "Đạo hàm nguyên hàm trùng từng hệ số với đa thức nguồn; đa thức liên tục trên đoạn tích phân. Hai cận được thế bằng phân số chính xác, giữ đúng thứ tự kể cả cận đảo.",
      ],
    );
  }
  const tangent =
    /^(?:viết|tìm)?\s*(?:phương\s+trình\s+)?tiếp\s+tuyến\s+(?:của\s+)?(?:y\s*=|f\(x\)\s*=)?\s*(.+?)\s+tại\s+x\s*=\s*(.+)$/iu.exec(
      source.trim(),
    );
  if (tangent) {
    const p = polynomial(parseExpression(tangent[1])),
      x = constant(tangent[2]),
      y = peval(p, x),
      slope = peval(derivative(p), x),
      intercept = sub(y, mul(slope, x)),
      line = [intercept, slope];
    if (!eq(peval(line, x), y) || !eq(peval(derivative(line), x), slope))
      throw Error("Sai tiếp tuyến.");
    return result(
      "tangent",
      "Tiếp tuyến đồ thị đa thức",
      "x\\in\\mathbb R",
      math(`y=${ptex(line)}`),
      "Giá trị hàm và hệ số góc đạo hàm",
      [
        {
          title: "Tính điểm tiếp xúc",
          content: math(`x_0=${tex(x)},\\quad y_0=${tex(y)}`),
        },
        {
          title: "Tính hệ số góc",
          content: math(`f'(x)=${ptex(derivative(p))},\\quad m=${tex(slope)}`),
        },
        {
          title: "Lập và kiểm tra đường thẳng",
          content: math(`y=${ptex(line)}`),
        },
      ],
      [
        "Đường thẳng trả về đi qua đúng điểm (x₀,f(x₀)); hệ số góc bằng đạo hàm của đa thức gốc tại x₀, cả hai được kiểm tra hữu tỉ chính xác.",
      ],
    );
  }
  const limit =
    /^(?:tính\s+)?giới\s+hạn\s+khi\s+x\s*(?:->|→)\s*([^:]+)\s*:\s*(.+)$/iu.exec(
      source.trim(),
    );
  if (limit) {
    const r = rational(parseExpression(limit[2])),
      where = limit[1].trim();
    if (/^[+-]?(?:inf|infinity|∞)$/iu.test(where)) {
      if (isZero(r.n))
        return limitResult(
          "0",
          "Tử số đồng nhất bằng 0 trên các điểm thuộc miền nguồn.",
        );
      const dn = degree(r.n),
        dd = degree(r.d),
        ratio = div(r.n.at(-1)!, r.d.at(-1)!);
      let answer: string;
      if (dn < dd) answer = "0";
      else if (dn === dd) answer = tex(ratio);
      else {
        const negative = where.startsWith("-") && (dn - dd) % 2 === 1;
        answer = ratio.n < 0n !== negative ? "-\\infty" : "+\\infty";
      }
      return limitResult(
        answer,
        `So sánh bậc tử ${dn} và mẫu ${dd}; chia cho lũy thừa cao nhất. Các hệ số đầu khác 0 được tính chính xác, kể cả dấu tại âm vô cực.`,
      );
    }
    const point = constant(where);
    let n = r.n,
      d = r.d,
      cancelled = 0;
    while (!peval(d, point).n && !peval(n, point).n && !isZero(d)) {
      if (isZero(n))
        return limitResult(
          "0",
          "Tử đồng nhất bằng 0; bỏ điểm loại khỏi lân cận không làm đổi giới hạn.",
        );
      const factor = [{ n: -point.n, d: point.d }, O],
        nd = pdiv(n, factor),
        dd = pdiv(d, factor);
      if (!isZero(nd.remainder) || !isZero(dd.remainder))
        throw Error("Khử không chính xác.");
      n = nd.quotient;
      d = dd.quotient;
      if (++cancelled > 12) throw Error("Vượt bậc.");
    }
    if (!peval(d, point).n) return null;
    return limitResult(
      tex(div(peval(n, point), peval(d, point))),
      `Đã khử chính xác ${cancelled} nhân tử chung tại điểm tiến tới, rồi thế vào phân thức có mẫu khác 0. Không đồng nhất giá trị giới hạn với giá trị hàm tại điểm bị loại.`,
    );
  }
  return null;
}
function constant(s: string): Q {
  const ast = parseExpression(s);
  if (variables(ast).length) throw Error("Cận phải là hằng số.");
  const p = polynomial(ast);
  if (degree(p) !== 0) throw Error("Cận không hằng.");
  return p[0];
}
function limitResult(answer: string, proof: string): ExactResult {
  return result(
    "limit",
    "Giới hạn phân thức hữu tỉ",
    "Xét trên miền của biểu thức nguồn trong lân cận điểm tiến tới.",
    math(`L=${answer}`),
    "Khử nhân tử / so sánh bậc",
    [
      { title: "Phân tích tử, mẫu và miền tiến tới", content: proof },
      { title: "Tính giới hạn chính xác", content: math(`L=${answer}`) },
    ],
    [proof],
  );
}
