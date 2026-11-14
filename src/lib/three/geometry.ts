import * as THREE from "three";
import type { ThreeVisualObject } from "../contracts";
import { compileExpression } from "../expression";

export function solidGeometry(
  object: ThreeVisualObject,
  values: Record<string, number>,
) {
  const bind = object.parameterBindings || {};
  const size = bind.size ? values[bind.size] : object.size || 2;
  const radius = bind.radius ? values[bind.radius] : object.radius || size / 2;
  const height = bind.height ? values[bind.height] : object.height || size;
  const depth = bind.depth ? values[bind.depth] : object.depth || 1;
  const sides = Math.round(bind.sides ? values[bind.sides] : object.sides || 6);
  switch (object.type) {
    case "box":
      return new THREE.BoxGeometry(...(object.boxDimensions || [size,size,size] as [number,number,number]));
    case "tetrahedron":
      return new THREE.TetrahedronGeometry((size * Math.sqrt(6)) / 4);
    case "octahedron":
      return new THREE.OctahedronGeometry(size / Math.sqrt(2));
    case "dodecahedron":
      return new THREE.DodecahedronGeometry(
        (size * Math.sqrt(3) * (1 + Math.sqrt(5))) / 4,
      );
    case "icosahedron":
      return new THREE.IcosahedronGeometry(
        (size * Math.sqrt(10 + 2 * Math.sqrt(5))) / 4,
      );
    case "prism":
      return new THREE.CylinderGeometry(
        object.topRadius ?? radius,
        radius,
        height,
        Math.max(3, sides),
      );
    case "pyramid": {
      const geometry = new THREE.ConeGeometry(radius, height, Math.max(3, sides));
      if (object.apexOffset) {
        const [x, y, z] = object.apexOffset;
        const vertices = geometry.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          if (vertices.getY(i) <= 0) continue;
          vertices.setXYZ(i, x, height / 2 + y, z);
        }
        geometry.computeVertexNormals();
      }
      return geometry;
    }
    case "cylinder":
      return new THREE.CylinderGeometry(radius, radius, height, 48);
    case "cone":
      return new THREE.ConeGeometry(radius, height, 48);
    case "sphere":
      return new THREE.SphereGeometry(radius, 40, 28);
    case "slicePlane":
      return new THREE.PlaneGeometry(size, size);
    case "extrudedPolygon": {
      const vertices = object.vertices2d || [];
      const shape = new THREE.Shape();
      shape.moveTo(vertices[0]?.[0] || 0, vertices[0]?.[1] || 0);
      for (const [x, y] of vertices.slice(1)) shape.lineTo(x, y);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 32,
      });
      geometry.rotateX(Math.PI / 2);
      return geometry;
    }
    case "curve3d":
    case "label3d":
      return new THREE.BufferGeometry();
    case "polyhedron3d":
      return polygonFacesGeometry(object.faces3d ?? []);
    case "face3d": {
      const geometry = new THREE.BufferGeometry();
      geometry.setFromPoints(
        (object.points3d || []).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      );
      geometry.setIndex(Array.from({length: (object.points3d?.length || 3)-2},(_,i)=>[0,i+1,i+2]).flat());
      geometry.computeVertexNormals();
      return geometry;
    }
  }
}

export function polygonFacesGeometry(faces: readonly (readonly [number, number, number][])[]) {
  const positions: number[] = [];
  const geometry = new THREE.BufferGeometry();
  for (const face of faces) {
    const start = positions.length / 3;
    for (let i = 1; i + 1 < face.length; i++) positions.push(...face[0], ...face[i], ...face[i + 1]);
    geometry.addGroup(start, positions.length / 3 - start, geometry.groups.length);
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Preserve the mesh's original vertex numbering for saved edge and vertex anchors.
export function indexedSolidVertices(geometry: THREE.BufferGeometry, type: ThreeVisualObject["type"]) {
  const positions = geometry.getAttribute("position");
  const unique = new Map<string, THREE.Vector3>();
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i);
    const key = point.toArray().map((value) => value.toFixed(5)).join(",");
    if (!unique.has(key)) unique.set(key, point);
  }
  const physicalVertices = new Set<string>();
  return Array.from(unique, ([key, point], index) => {
    // The generated seam can contain both 0 and a tiny negative value that
    // rounds to -0.00000. Keep its old index for saved anchors, but show it once.
    const physicalKey = key.replaceAll("-0.00000", "0.00000");
    const duplicate = physicalVertices.has(physicalKey);
    physicalVertices.add(physicalKey);
    const isCorner = type === "cone" ? index === 0
      : type === "prism" || type === "pyramid"
        ? (type === "pyramid" && index === 0) || point.x !== 0 || point.z !== 0
        : type !== "sphere" && type !== "cylinder";
    return { point, index, selectable: !duplicate && isCorner };
  });
}

export function curvePoints(
  object: ThreeVisualObject,
  values: Record<string, number>,
) {
  if (object.expression && object.xRange) {
    const evaluate = compileExpression(object.expression, Object.keys(values));
    const count = object.samples || 180;
    const [min, max] = object.xRange;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= count; index++) {
      const x = min + ((max - min) * index) / count;
      const y = evaluate({ ...values, x });
      if (Number.isFinite(y) && Math.abs(y) < 1e5)
        points.push(new THREE.Vector3(x, 0, y));
    }
    return points;
  }
  return (object.points3d || []).map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

export function disposeObject(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    } else if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Line
    ) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}
