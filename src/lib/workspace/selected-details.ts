import { compileExpression } from "@/lib/expression";
import type { ReadoutContext, SelectedObjectDetails } from "./readout-types";
export function getSelectedDetails({
  selectedObject,
  visual,
  visualState,
}: Pick<
  ReadoutContext,
  "selectedObject" | "visual" | "visualState"
>): SelectedObjectDetails | null {
  if (!selectedObject || !visual) return null;
  const liveSelection = selectedObject;
  if (!liveSelection) return null;
  if (liveSelection.details?.length) {
    return {
      title: liveSelection.label,
      kind: liveSelection.kind || "Đối tượng đang chọn",
      details: liveSelection.details,
      position: null,
      editable: false,
    };
  }
  const current = visualState?.objects || {};
  const point = (id: string) => {
    const value = current[id];
    if (value && typeof value.x === "number" && typeof value.y === "number")
      return { x: value.x, y: value.y };
    if (visual.dimension === "2d") {
      const source = visual.objects.find((object) => object.id === id);
      if (
        source &&
        typeof source.x === "number" &&
        typeof source.y === "number"
      )
        return { x: source.x, y: source.y };
    }
    return null;
  };
  const number = (value: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
  const parentLabels = selectedObject.parents.map((id) => {
    const parent =
      visual.dimension === "2d"
        ? visual.objects.find((object) => object.id === id)
        : undefined;
    return parent?.label || id;
  });
  const parentPoints = selectedObject.parents.map(point);
  if (
    selectedObject.type === "polygon" &&
    parentPoints.length >= 3 &&
    parentPoints.every(Boolean)
  ) {
    const vertices = parentPoints as Array<{ x: number; y: number }>;
    const perimeter = vertices.reduce((sum, vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + Math.hypot(next.x - vertex.x, next.y - vertex.y);
    }, 0);
    const area =
      Math.abs(
        vertices.reduce((sum, vertex, index) => {
          const next = vertices[(index + 1) % vertices.length];
          return sum + vertex.x * next.y - next.x * vertex.y;
        }, 0),
      ) / 2;
    return {
      title: selectedObject.label,
      kind: "Đa giác đang chọn",
      details: [
        `${vertices.length} đỉnh: ${parentLabels.join(", ")}`,
        `Chu vi: ${number(perimeter)}`,
        `Diện tích: ${number(area)}`,
      ],
      position: null,
      editable: false,
    };
  }
  if (selectedObject.type === "circle") {
    const center = parentPoints[0],
      radiusPoint = parentPoints[1];
    const circle =
      visual.dimension === "2d"
        ? visual.objects.find((o) => o.id === selectedObject.id)
        : undefined;
    let radius = NaN;
    try {
      const params = Object.fromEntries(
        visual.parameters.map((p) => [
          p.id,
          visualState?.parameters[p.id] ?? p.value,
        ]),
      );
      radius =
        circle?.radius !== undefined
          ? Math.abs(
              typeof circle.radius === "number"
                ? circle.radius
                : compileExpression(circle.radius, Object.keys(params))(params),
            )
          : center && radiusPoint
            ? Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y)
            : NaN;
    } catch {
      /* Invalid expressions never execute as JavaScript. */
    }
    if (center && Number.isFinite(radius)) {
      return {
        title: selectedObject.label,
        kind: "Đường tròn đang chọn",
        details: [
          `Tâm: (${number(center.x)}; ${number(center.y)})`,
          `Bán kính R = ${number(radius)}`,
          `Đường kính = ${number(2 * radius)}`,
          `Chu vi = ${number(2 * Math.PI * radius)}`,
          `Diện tích = ${number(Math.PI * radius * radius)}`,
        ],
        position: null,
        editable: false,
      };
    }
    return {
      title: selectedObject.label,
      kind: "Đường tròn đang chọn",
      details: [
        "Chưa xác định được tâm hoặc bán kính hợp lệ. Kiểm tra điểm tham chiếu và tham số.",
      ],
      position: null,
      editable: false,
    };
  }
  if (
    selectedObject.type === "arrow" ||
    selectedObject.type === "segment" ||
    selectedObject.type === "line"
  ) {
    const start = point(selectedObject.parents[0]),
      end = point(selectedObject.parents[1]);
    if (start && end) {
      const dx = end.x - start.x,
        dy = end.y - start.y;
      const magnitude = number(Math.hypot(dx, dy));
      const details = [
        `Điểm đầu: (${number(start.x)}; ${number(start.y)})`,
        `Điểm cuối: (${number(end.x)}; ${number(end.y)})`,
        `Thành phần: (${number(dx)}; ${number(dy)})`,
      ];
      if (selectedObject.type === "arrow")
        details.push(`Độ lớn |${selectedObject.label}| = ${magnitude}`);
      if (selectedObject.type === "segment")
        details.push(`Độ dài = ${magnitude}`);
      return {
        title: selectedObject.label,
        kind:
          selectedObject.type === "arrow"
            ? "Vectơ"
            : selectedObject.type === "segment"
              ? "Đoạn thẳng"
              : "Đường thẳng · vectơ chỉ phương",
        details,
        position: null,
        editable: false,
      };
    }
  }
  if (
    selectedObject.type === "parallel" ||
    selectedObject.type === "perpendicular"
  )
    return {
      title: selectedObject.label,
      kind:
        selectedObject.type === "parallel"
          ? "Đường song song"
          : "Đường vuông góc",
      details: [
        `Quan hệ với ${parentLabels[0] || "đường tham chiếu"}`,
        `Đi qua ${parentLabels[1] || "điểm được chọn"}`,
      ],
      position: null,
      editable: false,
    };
  if (selectedObject.type === "functionGraph" && visual.dimension === "2d") {
    const graph = visual.objects.find(
      (object) => object.id === selectedObject.id,
    );
    return {
      title: selectedObject.label,
      kind: "Đồ thị hàm số",
      details: [
        `${graph?.label || "f(x)"} = ${graph?.expression || "biểu thức"}`,
        "Dùng các thanh tham số để thay đổi hệ số và quan sát đồ thị.",
      ],
      position: null,
      editable: false,
    };
  }
  const position = point(selectedObject.id);
  return {
    title: selectedObject.label,
    kind:
      selectedObject.type === "point" || selectedObject.type === "glider"
        ? "Điểm đang chọn"
        : "Đối tượng đang chọn",
    details: position
      ? [`Tọa độ: (${number(position.x)}; ${number(position.y)})`]
      : ["Đối tượng được làm nổi bật trên hình."],
    position,
    editable: selectedObject.editable && !!position,
  };
}
