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
  tex,
  wrap,
  readQ,
  radical,
  txt,
  nthRoot,
} from "./arithmetic";
import {
  Node,
  parseExpression,
  evaluate,
  variables,
  relation,
  command,
  math,
  nodeTex,
} from "./expression";
import {
  P,
  RF,
  rational,
  polynomial,
  degree,
  isZero,
  pmul,
  psub,
  padd,
  pdiv,
  pgcd,
  ptex,
  peval,
  peq,
  roots,
} from "./polynomial";
import { ExactResult, result } from "./types";
const unique = (a: Q[]) =>
  a.filter((r, i) => a.findIndex((x) => eq(r, x)) === i).sort(cmp);
const set = (a: Q[]) =>
  a.length ? `\\left\\{${a.map(tex).join(";\\,")}\\right\\}` : "\\varnothing";
const hold = (c: number, op: string) =>
  op === "="
    ? c === 0
    : op === "<"
      ? c < 0
      : op === "<="
        ? c <= 0
        : op === ">"
          ? c > 0
          : c >= 0;
export function equationText(source: string): string {
  return (
    command(
      source,
      /^(?:(?:hãy\s+)?giải\s+(?:bất\s+)?phương\s+trình|tìm\s+nghiệm(?:\s+thực)?(?:\s+của\s+phương\s+trình)?)\s*[:：]?\s*/iu,
    ) || source.trim()
  ).replace(/[.。]\s*$/, "");
}
function difference(a: RF, b: RF): RF {
  return {
    n: psub(pmul(a.n, b.d), pmul(b.n, a.d)),
    d: pmul(a.d, b.d),
    guards: [...a.guards, ...b.guards],
  };
}
function allRoots(p: P): Q[] {
  if (degree(p) === 0) {
    if (!p[0].n) throw Error("Điều kiện không xác định trên toàn miền.");
    return [];
  }
  return roots(p).roots;
}
function domain(guards: P[], v: string) {
  return guards.length
    ? guards.map((p) => `${ptex(p, v)}\\ne0`).join(",\\quad ")
    : `${v}\\in\\mathbb{R}`;
}
function intervalSet(
  points: Q[],
  segments: boolean[],
  included: boolean[],
): string {
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++)
    if (segments[i]) {
      const first = i;
      while (i + 1 < segments.length && segments[i + 1] && included[i]) i++;
      const last = i;
      out.push(
        `${first > 0 && included[first - 1] ? "[" : "("}${first ? tex(points[first - 1]) : "-\\infty"};${last < points.length ? tex(points[last]) : "+\\infty"}${last < points.length && included[last] ? " ]" : ")"}`,
      );
    }
  points.forEach((p, i) => {
    if (included[i] && !segments[i] && !segments[i + 1])
      out.push(`\\{${tex(p)}\\}`);
  });
  return out.join("\\cup") || "\\varnothing";
}
export function algebra(source: string): ExactResult | null {
  const stripped = equationText(source),
    r = relation(stripped),
    vars = uniqueVars(r.left, r.right);
  if (vars.length !== 1) return null;
  const v = vars[0] || "x";
  const special =
    absolute(r.left, r.right, r.op, v) || squareRoot(r.left, r.right, r.op, v);
  if (special) return special;
  if (r.op === "=") {
    try {
      const powerResult = powers(
        psub(polynomial(r.left, v), polynomial(r.right, v)),
        v,
      );
      if (powerResult) return powerResult;
    } catch {
      /* Rational expressions continue below with their original domain. */
    }
  }
  const f = difference(rational(r.left, v), rational(r.right, v));
  const guards = [...f.guards, f.d].filter((p) => degree(p) > 0);
  if (isZero(f.d)) throw Error("Biểu thức không xác định.");
  const dom = domain(guards, v);
  const valid = (x: Q) =>
    guards.every((p) => !!peval(p, x).n) && !!peval(f.d, x).n;
  const value = (x: Q) =>
    cmp(sub(evaluate(r.left, { [v]: x }), evaluate(r.right, { [v]: x })), Z);
  if (r.op === "=") {
    if (isZero(f.n)) {
      const exclusions = unique(guards.flatMap(allRoots));
      return result(
        "rational-equation",
        "Phương trình đồng nhất có điều kiện",
        dom,
        math(`S=\\mathbb{R}\\setminus${set(exclusions)}`),
        "Thu gọn và giữ điều kiện",
        [
          { title: "Giữ điều kiện từ biểu thức ban đầu", content: math(dom) },
          { title: "Đối chiếu hai vế", content: math(`${ptex(f.n, v)}=0`) },
        ],
        [
          "Hiệu hai vế có tử đồng nhất bằng 0; chỉ loại các điểm làm mẫu ban đầu bằng 0. Toàn bộ nghiệm mẫu đã được phân tích chính xác.",
        ],
      );
    }
    const rr = roots(f.n),
      accepted = rr.roots.filter((x) => valid(x) && value(x) === 0),
      excluded = rr.roots.filter((x) => !accepted.some((a) => eq(a, x)));
    const solved = result(
      guards.length ? "rational-equation" : "polynomial-equation",
      guards.length ? "Phương trình phân thức" : "Phương trình đa thức bậc cao",
      dom,
      math(`S=${set(accepted)}`),
      "Phân tích nhân tử và đối chiếu miền",
      [
        { title: "Xác định miền của biểu thức gốc", content: math(dom) },
        {
          title: "Quy đồng và giải tử số",
          content: math(
            `${ptex(f.n, v)}=0\\Rightarrow ${v}\\in${set(rr.roots)}`,
          ),
        },
        {
          title: "Thế lại vào hai vế ban đầu",
          content: accepted.length
            ? accepted
                .map((x) =>
                  math(
                    `${v}=${tex(x)}:\\quad ${tex(evaluate(r.left, { [v]: x }))}=${tex(evaluate(r.right, { [v]: x }))}`,
                  ),
                )
                .join("\n")
            : "Không có ứng viên thỏa biểu thức gốc.",
        },
        {
          title: "Kết luận sau khi loại nghiệm ngoại lai",
          content: `${excluded.length ? `Loại ${math(set(excluded))} do vi phạm điều kiện.` : "Không có nghiệm ngoại lai."}\n${math(`S=${set(accepted)}`)}`,
        },
      ],
      [
        "Các nhân tử được nhân ngược để khôi phục toàn bộ tử số. Phần dư còn lại là hằng hoặc bậc hai có biệt thức âm, nên không bỏ sót nghiệm thực.",
        "Mọi nghiệm trả về được thế lại chính xác vào hai vế nguồn và tất cả mẫu số gốc; nghiệm vi phạm điều kiện bị loại.",
      ],
    );
    solved.rationalSolutions = { variable: v, values: accepted.map(txt) };
    return solved;
  }
  const zeros = isZero(f.n) ? [] : roots(f.n).roots,
    points = unique([...zeros, ...allRoots(f.d), ...guards.flatMap(allRoots)]);
  const included = points.map((x) => valid(x) && hold(value(x), r.op));
  const samples = Array.from({ length: points.length + 1 }, (_, i) =>
    !points.length
      ? Z
      : i === 0
        ? sub(points[0], O)
        : i === points.length
          ? add(points.at(-1)!, O)
          : div(add(points[i - 1], points[i]), q(2)),
  );
  const segments = samples.map((x) => valid(x) && hold(value(x), r.op)),
    answer = intervalSet(points, segments, included);
  return result(
    "rational-inequality",
    "Bất phương trình đa thức / phân thức",
    dom,
    math(`S=${answer}`),
    "Lập bảng xét dấu có điểm loại",
    [
      { title: "Miền xác định", content: math(dom) },
      {
        title: "Tìm đầy đủ mốc đổi dấu và điểm loại",
        content: math(`${v}\\in${set(points)}`),
      },
      {
        title: "Xét dấu trên từng khoảng liên tục",
        content: samples
          .map((x, i) =>
            math(
              `${v}=${tex(x)}:\\quad L-R ${value(x) < 0 ? "<" : value(x) > 0 ? ">" : "="}0\\quad ${segments[i] ? "\\text{nhận}" : "\\text{loại}"}`,
            ),
          )
          .join("\n"),
      },
      {
        title: "Kiểm tra dấu bằng và các điểm không xác định",
        content: math(`S=${answer}`),
      },
    ],
    [
      "Đã tìm đủ nghiệm thực của tử, mẫu và mọi mẫu trước rút gọn. Trên mỗi khoảng không chứa các mốc này, phân thức liên tục và không thể đổi dấu; phép thế hữu tỉ chỉ xác định dấu của khoảng đã được chứng minh đó.",
      "Từng mốc được kiểm tra riêng trên biểu thức gốc; không nhận điểm làm mẫu bằng 0 kể cả khi có thể khử nhân tử.",
    ],
  );
}
function uniqueVars(a: Node, b: Node) {
  return [...new Set([...variables(a), ...variables(b)])];
}
function absolute(
  left: Node,
  right: Node,
  op: string,
  v: string,
): ExactResult | null {
  if (
    left.type === "fn" &&
    left.name === "abs" &&
    right.type === "fn" &&
    right.name === "abs"
  )
    return null;
  if (right.type === "fn" && right.name === "abs")
    return absolute(
      right,
      left,
      { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "=": "=" }[op]!,
      v,
    );
  if (left.type !== "fn" || left.name !== "abs") return null;
  const p = polynomial(left.arg, v),
    k = evaluate(right);
  if (degree(p) > 1) return null;
  const a = p[1] || Z,
    b = p[0];
  let answer: string;
  if (!a.n) {
    const value = b.n < 0n ? neg(b) : b;
    answer = hold(cmp(value, k), op) ? "\\mathbb R" : "\\varnothing";
  } else if (k.n < 0n)
    answer = op === ">" || op === ">=" ? "\\mathbb R" : "\\varnothing";
  else {
    const ends = [div(sub(neg(k), b), a), div(sub(k, b), a)].sort(cmp),
      lo = tex(ends[0]),
      hi = tex(ends[1]);
    if (op === "=") answer = set(unique(ends));
    else if (!k.n)
      answer =
        op === "<"
          ? "\\varnothing"
          : op === "<="
            ? set([ends[0]])
            : op === ">="
              ? "\\mathbb R"
              : `(-\\infty;${lo})\\cup(${hi};+\\infty)`;
    else
      answer =
        op === "<"
          ? `(${lo};${hi})`
          : op === "<="
            ? `[${lo};${hi}]`
            : op === ">"
              ? `(-\\infty;${lo})\\cup(${hi};+\\infty)`
              : `(-\\infty;${lo}]\\cup[${hi};+\\infty)`;
  }
  return result(
    "absolute-value",
    "Phương trình / bất phương trình giá trị tuyệt đối",
    `${v}\\in\\mathbb R`,
    math(`S=${answer}`),
    "Tách trường hợp theo định nghĩa giá trị tuyệt đối",
    [
      {
        title: "Xét dấu vế phải và hệ số",
        content: math(`|${ptex(p, v)}|${op}${tex(k)}`),
      },
      {
        title: "Tách hai nhánh tương đương",
        content:
          "Dùng định nghĩa |u|: u khi u ≥ 0, và −u khi u < 0; xử lý riêng vế phải âm hoặc bằng 0.",
      },
      {
        title: "Giải các quan hệ bậc nhất và hợp nghiệm",
        content: math(`S=${answer}`),
      },
    ],
    [
      "Hai nhánh của trị tuyệt đối bao phủ toàn bộ R, mỗi nhánh được biến đổi tương đương; trường hợp hệ số 0 và vế phải không dương được xét riêng.",
    ],
  );
}
function squareRoot(
  left: Node,
  right: Node,
  op: string,
  v: string,
): ExactResult | null {
  if (
    left.type === "fn" &&
    left.name === "sqrt" &&
    right.type === "fn" &&
    right.name === "sqrt"
  )
    return null;
  if (op !== "=") return null;
  if (right.type === "fn" && right.name === "sqrt")
    return squareRoot(right, left, op, v);
  if (left.type !== "fn" || left.name !== "sqrt") return null;
  const rad = polynomial(left.arg, v),
    rhs = polynomial(right, v);
  if (degree(rad) > 2 || degree(rhs) > 1) return null;
  const squared = psub(rad, pmul(rhs, rhs));
  if (isZero(squared)) return null;
  const rr = roots(squared),
    accepted = rr.roots.filter(
      (x) =>
        peval(rhs, x).n >= 0n &&
        peval(rad, x).n >= 0n &&
        eq(peval(rad, x), mul(peval(rhs, x), peval(rhs, x))),
    );
  return result(
    "radical-equation",
    "Phương trình chứa căn bậc hai",
    `${ptex(rad, v)}\\ge0,\\quad ${ptex(rhs, v)}\\ge0`,
    math(`S=${set(accepted)}`),
    "Bình phương có điều kiện rồi thế lại",
    [
      {
        title: "Ghi điều kiện tương đương",
        content: math(`${ptex(rad, v)}\\ge0,\\quad ${ptex(rhs, v)}\\ge0`),
      },
      {
        title: "Bình phương và giải đa thức",
        content: math(
          `${ptex(squared, v)}=0\\Rightarrow ${v}\\in${set(rr.roots)}`,
        ),
      },
      {
        title: "Loại nghiệm ngoại lai bằng điều kiện dấu",
        content: math(`S=${set(accepted)}`),
      },
    ],
    [
      "Với vế phải không âm, căn bậc hai bằng vế phải khi và chỉ khi bình phương của vế phải bằng biểu thức dưới căn. Mọi ứng viên được kiểm tra dấu và đẳng thức chính xác; đa thức sau bình phương đã được phân tích đủ nghiệm thực.",
    ],
  );
}
export function transform(source: string): ExactResult | null {
  let kind: "expand" | "factor" | "simplify";
  let body = command(source, /^(?:khai\s+triển|expand)\s*[:：]?\s*/iu);
  if (body !== null) kind = "expand";
  else {
    body = command(
      source,
      /^(?:phân\s+tích(?:\s+đa\s+thức)?\s+thành\s+nhân\s+tử|phân\s+tích\s+nhân\s+tử|factor)\s*[:：]?\s*/iu,
    );
    if (body !== null) kind = "factor";
    else {
      body = command(source, /^(?:rút\s+gọn|simplify)\s*[:：]?\s*/iu);
      if (body === null) return null;
      kind = "simplify";
    }
  }
  const ast = parseExpression(body!),
    vars = variables(ast);
  if (vars.length > 1) return null;
  const v = vars[0] || "x",
    r = rational(ast, v);
  if (kind === "simplify") {
    const g = pgcd(r.n, r.d),
      n = pdiv(r.n, g).quotient,
      d = pdiv(r.d, g).quotient;
    if (!peq(pmul(n, r.d), pmul(r.n, d))) throw Error("Sai đồng nhất thức.");
    const guards = [...r.guards, r.d].filter((p) => degree(p) > 0),
      dom = domain(guards, v),
      answer =
        degree(d) === 0
          ? ptex(
              n.map((c) => div(c, d[0])),
              v,
            )
          : `\\frac{${ptex(n, v)}}{${ptex(d, v)}}`;
    return result(
      "simplification",
      "Rút gọn biểu thức hữu tỉ",
      dom,
      math(`${answer},\\quad ${dom}`),
      "GCD đa thức và giữ mẫu nguồn",
      [
        { title: "Điều kiện từ mọi phép chia ban đầu", content: math(dom) },
        {
          title: "Tìm nhân tử chung lớn nhất của tử và mẫu",
          content: math(`G=${ptex(g, v)}`),
        },
        {
          title: "Rút gọn và giữ nguyên miền ban đầu",
          content: math(`${answer},\\quad ${dom}`),
        },
      ],
      [
        "Đã kiểm tra đồng nhất thức nhân chéo giữa biểu thức trước và sau rút gọn theo từng hệ số. Mọi điều kiện mẫu nguồn được giữ, kể cả nhân tử đã khử.",
      ],
    );
  }
  const p = polynomial(ast, v);
  if (kind === "expand")
    return result(
      "expansion",
      "Khai triển đa thức",
      `${v}\\in\\mathbb R`,
      math(ptex(p, v)),
      "Phân phối và gom hệ số",
      [
        { title: "Áp dụng quy tắc phân phối", content: math(nodeTex(ast)) },
        { title: "Gom các đơn thức cùng bậc", content: math(ptex(p, v)) },
      ],
      [
        "Biểu thức được chuyển bằng các phép cộng/nhân/lũy thừa đa thức hữu tỉ; hệ số của từng bậc được tính chính xác, không dùng thử điểm số.",
      ],
    );
  if (degree(p) === 0) return null;
  const rr = roots(p),
    factor = rr.factors
      .map(
        (x) =>
          `\\left(${v}${x.n < 0n ? "+" : "-"}${tex(x.n < 0n ? neg(x) : x)}\\right)`,
      )
      .join("");
  const answer = `${degree(rr.rest) > 0 ? `\\left(${ptex(rr.rest, v)}\\right)` : tex(rr.rest[0])}${factor}`;
  return result(
    "factorization",
    "Phân tích đa thức thành nhân tử",
    `${v}\\in\\mathbb R`,
    math(answer),
    "Nghiệm hữu tỉ và chia đa thức",
    [
      {
        title: "Tìm các nhân tử tuyến tính",
        content: math(`S_{\\text{nghiệm hữu tỉ}}=${set(rr.roots)}`),
      },
      { title: "Chia liên tiếp, giữ bội nghiệm", content: math(answer) },
      {
        title: "Nhân ngược để kiểm tra",
        content: math(`${answer}=${ptex(p, v)}`),
      },
    ],
    [
      "Tích các nhân tử, gồm đúng bội nghiệm và hệ số đầu, được nhân ngược để khôi phục chính xác từng hệ số đa thức gốc.",
    ],
  );
}

