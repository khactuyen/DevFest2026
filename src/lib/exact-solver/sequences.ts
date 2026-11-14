import { Q, Z, O, q, add, sub, mul, div, pow, eq, tex } from "./arithmetic";
import { parseExpression, evaluate, math } from "./expression";
import { ExactResult, result } from "./types";
/** Explicit, fully consumed progression syntax; no guesses from prose. */
export function sequences(source: string): ExactResult | null {
  const m =
    /^cấp\s+số\s+(cộng|nhân)\s*:\s*u_?\{?1\}?\s*=\s*([^;]+);\s*([dq])\s*=\s*([^;]+);\s*(?:tính|tìm)\s+([uS])_?\{?(n|\d+)\}?\s*[.]?$/iu.exec(
      source.trim(),
    );
  if (!m) return null;
  const arithmetic = m[1].toLowerCase() === "cộng";
  if (m[3] !== (arithmetic ? "d" : "q")) return null;
  const a = evaluate(parseExpression(m[2])),
    r = evaluate(parseExpression(m[4])),
    sum = m[5] === "S",
    index = m[6];
  let answer: string;
  const general = arithmetic
    ? sum
      ? `S_n=\\frac n2\\left(2(${tex(a)})+(n-1)(${tex(r)})\\right)`
      : `u_n=${tex(a)}+(n-1)(${tex(r)})`
    : sum
      ? eq(r, O)
        ? `S_n=n(${tex(a)})`
        : `S_n=(${tex(a)})\\frac{1-(${tex(r)})^n}{1-(${tex(r)})}`
      : `u_n=(${tex(a)})(${tex(r)})^{n-1}`;
  if (index.toLowerCase() === "n") answer = general + ",\\quad n\\ge1";
  else {
    const n = Number(index);
    if (!Number.isSafeInteger(n) || n < 1 || n > 100)
      throw Error("Chỉ số từ 1 đến 100.");
    const nth = arithmetic ? add(a, mul(q(n - 1), r)) : mul(a, pow(r, n - 1));
    const value = sum
      ? arithmetic
        ? div(mul(q(n), add(mul(q(2), a), mul(q(n - 1), r))), q(2))
        : eq(r, O)
          ? mul(q(n), a)
          : mul(a, div(sub(O, pow(r, n)), sub(O, r)))
      : nth;
    let term = a,
      acc = Z;
    for (let k = 1; k <= n; k++) {
      acc = add(acc, term);
      if (k === n && !eq(term, nth)) throw Error("Sai số hạng.");
      term = arithmetic ? add(term, r) : mul(term, r);
    }
    if (sum && !eq(value, acc)) throw Error("Sai tổng dãy.");
    answer = `${sum ? "S" : "u"}_{${n}}=${tex(value)}`;
  }
  return result(
    arithmetic ? "arithmetic-progression" : "geometric-progression",
    arithmetic ? "Cấp số cộng" : "Cấp số nhân",
    "Chỉ số nguyên n≥1; các tham số hữu tỉ.",
    math(answer),
    arithmetic
      ? "Số hạng tổng quát và ghép cặp tổng"
      : "Số hạng tổng quát và tổng hình học",
    [
      { title: "Ghi công thức theo dữ kiện", content: math(general) },
      { title: "Tính hoặc giữ công thức theo n", content: math(answer) },
      {
        title: "Kiểm tra số hạng đầu và quy luật",
        content: arithmetic
          ? "u₁ đúng dữ kiện, uₙ₊₁−uₙ=d; tổng có S₁=u₁ và Sₙ−Sₙ₋₁=uₙ."
          : "u₁ đúng dữ kiện, uₙ₊₁=q·uₙ; tổng có S₁=u₁ và Sₙ−Sₙ₋₁=uₙ. Xử lý riêng q=1, kể cả q=0.",
      },
    ],
    [
      "Công thức tổng quát được suy ra từ đồng nhất thức sai phân / tỉ số và điều kiện đầu. Với chỉ số cụ thể, kiểm tra độc lập bằng sinh từng số hạng và cộng trực tiếp bằng phân số.",
    ],
  );
}
