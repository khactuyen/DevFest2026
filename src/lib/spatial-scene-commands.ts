import {
  ThreeObjectSchema,
  ThreeVisualSpecSchema,
  type ThreeVisualSpec,
  type ThreeVisualObject,
} from "./contracts";
import {
  constructSpatial,
  SPATIAL_TOOLS,
  type SpatialTool,
  type XYZ,
} from "./spatial-constructions";
import type { VertexHit } from "./runtime";
import { indexedSolidVertices, solidGeometry } from "./three/geometry";
import { uid } from "./drawing-id";
export { uid } from "./drawing-id";
export function emptySpatialScene(): ThreeVisualSpec {
  return ThreeVisualSpecSchema.parse({
    id: uid(),
    version: 1,
    dimension: "3d",
    engine: "threejs",
    source: { key: "manual-3d", version: 1 },
    kind: "solid",
    parameters: [],
    objects: [
      { id: uid(), type: "label3d", text: "Không gian", position: [0, 0, 0] },
    ],
    camera: { position: [8, 6, 9], target: [0, 0, 0] },
  });
}
export function addSpatialNet(
  scene: ThreeVisualSpec,
  sourceId?: string,
): ThreeVisualSpec {
  const source = scene.objects.find((o) => o.id === sourceId);
  if (
    !source ||
    ![
      "box",
      "tetrahedron",
      "octahedron",
      "dodecahedron",
      "icosahedron",
      "prism",
      "pyramid",
    ].includes(source.type)
  )
    throw Error("Chọn một khối đa diện trước khi khai triển.");
  if (scene.parameters.length >= 12) throw Error("Bảng đã đủ 12 tham số.");
  const parameter = uid();
  return {
    ...scene,
    parameters: [
      ...scene.parameters,
      {
        id: parameter,
        label: "Mở / gấp khai triển",
        min: 0,
        max: 1,
        value: 1,
        step: 0.02,
      },
    ],
    objects: [
      ...scene.objects,
      ThreeObjectSchema.parse({
        id: uid(),
        type: "curve3d",
        label: "Khai triển đa diện",
        segments: true,
        points3d: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        userCreated: true,
        net: { sourceId, parameter },
      }),
    ],
  };
}
export function solidPresetVertexCount(kind: string, sides: number) {
  if (["box", "rectangularBox"].includes(kind)) return 8;
  if (kind === "cone") return 1;
  if (!Number.isInteger(sides) || sides < 3 || sides > 64) return 0;
  if (kind === "pyramid") return sides + 1;
  if (kind === "prism" || kind === "frustum") return sides * 2;
  return 0;
}

export function addSpatialSolid(
  scene: ThreeVisualSpec,
  kind: string,
  sides = 4,
  size = 3,
  radius = 2,
  height = 3,
  vertexNames: string[] = [],
): ThreeVisualSpec {
  if (
    ![size, radius, height].every(
      (n) => Number.isFinite(n) && n > 0 && n <= 10000,
    )
  )
    throw Error("Kích thước phải lớn hơn 0 và không quá 10000.");
  const object = ThreeObjectSchema.parse({
    id: uid(),
    type:
      kind === "frustum" ? "prism" : kind === "rectangularBox" ? "box" : kind,
    userCreated: true,
    label:
      (
        {
          frustum: "Chóp cụt",
          rectangularBox: "Hộp chữ nhật",
          box: "Lập phương",
          prism: "Lăng trụ",
          pyramid: "Hình chóp",
          cylinder: "Hình trụ",
          cone: "Hình nón",
          sphere: "Hình cầu",
        } as Record<string, string>
      )[kind] || kind,
    size,
    radius,
    height,
    sides,
    ...(kind === "frustum" ? { topRadius: radius / 2 } : {}),
    ...(kind === "rectangularBox"
      ? { boxDimensions: [size, height, radius] }
      : {}),
    position: [0, 0, 0],
  });
  if (vertexNames.some((name) => name.trim())) {
    const geometry = solidGeometry(object, {});
    const vertices = indexedSolidVertices(geometry, object.type).filter((vertex) => vertex.selectable);
    geometry.dispose();
    object.vertexAnnotations = Object.fromEntries(vertices.flatMap(({ index }, i) => {
      const label = vertexNames[i]?.trim().slice(0, 100);
      return label ? [[index, { label }]] : [];
    }));
  }
  return { ...scene, objects: [...scene.objects, object] };
}
export function spatialConstructionInput(h: VertexHit) {
  return {
    position: h.position,
    ...(!h.free && {
      anchor: {
        objectId: h.objectId,
        vertexIndex: h.vertexIndex,
        edgeIndex: h.edgeIndex,
        edgeKey: h.edgeKey,
        edgeRatio: h.edgeIndex !== undefined || h.edgeKey ? h.edgeRatio ?? 0.5 : undefined,
      },
    }),
  };
}

