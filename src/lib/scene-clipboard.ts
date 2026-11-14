import type { VisualSpec } from "./contracts";
import { validateVisual } from "./validation";
import { uid } from "./drawing-id";
export function copySceneObjects(
  scene: VisualSpec,
  selection: string[],
): VisualSpec {
  const selected = new Set(
    selection.length ? selection : scene.objects.map((o) => o.id),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of scene.objects)
      if (selected.has(o.id)) {
        const refs =
          "parents" in o
          ? [...o.parents,...(o.tangentOf?[o.tangentOf.sourceId]:[])]
            : [
                ...(o.vertexEndpoints?.map((a) => a.objectId) || []),
                ...(o.spatialConstruction?.inputs.flatMap((p) =>
                  p.anchor ? [p.anchor.objectId] : [],
                ) || []),
                ...(o.spatialConstruction?.sourceId
                  ? [o.spatialConstruction.sourceId]
                  : []),
                ...(o.net ? [o.net.sourceId] : []),
              ];
        for (const id of refs)
          if (!selected.has(id)) {
            selected.add(id);
            grew = true;
          }
      }
  }
  return {
    ...structuredClone(scene),
    objects: scene.objects.filter((o) => selected.has(o.id)),
    boardItems: selection.length ? [] : scene.boardItems,
  } as VisualSpec;
}
export function pasteSceneObjects(
  target: VisualSpec,
  clipboard: VisualSpec,
): VisualSpec {
  if (target.dimension !== clipboard.dimension)
    throw Error("Chuyển bảng về cùng chế độ 2D/3D trước khi dán hình.");
  const source = validateVisual(clipboard),
    ids = new Map(
      [
        ...source.objects,
        ...source.parameters,
        ...(source.boardItems || []),
      ].map((o) => [o.id, uid()]),
    );
  const parameterIds = source.parameters.map((p) => p.id);
  const expression = (s: string) =>
    s.replace(/[a-zA-Z_]\w*/g, (n) =>
      parameterIds.includes(n) ? ids.get(n)! : n,
    );
  const remap = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map((v) => remap(v, key));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, remap(v, k)]),
      );
    if (typeof value === "string") {
      if (
        [
          "expression",
          "expressionY",
          "constructionFactor",
          "x",
          "y",
          "radius",
        ].includes(key)
      )
        return expression(value);
      if (
        [
          "id",
          "parents",
          "objectId",
          "sourceId",
          "parameter",
            "angleParameter",
          "parameterBindings",
          "size",
          "height",
          "depth",
          "positionX",
          "positionY",
          "positionZ",
          "rotationX",
          "rotationY",
          "rotationZ",
          "sides",
        ].includes(key)
      )
        return ids.get(value) || value;
    }
    return value;
  };
  const objects = remap(source.objects) as VisualSpec["objects"],
    parameters = remap(source.parameters) as VisualSpec["parameters"],
    items = remap(source.boardItems || []) as NonNullable<
      VisualSpec["boardItems"]
    >;
  return validateVisual({
    ...target,
    parameters: [...target.parameters, ...parameters],
    objects: [...target.objects, ...objects],
    boardItems: [
      ...(target.boardItems || []),
      ...items.map((i) => ({ ...i, x: i.x + 25, y: i.y + 25 })),
    ],
  });
}
