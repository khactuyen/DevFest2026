import type { ThreeVisualSpec } from "./contracts";
import type { VisualSelection } from "./runtime";

const solidTypes = new Set([
  "box",
  "tetrahedron",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  "prism",
  "pyramid",
  "cylinder",
  "cone",
  "sphere",
  "extrudedPolygon",
  "polyhedron3d",
]);

export function wholeSolidSelection(
  spec: ThreeVisualSpec,
  selection: VisualSelection,
): VisualSelection | null {
  const object = spec.objects.find((item) => item.id === selection.id);
  if (!object || !object.visible || object.marker || !solidTypes.has(object.type)) return null;
  return {
    id: object.id,
    type: object.type,
    label: object.label || object.id,
    parents: [],
    editable: false,
    kind: "Khối 3D",
  };
}

export function resolveSolidSelection(
  spec: ThreeVisualSpec,
  hit: VisualSelection,
  previous: VisualSelection | null,
): VisualSelection {
  const whole = wholeSolidSelection(spec, hit);
  return whole && previous?.id !== hit.id ? whole : hit;
}
