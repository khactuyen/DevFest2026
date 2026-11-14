import * as THREE from "three";
import { planarFace } from "./faces";
type Face = { points: THREE.Vector3[]; normal: THREE.Vector3 };
/** A deterministic spanning-tree net of a convex, closed polyhedron. */
export function polyhedronNet(
  geometry: THREE.BufferGeometry,
  progress: number,
  rootFace = 0,
): THREE.Vector3[][] {
  const attr = geometry.getAttribute("position"),
    index = geometry.getIndex(),
    count = (index?.count || attr.count) / 3,
    faces: Face[] = [];
  for (let t = 0; t < count; t++) {
    const face = planarFace(geometry, t);
    if (!face) continue;
    const points: THREE.Vector3[] = [];
    for (const p of face.triangles.flat())
      if (!points.some((q) => p.distanceTo(q) < 1e-6)) points.push(p.clone());
    if (points.length < 3) continue;
    const center = points
      .reduce((s, p) => s.add(p), new THREE.Vector3())
      .divideScalar(points.length);
    if (
      faces.some(
        (f) =>
          f.points.some((p) => p.distanceTo(points[0]) < 1e-6) &&
          f.points.length === points.length &&
          f.points.every((p) => points.some((q) => q.distanceTo(p) < 1e-6)),
      )
    )
      continue;
    const normal = face.plane.normal,
      u = points[0].clone().sub(center).normalize(),
      v = normal.clone().cross(u);
    points.sort(
      (a, b) =>
        Math.atan2(a.clone().sub(center).dot(v), a.clone().sub(center).dot(u)) -
        Math.atan2(b.clone().sub(center).dot(v), b.clone().sub(center).dot(u)),
    );
    faces.push({ points, normal: normal.clone() });
    if (faces.length > 32)
      throw Error(
        "Khối có quá nhiều mặt hoặc chứa mặt cong; chưa hỗ trợ khai triển này.",
      );
  }
  if (faces.length < 4) throw Error("Cần một đa diện kín có ít nhất bốn mặt.");
  const root = ((rootFace % faces.length) + faces.length) % faces.length;
  const transforms = new Map<number, THREE.Matrix4>([
      [root, new THREE.Matrix4()],
    ]),
    queue = [root];
  for (let k = 0; k < queue.length; k++) {
    const parent = queue[k],
      face = faces[parent];
    for (let j = 0; j < faces.length; j++)
      if (!transforms.has(j)) {
        const shared = face.points.filter((p) =>
          faces[j].points.some((q) => q.distanceTo(p) < 1e-6),
        );
        if (shared.length !== 2) continue;
        const [a, b] = shared,
          axis = b.clone().sub(a).normalize(),
          angle = Math.atan2(
            axis.dot(faces[j].normal.clone().cross(face.normal)),
            faces[j].normal.dot(face.normal),
          );
        const rotation = new THREE.Matrix4()
          .makeTranslation(a.x, a.y, a.z)
          .multiply(
            new THREE.Matrix4().makeRotationAxis(
              axis,
              angle * THREE.MathUtils.clamp(progress, 0, 1),
            ),
          )
          .multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z));
        transforms.set(j, transforms.get(parent)!.clone().multiply(rotation));
        queue.push(j);
      }
  }
  if (transforms.size !== faces.length)
    throw Error("Các mặt không tạo thành một đa diện liên thông.");
  return faces.map((f, i) =>
    f.points.map((p) => p.clone().applyMatrix4(transforms.get(i)!)),
  );
}
export function netHasOverlaps(faces: THREE.Vector3[][]): boolean {
  const origin = faces[0][0],
    u = faces[0][1].clone().sub(origin).normalize(),
    n = new THREE.Vector3()
      .crossVectors(u, faces[0][2].clone().sub(origin))
      .normalize(),
    v = n.clone().cross(u),
    polygons = faces.map((face) =>
      face.map(
        (p) =>
          new THREE.Vector2(
            p.clone().sub(origin).dot(u),
            p.clone().sub(origin).dot(v),
          ),
      ),
    );
  for (let i = 0; i < polygons.length; i++)
    for (let j = i + 1; j < polygons.length; j++) {
      const a = polygons[i],
        b = polygons[j],
        axes = [
          ...a.map((p, k) => a[(k + 1) % a.length].clone().sub(p)),
          ...b.map((p, k) => b[(k + 1) % b.length].clone().sub(p)),
        ].map((e) => new THREE.Vector2(-e.y, e.x).normalize());
      if (
        axes.every((axis) => {
          const x = a.map((p) => p.dot(axis)),
            y = b.map((p) => p.dot(axis));
          return (
            Math.min(Math.max(...x), Math.max(...y)) -
              Math.max(Math.min(...x), Math.min(...y)) >
            1e-6
          );
        })
      )
        return true;
    }
  return false;
}
