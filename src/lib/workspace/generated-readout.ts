import {
  CYLINDER_DIMENSIONS_KEY,
  cylinderSourceReadout,
} from "@/lib/cylinder-problem-visual";
import { polynomialCoefficients } from "@/lib/expression";
import { getModelReadout, type ModelReadout } from "@/lib/model-inspector";
import { deriveTetrahedronResult } from "@/lib/tetrahedron-problem";
import { TUNNEL_NOTE } from "@/lib/tunnel-visual";
import type { ReadoutContext } from "./readout-types";
export function getGeneratedReadout({
  analysisResult,
  selectedCircle,
  selectedObject,
  selectedSourceObject,
  selectedPolygon,
  source2d,
  sourceGraph,
  values,
  visual,
  visualState,
}: Pick<
  ReadoutContext,
  | "analysisResult"
  | "selectedCircle"
  | "selectedObject"
  | "selectedSourceObject"
  | "selectedPolygon"
  | "source2d"
  | "sourceGraph"
  | "values"
  | "visual"
  | "visualState"
>): ModelReadout | null {
  if (!visual) return null;
  if(visual.dimension==="3d" && (!visual.source || visual.source.key==="manual-3d" || visual.objects.some(o=>o.userCreated || o.spatialConstruction || o.net))){const solids=visual.objects.filter(o=>!o.marker&&!["label3d","curve3d","face3d","slicePlane"].includes(o.type)),constructions=visual.objects.filter(o=>o.spatialConstruction||o.net);return {heading:"Không gian dựng hình 3D",formula:`${solids.length} khối · ${constructions.length} đối tượng dựng phụ thuộc`,metrics:[{label:"Đối tượng",value:String(visual.objects.length)},{label:"Tham số",value:String(visual.parameters.length)}],observations:["Chọn khối, mặt hoặc cạnh để đọc thông tin tương ứng.","Đối tượng phụ thuộc cập nhật khi nguồn thay đổi; cấu hình suy biến cần được kiểm tra lại."],focus:solids.slice(0,5).map(o=>({label:o.label||o.type,targets:[o.id]}))};}
  if (source2d?.source?.key === CYLINDER_DIMENSIONS_KEY)
    return cylinderSourceReadout(source2d);
  if (visual.source?.key === "tunnel-parabolic")
    return {
      heading: "Đường hầm có mặt cắt parabol",
      formula: "BE = BG · SH = 2EH",
      metrics:
        visual.dimension === "3d"
          ? visual.objects
              .filter(
                (o) =>
                  o.annotationKind === "length" && o.id.startsWith("length_"),
              )
              .map((o) => ({ label: "Số đo đề cho", value: o.text || "" }))
          : [],
      observations: [
        "Mái là đường cong parabol, không phải các đoạn thẳng nối S, E và G.",
        TUNNEL_NOTE,
      ],
      focus:
        visual.dimension === "3d"
          ? [
              {
                label: "Thiết diện BEG",
                targets: ["section_roof", "section_BE", "section_BG"],
              },
            ]
          : [],
      note: TUNNEL_NOTE,
    };
  if (source2d?.id === "solve_triangle_median")
    return {
      heading: "Tam giác cân và trung điểm",
      formula: source2d.objects.find((o) => o.id === "given_sides")?.text || "",
      metrics: [],
      observations: [
        "Vạch giống nhau biểu thị hai đoạn bằng nhau; AM là đường cần xét.",
        "Đề không cho số đo cạnh. Kích thước bố trí trên bảng không phải độ dài đề bài; không đánh dấu trước kết luận vuông góc.",
      ],
      focus: [],
      note: "Tỉ lệ hiển thị chỉ thay đổi kích thước minh họa, không thêm dữ kiện số.",
    };
  const number = (value: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
      Math.abs(value) < 1e-8 ? 0 : value,
    );
  const primaryShapes =
    source2d?.objects.filter(
      (o) =>
        o.visible && ["circle", "polygon", "functionGraph"].includes(o.type),
    ) || [];
  const recognizedSelection =
    selectedSourceObject &&
    ["circle", "polygon", "functionGraph"].includes(selectedSourceObject.type);
  if (
    source2d &&
    (visual.source?.key === "generated" ||
      (visual.dimension === "3d" && visual.derivedFrom2d)) &&
    !recognizedSelection &&
    primaryShapes.length > 1
  ) {
    return {
      heading: "Nhiều đối tượng trên bảng",
      formula: "",
      metrics: [
        { label: "Hình/đồ thị đã dựng", value: String(primaryShapes.length) },
      ],
      observations: [
        "Chọn riêng một hình để xem công thức, số đo và kiến thức liên quan.",
      ],
      focus: [],
      note: "Không gán công thức của một hình cho toàn bộ bản vẽ hoặc khối 3D.",
    };
  }
  if (visual.dimension === "3d" && visual.source?.key === "geometry-problem") {
    const givenAngles = visual.objects.filter(
      (object) =>
        object.annotationKind === "angle" &&
        object.type === "curve3d" &&
        !object.id.startsWith("dihedral_"),
    );
    const sideBC =
      values.side_bc ??
      visual.parameters.find((item) => item.id === "side_bc")?.value;
    const sideCD =
      values.side_cd ??
      visual.parameters.find((item) => item.id === "side_cd")?.value;
    const construction = visual.construction;
    const derived =
      construction?.kind === "tetrahedron-problem" && sideBC && sideCD
        ? deriveTetrahedronResult(
            sideBC,
            sideCD,
            construction.lineAngleDegrees,
            construction.rightAtD,
          )
        : null;
    const dimensionText =
      sideBC && sideCD
        ? [`BC = ${number(sideBC)}`, `CD = ${number(sideCD)}`]
        : visual.objects
            .filter((object) => object.annotationKind === "length")
            .map((object) => object.text || object.label || "");
    const angleText = givenAngles.map((object) => object.label || "");
    const exactCosine = derived?.exact
      ? `cos φ = ${derived.exact.a}/√${derived.exact.b}`
      : null;
    const cosineText = derived
      ? exactCosine || `cos φ ≈ ${number(derived.cosine)}`
      : null;
    const sumResult = derived?.exact
      ? `a + b = ${derived.exact.a + derived.exact.b}`
      : null;
    return {
      heading: "Dữ kiện hình học · Tứ diện ABCD",
      formula: [...dimensionText, ...angleText].join(" · "),
      metrics: [
        ...dimensionText.map((item) => ({
          label: "Cạnh điều chỉnh",
          value: item,
        })),
        ...givenAngles.slice(0, 3).map((object) => ({
          label: "Góc cố định",
          value: object.label || "—",
        })),
        ...(cosineText
          ? [
              {
                label: "Cos góc nhị diện · suy ra",
                value: cosineText.replace(/^cos φ [=≈] /, ""),
              },
            ]
          : []),
        ...(sumResult
          ? [
              {
                label: "Kết quả ở kích thước hiện tại",
                value: sumResult.replace("a + b = ", ""),
              },
            ]
          : []),
      ],
      observations: [
        "BC và CD là hai cạnh điều chỉnh kích thước. Các góc đã cho vẫn được giữ cố định.",
        "Các kết quả suy ra chỉ hiển thị tại bảng thông tin, không chồng lên hình vẽ.",
      ],
      focus: [
        { label: "Hai mặt phẳng cần xét", targets: ["face_abc", "face_acd"] },
        ...givenAngles.slice(0, 2).map((object) => ({
          label: object.label || "Góc đã cho",
          targets: [object.id],
        })),
      ],
    };
  }
  if (visual.dimension === "3d" && visual.derivedFrom2d) {
    const matchesSelection = (id: string) =>
      !selectedSourceObject || id === `solid_${selectedSourceObject.id}`;
    const sphere = visual.objects.find(
      (item) =>
        matchesSelection(item.id) &&
        item.type === "sphere" &&
        item.label?.startsWith("Mặt cầu từ"),
    );
    if (sphere) {
      const radiusId = sphere.parameterBindings?.radius;
      return getModelReadout("sphere", {
        radius: radiusId
          ? (values[radiusId] ?? sphere.radius ?? 1)
          : (sphere.radius ?? 1),
      });
    }
    const cylinder = visual.objects.find(
      (item) =>
        matchesSelection(item.id) &&
        item.type === "cylinder" &&
        item.label?.startsWith("Hình trụ từ"),
    );
    if (cylinder) {
      const radiusId = cylinder.parameterBindings?.radius,
        heightId = cylinder.parameterBindings?.height;
      return getModelReadout("cylinder", {
        radius: radiusId
          ? (values[radiusId] ?? cylinder.radius ?? 1)
          : (cylinder.radius ?? 1),
        height: heightId
          ? (values[heightId] ?? cylinder.height ?? 1)
          : (cylinder.height ?? 1),
      });
    }
    const extrusion = visual.objects.find(
      (item) => matchesSelection(item.id) && item.type === "extrudedPolygon",
    );
    if (extrusion) {
      const vertices = extrusion.vertices2d || [];
      const area =
        Math.abs(
          vertices.reduce((sum, point, index) => {
            const next = vertices[(index + 1) % vertices.length];
            return sum + point[0] * next[1] - next[0] * point[1];
          }, 0),
        ) / 2;
      const heightId = extrusion.parameterBindings?.depth;
      const height = heightId
        ? (values[heightId] ?? extrusion.depth ?? 1)
        : (extrusion.depth ?? 1);
      const perimeter = vertices.reduce((sum, point, index) => {
        const next = vertices[(index + 1) % vertices.length];
        return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
      }, 0);
      return {
        heading: "Khối đùn từ đa giác",
        formula: "V = S_đáy × h",
        metrics: [
          { label: "Diện tích đáy", value: number(area) },
          { label: "Chu vi đáy", value: number(perimeter) },
          { label: "Chiều sâu h", value: number(height) },
          { label: "Thể tích", value: number(area * height) },
        ],
        observations: [
          "Mặt cắt song song đáy giữ nguyên diện tích.",
          "Thay đổi chiều sâu làm thể tích thay đổi theo tỉ lệ thuận.",
        ],
        focus: [{ label: "Khối đùn", targets: [extrusion.id] }],
      };
    }
  }
  if (sourceGraph && !selectedCircle && !selectedPolygon) {
    const polynomial = sourceGraph.expression
      ? polynomialCoefficients(sourceGraph.expression, values)
      : null;
    if (polynomial?.length === 3)
      return getModelReadout("quadratic-roots", {
        a: polynomial[2],
        b: polynomial[1],
        c: polynomial[0],
      });
    if (polynomial?.length === 2)
      return getModelReadout("linear-function", {
        a: polynomial[1],
        b: polynomial[0],
      });
    const parameters =
      visual.dimension === "2d"
        ? visual.parameters
        : source2d?.parameters || [];
    const offset = values.offset ?? 0;
    const expression =
      sourceGraph.expression?.replace(
        /\+offset$/,
        `${offset < 0 ? " − " : " + "}${number(Math.abs(offset))}`,
      ) || "…";
    return {
      heading: analysisResult?.program?.title || "Đồ thị hàm số từ nét viết",
      formula: `${sourceGraph.label || "f(x)"} = ${expression}`,
      metrics: parameters.slice(0, 4).map((parameter) => ({
        label: parameter.label,
        value: number(values[parameter.id] ?? parameter.value),
      })),
      observations: [
        "Các hệ số hiển thị là những giá trị hiện đang dùng để vẽ đồ thị.",
      ],
      focus: [{ label: "Đồ thị", targets: [sourceGraph.id] }],
    };
  }
  if (!source2d || (visual.dimension !== "2d" && !visual.derivedFrom2d))
    return null;
  const shapeKinds = new Set(
    source2d.objects
      .filter(
        (o) =>
          o.visible && ["circle", "polygon", "functionGraph"].includes(o.type),
      )
      .map((o) => o.type),
  );
  const standaloneSegments = source2d.objects.filter(
    (o) => o.visible && o.type === "segment",
  );
  const singleSegment = !shapeKinds.size && standaloneSegments.length === 1;
  if (
    (visual.source?.key === "generated" ||
      (visual.dimension === "3d" && visual.derivedFrom2d)) &&
    ((!recognizedSelection && shapeKinds.size > 1) ||
      (!shapeKinds.size && !singleSegment))
  ) {
    const pointCount = source2d.objects.filter((o) =>
      ["point", "midpoint", "projection", "intersection", "glider"].includes(
        o.type,
      ),
    ).length;
    const segmentCount = source2d.objects.filter((o) =>
      ["segment", "line", "arrow"].includes(o.type),
    ).length;
    return {
      heading:
        shapeKinds.size > 1
          ? "Nhiều đối tượng trên bảng"
          : "Bản phác chưa xác định loại hình",
      formula: "",
      metrics: [
        { label: "Điểm đã dựng", value: String(pointCount) },
        { label: "Nét đã dựng", value: String(segmentCount) },
      ],
      observations: [
        `Có ${pointCount} điểm và ${segmentCount} nét đã dựng trên bảng.`,
        "Chọn riêng một đối tượng để xem số đo, nhãn và thông tin liên quan.",
      ],
      focus: [],
      note: "Chưa gán một công thức chung cho cả bản vẽ. Nét thô hoặc hình mơ hồ không được coi là hình chuẩn đã xác nhận.",
    };
  }
  const current = visual.dimension === "2d" ? visualState?.objects || {} : {};
  const point = (id: string) => {
    const state = current[id];
    if (state && typeof state.x === "number" && typeof state.y === "number")
      return { x: state.x, y: state.y };
    const object = source2d.objects.find((item) => item.id === id);
    return object?.type === "point" &&
      typeof object.x === "number" &&
      typeof object.y === "number"
      ? { x: object.x, y: object.y }
      : null;
  };
  if (
    singleSegment &&
    (visual.source?.key === "generated" ||
      (visual.dimension === "3d" && visual.derivedFrom2d))
  ) {
    const segment = standaloneSegments[0],
      a = point(segment.parents[0]),
      b = point(segment.parents[1]);
    if (a && b)
      return {
        heading: "Đoạn thẳng đang quan sát",
        formula: "",
        metrics: [
          { label: "Điểm đầu", value: `(${number(a.x)}; ${number(a.y)})` },
          { label: "Điểm cuối", value: `(${number(b.x)}; ${number(b.y)})` },
          {
            label: "Độ dài",
            value: number(Math.hypot(b.x - a.x, b.y - a.y)),
          },
        ],
        observations: [
          "Đoạn thẳng nối hai điểm đã dựng; kéo đầu mút để thay đổi vị trí và độ dài.",
          "Độ dài hiện tại là số đo trên bảng, không tự trở thành dữ kiện của đề.",
        ],
        focus: [
          {
            label: "Đoạn thẳng",
            targets: [
              visual.dimension === "3d" ? `edge_${segment.id}` : segment.id,
            ],
          },
        ],
      };
  }
  const circles = source2d.objects.filter((item) => item.type === "circle");
  const circle = selectedPolygon
    ? undefined
    : circles.find((item) => item.id === selectedSourceObject?.id) ||
      circles[0];
  if (circle) {
    const center = point(circle.parents[0]),
      radiusPoint = point(circle.parents[1]);
    const radiusFromParameter =
      typeof circle.radius === "string"
        ? values[circle.radius]
        : typeof circle.radius === "number"
          ? circle.radius
          : undefined;
    const radius =
      radiusFromParameter ??
      (center && radiusPoint
        ? Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y)
        : NaN);
    if (center && Number.isFinite(radius)) {
      const hSign = center.x < 0 ? "+" : "−",
        kSign = center.y < 0 ? "+" : "−";
      return {
        heading: "Đường tròn đang quan sát",
        formula: `(x ${hSign} ${number(Math.abs(center.x))})² + (y ${kSign} ${number(Math.abs(center.y))})² = ${number(radius * radius)}`,
        metrics: [
          {
            label: "Tâm I",
            value: `(${number(center.x)}; ${number(center.y)})`,
          },
          { label: "Bán kính r", value: number(radius) },
          { label: "Chu vi", value: number(2 * Math.PI * radius) },
          { label: "Diện tích", value: number(Math.PI * radius * radius) },
        ],
        observations: [
          `Mọi điểm trên đường tròn cách tâm I một khoảng r = ${number(radius)}.`,
          "Các tọa độ và số đo được lấy từ hình hiện tại.",
        ],
        focus: [{ label: "Đường tròn", targets: [circle.id] }],
      };
    }
  }
  const polygons = source2d.objects.filter((item) => item.type === "polygon");
  const polygon = selectedCircle
    ? undefined
    : polygons.find((item) => item.id === selectedSourceObject?.id) ||
      polygons[0];
  if (polygon) {
    const vertices = polygon.parents.map(point);
    if (vertices.length >= 3 && vertices.every(Boolean)) {
      const points = vertices as Array<{ x: number; y: number }>;
      const perimeter = points.reduce((sum, vertex, index) => {
        const next = points[(index + 1) % points.length];
        return sum + Math.hypot(next.x - vertex.x, next.y - vertex.y);
      }, 0);
      const area =
        Math.abs(
          points.reduce((sum, vertex, index) => {
            const next = points[(index + 1) % points.length];
            return sum + vertex.x * next.y - next.x * vertex.y;
          }, 0),
        ) / 2;
      const edges = points.map((vertex, index) => {
        const next = points[(index + 1) % points.length];
        return { x: next.x - vertex.x, y: next.y - vertex.y };
      });
      const rectangle =
        points.length === 4 &&
        edges.every((edge, index) => {
          const next = edges[(index + 1) % edges.length];
          const product =
            Math.hypot(edge.x, edge.y) * Math.hypot(next.x, next.y);
          return (
            product > 1e-8 &&
            Math.abs(edge.x * next.x + edge.y * next.y) / product < 0.001
          );
        });
      const sideLengths = edges.map((edge) => Math.hypot(edge.x, edge.y));
      const square =
        rectangle &&
        Math.max(...sideLengths) - Math.min(...sideLengths) <
          Math.max(...sideLengths) * 0.001;
      const lostClassification =
        (/chữ nhật/i.test(polygon.label || "") && !rectangle) ||
        (/hình vuông/i.test(polygon.label || "") && !square);
      return {
        heading: lostClassification
          ? "Đa giác đang quan sát"
          : polygon.label || "Đa giác đang quan sát",
        formula: "P = tổng độ dài các cạnh · S = diện tích phần bên trong",
        metrics: [
          { label: "Số đỉnh", value: String(points.length) },
          { label: "Chu vi P", value: number(perimeter) },
          { label: "Diện tích S", value: number(area) },
        ],
        observations: [
          "Số đo được tính từ tọa độ các đỉnh hiện tại.",
          "Kéo một đỉnh để xem chu vi và diện tích cập nhật.",
        ],
        focus: [{ label: polygon.label || "Đa giác", targets: [polygon.id] }],
        ...(lostClassification
          ? {
              note: "Các đỉnh đã thay đổi; hình hiện tại không còn thỏa điều kiện của hình chữ nhật/hình vuông ban đầu.",
            }
          : {}),
      };
    }
  }
  return null;
}
