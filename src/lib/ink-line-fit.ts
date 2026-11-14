type Point = { x: number; y: number };

/** Orthogonal least-squares fit, independent of zoom, orientation and scale. */
export function fitInkLine(input: Point[]) {
  const points = input.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (points.length < 2) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of points) {
    xx += (p.x - cx) ** 2;
    xy += (p.x - cx) * (p.y - cy);
    yy += (p.y - cy) ** 2;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  const projections = points.map((p) => (p.x - cx) * ux + (p.y - cy) * uy);
  const left = Math.min(...projections),
    right = Math.max(...projections),
    span = right - left;
  if (span < 1e-6) return null;
  const deviations = points
    .map((p) => Math.abs(-(p.x - cx) * uy + (p.y - cy) * ux))
    .sort((a, b) => a - b);
  const trace = xx + yy,
    gap = Math.hypot(xx - yy, 2 * xy);
  const ratio = (trace - gap) / Math.max(trace + gap, 1e-12);
  const chord = Math.hypot(
    points.at(-1)!.x - points[0].x,
    points.at(-1)!.y - points[0].y,
  );
  const length = points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
  const closed = chord < span * 0.2;
  const confident =
    !closed &&
    chord / span > 0.8 &&
    chord / Math.max(length, 1e-12) > 0.68 &&
    ratio < 0.035 &&
    deviations[Math.floor((deviations.length - 1) * 0.95)] / span < 0.12 &&
    deviations.at(-1)! / span < 0.18;
  const endpoints = [
    { x: cx + left * ux, y: cy + left * uy },
    { x: cx + right * ux, y: cy + right * uy },
  ];
  if (projections[0] > projections.at(-1)!) endpoints.reverse();
  return {
    endpoints,
    confident,
    closed,
    ratio,
    likelyLine: !closed && ratio < 0.08 && chord / span > 0.7,
  };
}
