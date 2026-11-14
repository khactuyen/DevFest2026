import type { VisualSpec, TwoDVisualSpec, ThreeVisualSpec } from "./contracts";
import type { VertexHit } from "./runtime";
import { validateVisual } from "./validation";
import { rebuildSketch3d, restoreSketch2d } from "./sketch-3d";

const uid = (prefix: string) =>
  prefix + "_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const near = (a: number[], b: number[]) =>
  Math.hypot(...a.map((n, i) => n - b[i])) < 1e-6;
const pointTypes = [
  "point",
  "glider",
  "intersection",
  "midpoint",
  "projection",
];
const pair = (parents: string[], a: string, b: string) =>
  parents.length === 2 && parents.includes(a) && parents.includes(b);

function add2d(
  source: TwoDVisualSpec,
  first: VertexHit,
  second: VertexHit,
  lineStyle: "solid" | "dashed",
) {
  const endpoint = (hit: VertexHit): string => {
    if (!hit.free && !hit.edge) {
      if (
        !source.objects.some(
          (o) => o.id === hit.objectId && pointTypes.includes(o.type),
        )
      )
        throw Error("Điểm nối không còn tồn tại.");
      return hit.objectId;
    }
    if (hit.edge) {
      let parent = hit.edge.objectId;
      if (hit.edge.parents) {
        const parents = hit.edge.parents;
        parent = source.objects.find(
          (o) =>
            ["segment", "line", "arrow"].includes(o.type) &&
            pair(o.parents, ...parents),
        )?.id;
        if (!parent) {
          parent = uid("anchor_edge");
          source.objects.push({
            id: parent,
            type: "segment",
            parents: [...parents],
            visible: false,
            free: false,
            color: "#17835e",
          });
        }
      }
      const target = source.objects.find((o) => o.id === parent);
      if (
        !target ||
        !["segment", "line", "arrow", "circle"].includes(target.type)
      )
        throw Error("Cạnh được chọn không còn tồn tại.");
      const existing = source.objects.find(
        (o) =>
          o.type === "glider" &&
          o.parents[0] === parent &&
          o.edgeRatio !== undefined &&
          Math.abs(o.edgeRatio - hit.edge!.ratio) < 1e-6,
      );
      if (existing) return existing.id;
      const id = uid("anchor");
      source.objects.push({
        id,
        type: "glider",
        parents: [parent!],
        x: hit.position[0],
        y: hit.position[1],
        edgeRatio: hit.edge.ratio,
        free: false,
        visible: true,
        color: "#168265",
      });
      return id;
    }
    const existing = source.objects.find(
      (o) =>
        o.type === "point" &&
        typeof o.x === "number" &&
        typeof o.y === "number" &&
        near([o.x, o.y], [hit.position[0], hit.position[1]]),
    );
    if (existing) return existing.id;
    const id = uid("anchor");
    source.objects.push({
      id,
      type: "point",
      parents: [],
      x: hit.position[0],
      y: hit.position[1],
      free: true,
      visible: true,
      color: "#168265",
    });
    return id;
  };
  const a = endpoint(first),
    b = endpoint(second);
  if (a === b) throw Error("Chọn hai vị trí khác nhau, không trùng nhau.");
  if (
    source.objects.some(
      (o) =>
        (["segment", "line", "arrow"].includes(o.type) &&
          o.visible &&
          pair(o.parents, a, b)) ||
        (o.type === "polygon" &&
          o.visible &&
          o.strokeOpacity !== 0 &&
          o.parents.some((id, i) =>
            pair([id, o.parents[(i + 1) % o.parents.length]], a, b),
          )),
    )
  )
    throw Error("Hai điểm này đã có đường nối; không tạo nét trùng.");
  if (source.objects.length >= 80)
    throw Error("Bảng đã đạt giới hạn 80 đối tượng.");
  source.objects.push({
    id: uid("join"),
    type: "segment",
    parents: [a, b],
    label:
      source.objects.find((o) => o.id === a)?.label &&
      source.objects.find((o) => o.id === b)?.label
        ? first.label + "–" + second.label
        : "",
    free: false,
    visible: true,
    color: "#17835e",
    lineStyle,
  });
}

