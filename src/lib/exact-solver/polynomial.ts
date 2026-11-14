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
  gcd,
  abs,
  sqrtQ,
  sumTerms,
} from "./arithmetic";
import { Node, evaluate } from "./expression";
export type P = Q[];
export const trim = (a: P): P => {
  const p = [...a];
  while (p.length > 1 && !p.at(-1)!.n) p.pop();
  return p;
};
export const degree = (a: P) => trim(a).length - 1;
export const isZero = (a: P) => trim(a).length === 1 && !a[0].n;
export const padd = (a: P, b: P): P =>
  trim(
    Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
      add(a[i] || Z, b[i] || Z),
    ),
  );
export const pneg = (a: P) => a.map(neg);
export const psub = (a: P, b: P) => padd(a, pneg(b));
export function pmul(a: P, b: P): P {
  if (degree(a) + degree(b) > 12) throw Error("Đa thức vượt bậc 12.");
  const p = Array.from({ length: a.length + b.length - 1 }, () => Z);
  a.forEach((x, i) =>
    b.forEach((y, j) => (p[i + j] = add(p[i + j], mul(x, y)))),
  );
  return trim(p);
}
export function ppow(a: P, n: number): P {
  if (!Number.isSafeInteger(n) || n < 0 || n > 12)
    throw Error("Bậc vượt giới hạn.");
  let p: P = [O];
  for (let i = 0; i < n; i++) p = pmul(p, a);
  return p;
}
export const peval = (a: P, x: Q) =>
  a.reduceRight((v, c) => add(mul(v, x), c), Z);
export const peq = (a: P, b: P) => isZero(psub(a, b));
export const derivative = (a: P): P =>
  a.length === 1 ? [Z] : trim(a.slice(1).map((c, i) => mul(c, q(i + 1))));
export const integral = (a: P): P => [Z, ...a.map((c, i) => div(c, q(i + 1)))];
export function pdiv(a: P, b: P): { quotient: P; remainder: P } {
  if (isZero(b)) throw Error("Chia đa thức 0.");
  let r = trim(a);
  const out = Array.from(
    { length: Math.max(1, degree(a) - degree(b) + 1) },
    () => Z,
  );
  for (let k = degree(a) - degree(b); k >= 0; k--) {
    const c = div(r[degree(b) + k] || Z, b.at(-1)!);
    out[k] = c;
    const term = [
      ...Array.from({ length: k }, () => Z),
      ...b.map((x) => mul(x, c)),
    ];
    r = psub(r, term);
  }
  return { quotient: trim(out), remainder: trim(r) };
}
export function pgcd(a: P, b: P): P {
  for (let i = 0; !isZero(b); i++) {
    if (i > 30) throw Error("GCD vượt giới hạn.");
    [a, b] = [b, pdiv(a, b).remainder];
  }
  return isZero(a) ? [O] : a.map((c) => div(c, a.at(-1)!));
}
export function ptex(a: P, v = "x"): string {
  return sumTerms(
    [...trim(a)]
      .map(
        (c, i) =>
          [c, i === 0 ? "" : i === 1 ? v : `${v}^{${i}}`] as [Q, string],
      )
      .reverse(),
  );
}
export type RF = { n: P; d: P; guards: P[] };
export function rational(n: Node, variable = "x"): RF {
  if (n.type === "num") return { n: [n.value], d: [O], guards: [] };
  if (n.type === "var") {
    if (n.name !== variable) throw Error("Nhiều biến chưa hỗ trợ.");
    return { n: [Z, O], d: [O], guards: [] };
  }
  if (n.type === "fn") return { n: [evaluate(n)], d: [O], guards: [] };
  const a = rational(n.a, variable),
    b = rational(n.b, variable),
    guards = [...a.guards, ...b.guards];
  if (n.op === "+")
    return {
      n: padd(pmul(a.n, b.d), pmul(b.n, a.d)),
      d: pmul(a.d, b.d),
      guards,
    };
  if (n.op === "-")
    return {
      n: psub(pmul(a.n, b.d), pmul(b.n, a.d)),
      d: pmul(a.d, b.d),
      guards,
    };
  if (n.op === "*") return { n: pmul(a.n, b.n), d: pmul(a.d, b.d), guards };
  if (n.op === "/") {
    if (isZero(b.n)) throw Error("Mẫu đồng nhất 0.");
    return { n: pmul(a.n, b.d), d: pmul(a.d, b.n), guards: [...guards, b.n] };
  }
  const exp = evaluate(n.b);
  if (exp.d !== 1n || abs(exp.n) > 12n) throw Error("Số mũ chưa hỗ trợ.");
  const e = Number(exp.n);
  if (e === 0 && isZero(a.n)) throw Error("0^0 không xác định.");
  if (e < 0 && isZero(a.n)) throw Error("Lũy thừa 0 số mũ âm.");
  return {
    n: ppow(e < 0 ? a.d : a.n, Math.abs(e)),
    d: ppow(e < 0 ? a.n : a.d, Math.abs(e)),
    guards: e <= 0 ? [...a.guards, a.n] : a.guards,
  };
}
export function polynomial(n: Node, v = "x"): P {
  const r = rational(n, v);
  if (degree(r.d) !== 0 || r.guards.some((p) => degree(p) !== 0))
    throw Error("Biểu thức không phải đa thức trên toàn R.");
  return r.n.map((c) => div(c, r.d[0]));
}
function divisors(n: bigint): bigint[] {
  n = abs(n);
  if (n > 1000000n) throw Error("Hệ số ngoài giới hạn phân tích hữu tỉ.");
  if (n === 0n) return [0n];
  const out: bigint[] = [];
  for (let k = 1n; k * k <= n; k++)
    if (n % k === 0n) {
      out.push(k);
      if (k * k !== n) out.push(n / k);
    }
  return out;
}
export type Roots = { roots: Q[]; factors: Q[]; rest: P };
/** Complete real roots only when the remaining factor is constant or a quadratic
 * proved positive/negative everywhere. Never infer completeness from sampling. */
