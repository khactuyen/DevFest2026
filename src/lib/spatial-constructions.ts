import { Vector3, Matrix3 } from "three";
import { SPATIAL_TOOLS, type SpatialTool } from "./spatial-tools";
export { SPATIAL_TOOLS, type SpatialTool } from "./spatial-tools";

export type XYZ = [number, number, number];
export type SpatialResult = {
  point?: XYZ;
  points?: XYZ[];
  value?: number;
  radius?: number;
  normal?: XYZ;
};
const vector = (p: XYZ) => new Vector3(...p);
const xyz = (p: Vector3): XYZ => p.toArray() as XYZ;
function direction(a: Vector3, b: Vector3) {
  const d = b.clone().sub(a);
  if (d.length() < 1e-8) throw Error("Hai điểm xác định đường phải khác nhau.");
  return d.normalize();
}
function normal(a: Vector3, b: Vector3, c: Vector3) {
  const u = direction(a, b),
    v = direction(a, c),
    n = u.cross(v);
  if (n.length() < 1e-8)
    throw Error("Ba điểm thẳng hàng, chưa xác định được mặt phẳng.");
  return n.normalize();
}
export function constructSpatial(
  tool: SpatialTool,
  input: XYZ[],
): SpatialResult {
  if (
    input.length !== SPATIAL_TOOLS[tool].count ||
    input.some((p) => p.some((v) => !Number.isFinite(v)))
  )
    throw Error("Chưa đủ điểm hợp lệ cho phép dựng.");
  const p = input.map(vector),
    [a, b, c, d, e, f] = p;
  const point = (v: Vector3): SpatialResult => ({ point: xyz(v) });
  if (tool === "edgePoint") return point(a);
  if (tool === "distance") return { points: input, value: a.distanceTo(b) };
  if (tool === "midpoint") return point(a.clone().add(b).multiplyScalar(0.5));
  if (tool === "centroid")
    return point(
      a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3),
    );
  if (tool === "parallel") {
    const u = direction(a, b);
    return {
      points: [
        xyz(c.clone().addScaledVector(u, -10)),
        xyz(c.clone().addScaledVector(u, 10)),
      ],
    };
  }
  if (tool === "footLine") {
    const u = direction(b, c);
    return point(b.clone().addScaledVector(u, a.clone().sub(b).dot(u)));
  }
  if (tool === "footPlane" || tool === "distancePlane") {
    const n = normal(b, c, d),
      h = a.clone().addScaledVector(n, -a.clone().sub(b).dot(n));
    return tool === "footPlane"
      ? point(h)
      : { points: [xyz(a), xyz(h)], value: a.distanceTo(h) };
  }
  if (tool === "intersectionLines" || tool === "commonPerpendicular") {
    const u = direction(a, b),
      v = direction(c, d),
      w = a.clone().sub(c),
      dot = u.dot(v),
      den = 1 - dot * dot;
    if (Math.abs(den) < 1e-12)
      throw Error(
        "Hai đường song song hoặc trùng nhau, không có nghiệm duy nhất.",
      );
    const s = (dot * v.dot(w) - u.dot(w)) / den,
      t = (v.dot(w) - dot * u.dot(w)) / den;
    const h = a.clone().addScaledVector(u, s),
      k = c.clone().addScaledVector(v, t);
    if (tool === "intersectionLines") {
      if (h.distanceTo(k) > 1e-6 * Math.max(1, a.length(), c.length()))
        throw Error("Hai đường chéo nhau, không có giao điểm.");
      return point(h.add(k).multiplyScalar(0.5));
    }
    return { points: [xyz(h), xyz(k)], value: h.distanceTo(k) };
  }
  if (tool === "intersectionLinePlane" || tool === "angleLinePlane") {
    const u = direction(a, b),
      n = normal(c, d, e),
      den = n.dot(u);
    if (tool === "angleLinePlane")
      return {
        point: xyz(a),
        value: (Math.asin(Math.min(1, Math.abs(den))) * 180) / Math.PI,
      };
    if (Math.abs(den) < 1e-10)
      throw Error(
        Math.abs(n.dot(a.clone().sub(c))) < 1e-8
          ? "Đường nằm trong mặt phẳng, có vô số giao điểm."
          : "Đường song song mặt phẳng, không có giao điểm.",
      );
    return point(a.clone().addScaledVector(u, n.dot(c.clone().sub(a)) / den));
  }
  if (tool === "intersectionPlanes" || tool === "anglePlanes") {
    const n1 = normal(a, b, c),
      n2 = normal(d, e, f),
      u = n1.clone().cross(n2),
      den = u.lengthSq();
    if (tool === "anglePlanes")
      return {
        point: xyz(a),
        value: (Math.acos(Math.min(1, Math.abs(n1.dot(n2)))) * 180) / Math.PI,
      };
    if (den < 1e-12) throw Error("Hai mặt phẳng song song hoặc trùng nhau.");
    const origin = n2
      .clone()
      .cross(u)
      .multiplyScalar(n1.dot(a))
      .add(u.clone().cross(n1).multiplyScalar(n2.dot(d)))
      .divideScalar(den);
    u.normalize();
    return {
      points: [
        xyz(origin.clone().addScaledVector(u, -10)),
        xyz(origin.clone().addScaledVector(u, 10)),
      ],
    };
  }
  if (tool === "angle")
    return {
      point: xyz(b),
      value:
        (Math.acos(
          Math.max(-1, Math.min(1, direction(b, a).dot(direction(b, c)))),
        ) *
          180) /
        Math.PI,
    };
  if (tool === "circumsphere") {
    const rows = [b, c, d].map((v) => v.clone().sub(a));
    const m = new Matrix3().set(
      ...(rows.flatMap((v) => v.toArray()) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]),
    );
    const scale = Math.max(...rows.map((v) => v.length()));
    if (Math.abs(m.determinant()) < 1e-10 * scale ** 3)
      throw Error(
        "Bốn điểm đồng phẳng hoặc gần suy biến, không xác định mặt cầu duy nhất.",
      );
    const rhs = new Vector3(...(rows.map((v) => v.lengthSq() / 2) as XYZ)),
      center = rhs.applyMatrix3(m.invert()).add(a);
    return { point: xyz(center), radius: center.distanceTo(a) };
  }
  const n = normal(a, b, c);
  if (tool === "plane") {
    const u = direction(a, b),
      v = n.clone().cross(u),
      center = a.clone().add(b).add(c).divideScalar(3),
      size = Math.max(2, a.distanceTo(b), a.distanceTo(c));
    return {
      points: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) =>
        xyz(
          center
            .clone()
            .addScaledVector(u, x * size)
            .addScaledVector(v, y * size),
        ),
      ),
      normal: xyz(n),
    };
  }
  if (tool === "flatten") {
    const u = direction(a, b),
      v = n.clone().cross(u),
      origin = a.clone().add(new Vector3(6, 0, 0));
    return {
      points: p.map((q) =>
        xyz(
          origin
            .clone()
            .add(
              new Vector3(q.clone().sub(a).dot(u), q.clone().sub(a).dot(v), 0),
            ),
        ),
      ),
      normal: xyz(n),
    };
  }
  return { points: input, normal: xyz(n) };
}
export function flattenPolygon(points: XYZ[], basis: XYZ[]): XYZ[] {
  const [a, b, c] = basis.map(vector),
    n = normal(a, b, c),
    u = direction(a, b),
    v = n.clone().cross(u),
    origin = a.clone().add(new Vector3(6, 0, 0));
  if (points.some((p) => Math.abs(n.dot(vector(p).sub(a))) > 1e-6))
    throw Error("Mặt được chọn không cùng mặt phẳng với ba điểm dựng.");
  return points.map((p) => {
    const q = vector(p).sub(a);
    return xyz(origin.clone().add(new Vector3(q.dot(u), q.dot(v), 0)));
  });
}

