import * as THREE from "three";
import { disposeObject } from "./geometry";
import type { Entry } from "./types";
import { sectionPolygon, type XYZ } from "../spatial-constructions";

export function meshSectionPolygon(
  mesh: THREE.Mesh<THREE.BufferGeometry>,
  plane: XYZ[],
) {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const points: XYZ[] = [],
    edges: [number, number][] = [];
  const count = index?.count ?? positions.count;
  for (let i = 0; i + 2 < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const point = new THREE.Vector3().fromBufferAttribute(
        positions,
        index ? index.getX(i + k) : i + k,
      );
      points.push(point.applyMatrix4(mesh.matrixWorld).toArray() as XYZ);
    }
    edges.push([i, i + 1], [i + 1, i + 2], [i + 2, i]);
  }
  return sectionPolygon(points, edges, plane);
}

/** Clip the outward-facing triangles of a convex solid, then close both parts. */
export function splitConvexMesh(
  mesh: THREE.Mesh<THREE.BufferGeometry>,
  plane: XYZ[],
) {
  const cap = meshSectionPolygon(mesh, plane);
  const [a, b, c] = plane.map((p) => new THREE.Vector3(...p));
  const cuttingPlane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const span = bounds.getSize(new THREE.Vector3()).length();
  const epsilon = span * 1e-7;
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const halves: XYZ[][][] = [[], []];
  const extendsBothSides = [false, false];
  for (let i = 0; i + 2 < (index?.count ?? positions.count); i += 3) {
    const triangle = [0, 1, 2].map((offset) =>
      new THREE.Vector3()
        .fromBufferAttribute(
          positions,
          index ? index.getX(i + offset) : i + offset,
        )
        .applyMatrix4(mesh.matrixWorld),
    );
    const distances = triangle.map((point) =>
      cuttingPlane.distanceToPoint(point),
    );
    for (const [half, sign] of [1, -1].entries()) {
      if (distances.some((distance) => sign * distance > epsilon))
        extendsBothSides[half] = true;
      const clipped: THREE.Vector3[] = [];
      for (let j = 0; j < 3; j++) {
        const next = (j + 1) % 3;
        const d = distances[j] * sign,
          nextDistance = distances[next] * sign;
        if (d >= -epsilon) clipped.push(triangle[j]);
        if (
          (d < -epsilon && nextDistance > epsilon) ||
          (d > epsilon && nextDistance < -epsilon)
        )
          clipped.push(
            triangle[j].clone().lerp(triangle[next], d / (d - nextDistance)),
          );
      }
      if (
        clipped.length >= 3 &&
        new THREE.Triangle(clipped[0], clipped[1], clipped[2]).getArea() >
          epsilon ** 2
      )
        halves[half].push(clipped.map((point) => point.toArray() as XYZ));
    }
  }
  if (!extendsBothSides.every(Boolean))
    throw Error("Mặt cắt cần đi qua bên trong khối.");
  const normal = cuttingPlane.normal;
  const capNormal = new THREE.Vector3(...cap[1])
    .sub(new THREE.Vector3(...cap[0]))
    .cross(new THREE.Vector3(...cap[2]).sub(new THREE.Vector3(...cap[0])));
  const positiveCap = capNormal.dot(normal) > 0 ? [...cap].reverse() : cap;
  halves[0].push(positiveCap);
  halves[1].push([...positiveCap].reverse());
  return halves.map((faces, side) => {
    const center = new THREE.Box3()
      .setFromPoints(faces.flat().map((point) => new THREE.Vector3(...point)))
      .getCenter(new THREE.Vector3());
    const position = center
      .clone()
      .addScaledVector(normal, span * (side === 0 ? 0.1 : -0.1));
    return {
      position: position.toArray() as XYZ,
      faces3d: faces.map((face) =>
        face.map(
          (point) => new THREE.Vector3(...point).sub(center).toArray() as XYZ,
        ),
      ),
    };
  });
}

export function hasConcaveBase(entry: Entry) {
  const points =
    entry.object.type === "extrudedPolygon"
      ? entry.object.vertices2d
      : undefined;
  if (!points) return false;
  const signs = points
    .map((a, i) => {
      const b = points[(i + 1) % points.length],
        c = points[(i + 2) % points.length];
      return Math.sign(
        (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
      );
    })
    .filter(Boolean);
  return signs.some((sign) => sign !== signs[0]);
}

/** Each body owns a separate section, so distant bodies are never bridged. */
export function updateSections(entries: Map<string, Entry>) {
  for (const slice of entries.values()) {
    if (slice.object.type !== "slicePlane" || !slice.group.children.length)
      continue;
    const old = slice.group.getObjectByName("computed-section");
    if (old) {
      old.removeFromParent();
      disposeObject(old);
    }
    delete slice.group.userData.sectionWarning;
    slice.group.updateWorldMatrix(true, true);
    const origin = slice.group.localToWorld(new THREE.Vector3()),
      u = slice.group.localToWorld(new THREE.Vector3(1, 0, 0)),
      v = slice.group.localToWorld(new THREE.Vector3(0, 1, 0)),
      normal = new THREE.Vector3()
        .crossVectors(u.clone().sub(origin), v.clone().sub(origin))
        .normalize();
    const result = new THREE.Group();
    result.name = "computed-section";
    for (const entry of entries.values()) {
      if (
        !entry.mesh ||
        !entry.group.visible ||
        entry.object.marker ||
        ["slicePlane", "face3d"].includes(entry.object.type)
      )
        continue;
      if (hasConcaveBase(entry)) {
        slice.group.userData.sectionWarning =
          "Chưa hỗ trợ thiết diện tổng quát cho khối đáy lõm.";
        continue;
      }
      try {
        const polygon = meshSectionPolygon(entry.mesh, [
            origin.toArray(),
            u.toArray(),
            v.toArray(),
          ] as XYZ[]),
          local = polygon.map((p) =>
            slice.group.worldToLocal(
              new THREE.Vector3(...p).addScaledVector(normal, 0.012),
            ),
          ),
          fillGeometry = new THREE.BufferGeometry().setFromPoints(local);
        fillGeometry.setIndex(
          Array.from({ length: local.length - 2 }, (_, i) => [
            0,
            i + 1,
            i + 2,
          ]).flat(),
        );
        fillGeometry.computeVertexNormals();
        const fill = new THREE.Mesh(
          fillGeometry,
          new THREE.MeshBasicMaterial({
            color: "#e58b34",
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        fill.userData = {
          objectId: slice.object.id,
          sourceId: entry.object.id,
          selectionKind: "section",
        };
        fill.renderOrder = 3;
        result.add(fill);
        const outline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([...local, local[0]]),
          new THREE.LineBasicMaterial({ color: "#a94e12" }),
        );
        outline.userData = { ...fill.userData };
        result.add(outline);
      } catch {
        /* No area intersection: keep the slice and other bodies' valid sections. */
      }
    }
    slice.group.add(result);
  }
}
