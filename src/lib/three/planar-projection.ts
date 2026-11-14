import * as THREE from "three";
import { circularEdgePoint, type CircularEdgeKey } from "../circular-edge";
import type { ThreeVisualObject, TwoDVisualSpec } from "../contracts";
import { curvePoints, indexedSolidVertices, solidGeometry } from "./geometry";
import { annotationCaption, edgeAnnotation } from "../object-annotations";
import { projectedObjects } from "../projected-objects";

type Point = [number, number];
type Stroke = { color: string; width: number; dashed: boolean };
type ProjectionPath = Stroke & { objectId: string; points: Point[]; filled?: boolean };

// A fixed oblique view gives the same teaching diagram after any camera rotation.
const towardViewer = new THREE.Vector3(6, 4, 8).normalize();
const right = new THREE.Vector3()
  .crossVectors(new THREE.Vector3(0, 1, 0), towardViewer)
  .normalize();
const up = new THREE.Vector3().crossVectors(towardViewer, right);
const project = (p: THREE.Vector3): Point => [p.dot(right), p.dot(up)];
export function translateProjectedPosition(position: ThreeVisualObject["position"], dx: number, dy: number) {
  return new THREE.Vector3(...position).addScaledVector(right, dx).addScaledVector(up, dy).toArray();
}
const rings: Partial<Record<ThreeVisualObject["type"], CircularEdgeKey[]>> = {
  sphere: ["great-y"],
  cylinder: ["top-ring", "bottom-ring"],
  cone: ["bottom-ring"],
};