/** Intersect a convex body's edges with a plane; keep each body separate. */
export function sectionPolygon(
  points: XYZ[],
  edges: [number, number][],
  plane: XYZ[],
): XYZ[] {
  constructSpatial("plane", plane);
  const [a, b, c] = plane.map(vector),
    n = normal(a, b, c),
    scale = Math.max(1, ...points.map((p) => vector(p).distanceTo(a))),
    eps = scale * 1e-8;
  const found: Vector3[] = [];
  const add = (q: Vector3) => {
    if (!found.some((p) => p.distanceTo(q) < eps)) found.push(q);
  };
  for (const [i, j] of edges) {
    const u = vector(points[i]),
      v = vector(points[j]),
      du = n.dot(u.clone().sub(a)),
      dv = n.dot(v.clone().sub(a));
    if (Math.abs(du) < eps) add(u);
    if (Math.abs(dv) < eps) add(v);
    if (du * dv < 0) add(u.clone().lerp(v, du / (du - dv)));
  }
  if (found.length < 3)
    throw Error(
      "Mặt phẳng chỉ tiếp xúc hoặc không cắt thành một thiết diện có diện tích.",
    );
  const center = found
      .reduce((s, p) => s.add(p), new Vector3())
      .divideScalar(found.length),
    u = direction(a, b),
    v = n.clone().cross(u);
  const polygon = found
    .sort(
      (p, q) =>
        Math.atan2(p.clone().sub(center).dot(v), p.clone().sub(center).dot(u)) -
        Math.atan2(q.clone().sub(center).dot(v), q.clone().sub(center).dot(u)),
    )
    .filter((p, i, all) => {
      const previous = all[(i + all.length - 1) % all.length],
        next = all[(i + 1) % all.length];
      return (
        p.clone().sub(previous).cross(next.clone().sub(p)).length() >
        eps * Math.max(p.distanceTo(previous), p.distanceTo(next))
      );
    })
    .map(xyz);
  if (polygon.length < 3)
    throw Error("Mặt phẳng chỉ tiếp xúc hoặc không cắt thành một thiết diện có diện tích.");
  return polygon;
}
