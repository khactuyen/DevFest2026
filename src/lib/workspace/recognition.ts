import type { ReadoutContext, RecognizedVisualSummary } from "./readout-types";
export function getRecognizedVisualSummary({
  analysisResult,
  values,
}: Pick<
  ReadoutContext,
  "analysisResult" | "values"
>): RecognizedVisualSummary | null {
  const analyzedVisual = analysisResult?.visual;
  if (analyzedVisual?.dimension === "3d") {
    const parameters = analyzedVisual.parameters;
    return {
      entities: [
        ...analyzedVisual.objects.map((object) => ({
          id: object.id,
          kind: object.marker
            ? "point"
            : object.type === "label3d"
              ? "label"
              : object.type === "slicePlane"
                ? "relation"
                : "shape",
          label: `${object.label || object.id}: ${object.marker ? "điểm" : object.type === "label3d" ? "nhãn" : object.type === "curve3d" ? "đường/cạnh" : object.type === "face3d" ? "mặt" : object.type === "slicePlane" ? "mặt phẳng điều khiển" : "khối 3D"}`,
        })),
        ...parameters.map((parameter) => ({
          id: parameter.id,
          kind: "parameter",
          label: `${parameter.label} = ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(values[parameter.id] ?? parameter.value)}`,
        })),
      ],
      objectCount: analyzedVisual.objects.length,
      freePointCount: 0,
      parameterCount: parameters.length,
    };
  }
  if (!analysisResult?.program || analyzedVisual?.dimension !== "2d")
    return null;
  const freePoints = analyzedVisual.objects
    .filter((item) => item.type === "point" && item.free)
    .map((item) => item.label || item.id);
  const graph = analyzedVisual.objects.find(
    (item) => item.type === "functionGraph",
  );
  const projection = analyzedVisual.objects.find(
    (item) => item.type === "projection",
  );
  const projectionLine = projection
    ? analyzedVisual.objects.find((item) => item.id === projection.parents[1])
    : undefined;
  const altitude = projection
    ? analyzedVisual.objects.find(
        (item) =>
          item.type === "segment" && item.parents.includes(projection.id),
      )
    : undefined;
  const primaryShape = analyzedVisual.objects.find(
    (item) => item.type === "polygon",
  );
  const rectangle = analysisResult.program.primitives.find(
    (item) => item.op === "rectangle",
  );
  const perpendicular = analyzedVisual.objects.find(
    (item) => item.type === "perpendicular",
  );
  const intersections = analyzedVisual.objects.filter(
    (item) => item.type === "intersection",
  );
  const parameters = analysisResult.program.parameters;
  return {
    entities: [
      primaryShape
        ? { kind: "shape", label: primaryShape.label || "Đa giác" }
        : null,
      rectangle
        ? { kind: "relation", label: "ABCD là hình chữ nhật · AB > BC" }
        : null,
      freePoints.length
        ? { kind: "point", label: `${freePoints.join(", ")}: điểm tự do` }
        : null,
      graph
        ? {
            kind: "function",
            label: `${graph.label || "f(x)"} = ${graph.expression || "hàm số"}`,
          }
        : null,
      ...parameters.map((parameter) => ({
        kind: "parameter",
        label: `${parameter.label} = ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(values[parameter.id] ?? parameter.value)}`,
      })),
      projectionLine
        ? {
            kind: "line",
            label: `${projectionLine.label || projectionLine.id}: đường thẳng`,
          }
        : null,
      projection
        ? {
            kind: "projection",
            label: `${projection.label || projection.id}: hình chiếu`,
          }
        : null,
      altitude && projectionLine
        ? {
            kind: "relation",
            label: `${altitude.label || altitude.id} ⟂ ${projectionLine.label || projectionLine.id}`,
          }
        : null,
      perpendicular
        ? {
            kind: "relation",
            label: `${perpendicular.label || "Đường dựng"}: đi qua B và vuông góc AC`,
          }
        : null,
      ...intersections.map((item) => ({
        kind: "projection",
        label: `${item.label || item.id}: giao điểm được dựng phụ thuộc`,
      })),
    ].filter(Boolean) as Array<{ kind: string; label: string }>,
    objectCount: analyzedVisual.objects.length,
    freePointCount: freePoints.length,
    parameterCount: parameters.length,
  };
}
