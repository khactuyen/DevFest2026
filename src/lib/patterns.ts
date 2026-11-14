import { VisualSpecSchema, type TwoDVisualSpec } from "./contracts";
const p = (id: string, value: number, min = -5, max = 5) => ({
  id,
  label: id,
  value,
  min,
  max,
  step: 0.1,
});
const point = (
  id: string,
  x: number | string,
  y: number | string,
  free = false,
) => ({ id, type: "point", label: id, x, y, free });
export const patternNames: Record<string, string> = {
  "quadratic-roots": "Hàm số bậc hai",
  "function-transform": "Biến đổi đồ thị",
  "triangle-thales": "Định lý Thales",
  "similar-triangles": "Tam giác đồng dạng",
  "unit-circle": "Đường tròn lượng giác",
  "vector-addition": "Cộng vectơ",
  "vector-dot-product": "Tích vô hướng hai vectơ",
  "linear-function": "Hàm số bậc nhất",
  "circle-line": "Giao đường thẳng và đường tròn",
  "triangle-angles": "Góc trong tam giác",
  "sine-wave": "Sóng hình sin",
};
export function pattern(key = "quadratic-roots", coeff?: number[]): TwoDVisualSpec {
  const common = {
    id: "visual_main",
    version: 1,
    source: { key, version: 1 },
    kind: "cartesian",
    viewport: { x: [-6, 6], y: [-5, 7] },
    parameters: [],
    objects: [],
    accessibility: { description: patternNames[key] || key },
  };
  let data: Record<string, unknown> = {};
  switch (key) {
    case "quadratic-roots": {
      const [a, b, c] = coeff || [1, 0, -2];
      data = {
        parameters: [
          p("a", a, Math.min(-5, a), Math.max(5, a)),
          p("b", b, Math.min(-8, b), Math.max(8, b)),
          p("c", c, Math.min(-8, c), Math.max(8, c)),
        ],
        objects: [
          {
            id: "graph",
            type: "functionGraph",
            expression: "a*x^2+b*x+c",
            label: "f(x)",
            color: "#07885f",
          },
          point("vertex", "-b/(2*a)", "c-b^2/(4*a)"),
          point("rootL", "(-b-sqrt(b^2-4*a*c))/(2*a)", 0),
          point("rootR", "(-b+sqrt(b^2-4*a*c))/(2*a)", 0),
          {
            id: "axis",
            type: "verticalMarker",
            x: "-b/(2*a)",
            color: "#9070c6",
          },
        ],
      };
      break;
    }
    case "function-transform":
      data = {
        parameters: [p("a", 1), p("h", 0), p("k", 0)],
        objects: [
          { id: "graph", type: "functionGraph", expression: "a*(x-h)^2+k" },
          point("vertex", "h", "k"),
        ],
      };
      break;
    case "linear-function":
      data = {
        parameters: [p("a", 1), p("b", 0)],
        objects: [
          { id: "graph", type: "functionGraph", expression: "a*x+b" },
          point("intercept", 0, "b"),
        ],
      };
      break;
    case "sine-wave":
      data = {
        parameters: [
          p("a", 2, 0, 4),
          p("w", 1, 0.1, 4),
          p("h", 0, -3.14, 3.14),
        ],
        objects: [
          { id: "graph", type: "functionGraph", expression: "a*sin(w*x+h)" },
        ],
      };
      break;
    case "unit-circle":
      data = {
        kind: "geometry",
        viewport: { x: [-2, 2], y: [-2, 2] },
        parameters: [p("theta", 0.7, -2*Math.PI, 2*Math.PI)],
        objects: [
          point("O", 0, 0),
          { id: "circle", type: "circle", parents: ["O"], radius: 1 },
          {id:"P",type:"glider",parents:["circle"],x:Math.cos(.7),y:Math.sin(.7),free:true,angleParameter:"theta",label:"P"},
          point("Q", "cos(theta)", 0),
          { id: "radius", type: "segment", parents: ["O", "P"] },
          {
            id: "projection",
            type: "segment",
            parents: ["P", "Q"],
            color: "#eeaa54",
          },
        ],
      };
      break;
    case "triangle-thales":
      data = {
        kind: "geometry",
        objects: [
          point("A", -3, 0, true),
          point("B", 3, 0, true),
          { id: "circle", type: "circle", parents: ["A", "B"] },
          {
            id: "C",
            type: "glider",
            x: 0,
            y: 5,
            parents: ["circle"],
            free: true,
          },
          { id: "triangle", type: "polygon", parents: ["A", "B", "C"] },
        ],
      }; // Replace with diameter endpoints via a fixed center, preserving right angle.
      data = {
        kind: "geometry",
        objects: [
          point("O", 0, 0),
          point("A", -3, 0),
          point("B", 3, 0),
          { id: "circle", type: "circle", parents: ["O", "B"] },
          {
            id: "C",
            type: "glider",
            x: 0,
            y: 3,
            parents: ["circle"],
            free: true,
          },
          { id: "triangle", type: "polygon", parents: ["A", "B", "C"] },
          { id: "angle", type: "angle", parents: ["A", "C", "B"] },
        ],
      };
      break;
    case "similar-triangles":
      data = {
        kind: "geometry",
        parameters: [p("r", 1.5, 0.2, 2)],
        objects: [
          point("A", 0, 0),
          point("B", 2, 0),
          point("C", 1, 2),
          point("D", "2*r", 0),
          point("E", "r", "2*r"),
          { id: "small", type: "polygon", parents: ["A", "B", "C"] },
          {
            id: "large",
            type: "polygon",
            parents: ["A", "D", "E"],
            color: "#eeaa54",
          },
        ],
      };
      break;
    case "vector-addition":
      data = {
        objects: [
          point("O", 0, 0),
          point("U", 2, 1, true),
          point("V", 1, 2, true),
          { id: "uSupport", type: "line", parents: ["O", "U"], visible: false },
          { id: "vSupport", type: "line", parents: ["O", "V"], visible: false },
          { id: "uAtV", type: "parallel", parents: ["uSupport", "V"], visible: false },
          { id: "vAtU", type: "parallel", parents: ["vSupport", "U"], visible: false },
          { id: "S", type: "intersection", parents: ["uAtV", "vAtU"], label: "S" },
          { id: "uLine", type: "arrow", parents: ["O", "U"], label: "u", color: "#315fbd" },
          { id: "vLine", type: "arrow", parents: ["O", "V"], label: "v", color: "#07885f" },
          { id: "sum", type: "arrow", parents: ["O", "S"], label: "u + v", color: "#e28743" },
        ],
      };
      break;
    case "vector-dot-product":
      data = {
        objects: [
          point("O", 0, 0),
          point("U", 3, 1, true),
          point("V", -1, 2, true),
          { id: "uLine", type: "arrow", parents: ["O", "U"], label: "u", color: "#315fbd" },
          { id: "vLine", type: "arrow", parents: ["O", "V"], label: "v", color: "#07885f" },
        ],
        accessibility: { description: "Tích vô hướng hai vectơ. Kéo hai mút U và V để xem u·v, độ dài và góc giữa hai vectơ cập nhật." },
      };
      break;
    case "circle-line":
      data = {
        kind: "geometry",
        objects: [
          point("O", 0, 0),
          point("R", 3, 0),
          point("A", -4, 1, true),
          point("B", 4, 1, true),
          { id: "circle", type: "circle", parents: ["O", "R"] },
          { id: "line", type: "line", parents: ["A", "B"] },
          { id: "I", type: "intersection", parents: ["circle", "line"] },
        ],
      };
      break;
    case "triangle-angles":
      data = {
        kind: "geometry",
        objects: [
          point("A", -3, 0, true),
          point("B", 3, 0, true),
          point("C", 0, 4, true),
          { id: "triangle", type: "polygon", parents: ["A", "B", "C"] },
          { id: "angle", type: "angle", parents: ["A", "C", "B"] },
        ],
      };
      break;
    default:
      throw Error("Mẫu không được hỗ trợ");
  }
  return VisualSpecSchema.parse({ ...common, ...data }) as TwoDVisualSpec;
}
export const goldenScenes = (): TwoDVisualSpec[] =>
  Object.keys(patternNames).map((k) => pattern(k));
