type Point = [number, number];
/** Resize about the opposite corner using the previous orthogonal frame. */
export function resizeRectangle(
  previous: Point[],
  corner: number,
  requested: Point,
  square = false,
): Point[] {
  if (
    previous.length !== 4 ||
    ![...previous.flat(), ...requested].every(Number.isFinite)
  )
    throw Error("Invalid rectangle");
  const opposite = (corner + 2) % 4,
    next = (corner + 1) % 4,
    last = (corner + 3) % 4;
  const origin = previous[opposite];
  const dx = previous[next][0] - origin[0],
    dy = previous[next][1] - origin[1],
    length = Math.hypot(dx, dy);
  if (length < 1e-9) return previous;
  const u: Point = [dx / length, dy / length],
    v: Point = [-u[1], u[0]];
  const relative: Point = [requested[0] - origin[0], requested[1] - origin[1]];
  let a = relative[0] * u[0] + relative[1] * u[1],
    b = relative[0] * v[0] + relative[1] * v[1];
  // Disallow collapse/crossing through the opposite corner.
  const old = previous[corner];
  const signB =
    Math.sign((old[0] - origin[0]) * v[0] + (old[1] - origin[1]) * v[1]) || 1;
  a = Math.max(0.02, a);
  b = signB * Math.max(0.02, signB * b);
  if (square) {
    const side = Math.max(Math.abs(a), Math.abs(b));
    a = side;
    b = signB * side;
  }
  const result = previous.map((p) => [...p] as Point);
  result[next] = [origin[0] + a * u[0], origin[1] + a * u[1]];
  result[last] = [origin[0] + b * v[0], origin[1] + b * v[1]];
  result[corner] = [
    result[next][0] + result[last][0] - origin[0],
    result[next][1] + result[last][1] - origin[1],
  ];
  return result;
}