function powers(p: P, v: string): ExactResult | null {
  const n = degree(p);
  if (n < 3) return null;
  if (p.slice(1, -1).every((c) => !c.n)) {
    const target = div(neg(p[0]), p[n]);
    let values: string[], exact: Q[] | undefined;
    if (target.n < 0n && n % 2 === 0) {
      values = [];
      exact = [];
    } else {
      const root = nthRoot(target, n),
        positive = target.n < 0n ? neg(target) : target;
      const value = root
        ? tex(root)
        : `${target.n < 0n ? "-" : ""}\\sqrt[${n}]{${tex(positive)}}`;
      values =
        root?.n === 0n ? ["0"] : n % 2 === 0 ? [`-${value}`, value] : [value];
      if (root)
        exact = root.n === 0n ? [Z] : n % 2 === 0 ? [neg(root), root] : [root];
    }
    const answer = values.length
      ? `\\{${values.join(";\\,")}\\}`
      : "\\varnothing";
    const solved = result(
      "power-equation",
      "Phương trình lũy thừa một đơn thức",
      `${v}\\in\\mathbb R`,
      math(`S=${answer}`),
      "Đưa về lũy thừa và xét tính chẵn lẻ",
      [
        {
          title: "Chuyển về một lũy thừa",
          content: math(`${v}^{${n}}=${tex(target)}`),
        },
        {
          title: "Xét dấu và số nhánh thực",
          content:
            n % 2
              ? "Lũy thừa bậc lẻ là song ánh trên R."
              : "Lũy thừa bậc chẵn không âm; lấy đủ hai nhánh đối nhau nếu vế phải dương.",
        },
        {
          title: "Lấy căn chính xác và kết luận",
          content: math(`S=${answer}`),
        },
      ],
      [
        "Căn được giữ ở dạng chính xác. Theo định nghĩa căn thực, nâng mỗi nghiệm lên đúng bậc cho vế phải; tính đơn điệu của lũy thừa bậc lẻ hoặc hai nửa trục của lũy thừa bậc chẵn chứng minh đầy đủ nghiệm.",
      ],
    );
    if (exact)
      solved.rationalSolutions = { variable: v, values: exact.map(txt) };
    return solved;
  }
  if (n === 4 && !p[1].n && !p[3].n) {
    const reduced = [p[0], p[2], p[4]],
      rr = roots(reduced),
      ts = rr.roots.filter((x) => x.n >= 0n),
      values: string[] = [],
      exact: Q[] = [];
    let allRational = true;
    for (const t of ts) {
      const root = nthRoot(t, 2);
      if (root) {
        if (!root.n) {
          values.push("0");
          exact.push(Z);
        } else {
          values.push(`-${tex(root)}`, tex(root));
          exact.push(neg(root), root);
        }
      } else {
        const rendered = radical(t);
        values.push(`-${rendered}`, rendered);
        allRational = false;
      }
    }
    const answer = values.length
      ? `\\{${values.join(";\\,")}\\}`
      : "\\varnothing";
    const solved = result(
      "biquadratic-equation",
      "Phương trình trùng phương",
      `${v}\\in\\mathbb R`,
      math(`S=${answer}`),
      "Đặt t = x², kiểm tra t không âm",
      [
        { title: "Đặt ẩn phụ và ghi miền", content: math(`t=${v}^2\\ge0`) },
        {
          title: "Giải phương trình bậc hai theo t",
          content: math(
            `${ptex(reduced, "t")}=0\\Rightarrow t\\in${set(rr.roots)}`,
          ),
        },
        { title: "Loại t âm và lấy đủ hai căn", content: math(`S=${answer}`) },
      ],
      [
        "Đa thức gốc trùng từng hệ số với đa thức theo t=x². Đã giải đầy đủ nghiệm t hữu tỉ, loại t âm và giữ đủ nhánh ±√t; căn bậc hai được biểu diễn chính xác, không làm tròn.",
      ],
    );
    if (allRational)
      solved.rationalSolutions = {
        variable: v,
        values: unique(exact).map(txt),
      };
    return solved;
  }
  return null;
}
