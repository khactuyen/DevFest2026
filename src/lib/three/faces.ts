import * as THREE from "three";

/** Collect triangles on the selected planar face, including triangulated caps. */
export function planarFace(geometry: THREE.BufferGeometry, faceIndex: number) {
  const positions = geometry.getAttribute("position");
  if (!positions) return null;
  const indices = geometry.getIndex();
  const count = indices?.count ?? positions.count;
  if (
    !Number.isInteger(faceIndex) ||
    faceIndex < 0 ||
    faceIndex * 3 + 2 >= count
  )
    return null;
  const point = (i: number) =>
    new THREE.Vector3().fromBufferAttribute(
      positions,
      indices ? indices.getX(i) : i,
    );
  const start = faceIndex * 3;
  const plane = new THREE.Plane().setFromCoplanarPoints(
    point(start),
    point(start + 1),
    point(start + 2),
  );
  if (plane.normal.lengthSq() < 0.5) return null;
  geometry.computeBoundingBox();
  const tolerance = Math.max(
    1e-7,
    (geometry.boundingBox?.getSize(new THREE.Vector3()).length() || 1) * 1e-6,
  );
  const triangles: THREE.Vector3[][] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const triangle = [point(i), point(i + 1), point(i + 2)];
    if (triangle.every((p) => Math.abs(plane.distanceToPoint(p)) <= tolerance))
      triangles.push(triangle);
  }
  return { plane, triangles };
}