function planarEndpoint(
  hit: VertexHit,
  source: TwoDVisualSpec,
): VertexHit | null {
  if (hit.free)
    return { ...hit, position: [hit.position[0], hit.position[2], 0] };
  if (hit.vertexIndex !== undefined) return null;
  if (hit.edgeIndex === undefined && hit.objectId.startsWith("point_"))
    return {
      ...hit,
      objectId: hit.objectId.slice(6),
      position: [hit.position[0], hit.position[2], 0],
    };
  if (hit.edgeIndex === undefined) return null;
  const id = hit.objectId.replace(/^(?:edge_|curve_)/, ""),
    object = source.objects.find((o) => o.id === id);
  if (!object) return null;
  const position: [number, number, number] = [
    hit.position[0],
    hit.position[2],
    0,
  ];
  if (["segment", "arrow"].includes(object.type))
    return { ...hit, position, edge: { objectId: id, ratio: hit.edgeRatio! } };
  if (object.type === "polygon")
    return {
      ...hit,
      position,
      edge: {
        parents: [
          object.parents[hit.edgeIndex % object.parents.length],
          object.parents[(hit.edgeIndex + 1) % object.parents.length],
        ],
        ratio: hit.edgeRatio!,
      },
    };
  if (object.type === "line") {
    const a = source.objects.find((o) => o.id === object.parents[0]),
      b = source.objects.find((o) => o.id === object.parents[1]);
    if (
      typeof a?.x !== "number" ||
      typeof a.y !== "number" ||
      typeof b?.x !== "number" ||
      typeof b.y !== "number"
    )
      return null;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      squared = dx * dx + dy * dy;
    if (squared < 1e-12) return null;
    return {
      ...hit,
      position,
      edge: {
        objectId: id,
        ratio: ((position[0] - a.x) * dx + (position[1] - a.y) * dy) / squared,
      },
    };
  }
  if (object.type === "circle") {
    const center = source.objects.find((o) => o.id === object.parents[0]);
    if (typeof center?.x !== "number" || typeof center.y !== "number")
      return null;
    const ratio =
      (Math.atan2(position[1] - center.y, position[0] - center.x) /
        (2 * Math.PI) +
        1) %
      1;
    return { ...hit, position, edge: { objectId: id, ratio } };
  }
  return null;
}

/** Endpoints may be existing vertices, attached edge points, or free positions. */
export function connectVisualVertices(
  input: VisualSpec,
  first: VertexHit,
  second: VertexHit,
  lineStyle: "solid" | "dashed",
) {
  if (
    ![first, second].every((p) =>
      p.position.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6),
    ) ||
    near(first.position, second.position)
  )
    throw Error("Hãy chọn hai vị trí khác nhau, hữu hạn và không trùng nhau.");
  const spec = structuredClone(input);
  if (spec.dimension === "2d") {
    add2d(spec, first, second, lineStyle);
    return validateVisual(spec);
  }
  if (spec.derivedFrom2d) {
    const source = restoreSketch2d(spec);
    const a = planarEndpoint(first, source),
      b = planarEndpoint(second, source);
    if (
      a &&
      b &&
      (spec.derivedFrom2d.mode === "planar" ||
        (!first.free &&
          !second.free &&
          first.edgeIndex === undefined &&
          second.edgeIndex === undefined))
    ) {
      add2d(source, a, b, lineStyle);
      spec.derivedFrom2d.source = source;
      return validateVisual(rebuildSketch3d(spec));
    }
  }
  type Anchor = NonNullable<
    ThreeVisualSpec["objects"][number]["vertexEndpoints"]
  >[number];
  const endpoint = (hit: VertexHit): Anchor => {
    if (hit.free) {
      const existing = spec.objects.find(
        (o) => o.marker && near(o.position, hit.position),
      );
      if (existing) return { objectId: existing.id };
      const id = uid("anchor");
      spec.objects.push({
        id,
        type: "sphere",
        marker: true,
        annotationKind: "vertex",
        position: [...hit.position],
        rotation: [0, 0, 0],
        radius: 0.075,
        label: "Điểm tự do",
        color: "#168265",
        visible: true,
      });
      if (spec.derivedFrom2d) {
        const source = spec.derivedFrom2d.source;
        source.spatialPoints = [
          ...(source.spatialPoints || []),
          { id, position: [...hit.position], color: "#168265" },
        ];
      }
      return { objectId: id };
    }
    return {
      objectId: hit.objectId,
      ...(hit.vertexIndex !== undefined
        ? { vertexIndex: hit.vertexIndex }
        : {}),
      ...(hit.edgeIndex !== undefined
        ? { edgeIndex: hit.edgeIndex, edgeRatio: hit.edgeRatio }
        : {}),
      ...(hit.edgeKey !== undefined ? {edgeKey:hit.edgeKey,edgeRatio:hit.edgeRatio} : {}),
    };
  };
  const endpoints = [endpoint(first), endpoint(second)] as [Anchor, Anchor];
  const same = (a: Anchor, b: Anchor) =>
    a.objectId === b.objectId &&
    a.vertexIndex === b.vertexIndex &&
    a.edgeIndex === b.edgeIndex &&
    a.edgeKey === b.edgeKey &&
    Math.abs((a.edgeRatio || 0) - (b.edgeRatio || 0)) < 1e-6;
  if (
    spec.objects.some(
      (o) =>
        o.vertexEndpoints &&
        endpoints.every((a) => o.vertexEndpoints!.some((b) => same(a, b))),
    )
  )
    throw Error("Hai điểm này đã có đường nối; không tạo nét trùng.");
  if (spec.objects.length >= 120)
    throw Error("Mô hình 3D đã đạt giới hạn 120 đối tượng.");
  const id = uid("join");
  spec.objects.push({
    id,
    type: "curve3d",
    vertexEndpoints: endpoints,
    visible: true,
    marker: false,
    annotationKind: "helper",
    color: "#17835e",
    lineStyle,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  if (spec.derivedFrom2d) {
    const source = spec.derivedFrom2d.source,
      spatial = source.spatialConnections || [];
    if (spatial.length >= 40)
      throw Error("Đã đạt giới hạn 40 đường nối không gian.");
    source.spatialConnections = [
      ...spatial,
      { id, color: "#17835e", lineStyle, endpoints },
    ];
  }
  return validateVisual(spec);
}
