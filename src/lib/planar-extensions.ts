import type { TwoDVisualSpec } from "./contracts";
import {
  constructionPoint,
  type ConstructionKind,
  type Coordinate,
} from "./geometry-construction-point";
export const EXTENDED_PLANAR_TOOLS = {
  vector: { label: "Vectơ", count: 2, help: "Chọn gốc rồi ngọn vectơ." },
  vectorSum: {
    label: "Tổng hai vectơ",
    count: 3,
    help: "Chọn gốc chung, ngọn thứ nhất, ngọn thứ hai.",
  },
  vectorDifference: {
    label: "Hiệu hai vectơ",
    count: 3,
    help: "Chọn gốc chung, ngọn thứ nhất, ngọn thứ hai.",
  },
  parallelogram: {
    label: "Hình bình hành",
    count: 3,
    help: "Chọn ba đỉnh liên tiếp A, B, C.",
  },
  rectangle: {
    label: "Hình chữ nhật",
    count: 3,
    help: "Chọn A, B xác định cạnh; điểm thứ ba xác định chiều cao.",
  },
  rhombus: {
    label: "Hình thoi",
    count: 3,
    help: "Chọn A, B xác định cạnh; điểm thứ ba xác định hướng AD.",
  },
  square: {
    label: "Hình vuông",
    count: 2,
    help: "Chọn hai đầu cạnh AB; dựng về bên trái cạnh.",
  },
  reflectAxis: {
    label: "Đối xứng điểm qua trục",
    count: 3,
    help: "Chọn điểm, rồi hai điểm của trục.",
  },
  reflectCenter: {
    label: "Đối xứng điểm qua tâm",
    count: 2,
    help: "Chọn điểm rồi tâm đối xứng.",
  },
  rotate: {
    label: "Quay điểm",
    count: 2,
    help: "Chọn điểm rồi tâm quay. Nhập góc ở ô Giá trị.",
  },
  dilate: {
    label: "Vị tự điểm",
    count: 2,
    help: "Chọn điểm rồi tâm vị tự. Nhập tỉ số ở ô Giá trị.",
  },
  translate: {
    label: "Tịnh tiến điểm",
    count: 3,
    help: "Chọn điểm, gốc và ngọn vectơ dịch chuyển.",
  },
  lineCircle: {
    label: "Giao đường–tròn",
    count: 4,
    help: "Hai điểm của đường, tâm tròn, điểm trên tròn.",
  },
  circleCircle: {
    label: "Giao hai đường tròn",
    count: 4,
    help: "Tâm và điểm trên tròn thứ nhất, rồi tương tự tròn thứ hai.",
  },
  tangent: {
    label: "Tiếp tuyến từ điểm",
    count: 3,
    help: "Chọn tâm tròn, điểm trên tròn, điểm cần kẻ tiếp tuyến.",
  },
} as const;
const id = () => `ext_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
export function extendPlanarConstruction(
  spec: TwoDVisualSpec,
  tool: string,
  refs: string[],
  coords: Coordinate[],
  factor: number,
  put: (d: Record<string, unknown>) => string,
  label: () => string,
  line: (a: string, b: string) => string,
) {
  const point = (
    kind: ConstructionKind,
    parents: string[],
    positions: Coordinate[],
    parameter: number | string = factor,
  ) => {
    const p = constructionPoint(kind, positions, factor);
    if (!p) throw Error("Điểm trùng hoặc hướng dựng chưa xác định.");
    return {
      id: put({
        id: id(),
        type: "point",
        parents,
        construction: kind,
        constructionFactor: parameter,
        x: p.x,
        y: p.y,
        label: label(),
        annotationKind: "vertex",
      }),
      position: p,
    };
  };
  const polygon = (parents: string[]) =>
    put({ id: id(), type: "polygon", parents });
  if (tool === "vector") {
    if (Math.hypot(coords[1].x - coords[0].x, coords[1].y - coords[0].y) < 1e-8)
      throw Error("Vectơ cần hai điểm phân biệt.");
    put({ id: id(), type: "arrow", parents: refs, label: "u" });
  }
  if (tool === "square") {
    const c = point("square", refs, coords),
      d = point(
        "parallelogram",
        [refs[0], refs[1], c.id],
        [coords[0], coords[1], c.position],
      );
    polygon([refs[0], refs[1], c.id, d.id]);
  }
  if (["parallelogram", "rectangle", "rhombus"].includes(tool)) {
    const [a, b, c] = coords;
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-8)
      throw Error("Ba điểm thẳng hàng, chưa dựng được tứ giác có diện tích.");
    if (tool === "parallelogram") {
      const d = point("parallelogram", refs, coords);
      polygon([...refs, d.id]);
    }
    if (tool === "rectangle") {
      const c = point("rectangle", refs, coords),
        d = point(
          "parallelogram",
          [refs[0], refs[1], c.id],
          [coords[0], coords[1], c.position],
        );
      if (
        Math.hypot(c.position.x - coords[1].x, c.position.y - coords[1].y) <
        1e-8
      )
        throw Error("Chiều cao hình chữ nhật phải khác 0.");
      polygon([refs[0], refs[1], c.id, d.id]);
    }
    if (tool === "rhombus") {
      const d = point("rhombus", refs, coords),
        c = point(
          "vector-sum",
          [refs[0], refs[1], d.id],
          [coords[0], coords[1], d.position],
        );
      polygon([refs[0], refs[1], c.id, d.id]);
    }
  }
  const map: Record<string, ConstructionKind> = {
    vectorSum: "vector-sum",
    vectorDifference: "vector-difference",
    reflectAxis: "reflect-axis",
    reflectCenter: "reflect-center",
    rotate: "rotate",
    dilate: "dilate",
    translate: "translate",
  };
  if (map[tool]) {
    let parameter: number | string = factor;
    if (["rotate", "dilate", "translate"].includes(tool)) {
      if (spec.parameters.length >= 12) throw Error("Bảng đã đủ 12 tham số.");
      parameter = id();
      spec.parameters.push({
        id: parameter,
        label: tool === "rotate" ? "Góc quay (°)" : "Tỉ số k",
        value: factor,
        min: Math.min(tool === "rotate" ? -360 : -5, factor),
        max: Math.max(tool === "rotate" ? 360 : 5, factor),
        step: tool === "rotate" ? 1 : 0.1,
      });
    }
    const p = point(map[tool], refs, coords, parameter);
    if (tool.startsWith("vector"))
      put({
        id: id(),
        type: "arrow",
        parents: [refs[0], p.id],
        label: tool === "vectorSum" ? "u + v" : "u − v",
      });
  }
  if (["lineCircle", "circleCircle", "tangent"].includes(tool)) {
    let intersectionCount = 2;
    const distance = (i: number, j: number) =>
      Math.hypot(coords[i].x - coords[j].x, coords[i].y - coords[j].y);
    if (tool === "lineCircle") {
      const [a, b, c] = coords,
        len = distance(0, 1),
        r = distance(2, 3);
      if (len < 1e-8 || r < 1e-8)
        throw Error("Đường hoặc đường tròn suy biến.");
      const d =
        Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / len;
      if (d > r + 1e-8) throw Error("Đường thẳng không cắt đường tròn.");
      if (Math.abs(d - r) < 1e-8) intersectionCount = 1;
    }
    if (tool === "circleCircle") {
      const r = distance(0, 1),
        s = distance(2, 3),
        d = distance(0, 2);
      if (Math.min(r, s) < 1e-8) throw Error("Bán kính cần lớn hơn 0.");
      if (d < 1e-8 && Math.abs(r - s) < 1e-8)
        throw Error("Hai đường tròn trùng nhau, có vô số giao điểm.");
      if (d > r + s + 1e-8 || d < Math.abs(r - s) - 1e-8 || d < 1e-8)
        throw Error("Hai đường tròn không giao nhau.");
      if (Math.abs(d - r - s) < 1e-8 || Math.abs(d - Math.abs(r - s)) < 1e-8)
        intersectionCount = 1;
    }
    const circle = (a: string, b: string) =>
      put({ id: id(), type: "circle", parents: [a, b], visible: false });
    let parents: string[] = [];
    if (tool === "lineCircle")
      parents = [line(refs[0], refs[1]), circle(refs[2], refs[3])];
    if (tool === "circleCircle")
      parents = [circle(refs[0], refs[1]), circle(refs[2], refs[3])];
    if (tool === "tangent") {
      const r = Math.hypot(
          coords[1].x - coords[0].x,
          coords[1].y - coords[0].y,
        ),
        d = Math.hypot(coords[2].x - coords[0].x, coords[2].y - coords[0].y);
      if (r < 1e-8 || d < r - 1e-8)
        throw Error("Điểm ở trong đường tròn, không có tiếp tuyến thực.");
      if (Math.abs(d - r) < 1e-8)
        put({
          id: id(),
          type: "perpendicular",
          parents: [line(refs[0], refs[2]), refs[2]],
        });
      else {
        const mid = put({
          id: id(),
          type: "midpoint",
          parents: [refs[0], refs[2]],
          visible: false,
        });
        parents = [circle(refs[0], refs[1]), circle(mid, refs[0])];
      }
    }
    if (parents.length)
      for (let i = 0; i < intersectionCount; i++) {
        const cross = put({
          id: id(),
          type: "intersection",
          parents,
          intersectionIndex: i,
          label: label(),
        });
        if (tool === "tangent")
          put({ id: id(), type: "line", parents: [refs[2], cross] });
      }
  }
}
