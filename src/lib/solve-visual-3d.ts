import type {
  ThreeVisualObject,
  ThreeVisualSpec,
  TwoDVisualSpec,
} from "./contracts";
import { convertSketchTo3d } from "./sketch-3d";
import { validateVisual } from "./validation";
import { ShapeUtils, Vector2 } from "three";
import { tunnelFromPlan } from "./tunnel-visual";
import { CYLINDER_DIMENSIONS_KEY, cylinderDimensions3d } from "./cylinder-problem-visual";

export const SOLVE_PLANAR_3D_NOTE =
  "Hình phẳng được giữ trên một mặt phẳng trong không gian 3D để xoay và quan sát; không tự suy ra một khối từ đề.";
export const SOLVE_CYLINDER_3D_NOTE =
  "Hình trụ 3D theo trục quay của đề. Giữ các đỉnh, tâm đáy, bán kính và đường sinh; kích thước không được cho chỉ dùng bố trí hình. Kéo để xoay, cuộn để zoom.";

/** A separate view: never replace or project back over the canonical 2D construction. */
export function solveVisualTo3d(input: TwoDVisualSpec): ThreeVisualSpec {
  const source = validateVisual(input) as TwoDVisualSpec;
  if (source.source?.key === CYLINDER_DIMENSIONS_KEY) return cylinderDimensions3d(source);
  if (source.source?.key === "tunnel-parabolic") return tunnelFromPlan(source);
  if (source.source?.key !== "solve-cylinder-revolution") {
    const prepared = structuredClone(source);
    // The step player must be able to reveal roots/vertex later; the generic
    // converter deliberately omits hidden objects, so include these then hide them.
    const stepPoints =
      source.id === "visual_solve"
        ? source.objects.filter(
            (object) =>
              object.type === "point" &&
              (object.id.startsWith("root_") || object.id === "vertex"),
          )
        : [];
    for (const object of prepared.objects)
      if (stepPoints.some((point) => point.id === object.id))
        object.visible = true;
    const view = convertSketchTo3d(prepared, "planar");
    for (const object of view.objects) {
      const sourcePoint = stepPoints.find(
        (point) =>
          object.id === `point_${point.id}` ||
          object.id === `label_${point.id}`,
      );
      if (sourcePoint) object.visible = sourcePoint.visible;
    }
    // Fill a planar region without inventing thickness or a solid.
    for (const polygon of source.objects.filter(
      (object) => ["polygon", "circle"].includes(object.type) && object.visible,
    )) {
      const curve = view.objects.find(
        (object) => object.id === `curve_${polygon.id}`,
      );
      if (!curve?.points3d) continue;
      const points =
        polygon.type === "circle"
          ? Array.from(
              { length: 32 },
              (_, index) =>
                curve.points3d![
                  Math.floor((index * curve.points3d!.length) / 32)
                ],
            )
          : curve.points3d;
      const triangles = ShapeUtils.triangulateShape(
        points.map(([x, , z]) => new Vector2(x, z)),
        [],
      );
      for (const [index, triangle] of triangles.entries())
        view.objects.push({
          id: `face_${polygon.id}_${index}`,
          type: "face3d",
          points3d: triangle.map((index) => points[index]),
          color: polygon.color,
          visible: true,
          marker: false,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        });
    }
    for (const object of source.objects.filter(
      (object) => object.visible && object.measurement,
    )) {
      const curve = view.objects.find(
        (candidate) =>
          candidate.id === `edge_${object.id}` ||
          candidate.id === `curve_${object.id}`,
      );
      const points = curve?.points3d;
      if (!points?.length) continue;
      const first = points[0],
        last = points[points.length - 1];
      view.objects.push({
        id: `measure_${object.id}`,
        type: "label3d",
        text: `${object.label || object.parents.join("")} = ${object.measurement}`,
        color: object.color,
        position: [(first[0] + last[0]) / 2, 0.12, (first[2] + last[2]) / 2],
        annotationKind: "length",
        visible: true,
        marker: false,
        rotation: [0, 0, 0],
      });
    }
    return validateVisual({
      ...view,
      derivedFrom2d: { ...view.derivedFrom2d, source },
      surfaceFill: false,
      accessibility: { description: SOLVE_PLANAR_3D_NOTE },
    }) as ThreeVisualSpec;
  }
  // This template has an actual revolution axis, unlike an arbitrary planar sketch.
  const midpoints = source.objects.filter(
    (object) => object.type === "midpoint",
  );
  const axis = source.objects.find(
    (object) =>
      object.type === "segment" &&
      midpoints.some((point) => point.id === object.parents[0]) &&
      midpoints.some((point) => point.id === object.parents[1]),
  );
  const coordinates = new Map<string, [number, number, number]>();
  for (const object of source.objects) {
    if (
      object.type === "point" &&
      typeof object.x === "number" &&
      typeof object.y === "number"
    )
      coordinates.set(object.id, [object.x, object.y, 0]);
  }
  for (const point of midpoints) {
    const first = coordinates.get(point.parents[0]),
      second = coordinates.get(point.parents[1]);
    if (first && second)
      coordinates.set(
        point.id,
        first.map((value, index) => (value + second[index]) / 2) as [
          number,
          number,
          number,
        ],
      );
  }
  const bottom = axis && coordinates.get(axis.parents[0]),
    top = axis && coordinates.get(axis.parents[1]);
  const end = midpoints.find((point) => point.id === axis?.parents[0]);
  const radialPoint = end && coordinates.get(end.parents[0]);
  if (
    !bottom ||
    !top ||
    !radialPoint ||
    bottom[0] !== top[0] ||
    top[1] <= bottom[1]
  )
    throw Error(
      "Chưa xác định được trục quay hợp lệ để dựng hình trụ 3D. Bản 2D vẫn được giữ.",
    );
  const radius = Math.abs(radialPoint[0] - bottom[0]),
    height = top[1] - bottom[1];
  if (!radius) throw Error("Bán kính hình trụ không hợp lệ.");
  const color = "#17835e";
  const objects: Array<
    Partial<ThreeVisualObject> & { id: string; type: ThreeVisualObject["type"] }
  > = [
    {
      id: "cylinder",
      type: "cylinder",
      label: "Hình trụ",
      radius,
      height,
      position: [bottom[0], (bottom[1] + top[1]) / 2, 0],
      color,
    },
  ];
  for (const [id, position] of coordinates) {
    const point = source.objects.find((object) => object.id === id)!;
    objects.push({
      id: `point_${id}`,
      type: "sphere",
      marker: true,
      radius: Math.min(radius, height) * 0.035,
      position,
      color,
      label: point.label || id,
      annotationKind: "vertex",
    });
    objects.push({
      id: `label_${id}`,
      type: "label3d",
      text: point.label || id,
      color,
      position: [position[0], position[1], radius * 0.07],
      annotationKind: "vertex",
    });
  }
  for (const object of source.objects.filter(
    (object) => object.type === "segment",
  )) {
    const first = coordinates.get(object.parents[0]),
      second = coordinates.get(object.parents[1]);
    if (!first || !second)
      throw Error("Cạnh hình trụ thiếu điểm phụ thuộc. Bản 2D vẫn được giữ.");
    objects.push({
      id: `curve_${object.id}`,
      type: "curve3d",
      points3d: [first, second],
      color: object.color,
      lineStyle: object.lineStyle,
      strokeWidth: object.strokeWidth,
      visible: object.strokeOpacity !== 0,
    });
    const text = object.measurement
      ? `${object.label || object.parents.join("")} = ${object.measurement}`
      : object.id === axis!.id
        ? object.label
        : undefined;
    if (text)
      objects.push({
        id: `label_${object.id}`,
        type: "label3d",
        text,
        color: object.color,
        position: [
          (first[0] + second[0]) / 2,
          (first[1] + second[1]) / 2,
          radius * 0.15,
        ],
        annotationKind: object.measurement ? "length" : "helper",
      });
  }
  for (const [id, center] of [
    ["bottom", bottom],
    ["top", top],
  ] as const) {
    objects.push({
      id: `curve_${id}_circle`,
      type: "curve3d",
      closed: true,
      color,
      points3d: Array.from({ length: 96 }, (_, index) => {
        const angle = (index * Math.PI * 2) / 96;
        return [
          center[0] + radius * Math.cos(angle),
          center[1],
          radius * Math.sin(angle),
        ];
      }),
    });
  }
  return validateVisual({
    id: source.id,
    version: 1,
    dimension: "3d",
    engine: "threejs",
    kind: "solid",
    source: { key: "solve-cylinder-3d", version: 1 },
    parameters: [],
    objects,
    surfaceFill: false,
    derivedFrom2d: { source, mode: "cylinder" },
    camera: {
      position: [radius * 3, height * 0.9, radius * 4],
      target: [bottom[0], height / 2 + bottom[1], 0],
    },
    accessibility: { description: SOLVE_CYLINDER_3D_NOTE },
  }) as ThreeVisualSpec;
}
