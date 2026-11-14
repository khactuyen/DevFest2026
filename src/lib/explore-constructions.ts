import {
  VisualProgramSchema,
  ThreeVisualSpecSchema,
  type VisualProgram,
  type ThreeVisualSpec,
  type ThreeVisualObject,
} from "./contracts";
import { AppError } from "./app-error";

const parameter = (id: string, label: string, value: number) => {
  const digits = Math.min(
    6,
    Math.max(1, (String(value).split(".")[1] || "").length),
  );
  const step = 10 ** -digits;
  const min = Math.min(
    value,
    Number(Math.max(step, Math.floor(value / 4 / step) * step).toFixed(digits)),
  );
  return { id, label, value, min, max: Math.max(1, value * 3), step };
};
/** Scale geometry and annotations together, including when restoring the initial size. */
export function resizeCubeObjects(
  objects: ThreeVisualObject[],
  previous: number,
  next: number,
): ThreeVisualObject[] {
  if (
    !Number.isFinite(previous) ||
    !Number.isFinite(next) ||
    previous <= 0 ||
    next <= 0
  )
    throw Error("Cạnh lập phương phải lớn hơn 0.");
  const ratio = next / previous;
  return objects.map((object) =>
    object.id === "solid"
      ? { ...object, size: next }
      : {
          ...object,
          position: object.position.map((v) => v * ratio) as [
            number,
            number,
            number,
          ],
          ...(object.points3d
            ? {
                points3d: object.points3d.map(
                  (p) => p.map((v) => v * ratio) as [number, number, number],
                ),
              }
            : {}),
          ...(object.id === "side_label" ? { text: `Cạnh = ${next}` } : {}),
        },
  );
}
/** Reviewed, bounded constructions. Unknown additional constraints stay on the DSL path. */
export function exactExploreProgram(prompt: string): VisualProgram | null {
  const text = prompt.replace(/[−–]/g, "-");
  const rectangle = /hình\s*chữ\s*nhật\s*ABCD/i.test(text);
  const ab = /\bAB\s*=\s*(\d+(?:[.,]\d+)?)/.exec(text),
    bc = /\bBC\s*=\s*(\d+(?:[.,]\d+)?)/.exec(text);
  if (
    rectangle &&
    ab &&
    bc &&
    !/vuông\s*góc|tiếp\s*tuyến|giao\s*điểm|\b[EFGHMN]\b/.test(text)
  ) {
    const width = Number(ab[1].replace(",", ".")),
      height = Number(bc[1].replace(",", "."));
    if (width <= 0 || height <= 0 || Math.max(width, height) > 100) return null;
    const p: unknown[] = [
      { op: "point", id: "A", label: "A", x: 0, y: 0 },
      { op: "point", id: "B", label: "B", x: "width", y: 0 },
      { op: "point", id: "C", label: "C", x: "width", y: "height" },
      { op: "point", id: "D", label: "D", x: 0, y: "height" },
      {
        op: "polygon",
        id: "rectangle",
        label: "Hình chữ nhật ABCD",
        parents: ["A", "B", "C", "D"],
      },
      { op: "segment", id: "AB", label: "AB", parents: ["A", "B"] },
      { op: "segment", id: "BC", label: "BC", parents: ["B", "C"] },
    ];
    for (const ends of ["AC", "BD"])
      if (new RegExp(`đường\\s*chéo[^.!?]*\\b${ends}\\b`, "i").test(text))
        p.push({
          op: "segment",
          id: ends,
          label: ends,
          parents: ends.split(""),
        });
    if (/đường\s*tròn\s*ngoại\s*tiếp/i.test(text))
      p.push(
        { op: "midpoint", id: "I", label: "I", parents: ["A", "C"] },
        {
          op: "circle",
          id: "circumcircle",
          label: "Đường tròn ngoại tiếp",
          parents: ["I", "A"],
        },
        {
          op: "segment",
          id: "circumradius",
          label: "Bán kính r",
          parents: ["I", "A"],
        },
      );
    return VisualProgramSchema.parse({
      version: 1,
      dimension: "2d",
      engine: "jsxgraph",
      kind: "geometry",
      title: "Hình chữ nhật ABCD",
      description:
        "AB và BC là dữ kiện điều chỉnh kích thước; các đỉnh phụ thuộc giữ bốn góc vuông. Bán kính đường tròn ngoại tiếp được đo từ hình hiện tại.",
      viewport: {
        x: [-width / 2, width * 1.5],
        y: [-height / 2, height * 1.5],
      },
      parameters: [
        parameter("width", "AB", width),
        parameter("height", "BC", height),
      ],
      primitives: p,
    });
  }
  const center =
    /tâm\s*([A-Z])\s*\(\s*([+-]?\d+(?:[.,]\d+)?)\s*[;,]\s*([+-]?\d+(?:[.,]\d+)?)\s*\)/i.exec(
      text,
    );
  const radius = /bán\s*kính\s*(?:[rR]\s*=\s*)?(\d+(?:[.,]\d+)?)/i.exec(text);
  if (
    /đường\s*tròn/i.test(text) &&
    center &&
    radius &&
    !/tam\s*giác|chữ\s*nhật|tiếp\s*tuyến|đi\s*qua|ngoại\s*tiếp|nội\s*tiếp/i.test(
      text,
    )
  ) {
    const name = center[1].toUpperCase(),
      x = Number(center[2].replace(",", ".")),
      y = Number(center[3].replace(",", ".")),
      r = Number(radius[1].replace(",", "."));
    if (!r || r > 100 || Math.max(Math.abs(x), Math.abs(y)) > 100) return null;
    const through = name === "R" ? "radiusEnd" : "R";
    return VisualProgramSchema.parse({
      version: 1,
      dimension: "2d",
      engine: "jsxgraph",
      kind: "geometry",
      title: `Đường tròn tâm ${name}`,
      description:
        "Kéo tâm để di chuyển đường tròn; bán kính chỉ đổi khi điều chỉnh r. Đầu mút bán kính luôn phụ thuộc tâm.",
      viewport: {
        x: [x - r * 1.5, x + r * 1.5],
        y: [y - r * 1.5, y + r * 1.5],
      },
      parameters: [parameter("radius", "Bán kính r", r)],
      primitives: [
        { op: "point", id: name, label: name, x, y, free: true },
        {
          op: "offsetPoint",
          id: through,
          label: "R",
          parents: [name],
          x: "radius",
          y: 0,
        },
        {
          op: "circle",
          id: "circle",
          parents: [name],
          radius: "radius",
          label: `Đường tròn tâm ${name}`,
        },
        {
          op: "segment",
          id: "radiusSegment",
          parents: [name, through],
          label: "Bán kính",
        },
      ],
    });
  }
  return null;
}

