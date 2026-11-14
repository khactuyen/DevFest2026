import type { TwoDVisualSpec, VisualSpec } from "./contracts";

export function projectedObjects(spec: TwoDVisualSpec) {
  return spec.savedNative3d?.objects ?? spec.savedSpatialObjects ?? [];
}

export function findVisualObject(spec: VisualSpec, id: string) {
  return spec.objects.find((object) => object.id === id) ??
    (spec.dimension === "2d" ? projectedObjects(spec).find((object) => object.id === id) : undefined);
}

export function removeProjectedObjects(spec: TwoDVisualSpec, targets: string[]) {
  const objects = projectedObjects(spec);
  const removed = new Set(targets);
  const referencesRemoved = (id: string) => removed.has(id);
  let previousSize = 0;
  while (previousSize !== removed.size) {
    previousSize = removed.size;
    for (const connection of spec.spatialConnections ?? []) {
      if (connection.endpoints.some((point) => referencesRemoved(point.objectId))) {
        removed.add(connection.id);
      }
    }
    for (const object of objects) {
      const construction = object.spatialConstruction;
      if (
        object.vertexEndpoints?.some((point) => referencesRemoved(point.objectId)) ||
        construction?.inputs.some((point) => point.anchor && referencesRemoved(point.anchor.objectId)) ||
        (construction?.sourceId && referencesRemoved(construction.sourceId)) ||
        (object.net && referencesRemoved(object.net.sourceId))
      ) removed.add(object.id);
    }
  }
  const remaining = objects.filter((object) => !removed.has(object.id));
  return {
    spec: {
      ...spec,
      spatialConnections: spec.spatialConnections?.filter((connection) => !removed.has(connection.id)),
      spatialStyles: spec.spatialStyles?.filter((style) => !removed.has(style.objectId)),
      ...(spec.savedNative3d
        ? { savedNative3d: remaining.length ? { ...spec.savedNative3d, objects: remaining } : undefined }
        : { savedSpatialObjects: remaining }),
    },
    count: objects.length - remaining.length +
      (spec.spatialConnections?.filter((connection) => removed.has(connection.id)).length ?? 0),
  };
}
