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
  tex,
  sumTerms,
} from "./arithmetic";
import {
  Node,
  parseExpression,
  relation,
  evaluate,
  variables,
  math,
  command,
} from "./expression";
import { ExactResult, result, ExactStep } from "./types";
type Affine = { constant: Q; coeff: Q[] };
function linear(n: Node, vars: string[]): Affine {
  const zero = () => vars.map(() => Z);
  if (n.type === "num") return { constant: n.value, coeff: zero() };
  if (n.type === "var")
    return { constant: Z, coeff: vars.map((v) => (v === n.name ? O : Z)) };
  if (n.type === "fn") return { constant: evaluate(n), coeff: zero() };
  const a = linear(n.a, vars),
    b = linear(n.b, vars),
    ac = a.coeff.some((c) => c.n),
    bc = b.coeff.some((c) => c.n);
  const scale = (a: Affine, s: Q) => ({
    constant: mul(a.constant, s),
    coeff: a.coeff.map((c) => mul(c, s)),
  });
  if (n.op === "+" || n.op === "-") {
    const sign = n.op === "+" ? O : neg(O);
    return {
      constant: add(a.constant, mul(sign, b.constant)),
      coeff: a.coeff.map((c, i) => add(c, mul(sign, b.coeff[i]))),
    };
  }
  if (n.op === "*") {
    if (ac && bc) throw Error("Hệ phi tuyến.");
    return ac ? scale(a, b.constant) : scale(b, a.constant);
  }
  if (n.op === "/") {
    if (bc) throw Error("Hệ có mẫu chứa biến.");
    return scale(a, div(O, b.constant));
  }
  const exponent = evaluate(n.b);
  if (!bc && eq(exponent, O)) return a;
  if (!ac && !bc) return { constant: evaluate(n), coeff: zero() };
  throw Error("Hệ không tuyến tính.");
}
export const matrixTex = (m: Q[][]) =>
  `\\begin{pmatrix}${m.map((row) => row.map(tex).join("&")).join("\\\\")}\\end{pmatrix}`;
