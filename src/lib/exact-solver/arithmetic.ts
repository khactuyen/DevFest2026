/** Bounded exact rational arithmetic shared by deterministic solver plugins. */
export type Q = { n: bigint; d: bigint };
export const abs = (a: bigint) => (a < 0n ? -a : a);
export function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export function q(n: bigint | number, d: bigint | number = 1n): Q {
  n = BigInt(n);
  d = BigInt(d);
  if (!d) throw Error("Mẫu số bằng 0.");
  const g = gcd(n, d),
    s = d < 0n ? -1n : 1n;
  const result = { n: (n / g) * s, d: abs(d) / g };
  if (abs(result.n).toString().length > 300 || result.d.toString().length > 300)
    throw Error("Vượt giới hạn số học.");
  return result;
}
export const Z = q(0),
  O = q(1);
export const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const neg = (a: Q) => q(-a.n, a.d);
export const sub = (a: Q, b: Q) => add(a, neg(b));
export const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
export const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
export const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
export const cmp = (a: Q, b: Q) =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export function pow(a: Q, n: number): Q {
  if (!a.n && n === 0) throw Error("0^0 không xác định.");
  if (!Number.isSafeInteger(n) || Math.abs(n) > 100)
    throw Error("Số mũ vượt phạm vi.");
  return n < 0
    ? q(a.d ** BigInt(-n), a.n ** BigInt(-n))
    : q(a.n ** BigInt(n), a.d ** BigInt(n));
}
export function readQ(s: string): Q {
  s = s.trim();
  const m = /^([+-]?)(\d{1,12})(?:\.(\d{1,10}))?$/.exec(s);
  if (m)
    return q(
      BigInt((m[1] === "-" ? "-" : "") + m[2] + (m[3] || "")),
      10n ** BigInt(m[3]?.length || 0),
    );
  const f = /^([+-]?\d{1,12})\/([+-]?\d{1,12})$/.exec(s);
  if (f) return q(BigInt(f[1]), BigInt(f[2]));
  throw Error("Cần số nguyên, thập phân hoặc phân số hữu hạn.");
}
export const txt = (a: Q) => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
export const tex = (a: Q) =>
  a.d === 1n
    ? String(a.n)
    : `${a.n < 0n ? "-" : ""}\\frac{${abs(a.n)}}{${a.d}}`;
export const wrap = (a: Q) =>
  a.n < 0n || a.d !== 1n ? `\\left(${tex(a)}\\right)` : tex(a);
export function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw Error("Căn âm.");
  let a = 0n,
    b = n + 1n;
  while (b - a > 1n) {
    const c = (a + b) / 2n;
    if (c * c <= n) a = c;
    else b = c;
  }
  return a;
}
export function sqrtQ(a: Q): Q | null {
  if (a.n < 0n) return null;
  const n = integerSqrt(a.n),
    d = integerSqrt(a.d);
  return n * n === a.n && d * d === a.d ? q(n, d) : null;
}
export function radical(a: Q): string {
  if (a.n < 0n) throw Error("Không có căn thực.");
  const r = sqrtQ(a);
  return r ? tex(r) : `\\sqrt{${tex(a)}}`;
}
export function sumTerms(terms: [Q, string][]): string {
  return (
    terms
      .filter(([a]) => a.n !== 0n)
      .map(
        ([a, b], i) =>
          `${a.n < 0n ? "-" : i ? "+" : ""}${b && eq(q(abs(a.n), a.d), O) ? "" : tex(q(abs(a.n), a.d))}${b ? `\\,${b}` : ""}`,
      )
      .join("") || "0"
  );
}

export function nthRoot(a: Q, n: number): Q | null {
  if (!Number.isInteger(n) || n < 2 || n > 12 || (a.n < 0n && n % 2 === 0))
    return null;
  function root(value: bigint) {
    let lo = 0n,
      hi = value + 1n;
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n;
      if (mid ** BigInt(n) <= value) lo = mid;
      else hi = mid;
    }
    return lo ** BigInt(n) === value ? lo : null;
  }
  const numerator = root(abs(a.n)),
    denominator = root(a.d);
  return numerator === null || denominator === null
    ? null
    : q(a.n < 0n ? -numerator : numerator, denominator);
}