export function addSpatialConstruction(
  scene: ThreeVisualSpec,
  tool: SpatialTool,
  hits: VertexHit[],
  sourceId?: string,
  faceIndex?: number,
): ThreeVisualSpec {
  const result = constructSpatial(
    tool,
    hits.map((h) => h.position),
  );
  if (tool === "section" && !sourceId)
    throw Error("Chọn khối trước, sau đó chọn ba điểm của mặt phẳng cắt.");
  if (!["section", "flatten"].includes(tool)) {
    sourceId = undefined;
    faceIndex = undefined;
  }
  const inputs = hits.map(spatialConstructionInput);
  const type =
    tool === "circumsphere" || (result.point && result.value === undefined)
      ? "sphere"
      : result.value !== undefined && tool.startsWith("angle")
        ? "label3d"
        : ["plane", "section", "flatten"].includes(tool)
          ? "face3d"
          : "curve3d";
  const object = ThreeObjectSchema.parse({
    id: uid(),
    type,
    label: SPATIAL_TOOLS[tool].label,
    position: result.point || [0, 0, 0],
    radius: result.radius || 0.07,
    marker: type === "sphere" && tool !== "circumsphere",
    points3d: result.points || [
      [0, 0, 0],
      [1, 0, 0],
    ],
    text:
      result.value !== undefined
        ? `${SPATIAL_TOOLS[tool].label}: ${Number(result.value.toFixed(4))}${tool.startsWith("angle") ? "°" : ""}`
        : undefined,
    spatialConstruction: {
      tool,
      inputs,
      ...(sourceId ? { sourceId } : {}),
      ...(faceIndex !== undefined ? { faceIndex } : {}),
    },
  });
  const additions: ThreeVisualObject[] = [object];
  if (tool === "circumsphere" && result.point && result.radius) {
    additions.push(ThreeObjectSchema.parse({
      id: uid(), type: "label3d", label: "Tâm và bán kính mặt cầu",
      text: "Tâm và bán kính mặt cầu", position: result.point,
      annotationKind: "length", spatialConstruction: { tool, inputs },
    }));
  }
  if (result.value !== undefined && !tool.startsWith("angle"))
    additions.push(
      ThreeObjectSchema.parse({
        id: uid(),
        type: "label3d",
        text: `${SPATIAL_TOOLS[tool].label}: ${Number(result.value.toFixed(4))}`,
        label: SPATIAL_TOOLS[tool].label,
        position: result.points?.[0] || [0, 0, 0],
        spatialConstruction: { tool, inputs },
      }),
    );
  return { ...scene, objects: [...scene.objects, ...additions] };
}
export function spatialCoordinateObjects(
  kind: "point" | "line" | "plane" | "sphere" | "axes",
  numbers: number[],
): ThreeVisualObject[] {
  return coordinateObjects(kind, numbers).map((o) => ({
    ...o,
    userCreated: true,
  }));
}
function coordinateObjects(
  kind: "point" | "line" | "plane" | "sphere" | "axes",
  numbers: number[],
): ThreeVisualObject[] {
  if (numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e5))
    throw Error("Tọa độ không hợp lệ.");
  if (kind === "axes")
    return [
      [
        [-5, 0, 0],
        [5, 0, 0],
      ],
      [
        [0, -5, 0],
        [0, 5, 0],
      ],
      [
        [0, 0, -5],
        [0, 0, 5],
      ],
    ].flatMap((points, i) => [
      ThreeObjectSchema.parse({
        id: uid(),
        type: "curve3d",
        points3d: points,
        color: ["#cf4f4f", "#168265", "#487cc7"][i],
      }),
      ThreeObjectSchema.parse({
        id: uid(),
        type: "label3d",
        text: ["Ox", "Oy", "Oz"][i],
        position: points[1],
      }),
    ]);
  if (kind === "point" && numbers.length === 3)
    return [
      ThreeObjectSchema.parse({
        id: uid(),
        type: "sphere",
        marker: true,
        radius: 0.07,
        position: numbers,
        label: "Điểm tọa độ",
      }),
    ];
  if (kind === "sphere" && numbers.length === 4 && numbers[3] > 0)
    return [
      ThreeObjectSchema.parse({
        id: uid(),
        type: "sphere",
        radius: numbers[3],
        position: numbers.slice(0, 3),
      }),
    ];
  if (kind === "line" && numbers.length === 6) {
    const p = numbers.slice(0, 3),
      v = numbers.slice(3);
    if (Math.hypot(...v) < 1e-8) throw Error("Vectơ chỉ phương phải khác 0.");
    return [
      ThreeObjectSchema.parse({
        id: uid(),
        type: "curve3d",
        points3d: [
          p.map((x, i) => x - 10 * v[i]),
          p.map((x, i) => x + 10 * v[i]),
        ],
      }),
    ];
  }
  if (kind === "plane" && numbers.length === 4) {
    const [a, b, c, d] = numbers,
      n = [a, b, c],
      length = Math.hypot(a, b, c);
    if (length < 1e-8) throw Error("Pháp tuyến phải khác 0.");
    const index = n.findIndex((v) => Math.abs(v) > 0.001),
      p: XYZ = [0, 0, 0];
    p[index] = -d / n[index];
    const u: XYZ = Math.abs(a) < Math.abs(b) ? [0, c, -b] : [-c, 0, a];
    if (Math.hypot(...u) < 1e-8) {
      u[0] = -b;
      u[1] = a;
    }
    const norm = Math.hypot(...u);
    u.forEach((v, i) => (u[i] = (v / norm) * 4));
    const v: XYZ = [
      b * u[2] - c * u[1],
      c * u[0] - a * u[2],
      a * u[1] - b * u[0],
    ];
    v.forEach((x, i) => (v[i] = x / length));
    return [
      ThreeObjectSchema.parse({
        id: uid(),
        type: "face3d",
        points3d: [
          [1, 1],
          [-1, 1],
          [-1, -1],
          [1, -1],
        ].map(([s, t]) => p.map((x, i) => x + s * u[i] + t * v[i])),
      }),
    ];
  }
  throw Error("Số giá trị chưa đúng hoặc bán kính không dương.");
}
