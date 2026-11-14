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
  pow,
  tex,
  sqrtQ,
  sumTerms,
} from "./arithmetic";
export type Surd = { a: Q; b: Q };
/** Exact arithmetic in Q(sqrt(D)); never compares approximations to declare zero. */
export function quadraticField(D: Q) {
  if (D.n <= 0n || sqrtQ(D)) throw Error("Cần căn thực dương vô tỉ.");
  const from = (a: Q): Surd => ({ a, b: Z });
  const plus = (x: Surd, y: Surd): Surd => ({
    a: add(x.a, y.a),
    b: add(x.b, y.b),
  });
  const minus = (x: Surd, y: Surd): Surd => ({
    a: sub(x.a, y.a),
    b: sub(x.b, y.b),
  });
  const times = (x: Surd, y: Surd): Surd => ({
    a: add(mul(x.a, y.a), mul(D, mul(x.b, y.b))),
    b: add(mul(x.a, y.b), mul(x.b, y.a)),
  });
  const divide = (x: Surd, y: Surd): Surd => {
    const norm = sub(mul(y.a, y.a), mul(D, mul(y.b, y.b)));
    if (!norm.n) throw Error("Chia căn thức 0.");
    const product = times(x, { a: y.a, b: neg(y.b) });
    return { a: div(product.a, norm), b: div(product.b, norm) };
  };
  const power = (x: Surd, n: number): Surd => {
    if (!Number.isInteger(n) || n < 0 || n > 100)
      throw Error("Số mũ căn thức quá lớn.");
    let a = from(O);
    for (let k = 0; k < n; k++) a = times(a, x);
    return a;
  };
  const same = (x: Surd, y: Surd) => eq(x.a, y.a) && eq(x.b, y.b);
  const render = (x: Surd) =>
    sumTerms([
      [x.a, ""],
      [x.b, `\\sqrt{${tex(D)}}`],
    ]);
  return {
    from,
    add: plus,
    sub: minus,
    mul: times,
    div: divide,
    pow: power,
    eq: same,
    tex: render,
  };
}
