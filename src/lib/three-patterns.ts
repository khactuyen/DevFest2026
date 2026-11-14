import { VisualSpecSchema, type ThreeVisualSpec } from "./contracts";

type ThreePatternKey =
  | "cube"
  | "triangular-prism"
  | "square-pyramid"
  | "cylinder"
  | "cone"
  | "sphere"
  | "tetrahedron"
  | "octahedron"
  | "dodecahedron"
  | "icosahedron"
  | "cube-slice";

export const threePatternNames: Record<ThreePatternKey, string> = {
  cube: "Hình lập phương",
  "triangular-prism": "Lăng trụ tam giác",
  "square-pyramid": "Hình chóp đáy vuông",
  cylinder: "Hình trụ",
  cone: "Hình nón",
  sphere: "Hình cầu",
  tetrahedron: "Tứ diện đều",
  octahedron: "Bát diện đều",
  dodecahedron: "Mười hai mặt đều",
  icosahedron: "Hai mươi mặt đều",
  "cube-slice": "Thiết diện hình lập phương",
};

const parameter = (
  id: string,
  value: number,
  min: number,
  max: number,
  step = 0.1,
) => ({ id, label: id, value, min, max, step });

function scene(
  key: ThreePatternKey,
  parameters: unknown[],
  objects: unknown[],
  description: string,
): ThreeVisualSpec {
  return VisualSpecSchema.parse({
    id: "visual_main",
    version: 1,
    dimension: "3d",
    engine: "threejs",
    source: { key, version: 1 },
    kind: "solid",
    parameters,
    objects,
    camera: { position: [5, 4, 6], target: [0, 0, 0] },
    accessibility: { description },
  }) as ThreeVisualSpec;
}

export function threePattern(key: ThreePatternKey = "cube"): ThreeVisualSpec {
  switch (key) {
    case "cube":
      return scene(
        key,
        [parameter("size", 2.4, 0.8, 5)],
        [{ id: "solid", type: "box", label: "Lập phương", size: 2.4, parameterBindings: { size: "size" } }],
        "Hình lập phương 3D có thể xoay, phóng to và thay đổi kích thước.",
      );
    case "triangular-prism":
      return scene(
        key,
        [parameter("radius", 1.5, 0.5, 4), parameter("height", 3.2, 0.8, 6)],
        [{ id: "solid", type: "prism", label: "Lăng trụ tam giác", radius: 1.5, height: 3.2, sides: 3, parameterBindings: { radius: "radius", height: "height" } }],
        "Lăng trụ tam giác với bán kính đáy và chiều cao thay đổi được.",
      );
    case "square-pyramid":
      return scene(
        key,
        [parameter("radius", 1.7, 0.5, 4), parameter("height", 3, 0.8, 6)],
        [{ id: "solid", type: "pyramid", label: "Chóp đáy vuông", radius: 1.7, height: 3, sides: 4, parameterBindings: { radius: "radius", height: "height" } }],
        "Hình chóp đáy vuông với chiều cao thay đổi được.",
      );
    case "cylinder":
      return scene(
        key,
        [parameter("radius", 1.4, 0.4, 4), parameter("height", 3.4, 0.8, 7)],
        [{ id: "solid", type: "cylinder", label: "Hình trụ", radius: 1.4, height: 3.4, parameterBindings: { radius: "radius", height: "height" } }],
        "Hình trụ trực quan với bán kính và chiều cao điều chỉnh được.",
      );
    case "cone":
      return scene(
        key,
        [parameter("radius", 1.6, 0.4, 4), parameter("height", 3.6, 0.8, 7)],
        [{ id: "solid", type: "cone", label: "Hình nón", radius: 1.6, height: 3.6, parameterBindings: { radius: "radius", height: "height" } }],
        "Hình nón trực quan với bán kính đáy và chiều cao điều chỉnh được.",
      );
    case "sphere":
      return scene(
        key,
        [parameter("radius", 1.8, 0.5, 4)],
        [{ id: "solid", type: "sphere", label: "Hình cầu", radius: 1.8, parameterBindings: { radius: "radius" } }],
        "Hình cầu 3D có thể xoay và thay đổi bán kính.",
      );
    case "tetrahedron":
    case "octahedron":
    case "dodecahedron":
    case "icosahedron":
      return scene(
        key,
        [parameter("size", 2, 0.6, 4.5)],
        [{ id: "solid", type: key, label: threePatternNames[key], size: 2, parameterBindings: { size: "size" } }],
        `${threePatternNames[key]} 3D để quan sát mặt, cạnh và đỉnh.`,
      );
    case "cube-slice":
      return scene(
        key,
        [parameter("size", 3.2, 1.5, 5), parameter("sliceY", 0, -1.6, 1.6)],
        [
          { id: "solid", type: "box", label: "Hình lập phương", size: 3.2, parameterBindings: { size: "size" } },
          { id: "slice", type: "slicePlane", label: "Mặt phẳng cắt", color: "#8268bd", size: 3.2, rotation: [-Math.PI / 2, 0, 0], parameterBindings: { size: "size", positionY: "sliceY" } },
        ],
        "Thiết diện của hình lập phương khi di chuyển mặt phẳng cắt.",
      );
  }
}

export const threeGoldenScenes = () =>
  (Object.keys(threePatternNames) as ThreePatternKey[]).map((key) =>
    threePattern(key),
  );
