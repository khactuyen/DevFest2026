import { ObjectSchema, type TwoDVisualSpec } from "./contracts";
import { uid } from "./drawing-id";
import {
  constructionPoint,
  type ConstructionKind,
} from "./geometry-construction-point";
import { validateVisual } from "./validation";
export type PlanarTransform =
  "rotate" | "dilate" | "translate" | "reflect-axis" | "reflect-center";
export function transformPlanarObject(
  scene: TwoDVisualSpec,
  id: string,
  kind: PlanarTransform,
  center: [number, number],
  amount: number,
  delta: [number, number],
  positions: Record<string, { x?: number; y?: number; visible?: boolean }>,
): TwoDVisualSpec {
  const source = scene.objects.find((o) => o.id === id);
  if (
    !source ||
    ![
      "point",
      "midpoint",
      "intersection",
      "projection",
      "glider",
      "segment",
      "line",
      "arrow",
      "circle",
      "polygon",
    ].includes(source.type)
  )
    throw Error(
      "Chọn điểm, đoạn, đường, vectơ, đa giác hoặc đường tròn cần biến hình.",
    );
  if (
    [...center, ...delta, amount].some(
      (n) => !Number.isFinite(n) || Math.abs(n) > 1e4,
    )
  )
    throw Error("Thông số biến hình không hợp lệ.");
  if (kind === "dilate" && amount === 0) throw Error("Tỉ số vị tự cần khác 0.");
  const next = structuredClone(scene),
    add = (o: Record<string, unknown>) => {
      const obj = ObjectSchema.parse({ id: uid(), color: source.color, ...o });
      next.objects.push(obj);
      return obj.id;
    };
  const origin = add({
      type: "point",
      x: center[0],
      y: center[1],
      visible: false,
    }),
    originPosition = { x: center[0], y: center[1] };
  const otherPosition =
    kind === "reflect-axis"
      ? {
          x: center[0] + Math.cos((amount * Math.PI) / 180),
          y: center[1] + Math.sin((amount * Math.PI) / 180),
        }
      : { x: center[0] + delta[0], y: center[1] + delta[1] };
  const other = ["reflect-axis", "translate"].includes(kind)
    ? add({ type: "point", ...otherPosition, visible: false })
    : null;
  let factor: number | string = amount;
  if (["rotate", "dilate", "translate"].includes(kind)) {
    if (next.parameters.length >= 12) throw Error("Bảng đã đủ 12 tham số.");
    factor = uid();
    next.parameters.push({
      id: factor,
      label: kind === "rotate" ? "Góc quay (°)" : "Hệ số biến hình",
      min: kind === "rotate" ? Math.min(-360, amount) : Math.min(-5, amount),
      max: kind === "rotate" ? Math.max(360, amount) : Math.max(5, amount),
      value: amount,
      step: kind === "rotate" ? 1 : 0.1,
    });
  }
  const transformed = new Map<string, string>();
  const transformPoint = (id: string) => {
    if (transformed.has(id)) return transformed.get(id)!;
    const p = positions[id];
    if (p?.x === undefined || p.y === undefined)
      throw Error(
        "Không đọc được tọa độ nguồn. Chờ bảng hiển thị xong rồi thử lại.",
      );
    const parents = [id, origin, ...(other ? [other] : [])],
      point = constructionPoint(
        kind as ConstructionKind,
        [{ x: p.x, y: p.y }, originPosition, ...(other ? [otherPosition] : [])],
        amount,
      );
    if (!point) throw Error("Phép biến hình chưa xác định.");
    const original = scene.objects.find((o) => o.id === id);
    const target = add({
      type: "point",
      parents,
      construction: kind,
      constructionFactor: factor,
      ...point,
      label: original?.label ? `${original.label}′` : "",
      annotationKind: "vertex",
    });
    transformed.set(id, target);
    return target;
  };
  if (
    ["point", "midpoint", "intersection", "projection", "glider"].includes(
      source.type,
    )
  )
    transformPoint(id);
  else {
    const parents = source.parents.map(transformPoint),
      radius =
        source.radius !== undefined && kind === "dilate"
          ? `abs(${factor})*(${source.radius})`
          : source.radius;
    add({
      ...source,
      id: uid(),
      parents,
      radius,
      constraint: undefined,
      measurement: undefined,
      edgeStyles: undefined,
      label: source.label ? `${source.label}′` : "",
    });
  }
  return validateVisual(next) as TwoDVisualSpec;
}