function convexOutline(points: Point[]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (sequence: Point[]) => {
    const result: Point[] = [];
    for (const point of sequence) {
      while (result.length >= 2) {
        const a = result[result.length - 2],
          b = result[result.length - 1];
        if (
          (b[0] - a[0]) * (point[1] - a[1]) >
          (b[1] - a[1]) * (point[0] - a[0])
        )
          break;
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  };
  const outline = [...half(sorted), ...half(sorted.reverse())];
  return [...outline, outline[0]].filter(Boolean);
}

export function spatialProjection(spec: TwoDVisualSpec) {
  const objects = projectedObjects(spec);
  const values = Object.fromEntries(
    [
      ...spec.parameters,
      ...(spec.savedNative3d?.parameters ?? spec.savedSpatialParameters ?? []),
    ].map((p) => [p.id, p.value]),
  );
  const strokes = new Map<string, ProjectionPath>();
  const faces: ProjectionPath[] = [];
  const markers: Array<{ objectId: string; point: Point; color: string }> = [];
  const labels: Array<{ objectId: string; point: Point; text: string; color: string }> = [];
  const vertices: Array<{ objectId: string; point: Point; vertexIndex: number }> = [];
  const edges: Array<{ objectId: string; points: Point[]; edgeIndex: number; edgeKey?: CircularEdgeKey }> = [];
  const append = (objectId: string, points: Point[], style: Stroke, edgeIndex?: number, edgeKey?: CircularEdgeKey) => {
    if (
      points.length < 2 ||
      points.some((point) => !point.every(Number.isFinite))
    )
      return;
    if (edgeIndex !== undefined) edges.push({ objectId, points, edgeIndex, edgeKey });
    const key = JSON.stringify([objectId, style]);
    let path = strokes.get(key);
    if (!path) {
      path = { ...style, objectId, points: [] };
      strokes.set(key, path);
    }
    path.points.push(...points, [NaN, NaN]);
  };
  for (const object of objects) {
    if (!object.visible || object.type === "slicePlane") continue;
    const objectId = object.id;
    const binding = object.parameterBindings ?? {};
    const transform = new THREE.Object3D();
    transform.position.set(
      values[binding.positionX ?? ""] ?? object.position[0],
      values[binding.positionY ?? ""] ?? object.position[1],
      values[binding.positionZ ?? ""] ?? object.position[2],
    );
    transform.rotation.set(
      values[binding.rotationX ?? ""] ?? object.rotation[0],
      values[binding.rotationY ?? ""] ?? object.rotation[1],
      values[binding.rotationZ ?? ""] ?? object.rotation[2],
    );
    transform.updateMatrixWorld();
    const toPlane = (point: THREE.Vector3) =>
      project(transform.localToWorld(point));
    const color = object.color ?? "#244f3c";
    const style = (
      edgeIndex: number,
      hidden = false,
      edgeKey?: CircularEdgeKey,
    ): Stroke | undefined => {
      const edge = object.edgeStyles?.find((item) =>
        edgeKey
          ? item.edgeKey === edgeKey
          : !item.edgeKey &&
            item.edgePart === 0 &&
            item.edgeIndex === edgeIndex,
      );
      return edge?.hidden
        ? undefined
        : {
            color: edge?.color ?? color,
            width: edge?.strokeWidth ?? object.strokeWidth ?? 1.8,
            dashed:
              hidden || (edge?.lineStyle ?? object.lineStyle) === "dashed",
          };
    };
    if (object.type === "label3d") {
      if (object.text && object.text !== "Không gian")
        labels.push({
          objectId,
          point: project(transform.position),
          text: object.text,
          color,
        });
      continue;
    }
    if (object.marker) {
      markers.push({ objectId, point: project(transform.position), color });
      if (
        object.label &&
        !objects.some(
          (other) => other.type === "label3d" && other.text === object.label,
        )
      )
        labels.push({
          objectId,
          point: project(transform.position),
          text: object.label,
          color,
        });
      continue;
    }
    if (object.type === "curve3d" || object.type === "face3d") {
      object.faces3d?.forEach((face, index) => {
        const points = [...face, face[0]].map((point) => toPlane(new THREE.Vector3(...point)));
        const palette = ["#80c7ad", "#f2b56d", "#89b5ec", "#d9a0d1"];
        faces.push({ objectId, points, color: palette[index % palette.length], width: 0, dashed: false, filled: true });
        const center = face.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).divideScalar(face.length);
        labels.push({ objectId, point: toPlane(center), text: String(index + 1), color });
      });
      const points = curvePoints(object, values).map(toPlane);
      if ((object.closed || object.type === "face3d") && points.length)
        points.push(points[0]);
      if (object.type === "face3d" && points.length >= 4)
        faces.push({ objectId, points, color, width: 0, dashed: false, filled: true });
      for (let i = 0; i + 1 < points.length; i += object.segments ? 2 : 1) {
        const edge = style(i);
        if (!edge) continue;
        append(objectId, [points[i], points[i + 1]], edge);
        const caption = annotationCaption(edgeAnnotation(object, { edgeIndex: i }) ?? {});
        if (caption) labels.push({
          objectId,
          point: [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2],
          text: caption, color,
        });
      }
      if (object.showAnnotationLabel && points.length) {
        const caption = annotationCaption(object);
        if (caption) labels.push({ objectId, point: points[Math.floor(points.length / 2)], text: caption, color });
      }
      continue;
    }
    const geometry = solidGeometry(object, values);
    if (object.type !== "sphere" && object.type !== "cylinder") {
      for (const { point, index, selectable } of indexedSolidVertices(geometry, object.type)) {
        if (!selectable) continue;
        const projected = toPlane(point);
        vertices.push({ objectId, point: projected, vertexIndex: index });
        const text = object.vertexAnnotations?.[index]?.label;
        if (text) labels.push({ objectId, point: projected, text, color });
      }
    }
    const material = new THREE.MeshBasicMaterial();
    const surface = new THREE.Mesh(geometry, material);
    surface.matrixWorld.copy(transform.matrixWorld);
    const localBounds = new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    const span = Math.max(
      localBounds.getSize(new THREE.Vector3()).length(),
      1e-8,
    );
    const ray = new THREE.Raycaster();
    const hidden = (point: THREE.Vector3) => {
      const midpoint = transform.localToWorld(point);
      ray.set(
        midpoint.addScaledVector(towardViewer, span * 2),
        towardViewer.clone().negate(),
      );
      ray.far = span * (2 - 1e-5);
      return ray.intersectObject(surface, false).length > 0;
    };
    const positions = geometry.getAttribute("position");
    const contours = rings[object.type];
    const outline =
      object.type === "extrudedPolygon"
        ? []
        : convexOutline(
            Array.from({ length: positions.count }, (_, index) =>
              toPlane(
                new THREE.Vector3().fromBufferAttribute(positions, index),
              ),
            ),
          );
    if (outline.length >= 4)
      faces.push({
        objectId,
        points: outline,
        color,
        width: 0,
        dashed: false,
        filled: true,
      });
    if (contours) {
      append(objectId, outline, {
        color,
        width: object.strokeWidth ?? 1.8,
        dashed: object.lineStyle === "dashed",
      });
      const size = values[binding.size ?? ""] ?? object.size ?? 2;
      const radius = values[binding.radius ?? ""] ?? object.radius ?? size / 2;
      const height = values[binding.height ?? ""] ?? object.height ?? size;
      for (const key of contours) {
        const ring = (index: number) =>
          new THREE.Vector3(
            ...circularEdgePoint(key, index / 64, radius, height),
          );
        for (let i = 0; i < 64; i++) {
          const a = ring(i),
            b = ring(i + 1);
          const edge = style(0, hidden(ring(i + 0.5)), key);
          if (edge) append(objectId, [toPlane(a), toPlane(b)], edge, 0, key);
        }
        const info = edgeAnnotation(object, { edgeKey: key });
        const caption = annotationCaption(info ?? {});
        if (caption && !info?.hidden) labels.push({ objectId, point: toPlane(ring(16)), text: caption, color });
      }
    } else {
      const edges = new THREE.EdgesGeometry(geometry);
      const points = edges.getAttribute("position");
      for (let i = 0; i + 1 < points.count; i += 2) {
        const a = new THREE.Vector3().fromBufferAttribute(points, i);
        const b = new THREE.Vector3().fromBufferAttribute(points, i + 1);
        const midpoint = a.clone().lerp(b, 0.5);
        const edge = style(i, hidden(midpoint));
        const caption = annotationCaption(edgeAnnotation(object, { edgeIndex: i }) ?? {});
        if (edge && caption) labels.push({ objectId, point: toPlane(midpoint), text: caption, color });
        if (edge) append(objectId, [toPlane(a), toPlane(b)], edge, i);
      }
      edges.dispose();
    }
    geometry.dispose();
    material.dispose();
    const caption = object.showAnnotationLabel && annotationCaption(object);
    if (caption) labels.push({ objectId, point: project(transform.position), text: caption, color });
  }
  return { paths: [...faces, ...strokes.values()], markers, labels, vertices, edges };
}