export function linearSystem(source: string): ExactResult | null {
  let body = command(
    source,
    /^(?:giải\s+)?(?:hệ\s+phương\s+trình|hệ\s+tuyến\s+tính|linear\s+system)\s*[:：]?\s*/iu,
  );
  if (body === null) return null;
  body = body
    .replace(
      /\\begin\{(?:cases|aligned)\}|\\end\{(?:cases|aligned)\}|\\left\\\{|\\right\./g,
      "",
    )
    .replace(/&/g, "")
    .replace(/\\\\/g, ";");
  const equations = body
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (equations.length < 2 || equations.length > 6) return null;
  const parsed = equations.map(relation);
  if (parsed.some((r) => r.op !== "=")) return null;
  const vars = [
    ...new Set(
      parsed.flatMap((r) => [...variables(r.left), ...variables(r.right)]),
    ),
  ].sort();
  if (vars.length < 2 || vars.length > 4) return null;
  const original = parsed.map((r) => {
    const a = linear(r.left, vars),
      b = linear(r.right, vars);
    return [
      ...a.coeff.map((c, i) => sub(c, b.coeff[i])),
      sub(b.constant, a.constant),
    ];
  });
  const rows = original.map((r) => [...r]),
    pivots: number[] = [],
    ops: string[] = [];
  let pivotRow = 0;
  for (let col = 0; col < vars.length && pivotRow < rows.length; col++) {
    const p = rows.findIndex((row, i) => i >= pivotRow && !!row[col].n);
    if (p < 0) continue;
    if (p !== pivotRow) {
      [rows[p], rows[pivotRow]] = [rows[pivotRow], rows[p]];
      ops.push(`R_${p + 1}\\leftrightarrow R_${pivotRow + 1}`);
    }
    const pivot = rows[pivotRow][col];
    rows[pivotRow] = rows[pivotRow].map((c) => div(c, pivot));
    ops.push(`R_${pivotRow + 1}\\leftarrow R_${pivotRow + 1}/(${tex(pivot)})`);
    for (let i = 0; i < rows.length; i++)
      if (i !== pivotRow && rows[i][col].n) {
        const f = rows[i][col];
        rows[i] = rows[i].map((c, j) => sub(c, mul(f, rows[pivotRow][j])));
        ops.push(
          `R_${i + 1}\\leftarrow R_${i + 1}-(${tex(f)})R_${pivotRow + 1}`,
        );
      }
    pivots.push(col);
    pivotRow++;
  }
  const inconsistent = rows.find(
    (row) => row.slice(0, vars.length).every((c) => !c.n) && !!row.at(-1)!.n,
  );
  let answer: string, check: string;
  if (inconsistent) {
    answer = "S=\\varnothing";
    check = `Có hàng mâu thuẫn 0=${tex(inconsistent.at(-1)!)} sau các phép biến đổi dòng khả nghịch.`;
  } else {
    const free = vars.map((_, i) => i).filter((i) => !pivots.includes(i)),
      forms = vars.map(() => ({ constant: Z, coeff: free.map(() => Z) }));
    free.forEach((col, j) => (forms[col].coeff[j] = O));
    pivots.forEach((col, row) => {
      forms[col] = {
        constant: rows[row].at(-1)!,
        coeff: free.map((f) => neg(rows[row][f])),
      };
    });
    // Substitute affine parameter forms in every original row, coefficient by coefficient.
    for (const row of original) {
      let c = neg(row.at(-1)!);
      const cs = free.map(() => Z);
      for (let j = 0; j < vars.length; j++) {
        c = add(c, mul(row[j], forms[j].constant));
        free.forEach(
          (_, k) => (cs[k] = add(cs[k], mul(row[j], forms[j].coeff[k]))),
        );
      }
      if (c.n || cs.some((x) => x.n)) throw Error("Thế lại hệ không khớp.");
    }
    answer =
      vars
        .map(
          (v, i) =>
            `${v}=${sumTerms([[forms[i].constant, ""], ...forms[i].coeff.map((c, j) => [c, `t_{${j + 1}}`] as [Q, string])])}`,
        )
        .join(",\\quad ") +
      (free.length
        ? `,\\quad ${free.map((_, i) => `t_{${i + 1}}`).join(",")}\\in\\mathbb R`
        : "");
    check = free.length
      ? "Thế các biểu thức theo tham số vào từng phương trình gốc cho đồng nhất thức 0=0. Hạng và số biến tự do từ RREF chứng minh đây là toàn bộ nghiệm."
      : "Đã thế nghiệm hữu tỉ vào từng phương trình gốc, hai vế bằng nhau chính xác. Mỗi biến đều có cột trụ nên nghiệm là duy nhất.";
  }
  const solved = result(
    "linear-system",
    "Hệ phương trình tuyến tính",
    `${vars.join(",")}\\in\\mathbb R`,
    math(answer),
    "Khử Gauss–Jordan",
    [
      {
        title: "Lập ma trận mở rộng từ toàn bộ hệ",
        content: math(matrixTex(original)),
      },
      {
        title: "Biến đổi dòng khả nghịch",
        content: ops.length
          ? math(ops.join(",\\quad "))
          : "Mọi hàng đã bằng 0; không cần biến đổi dòng.",
      },
      {
        title: "Đọc hạng và nghiệm từ dạng bậc thang rút gọn",
        content: math(matrixTex(rows)) + "\n" + math(answer),
      },
      { title: "Thế lại mọi phương trình nguồn", content: check },
    ],
    [
      check,
      "Chỉ dùng đổi dòng, nhân dòng với số hữu tỉ khác 0 và cộng bội một dòng khác; các bước giữ nguyên tập nghiệm.",
    ],
  );
  if (original.length === vars.length) {
    const coefficients = original.map((row) => row.slice(0, vars.length)),
      D = determinant(coefficients);
    if (D.n) {
      const ds = vars.map((_, column) =>
        determinant(
          coefficients.map((row, i) =>
            row.map((v, j) => (j === column ? original[i].at(-1)! : v)),
          ),
        ),
      );
      const values = ds.map((value) => div(value, D));
      for (const row of original)
        if (
          !eq(
            row
              .slice(0, vars.length)
              .reduce((total, c, i) => add(total, mul(c, values[i])), Z),
            row.at(-1)!,
          )
        )
          throw Error("Cramer không thỏa hệ nguồn.");
      solved.methods.push({
        id: "ai-1",
        label: "Quy tắc Cramer",
        description:
          "Tính định thức hệ số và các định thức thay cột, sau đó thế lại toàn bộ hệ gốc.",
        steps: [
          { title: "Tính định thức hệ số", content: math(`D=${tex(D)}\\ne0`) },
          {
            title: "Lần lượt thay mỗi cột bằng vế phải",
            content: math(
              ds
                .map((value, i) => `D_{${vars[i]}}=${tex(value)}`)
                .join(",\\quad "),
            ),
          },
          {
            title: "Chia định thức và thế lại",
            content: math(
              values
                .map((value, i) => `${vars[i]}=${tex(value)}`)
                .join(",\\quad "),
            ),
          },
        ],
      });
    }
  }
  return solved;
}
export function parseMatrix(source: string): Q[][] {
  let s = source.trim();
  const latex = /^\\begin\{[pb]matrix\}([\s\S]+)\\end\{[pb]matrix\}$/.exec(s);
  let entries: string[][];
  if (latex) entries = latex[1].split(/\\\\/).map((row) => row.split("&"));
  else {
    if (!/^\[\s*\[[\s\S]*\]\s*\]$/.test(s))
      throw Error("Cần ma trận dạng [[...],[...]].");
    s = s.slice(1, -1).trim();
    entries = s
      .split(/\]\s*,\s*\[/)
      .map((row) => row.replace(/^\[/, "").replace(/\]$/, "").split(","));
  }
  if (
    entries.length < 1 ||
    entries.length > 4 ||
    entries.some((row) => row.length !== entries.length)
  )
    throw Error("Cần ma trận vuông tối đa 4x4.");
  return entries.map((row) => row.map((s) => evaluate(parseExpression(s))));
}
function determinant(m: Q[][]): Q {
  const a = m.map((row) => [...row]);
  let d = O;
  for (let c = 0; c < a.length; c++) {
    const p = a.findIndex((r, i) => i >= c && !!r[c].n);
    if (p < 0) return Z;
    if (p !== c) {
      [a[p], a[c]] = [a[c], a[p]];
      d = neg(d);
    }
    const pivot = a[c][c];
    d = mul(d, pivot);
    for (let i = c + 1; i < a.length; i++) {
      const f = div(a[i][c], pivot);
      for (let j = c; j < a.length; j++)
        a[i][j] = sub(a[i][j], mul(f, a[c][j]));
    }
  }
  return d;
}
function laplace(m: Q[][]): Q {
  if (m.length === 1) return m[0][0];
  return m[0].reduce(
    (v, c, j) =>
      add(
        v,
        mul(
          j % 2 ? neg(c) : c,
          laplace(m.slice(1).map((row) => row.filter((_, k) => j !== k))),
        ),
      ),
    Z,
  );
}
export function matrix(source: string): ExactResult | null {
  let body = command(source, /^(?:tính\s+)?(?:định\s+thức|det)\s*[:：]?\s*/iu),
    inverse = false;
  if (body === null) {
    body = command(
      source,
      /^(?:tìm\s+|tính\s+)?(?:ma\s+trận\s+nghịch\s+đảo|inverse)\s*[:：]?\s*/iu,
    );
    if (body === null) return null;
    inverse = true;
  }
  const a = parseMatrix(body),
    det = determinant(a);
  if (!eq(det, laplace(a)))
    throw Error("Định thức không khớp khai triển Laplace.");
  if (!inverse)
    return result(
      "determinant",
      "Định thức ma trận",
      "Ma trận vuông hữu tỉ, kích thước ≤4.",
      math(`\\det A=${tex(det)}`),
      "Khử Gauss và kiểm tra Laplace",
      [
        {
          title: "Giữ nguyên ma trận nguồn",
          content: math(`A=${matrixTex(a)}`),
        },
        {
          title: "Theo dõi tích trụ và dấu đổi dòng",
          content: math(`\\det A=${tex(det)}`),
        },
        {
          title: "Kiểm tra độc lập bằng khai triển phần bù",
          content: "Khai triển Laplace cho cùng giá trị hữu tỉ chính xác.",
        },
      ],
      [
        "Định thức tính bằng khử Gauss được đối chiếu độc lập với khai triển Laplace, gồm đầy đủ dấu hoán vị.",
      ],
    );
  if (!det.n)
    return result(
      "matrix-inverse",
      "Ma trận không khả nghịch",
      "Ma trận vuông hữu tỉ.",
      math("\\det A=0\\Rightarrow A^{-1}\\text{ không tồn tại}"),
      "Kiểm tra định thức trước khi nghịch đảo",
      [
        { title: "Tính và kiểm tra định thức", content: math("\\det A=0") },
        { title: "Kết luận", content: "Ma trận không có nghịch đảo." },
      ],
      [
        "Định thức bằng 0 được xác nhận bằng cả khử Gauss và khai triển Laplace.",
      ],
    );
  const n = a.length,
    rows = a.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? O : Z)),
    ]);
  for (let c = 0; c < n; c++) {
    const p = rows.findIndex((r, i) => i >= c && !!r[c].n);
    [rows[p], rows[c]] = [rows[c], rows[p]];
    const pivot = rows[c][c];
    rows[c] = rows[c].map((x) => div(x, pivot));
    for (let i = 0; i < n; i++)
      if (i !== c) {
        const f = rows[i][c];
        rows[i] = rows[i].map((x, j) => sub(x, mul(f, rows[c][j])));
      }
  }
  const inv = rows.map((row) => row.slice(n));
  for (const [l, r] of [
    [a, inv],
    [inv, a],
  ])
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const c = l[i].reduce((v, x, k) => add(v, mul(x, r[k][j])), Z);
        if (!eq(c, i === j ? O : Z)) throw Error("Không khớp tích đơn vị.");
      }
  return result(
    "matrix-inverse",
    "Nghịch đảo ma trận",
    "Ma trận vuông hữu tỉ khả nghịch.",
    math(`A^{-1}=${matrixTex(inv)}`),
    "Gauss–Jordan trên [A|I]",
    [
      {
        title: "Kiểm tra khả nghịch",
        content: math(`\\det A=${tex(det)}\\ne0`),
      },
      { title: "Biến đổi [A|I] thành [I|A⁻¹]", content: math(matrixTex(rows)) },
      { title: "Nhân kiểm tra hai phía", content: math("AA^{-1}=A^{-1}A=I") },
    ],
    [
      "Cả hai tích A·A⁻¹ và A⁻¹·A được tính theo từng phần tử bằng phân số và đều trùng ma trận đơn vị.",
    ],
  );
}