export function roots(a: P): Roots {
  let p = trim(a);
  if (isZero(p)) throw Error("Đa thức đồng nhất 0.");
  const factors: Q[] = [];
  while (degree(p) > 0) {
    let found: Q | undefined;
    if (!p[0].n) found = Z;
    else if (degree(p) === 1) found = div(neg(p[0]), p[1]);
    else if (degree(p) === 2) {
      const [c, b, a] = p,
        delta = sub(mul(b, b), mul(q(4), mul(a, c)));
      if (delta.n < 0n) break;
      const s = sqrtQ(delta);
      if (!s) throw Error("Còn nghiệm vô tỉ.");
      found = div(sub(neg(b), s), mul(q(2), a));
    } else {
      const lcm = p.reduce((d, c) => (d / gcd(d, c.d)) * c.d, 1n),
        ints = p.map((c) => c.n * (lcm / c.d));
      const ns = divisors(ints[0]),
        ds = divisors(ints.at(-1)!);
      if (ns.length * ds.length > 15000) throw Error("Quá nhiều ứng viên.");
      outer: for (const n of ns)
        for (const d of ds)
          for (const sign of [1n, -1n]) {
            const candidate = q(n * sign, d);
            if (!peval(p, candidate).n) {
              found = candidate;
              break outer;
            }
          }
      if (!found) throw Error("Chưa phân tích đủ nghiệm thực.");
    }
    if (!found) break;
    const factor = [neg(found), O];
    const result = pdiv(p, factor);
    if (!isZero(result.remainder)) throw Error("Chia nhân tử không chính xác.");
    factors.push(found);
    p = result.quotient;
  }
  const unique = factors
    .filter((r, i) => factors.findIndex((x) => eq(x, r)) === i)
    .sort(cmp);
  // Reconstruct coefficients to certify no factor/root was lost.
  const rebuilt = factors.reduce((prod, r) => pmul(prod, [neg(r), O]), p);
  if (!peq(rebuilt, a)) throw Error("Không khôi phục được đa thức.");
  return { roots: unique, factors, rest: p };
}
