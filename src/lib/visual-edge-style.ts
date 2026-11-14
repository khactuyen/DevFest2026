import { VisualSpecSchema, type VisualSpec } from "./contracts";
import type { VisualSelection } from "./runtime";
import { supportsCircularEdge } from "./circular-edge";
import { findVisualObject, projectedObjects } from "./projected-objects";

export type StrokePatch = {
  color?: string;
  strokeWidth?: number;
  hidden?: boolean;
  lineStyle?: "solid" | "dashed";
};
const lineTypes = new Set([
  "line",
  "segment",
  "arrow",
  "circle",
  "polygon",
  "parallel",
  "perpendicular",
  "functionGraph",
  "verticalMarker",
  "horizontalMarker",
  "curve3d",
  "edge",
]);
export function canStyleEdge(selection: VisualSelection) {
  return (
    lineTypes.has(selection.type) &&
    (selection.type !== "polygon" || selection.edgeIndex !== undefined)
  );
}
export function selectedEdgeStyle(
  spec: VisualSpec,
  selection: VisualSelection,
): { color: string; strokeWidth: number; lineStyle: "solid" | "dashed" } {
  const object = findVisualObject(spec, selection.id);
  const edge =
    selection.edgeIndex === undefined
      ? undefined
      : object?.edgeStyles?.find((s) =>
          selection.edgeKey
            ? s.edgeKey === selection.edgeKey
            : !s.edgeKey &&
              s.edgeIndex === selection.edgeIndex &&
              s.edgePart === (selection.edgePart || 0),
        );
  return {
    color: edge?.color || object?.color || "#168265",
    strokeWidth: edge?.strokeWidth || object?.strokeWidth || 2.25,
    lineStyle: edge?.lineStyle || object?.lineStyle || "solid",
  };
}
function patchObject<
  T extends {
    color?: string;
    strokeWidth?: number;
    lineStyle?: "solid" | "dashed";
    edgeStyles?: Array<{
      edgeIndex: number;
      edgePart: number;
      edgeKey?: VisualSelection["edgeKey"];
      hidden?: boolean;
      color?: string;
      strokeWidth?: number;
      lineStyle?: "solid" | "dashed";
    }>;
  },
>(object: T, selection: VisualSelection, patch: StrokePatch) {
  if (selection.edgeIndex === undefined) Object.assign(object, patch);
  else {
    const part = selection.edgePart || 0;
    const old = object.edgeStyles?.find((s) =>
      selection.edgeKey
        ? s.edgeKey === selection.edgeKey
        : !s.edgeKey &&
          s.edgeIndex === selection.edgeIndex &&
          s.edgePart === part,
    );
    object.edgeStyles = [
      ...(object.edgeStyles || []).filter((s) => s !== old),
      {
        ...old,
        edgeIndex: selection.edgeIndex,
        edgePart: part,
        ...(selection.edgeKey ? { edgeKey: selection.edgeKey } : {}),
        ...patch,
      },
    ];
  }
}
/** Appearance only: never create geometry, change constraints, or recolor a solid's faces. */
export function styleVisualEdge(
  input: VisualSpec,
  selection: VisualSelection,
  patch: StrokePatch,
): VisualSpec {
  if (!canStyleEdge(selection))
    throw Error("Hãy chọn một cạnh hoặc đường để đổi kiểu nét.");
  if (
    (patch.lineStyle !== undefined && !["solid", "dashed"].includes(patch.lineStyle)) ||
    (patch.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(patch.color)) ||
    (patch.strokeWidth !== undefined &&
      (!Number.isFinite(patch.strokeWidth) ||
        patch.strokeWidth < 1 ||
        patch.strokeWidth > 10))
  )
    throw Error("Màu hoặc độ dày cạnh không hợp lệ.");
  const next = structuredClone(input);
  const object = findVisualObject(next, selection.id);
  if (!object) throw Error("Cạnh đã chọn không còn tồn tại.");
  if (
    selection.edgeKey &&
    ("parents" in object ||
      !supportsCircularEdge(
        object.type,
        selection.edgeKey,
      ))
  )
    throw Error("Viền tròn không thuộc đối tượng đã chọn.");
  if (patch.hidden !== undefined && !isConstituentEdge(input,selection))
    throw Error("Chỉ ẩn cạnh thành phần; đường độc lập có thể xóa trực tiếp.");
  if (
    selection.edgeIndex !== undefined &&
    (!Number.isInteger(selection.edgeIndex) ||
      selection.edgeIndex < 0 ||
      selection.edgeIndex > 65535 ||
      ("parents" in object &&
        (object.type !== "polygon" ||
          selection.edgeIndex >= object.parents.length ||
          selection.edgePart)))
  )
    throw Error("Cạnh đã chọn không hợp lệ.");
  patchObject(object, selection, patch);
  if (next.dimension === "3d" && next.derivedFrom2d) {
    const source = next.derivedFrom2d.source;
    const sourceId = object.id.replace(/^(?:curve|edge)_/, "");
    const planar =
      object.type === "curve3d" &&
      /^(curve|edge)_/.test(object.id) &&
      source.objects.find((o) => o.id === sourceId);
    if (planar) patchObject(planar, selection, patch);
    else {
      const connection = source.spatialConnections?.find(
        (c) => c.id === object.id,
      );
      if (connection && selection.edgeIndex === undefined)
        Object.assign(connection, patch);
      const previous = source.spatialStyles?.find(
        (s) => s.objectId === object.id,
      );
      source.spatialStyles = [
        ...(source.spatialStyles || []).filter((s) => s !== previous),
        {
          ...previous,
          objectId: object.id,
          color: object.color,
          strokeWidth: object.strokeWidth,
          lineStyle: object.lineStyle,
          edgeStyles: object.edgeStyles,
        },
      ];
    }
  }
  return VisualSpecSchema.parse(next);
}

export function isConstituentEdge(
  spec: VisualSpec,
  selection: VisualSelection | null,
) {
  if (!selection || selection.edgeIndex === undefined) return false;
  const object = findVisualObject(spec, selection.id);
  if (object?.type === "curve3d" && (object.vertexEndpoints || object.points3d?.length === 2)) return false;
  return (
    !!object &&
    (object.type === "polygon" ||
      (!("parents" in object) &&
        !["label3d", "slicePlane"].includes(object.type)))
  );
}
export function hiddenEdgeCount(spec: VisualSpec) {
  const objects = spec.dimension === "2d" ? [...spec.objects, ...projectedObjects(spec)] : spec.objects;
  return objects.reduce(
    (count, o) => count + (o.edgeStyles?.filter((s) => s.hidden).length || 0),
    0,
  );
}
/** Restore visibility only; colors, widths, topology and connection anchors remain intact. */
export function restoreHiddenEdges(input: VisualSpec): VisualSpec {
  const next = structuredClone(input);
  const restore = (
    objects: Array<{ edgeStyles?: Array<{ hidden?: boolean }> }>,
  ) =>
    objects.forEach((o) =>
      o.edgeStyles?.forEach((s) => {
        delete s.hidden;
      }),
    );
  restore(next.objects);
  if (next.dimension === "2d") restore(projectedObjects(next));
  if (next.dimension === "3d" && next.derivedFrom2d) {
    restore(next.derivedFrom2d.source.objects);
    restore(next.derivedFrom2d.source.spatialStyles || []);
  }
  return VisualSpecSchema.parse(next);
}