/** Cube labels and diagonal endpoints have stable IDs independent of prime display labels. */
export function namedCube(prompt: string, side = 2): ThreeVisualSpec | null {
  if (!/lập\s*phương/i.test(prompt)) return null;
  const notation = /([A-Z]{4})\s*[.·]\s*((?:[A-Z]\s*['′’]\s*){4})/.exec(prompt);
  if (!notation) return null;
  const names = [
    ...notation[1],
    ...Array.from(notation[2].matchAll(/([A-Z])\s*['′’]/g), (m) => m[1] + "′"),
  ];
  if (new Set(names).size !== 8)
    throw new AppError(422, "Tên tám đỉnh phải phân biệt.", "invalid_plan");
  const normal = prompt.replace(/['’]/g, "′");
  const diagonalClause = /đường\s*chéo\s+([^.;\n]+)/i.exec(normal)?.[1] || "";
  const pairs = Array.from(
    diagonalClause.matchAll(/([A-Z]′?)\s*([A-Z]′?)/g),
    (m) => [m[1], m[2]] as [string, string],
  );
  if (/đường\s*chéo/i.test(normal) && !pairs.length)
    throw new AppError(
      422,
      "Chưa xác định được hai đầu mút đường chéo.",
      "unsupported",
    );
  if (pairs.some((pair) => pair.some((name) => !names.includes(name))))
    throw new AppError(
      422,
      "Đường chéo tham chiếu đỉnh không có trong hình lập phương.",
      "invalid_plan",
    );
  // More involved incidence/slicing problems must not silently become a plain cube.
  if (
    /trung\s*điểm|thiết\s*diện|mặt\s*phẳng|giao\s*điểm|tiếp\s*tuyến/i.test(
      normal,
    )
  )
    throw new AppError(
      422,
      "Mẫu lập phương có nhãn chưa hỗ trợ các phép dựng bổ sung này. Không tự bỏ yêu cầu của đề.",
      "unsupported",
    );
  const h = side / 2;
  const points: Array<[number, number, number]> = [
    [-h, -h, h],
    [h, -h, h],
    [h, -h, -h],
    [-h, -h, -h],
    [-h, h, h],
    [h, h, h],
    [h, h, -h],
    [-h, h, -h],
  ];
  const objects: unknown[] = [
    {
      id: "solid",
      type: "box",
      size: side,
      label: "Hình lập phương",
      parameterBindings: { size: "size" },
    },
  ];
  names.forEach((name, i) =>
    objects.push(
      {
        id: `vertex_${i}`,
        type: "sphere",
        marker: true,
        annotationKind: "vertex",
        radius: 0.04,
        position: points[i],
        label: name,
      },
      {
        id: `name_${i}`,
        type: "label3d",
        annotationKind: "vertex",
        position: points[i],
        text: name,
        label: name,
      },
    ),
  );
  pairs.forEach((pair, i) =>
    objects.push({
      id: `diagonal_${i}`,
      type: "curve3d",
      label: pair.join(""),
      points3d: pair.map((name) => points[names.indexOf(name)]),
      vertexEndpoints: pair.map((name) => ({
        objectId: `vertex_${names.indexOf(name)}`,
      })),
      color: "#df7136",
    }),
  );
  objects.push({
    id: "side_label",
    type: "label3d",
    annotationKind: "length",
    position: [0, -h, h],
    text: `Cạnh = ${side}`,
    label: "Cạnh",
  });
  return ThreeVisualSpecSchema.parse({
    id: `visual_cube_${crypto.randomUUID().replace(/-/g, "")}`,
    version: 1,
    dimension: "3d",
    engine: "threejs",
    source: { key: "cube", version: 1 },
    kind: "solid",
    parameters: [parameter("size", "Độ dài cạnh", side)],
    cubeConstruction: { vertexNames: names },
    objects,
    accessibility: {
      description:
        "Hình lập phương có tám đỉnh được đặt tên và các đường chéo theo yêu cầu; kích thước thay đổi cùng tham số cạnh.",
    },
  });
}
