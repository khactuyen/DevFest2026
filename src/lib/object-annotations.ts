import type { VisualSpec } from "./contracts";
import type { VisualSelection } from "./runtime";
import { validateVisual } from "./validation";
import { findVisualObject } from "./projected-objects";

type Annotation = { label?: string; measurement?: string; note?: string };
type AnnotatedObject = VisualSpec["objects"][number];

export function edgeAnnotation(object: AnnotatedObject, selection: Pick<VisualSelection, "edgeIndex" | "edgePart" | "edgeKey">) {
  return object.edgeStyles?.find((style) => selection.edgeKey
    ? style.edgeKey === selection.edgeKey
    : !style.edgeKey && style.edgeIndex === selection.edgeIndex && style.edgePart === (selection.edgePart ?? 0));
}

export function selectedAnnotation(object: AnnotatedObject, selection: VisualSelection): Annotation {
  if (selection.vertexIndex !== undefined && !("parents" in object))
    return object.vertexAnnotations?.[selection.vertexIndex] ?? {};
  if (selection.edgeIndex !== undefined) return edgeAnnotation(object, selection) ?? {};
  return object;
}

export function annotationCaption({ label, measurement }: Annotation) {
  return label && measurement ? `${label} = ${measurement}` : label || measurement || "";
}

export function editObjectAnnotation(input: VisualSpec, selection: VisualSelection, fields: Annotation): VisualSpec {
  const next = structuredClone(input);
  const object = findVisualObject(next, selection.id);
  if (!object) throw Error("Đối tượng đã chọn không còn trên bảng.");
  function apply(target: AnnotatedObject) {
    if (selection.vertexIndex !== undefined && !("parents" in target)) {
      const annotations = { ...target.vertexAnnotations };
      if (fields.label || fields.note) annotations[selection.vertexIndex] = fields;
      else delete annotations[selection.vertexIndex];
      target.vertexAnnotations = Object.keys(annotations).length ? annotations : undefined;
    } else if (selection.edgeIndex !== undefined) {
      const previous = edgeAnnotation(target, selection);
      const edge = {
        edgeIndex: selection.edgeIndex, edgePart: selection.edgePart ?? 0, edgeKey: selection.edgeKey,
        ...previous, ...fields,
      };
      const rest = (target.edgeStyles ?? []).filter((style) => style !== previous);
      if (edge.label || edge.measurement || edge.note || edge.hidden || edge.lineStyle || edge.color || edge.strokeWidth)
        rest.push(edge);
      target.edgeStyles = rest.length ? rest : undefined;
    } else {
      Object.assign(target, fields);
      if (target.type === "label3d") target.text = fields.label || target.text;
      else target.showAnnotationLabel = Boolean(fields.label || fields.measurement);
    }
  }
  apply(object);
  if (next.dimension === "3d" && !("parents" in object) && object.marker && selection.vertexIndex === undefined) {
    const pairedId = object.id.startsWith("point_") ? object.id.replace(/^point_/, "label_")
      : /^vertex_\d+$/.test(object.id) ? object.id.replace(/^vertex_/, "name_") : undefined;
    const pair = next.objects.find((candidate) => candidate.id === pairedId && candidate.type === "label3d");
    if (pair) {
      pair.visible = Boolean(fields.label);
      pair.text = fields.label || pair.text;
      pair.label = fields.label;
      object.showAnnotationLabel = false;
    }
  }
  if (next.dimension === "3d" && next.derivedFrom2d && !("parents" in object)) {
    const plane = next.derivedFrom2d.source;
    const sourceId = object.id.replace(/^(?:curve|edge|point)_/, "");
    const source = sourceId !== object.id && plane.objects.find((candidate) => candidate.id === sourceId);
    const connection = plane.spatialConnections?.find((candidate) => candidate.id === object.id);
    if (source && selection.vertexIndex === undefined && (selection.edgeIndex === undefined || source.type === "polygon")) {
      apply(source);
    } else if (connection && selection.edgeIndex === undefined) {
      Object.assign(connection, fields, { showAnnotationLabel: object.showAnnotationLabel });
    } else if (!object.userCreated) {
      const previous = plane.spatialStyles?.find((style) => style.objectId === object.id);
      plane.spatialStyles = [...(plane.spatialStyles ?? []).filter((style) => style !== previous), {
        ...previous, objectId: object.id, edgeStyles: object.edgeStyles, vertexAnnotations: object.vertexAnnotations,
        ...(selection.vertexIndex === undefined && selection.edgeIndex === undefined && {
          ...fields, showAnnotationLabel: object.showAnnotationLabel,
        }),
      }];
    }
  }
  return validateVisual(next);
}
