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
  gcd,
  abs,
  radical,
} from "./arithmetic";
import {
  parseExpression,
  evaluate,
  command,
  math,
  variables,
} from "./expression";
import { ExactResult, result } from "./types";
function constant(s: string): Q {
  const ast = parseExpression(s);
  if (variables(ast).length) throw Error("Cần hằng số.");
  return evaluate(ast);
}
function list(s: string): Q[] {
  s = s.trim();
  if (!/^\[[^\[\]]+\]$/.test(s)) throw Error("Cần danh sách [a,b,...].");
  const xs = s.slice(1, -1).split(/[;,]/).map(constant);
  if (!xs.length || xs.length > 100) throw Error("Danh sách quá dài.");
  return xs;
}
function whole(a: Q, max: number): number {
  if (a.d !== 1n || a.n < 0n || a.n > BigInt(max))
    throw Error("Số nguyên ngoài phạm vi.");
  return Number(a.n);
}
const factorial = (n: number) => {
  let a = 1n;
  for (let k = 2; k <= n; k++) a *= BigInt(k);
  return a;
};
function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) throw Error("k ngoài [0,n].");
  k = Math.min(k, n - k);
  let a = 1n;
  for (let j = 1; j <= k; j++) a = (a * BigInt(n - k + j)) / BigInt(j);
  return a;
}
function pascal(n: number, k: number): bigint {
  const row = Array.from({ length: k + 1 }, () => 0n);
  row[0] = 1n;
  for (let i = 1; i <= n; i++)
    for (let j = Math.min(i, k); j > 0; j--) row[j] += row[j - 1];
  return row[k];
}
export function discrete(source: string): ExactResult | null {
  let s = (command(source, /^(?:tính\s+|calculate\s+)/iu) ?? source).trim();
  s = s
    .replace(/\\[()[\]]|\$/g, "")
    .replace(/^\\binom\{(\d+)\}\{(\d+)\}$/, "C($1,$2)")
    .replace(/^([CA])_\{(\d+)\}\^\{(\d+)\}$/, "$1($2,$3)")
    .replace(/^\\gcd/, "gcd");
  let m =
    /^(?:C|choose)\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s) ||
    /^C_(\d+)\^(\d+)$/.exec(s);
  if (m) {
    const n = whole(constant(m[1]), 500),
      k = whole(constant(m[2]), 500),
      answer = choose(n, k);
    if (answer !== pascal(n, k)) throw Error("Không khớp Pascal.");
    return scalar(
      "combination",
      "Tổ hợp",
      tex(q(answer)),
      math(`C_{${n}}^{${k}}=\\frac{${n}!}{${k}!(${n}-${k})!}`),
      "Tích rút gọn được kiểm tra độc lập bằng hàng tam giác Pascal, không dùng xấp xỉ.",
    );
  }
  m =
    /^(?:A|P|perm)\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s) ||
    /^A_(\d+)\^(\d+)$/.exec(s);
  if (m) {
    const n = whole(constant(m[1]), 150),
      k = whole(constant(m[2]), 150);
    if (k > n) throw Error("k>n.");
    let answer = 1n;
    for (let j = 0; j < k; j++) answer *= BigInt(n - j);
    if (answer !== choose(n, k) * factorial(k))
      throw Error("Không khớp tổ hợp.");
    return scalar(
      "permutation",
      "Chỉnh hợp",
      tex(q(answer)),
      math(`A_{${n}}^{${k}}=\\frac{${n}!}{(${n}-${k})!}`),
      "Tích k thừa số giảm dần trùng C(n,k)·k! bằng số nguyên chính xác.",
    );
  }
  m = /^(\d+)!$/.exec(s);
  if (m) {
    const n = whole(constant(m[1]), 150),
      answer = factorial(n);
    return scalar(
      "factorial",
      "Giai thừa",
      tex(q(answer)),
      math(`${n}!=${n === 0 ? "1" : "1\\cdot2\\cdots" + n}`),
      "Áp dụng định nghĩa tích các số nguyên dương từ 1 đến n; 0! được quy ước bằng 1.",
    );
  }
  m = /^(?:gcd|ucln|ước\s+chung\s+lớn\s+nhất)\s*\(([^()]+)\)$/iu.exec(s);
  const l = /^(?:lcm|bcnn|bội\s+chung\s+nhỏ\s+nhất)\s*\(([^()]+)\)$/iu.exec(s);
  if (m || l) {
    const nums = (m || l)![1].split(/[;,]/).map(constant);
    if (nums.length < 2 || nums.length > 20 || nums.some((x) => x.d !== 1n))
      throw Error("Cần 2–20 số nguyên.");
    const values = nums.map((x) => x.n),
      g = values.reduce(gcd),
      answer = m
        ? g
        : values.reduce(
            (v, x) => (!v || !x ? 0n : abs((v / gcd(v, x)) * x)),
            1n,
          );
    if (m && answer && values.some((x) => x % answer))
      throw Error("Không chia hết.");
    return scalar(
      m ? "gcd" : "lcm",
      m ? "Ước chung lớn nhất" : "Bội chung nhỏ nhất",
      tex(q(answer)),
      m
        ? "Thuật toán Euclid: gcd(a,b)=gcd(b,a mod b)."
        : "Dùng lcm(a,b)=|ab|/gcd(a,b), xử lý riêng số 0.",
      "Mỗi phép biến đổi Euclid giữ nguyên tập ước chung; dấu được chuẩn hóa. Quy ước gcd(0,0)=0 và lcm có phần tử 0 bằng 0.",
    );
  }
  m = /^phân\s+tích\s+thừa\s+số\s+nguyên\s+tố\s*[:：]?\s*(\d+)$/iu.exec(s);
  if (m) {
    let n = BigInt(m[1]);
    if (n < 2n || n > 1000000000n)
      throw Error("Số cần phân tích phải từ 2 đến 10^9.");
    const original = n,
      factors: [bigint, number][] = [];
    for (let p = 2n; p * p <= n; p += p === 2n ? 1n : 2n) {
      let k = 0;
      while (n % p === 0n) {
        n /= p;
        k++;
      }
      if (k) factors.push([p, k]);
    }
    if (n > 1n) factors.push([n, 1]);
    if (factors.reduce((a, [p, k]) => a * p ** BigInt(k), 1n) !== original)
      throw Error("Sai tích nguyên tố.");
    return scalar(
      "prime-factorization",
      "Phân tích số nguyên",
      factors
        .map(([p, k]) => (k === 1 ? `${p}` : `${p}^{${k}}`))
        .join("\\cdot"),
      "Chia thử các số nguyên tăng dần đến căn của phần còn lại.",
      "Các thừa số còn lại là nguyên tố theo phép chia thử đủ đến căn bậc hai; tích các lũy thừa khôi phục đúng số nguyên ban đầu.",
    );
  }
  m = /^(\([+-]?\d+\)|[+-]?\d+)\^(\d+)\s+mod\s+(\d+)$/iu.exec(s);
  if (m) {
    const signed = BigInt(m[1].replace(/[()]/g, ""));
    const outerNegative = !m[1].startsWith("(") && signed < 0n;
    const a = outerNegative ? -signed : signed,
      exp = Number(m[2]),
      mod = BigInt(m[3]);
    if (
      abs(a) > 1000000000n ||
      !Number.isSafeInteger(exp) ||
      exp > 100000 ||
      mod < 1n ||
      mod > 1000000000n
    )
      throw Error("Ngoài giới hạn modulo.");
    let power = ((a % mod) + mod) % mod,
      e = exp,
      answer = 1n % mod;
    while (e) {
      if (e % 2) answer = (answer * power) % mod;
      power = (power * power) % mod;
      e = Math.floor(e / 2);
    }
    let check = 1n % mod;
    for (let j = 0; j < exp; j++) check = (check * a) % mod;
    check = (check + mod) % mod;
    if (outerNegative) {
      answer = (mod - answer) % mod;
      check = (mod - check) % mod;
    }
    if (check !== answer) throw Error("Sai modulo.");
    return scalar(
      "modular-power",
      "Lũy thừa modulo",
      `${answer}`,
      "Bình phương và nhân theo các bit của số mũ.",
      "Kết quả được kiểm tra độc lập bằng chuỗi nhân modulo; số dư nằm trong [0,m−1].",
    );
  }
  const stat =
    /^(trung\s+bình(?:\s+cộng)?|trung\s+vị|phương\s+sai(?:\s+(?:mẫu|tổng\s+thể))?|độ\s+lệch\s+chuẩn(?:\s+(?:mẫu|tổng\s+thể))?|mean|median|variance)\s*[:：]?\s*(\[[\s\S]+\])$/iu.exec(
      s,
    );
  if (stat) {
    const xs = list(stat[2]),
      name = stat[1].toLowerCase(),
      n = xs.length,
      mean = div(xs.reduce(add, Z), q(n));
    let answer: string, formula: string, check: string;
    if (/trung\s+bình|mean/.test(name)) {
      answer = tex(mean);
      formula = `\\bar x=\\frac{\\sum x_i}{n}=\\frac{${tex(xs.reduce(add, Z))}}{${n}}`;
      if (!eq(mul(mean, q(n)), xs.reduce(add, Z)))
        throw Error("Sai trung bình.");
      check =
        "Nhân trung bình với số phần tử khôi phục đúng tổng hữu tỉ của toàn bộ dữ liệu.";
    } else if (/trung\s+vị|median/.test(name)) {
      const sorted = [...xs].sort(cmp),
        med =
          n % 2
            ? sorted[(n - 1) / 2]
            : div(add(sorted[n / 2 - 1], sorted[n / 2]), q(2));
      answer = tex(med);
      formula = `${sorted.map(tex).join(";\\,")}`;
      check =
        "Sắp xếp bằng so sánh hữu tỉ chính xác; dùng phần tử giữa khi n lẻ hoặc trung bình đúng hai phần tử giữa khi n chẵn.";
    } else {
      const sample = /mẫu/.test(name);
      if (sample && n < 2) throw Error("Phương sai mẫu cần ít nhất 2 phần tử.");
      const ss = xs.map((x) => mul(sub(x, mean), sub(x, mean))).reduce(add, Z),
        alternative = sub(
          xs.map((x) => mul(x, x)).reduce(add, Z),
          mul(q(n), mul(mean, mean)),
        );
      if (!eq(ss, alternative) || ss.n < 0n)
        throw Error("Sai tổng bình phương độ lệch.");
      const variance = div(ss, q(sample ? n - 1 : n));
      answer = /độ\s+lệch/.test(name) ? radical(variance) : tex(variance);
      formula = `s^2=\\frac{\\sum(x_i-\\bar x)^2}{${sample ? "n-1" : "n"}}=${tex(variance)}`;
      check = `Hai công thức tổng bình phương độ lệch và tổng x_i²−n·trung bình² khớp chính xác. Mẫu số là ${sample ? "n−1 (mẫu)" : "n (tổng thể)"}; nếu trả độ lệch chuẩn thì lấy căn không âm chính xác.`;
    }
    return scalar(
      "statistics",
      `Thống kê: ${stat[1]}`,
      answer,
      math(formula),
      check,
    );
  }
  m =
    /^nhị\s+thức\s*\(\s*n\s*=\s*(\d+)\s*,\s*k\s*=\s*(\d+)\s*,\s*p\s*=\s*([^()]+)\)$/iu.exec(
      s,
    );
  if (m) {
    const n = whole(constant(m[1]), 100),
      k = whole(constant(m[2]), 100),
      p = constant(m[3]);
    if (k > n || cmp(p, Z) < 0 || cmp(p, O) > 0)
      throw Error("Tham số xác suất không hợp lệ.");
    let pk = O,
      qk = O;
    for (let j = 0; j < k; j++) pk = mul(pk, p);
    for (let j = 0; j < n - k; j++) qk = mul(qk, sub(O, p));
    const probability = mul(q(choose(n, k)), mul(pk, qk));
    if (cmp(probability, Z) < 0 || cmp(probability, O) > 0)
      throw Error("Xác suất ngoài [0,1].");
    return scalar(
      "binomial-probability",
      "Xác suất nhị thức",
      tex(probability),
      math(`P(X=${k})=C_{${n}}^{${k}}p^{${k}}(1-p)^{${n - k}}`),
      "Tham số n,k nguyên và p∈[0,1] được kiểm tra. Tổ hợp và các lũy thừa được tính hữu tỉ chính xác theo mô hình nhị thức đã được chỉ định rõ.",
    );
  }
  return null;
}
function scalar(
  family: string,
  topic: string,
  answer: string,
  formula: string,
  check: string,
): ExactResult {
  return result(
    family,
    topic,
    "Các đầu vào hữu tỉ / nguyên nằm trong giới hạn tính trực tiếp.",
    math(`K=${answer}`),
    "Áp dụng công thức và kiểm tra chính xác",
    [
      { title: "Chọn quy tắc phù hợp với đầu vào", content: formula },
      { title: "Tính và kiểm tra kết quả", content: math(`K=${answer}`) },
    ],
    [check],
  );
}
function vector(s: string): Q[] {
  s = s.trim();
  if (!/^[([][^()[\]]+[)\]]$/.test(s)) throw Error("Vector cần ngoặc.");
  const xs = s.slice(1, -1).split(/[;,]/).map(constant);
  if (![2, 3].includes(xs.length)) throw Error("Chỉ hỗ trợ 2D/3D.");
  return xs;
}
export function vectors(source: string): ExactResult | null {
  const m =
    /^(tích\s+vô\s+hướng|tích\s+có\s+hướng|khoảng\s+cách|độ\s+dài\s+vector)\s*[:：]?\s*(.+)$/iu.exec(
      source.trim(),
    );
  if (!m) return null;
  const op = m[1].toLowerCase(),
    parts = m[2].split(/\s+(?:và|đến)\s+/iu),
    a = vector(parts[0]);
  let answer: string, formula: string;
  if (/độ\s+dài/.test(op)) {
    if (parts.length !== 1) return null;
    const square = a.map((x) => mul(x, x)).reduce(add, Z);
    answer = radical(square);
    formula = `\\|u\\|^2=${tex(square)}\\ge0`;
  } else {
    if (parts.length !== 2) return null;
    const b = vector(parts[1]);
    if (a.length !== b.length) return null;
    if (/vô\s+hướng/.test(op)) {
      const dot = a.reduce((v, x, i) => add(v, mul(x, b[i])), Z),
        symmetric = b.reduce((v, x, i) => add(v, mul(x, a[i])), Z);
      if (!eq(dot, symmetric)) throw Error("Sai tích vô hướng.");
      answer = tex(dot);
      formula = "u\\cdot v=\\sum_i u_i v_i";
    } else if (/có\s+hướng/.test(op)) {
      if (a.length !== 3) return null;
      const c = [
        sub(mul(a[1], b[2]), mul(a[2], b[1])),
        sub(mul(a[2], b[0]), mul(a[0], b[2])),
        sub(mul(a[0], b[1]), mul(a[1], b[0])),
      ];
      if (
        a.reduce((v, x, i) => add(v, mul(x, c[i])), Z).n ||
        b.reduce((v, x, i) => add(v, mul(x, c[i])), Z).n
      )
        throw Error("Vector không vuông góc.");
      answer = `(${c.map(tex).join(";")})`;
      formula = "(u\\times v)\\cdot u=(u\\times v)\\cdot v=0";
    } else {
      const square = a
        .map((x, i) => {
          const d = sub(x, b[i]);
          return mul(d, d);
        })
        .reduce(add, Z);
      answer = radical(square);
      formula = `d^2=\\sum_i(u_i-v_i)^2=${tex(square)}\\ge0`;
    }
  }
  return scalar(
    "vectors",
    m[1],
    answer,
    math(formula),
    "Tọa độ được tính bằng phân số chính xác theo công thức Euclid. Tích có hướng được kiểm tra vuông góc với cả hai vector; căn độ dài/khoảng cách là căn không âm của tổng bình phương đã tính chính xác.",
  );
}
