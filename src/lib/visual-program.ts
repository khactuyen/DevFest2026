import {
VisualProgramSchema,
type TwoDVisualSpec,
type VisualProgram
} from "./contracts";
import { validateVisual } from "./validation";

import { AppError } from "./app-error";
import { exactExploreProgram } from "./explore-constructions";
import { compileExpression, polynomialCoefficients } from "./expression";
import { readMidpointRelations } from "./geometry-relations";
import { sketchProgram } from "./sketch-geometry";

/**
 * Compile the restricted visual DSL into the existing JSXGraph contract.
 * The compiler intentionally has no escape hatch for JavaScript or JSXGraph
 * attributes supplied by an LLM.
 */
export function compileVisualProgram(input: unknown, id = "visual_generated"): TwoDVisualSpec {
  const program = VisualProgramSchema.parse(input);
  // A standalone polynomial gets all coefficient controls, including zero c.
  if(program.primitives.length===1 && program.primitives[0].op==="functionGraph" && program.parameters.every(p=>["a","b","c"].includes(p.id))) {
    const graph=program.primitives[0];
    const coefficients=polynomialCoefficients(graph.expression,Object.fromEntries(program.parameters.map(p=>[p.id,p.value])));
    if(coefficients && coefficients.length===3) {
      const abc=[coefficients[2],coefficients[1],coefficients[0]];
      program.parameters=["a","b","c"].map((id,i)=>({id,label:id,value:abc[i],min:-Math.max(5,Math.abs(abc[i])*2),max:Math.max(5,Math.abs(abc[i])*2),step:0.1}));
      graph.expression="a*x^2+b*x+c";
    }
  }
  const hasInteraction = program.parameters.length > 0 || program.primitives.some(
    (primitive) => primitive.op === "point" && primitive.free,
  );
  if (!hasInteraction)
    throw Error("VisualProgram cho Khám phá cần ít nhất một tham số hoặc điểm tự do để tương tác.");
  const parameterMap = new Map(program.parameters.map((parameter) => [parameter.id, parameter]));
  const objects: unknown[] = [];
  for (const primitive of program.primitives) {
    if (primitive.op === "rectangle") {
      const width = parameterMap.get(primitive.widthParameter);
      const heightRatio = parameterMap.get(primitive.heightRatioParameter);
      if (!width || !heightRatio || width.id === heightRatio.id)
        throw new AppError(422, "Hình chữ nhật cần hai tham số chiều rộng và tỉ lệ chiều cao riêng biệt.", "invalid_plan");
      if (width.min <= 0 || heightRatio.min <= 0 || heightRatio.max >= 1)
        throw new AppError(422, "Ràng buộc hình chữ nhật không bảo đảm AB > BC > 0.", "invalid_plan");
      const [x, y] = primitive.origin;
      const number = (value: number) => Number(value.toFixed(5)).toString();
      const [a, b, c, d] = primitive.vertices;
      const color = primitive.color || "#315fbd";
      const point = (pointId: string, label: string, px: string, py: string) => ({
        id: pointId,
        type: "point" as const,
        label,
        parents: [] as string[],
        x: px,
        y: py,
        free: false,
        visible: primitive.visible ?? true,
        color,
      });
      objects.push(
        point(a, "A", number(x), number(y)),
        point(b, "B", `${number(x)}+${width.id}`, number(y)),
        point(c, "C", `${number(x)}+${width.id}`, `${number(y)}+${width.id}*${heightRatio.id}`),
        point(d, "D", number(x), `${number(y)}+${width.id}*${heightRatio.id}`),
        {
          id: primitive.id,
          type: "polygon" as const,
          label: primitive.label || "Hình chữ nhật ABCD",
          parents: [a, b, c, d],
          visible: primitive.visible ?? true,
          color,
        },
      );
      continue;
    }
    const { op, ...rest } = primitive;
    objects.push(op === "offsetPoint" ? {...rest,type:"point",offset:true,free:false} : op === "point" ? { ...rest, type: "point" as const } : { ...rest, type: op });
  }
  return validateVisual({
    id,
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    source: { key: "generated", version: 1 },
    kind: program.kind,
    viewport: program.viewport,
    parameters: program.parameters,
    objects,
    accessibility: { description: program.description || program.title },
  }) as TwoDVisualSpec;
}

export function rectangleAltitudeProgram(): VisualProgram {
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "geometry",
    title: "Đường vuông góc trong hình chữ nhật",
    description: "ABCD là hình chữ nhật với AB > BC. Qua B dựng đường vuông góc AC, cắt AC tại H và cắt CD tại M. Thay đổi chiều rộng và tỉ lệ chiều cao nhưng các ràng buộc hình học luôn được bảo toàn.",
    viewport: { x: [-5, 5], y: [-4, 4] },
    parameters: [
      { id: "width", label: "AB", min: 4, max: 8, value: 6, step: 0.1 },
      { id: "heightRatio", label: "BC / AB", min: 0.4, max: 0.85, value: 0.6, step: 0.01 },
    ],
    primitives: [
      { op: "rectangle", id: "rectangle", label: "Hình chữ nhật ABCD", vertices: ["A", "B", "C", "D"], widthParameter: "width", heightRatioParameter: "heightRatio", origin: [-3, -2], color: "#5266d5" },
      { op: "segment", id: "diagonalAC", label: "AC", parents: ["A", "C"], color: "#5266d5" },
      { op: "perpendicular", id: "lineThroughB", label: "d ⟂ AC", parents: ["diagonalAC", "B"], color: "#df7136" },
      { op: "intersection", id: "H", label: "H", parents: ["lineThroughB", "diagonalAC"], color: "#df7136" },
      { op: "segment", id: "sideCD", label: "CD", parents: ["C", "D"], color: "#315fbd" },
      { op: "intersection", id: "M", label: "M", parents: ["lineThroughB", "sideCD"], color: "#df7136" },
      { op: "segment", id: "BH", label: "BH", parents: ["B", "H"], color: "#df7136" },
      { op: "segment", id: "BM", label: "BM", parents: ["B", "M"], color: "#df7136" },
      { op: "angle", id: "rightAngle", label: "90°", parents: ["A", "H", "B"], color: "#df7136" },
    ],
  });
}

const rectangleAltitudeIntent = (prompt: string) => {
  const text = prompt.toLocaleLowerCase("vi");
  return /hình\s*chữ\s*nhật|rectangle/.test(text) &&
    /vuông\s*góc|perpendicular/.test(text) &&
    /\bac\b/.test(text) &&
    (/\bh\b|điểm\s*h/.test(text)) &&
    (/\bm\b|điểm\s*m/.test(text));
};

function sameEndpoints(parents: string[], first: string, second: string) {
  return parents.length === 2 && ((parents[0] === first && parents[1] === second) || (parents[0] === second && parents[1] === first));
}

function hasSegment(program: VisualProgram, first: string, second: string) {
  return program.primitives.some((item) => (item.op === "segment" || item.op === "line") && sameEndpoints(item.parents, first, second));
}

function hasConstrainedPerpendicular(program: VisualProgram, first: [string, string], second: [string, string]) {
  const midpointProjection = program.primitives.some((projection) => {
    if (projection.op !== "projection") return false;
    const base = program.primitives.find((item) => item.id === projection.parents[1]);
    if (!base || (base.op !== "line" && base.op !== "segment")) return false;
    return (sameEndpoints(base.parents, first[0], first[1]) &&
      (projection.parents[0] === second[0] && projection.id === second[1] || projection.parents[0] === second[1] && projection.id === second[0]) &&
      hasSegment(program, projection.parents[0], projection.id)) ||
      (sameEndpoints(base.parents, second[0], second[1]) &&
      (projection.parents[0] === first[0] && projection.id === first[1] || projection.parents[0] === first[1] && projection.id === first[0]) &&
      hasSegment(program, projection.parents[0], projection.id));
  });
  if (midpointProjection) return true;
  return program.primitives.some((construction) => {
    if (construction.op !== "perpendicular") return false;
    const base = program.primitives.find((item) => item.id === construction.parents[0]);
    if (!base || (base.op !== "line" && base.op !== "segment")) return false;
    const firstIsBase = sameEndpoints(base.parents, first[0], first[1]);
    const secondIsBase = sameEndpoints(base.parents, second[0], second[1]);
    if (!firstIsBase && !secondIsBase) return false;
    const through = construction.parents[1];
    const target = firstIsBase ? second : first;
    if (through !== target[0] && through !== target[1]) return false;
    const foot = target[0] === through ? target[1] : target[0];
    const intersection = program.primitives.some((item) => item.op === "intersection" &&
      sameEndpoints(item.parents, construction.id, base.id) && item.id === foot);
    return intersection && hasSegment(program, through, foot);
  });
}

function hasConstrainedParallel(program: VisualProgram, first: [string, string], second: [string, string]) {
  return program.primitives.some((construction) => {
    if (construction.op !== "parallel") return false;
    const base = program.primitives.find((item) => item.id === construction.parents[0]);
    if (!base || (base.op !== "line" && base.op !== "segment")) return false;
    const firstIsBase = sameEndpoints(base.parents, first[0], first[1]);
    const secondIsBase = sameEndpoints(base.parents, second[0], second[1]);
    if (!firstIsBase && !secondIsBase) return false;
    const through = construction.parents[1];
    const target = firstIsBase ? second : first;
    if (through !== target[0] && through !== target[1]) return false;
    const endpoint = target[0] === through ? target[1] : target[0];
    const intersection = program.primitives.some((item) => item.op === "intersection" && item.id === endpoint &&
      item.parents.includes(construction.id));
    return intersection && hasSegment(program, through, endpoint);
  });
}

function hasConstrainedMidpoint(program: VisualProgram, pointId: string, first: string, second: string) {
  return program.primitives.some((item) => item.op === "midpoint" && item.id === pointId && sameEndpoints(item.parents, first, second));
}

function namedPair(text: string, relation: RegExp): [[string, string], [string, string]] | null {
  const match = relation.exec(text);
  if (!match) return null;
  const pair = (value: string): [string, string] => value.replace(/\s/g, "").toUpperCase().split("") as [string, string];
  return [pair(match[1]), pair(match[2])];
}

function fixedDirection(program: VisualProgram, [first, second]: [string, string]) {
  const a = program.primitives.find((item) => item.id === first);
  const b = program.primitives.find((item) => item.id === second);
  if (a?.op !== "point" || b?.op !== "point") return null;
  const drawn = hasSegment(program, first, second) || program.primitives.some((item) =>
    item.op === "polygon" && item.parents.some((id, index) =>
      sameEndpoints([id, item.parents[(index + 1) % item.parents.length]], first, second)));
  if (!drawn) return null;
  const values = Object.fromEntries(program.parameters.map((parameter) => [parameter.id, parameter.value]));
  const coordinate = (value: number | string) =>
    typeof value === "number" ? value : compileExpression(value, Object.keys(values))(values);
  try {
    const x = coordinate(a.x), y = coordinate(a.y);
    const dx = coordinate(b.x) - x, dy = coordinate(b.y) - y;
    const length = Math.hypot(dx, dy);
    return length > 1e-8 && Number.isFinite(length)
      ? { x: dx / length, y: dy / length, origin: [x, y] }
      : null;
  } catch {
    return null;
  }
}

function hasFixedRelation(program: VisualProgram, [first, second]: [[string, string], [string, string]], perpendicular: boolean) {
  const a = fixedDirection(program, first), b = fixedDirection(program, second);
  if (!a || !b) return false;
  if (perpendicular) return Math.abs(a.x * b.x + a.y * b.y) < 1e-6;
  const dx = b.origin[0] - a.origin[0], dy = b.origin[1] - a.origin[1];
  return Math.abs(a.x * b.y - a.y * b.x) < 1e-6 && Math.abs(a.x * dy - a.y * dx) > 1e-8;
}

export function validateVisualProgramSemantics(program: VisualProgram, prompt: string, fixedFigure = false) {
  const text = prompt.toLocaleLowerCase("vi");
  for(const match of prompt.matchAll(/(?:[gG]óc|[aA]ngle)\s*([A-Z])([A-Z])([A-Z])\s*(?:=|bằng)?\s*(\d+(?:[.,]\d+)?)?\s*(?:°|độ)?/g)) {
    const parents=match.slice(1,4);
    if(!program.primitives.some(p=>p.op==="angle" && p.parents[1]===parents[1] && (p.parents[0]===parents[0] && p.parents[2]===parents[2] || p.parents[2]===parents[0] && p.parents[0]===parents[2])))throw new AppError(422,`Thiếu ký hiệu góc ${parents.join("")} đúng ba điểm đề yêu cầu.`,"invalid_plan");
  }
  for(const match of prompt.matchAll(/đường\s*chéo\s*([A-Z])([A-Z])/g))if(!hasSegment(program,match[1],match[2]))throw new AppError(422,`Thiếu đường chéo ${match[1]}${match[2]}.`,"invalid_plan");
  if(/bán\s*kính/i.test(prompt) && /kéo\s*tâm/i.test(prompt))for(const circle of program.primitives.filter(p=>p.op==="circle")) {
    if(circle.op!=="circle" || circle.radius!==undefined)continue;
    const center=program.primitives.find(p=>p.id===circle.parents[0]),through=program.primitives.find(p=>p.id===circle.parents[1]);
    if(center?.op==="point" && center.free && through?.op!=="offsetPoint")throw new AppError(422,"Đường tròn kéo tâm cần bán kính scalar hoặc offsetPoint phụ thuộc tâm, không được giữ đầu bán kính ở tọa độ tuyệt đối.","invalid_plan");
  }
  if (rectangleAltitudeIntent(prompt)) {
    const rectangle = program.primitives.find((item) => item.op === "rectangle");
    if (!rectangle || rectangle.vertices.join(",") !== "A,B,C,D")
      throw new AppError(422, "Kế hoạch chưa dựng ABCD thành hình chữ nhật có ràng buộc.", "invalid_plan");
    const parameters = new Map(program.parameters.map((parameter) => [parameter.id, parameter]));
    const width = parameters.get(rectangle.widthParameter);
    const ratio = parameters.get(rectangle.heightRatioParameter);
    if (!width || !ratio || width.min <= 0 || ratio.min <= 0 || ratio.max >= 1)
      throw new AppError(422, "Kế hoạch không bảo đảm AB > BC > 0 trong toàn bộ miền tham số.", "invalid_plan");
    const diagonal = program.primitives.find((item) => (item.op === "segment" || item.op === "line") && sameEndpoints(item.parents, "A", "C"));
    const cd = program.primitives.find((item) => (item.op === "segment" || item.op === "line") && sameEndpoints(item.parents, "C", "D"));
    if (!diagonal || !cd) throw new AppError(422, "Kế hoạch thiếu AC hoặc CD để dựng giao điểm.", "invalid_plan");
    const perpendicular = program.primitives.find((item) => item.op === "perpendicular" && item.parents[0] === diagonal.id && item.parents[1] === "B");
    if (!perpendicular) throw new AppError(422, "Chưa dựng đường thẳng qua B vuông góc AC.", "invalid_plan");
    const h = program.primitives.find((item) => item.op === "intersection" && item.id === "H" && sameEndpoints(item.parents, perpendicular.id, diagonal.id));
    if (!h) throw new AppError(422, "Chưa dựng H là giao điểm của đường vuông góc với AC.", "invalid_plan");
    const m = program.primitives.find((item) => item.op === "intersection" && item.id === "M" && sameEndpoints(item.parents, perpendicular.id, cd.id));
    if (!m) throw new AppError(422, "Chưa dựng M là giao điểm của đường vuông góc với cạnh CD.", "invalid_plan");
  }

  // Point/segment labels are uppercase in the math notation. Requiring them
  // prevents accented Vietnamese words (e.g. "đường") from being tokenized
  // into accidental pairs such as "NG".
  const perpendicular = namedPair(prompt, /([A-Z]\s*[A-Z])\s*(?:vuông\s*góc(?:\s*với)?|orthogonal\s*to|⊥)\s*([A-Z]\s*[A-Z])/);
  if (perpendicular && !hasConstrainedPerpendicular(program, perpendicular[0], perpendicular[1]) &&
    !(fixedFigure && hasFixedRelation(program, perpendicular, true)))
    throw new AppError(422, `Kế hoạch chưa thể hiện ${perpendicular[0].join("")} vuông góc ${perpendicular[1].join("")}${fixedFigure ? "." : " bằng quan hệ phụ thuộc có thể kéo."}`, "invalid_plan");

  const parallel = namedPair(prompt, /([A-Z]\s*[A-Z])\s*(?:song\s*song(?:\s*với)?|parallel\s*to|∥|\/\/)\s*([A-Z]\s*[A-Z])/);
  if (parallel && !hasConstrainedParallel(program, parallel[0], parallel[1]) &&
    !(fixedFigure && hasFixedRelation(program, parallel, false)))
    throw new AppError(422, `Kế hoạch chưa ràng buộc ${parallel[0].join("")} song song ${parallel[1].join("")}${fixedFigure ? "." : " khi kéo hình."}`, "invalid_plan");

  const midpointClaims = readMidpointRelations(prompt);
  if (midpointClaims.issues.length)
    throw new AppError(422, midpointClaims.issues[0], "invalid_plan");
  for (const { point: pointId, ends: [first, second] } of midpointClaims.relations) {
    if (!hasConstrainedMidpoint(program, pointId, first, second))
      throw new AppError(
        422,
        `Điểm ${pointId} chưa được dựng phụ thuộc làm trung điểm của ${first}${second}.`,
        "invalid_plan",
      );
  }

  const namedIntersection = /(?:điểm\s*)?([a-z])\s*(?:là\s*)?(?:giao\s*điểm|intersection)\s*(?:của\s*)?([a-z]\s*[a-z])\s*(?:và|with)\s*([a-z]\s*[a-z])/i.exec(text);
  if (namedIntersection) {
    const pointId = namedIntersection[1].toUpperCase();
    const pairs = [namedIntersection[2], namedIntersection[3]].map((value) => value.replace(/\s/g, "").toUpperCase().split(""));
    const lines = pairs.map(([first, second]) => program.primitives.find((item) => (item.op === "line" || item.op === "segment") && sameEndpoints(item.parents, first, second)));
    if (lines.some((item) => !item) || !program.primitives.some((item) => item.op === "intersection" && item.id === pointId && item.parents.every((id) => lines.some((line) => line?.id === id))))
      throw new AppError(422, `Chưa dựng ${pointId} phụ thuộc làm giao điểm của hai đường được nêu.`, "invalid_plan");
  }

  const triangle = /tam\s*giác|triangle/.test(text);
  if (triangle && /đường\s*cao|hình\s*chiếu|altitude/.test(text)) {
    const triangleNames = /(?:tam\s*giác|triangle)\s*([a-z]{3})/i
      .exec(text)?.[1]
      .toUpperCase();
    const requested = /(?:đường\s*cao|altitude)\s*([A-Z])([A-Z])/i.exec(prompt);
    const candidates = program.primitives.filter(
      (item) =>
        item.op === "projection" &&
        (!requested || item.id === requested[2].toUpperCase()),
    );
    const valid = candidates.some((projection) => {
      if (projection.op !== "projection" || !triangleNames) return false;
      const vertex = projection.parents[0];
      const baseEnds = triangleNames.split("").filter((id) => id !== vertex);
      const base = program.primitives.find(
        (item) => item.id === projection.parents[1],
      );
      return (
        triangleNames.includes(vertex) &&
        baseEnds.length === 2 &&
        (!requested || requested[1].toUpperCase() === vertex) &&
        !!base &&
        (base.op === "line" || base.op === "segment") &&
        sameEndpoints(base.parents, baseEnds[0], baseEnds[1]) &&
        hasSegment(program, vertex, projection.id) &&
        program.primitives.some(
          (item) =>
            item.op === "polygon" &&
            triangleNames.split("").every((id) => item.parents.includes(id)),
        )
      );
    });
    if (!valid)
      throw new AppError(
        422,
        "Đường cao chưa được ràng buộc bằng hình chiếu lên cạnh đối diện.",
        "invalid_plan",
      );
  }

  if (triangle) {
    const names = /(?:tam\s*giác|triangle)\s*([a-z]{3})/i
      .exec(text)?.[1]
      .toUpperCase();
    for (const median of text.matchAll(
      /(?:trung\s*tuyến|median)\s*([a-z])\s*([a-z])/gi,
    )) {
      const vertex = median[1].toUpperCase(),
        middle = median[2].toUpperCase();
      const base = names?.split("").filter((p) => p !== vertex);
      if (
        !base ||
        base.length !== 2 ||
        !hasConstrainedMidpoint(program, middle, base[0], base[1]) ||
        !hasSegment(program, vertex, middle)
      )
        throw new AppError(
          422,
          `Trung tuyến ${vertex}${middle} phải nối đỉnh với trung điểm cạnh đối diện.`,
          "invalid_plan",
        );
    }
  }

  // Math endpoint names are uppercase; ordinary Vietnamese words and ax must
  // never be interpreted as a claim that two geometry segments are equal.
  const equalLength = namedPair(prompt, /([A-Z]\s*[A-Z])\s*(?:bằng|có\s*độ\s*dài\s*bằng|equal\s*to|=)\s*([A-Z]\s*[A-Z])/);
  if (equalLength) {
    const [first, second] = equalLength;
    const guaranteedByRectangle = program.primitives.some((item) => item.op === "rectangle" &&
      ((sameEndpoints(first, item.vertices[0], item.vertices[1]) && sameEndpoints(second, item.vertices[2], item.vertices[3])) ||
       (sameEndpoints(first, item.vertices[1], item.vertices[2]) && sameEndpoints(second, item.vertices[3], item.vertices[0]))));
    if (!guaranteedByRectangle)
      throw new AppError(422, "Bộ dựng hiện chưa hỗ trợ ràng buộc hai đoạn bằng nhau trong cấu trúc này. Đây là giới hạn của bộ dựng, không phải kết luận đề thiếu dữ kiện; hãy dùng một mẫu hình đã hỗ trợ.", "unsupported");
  }

  if (/tích\s*vô\s*hướng|dot\s*product/.test(text)) {
    const vectors = program.primitives.filter((item) => (item.op === "segment" || item.op === "line") && item.parents.includes("O"));
    const freeEndpoints = vectors.map((line) => line.op === "segment" || line.op === "line" ? line.parents.find((parent) => parent !== "O") : undefined)
      .filter((pointId): pointId is string => Boolean(program.primitives.find((item) => item.op === "point" && item.id === pointId && item.free)));
    if (new Set(freeEndpoints).size < 2)
      throw new AppError(422, "Tích vô hướng cần hai vectơ chung gốc có đầu mút tự do để đo góc và cập nhật kết quả khi kéo.", "invalid_plan");
  }
}

export function triangleAltitudeProgram(): VisualProgram {
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "geometry",
    title: "Đường cao trong tam giác",
    description: "Kéo các đỉnh A, B hoặc C. H luôn là hình chiếu vuông góc của A lên đường thẳng BC.",
    viewport: { x: [-6, 6], y: [-4, 6] },
    parameters: [],
    primitives: [
      { op: "point", id: "A", label: "A", x: -1, y: 4, free: true, color: "#17835e" },
      { op: "point", id: "B", label: "B", x: -4, y: -2, free: true, color: "#17835e" },
      { op: "point", id: "C", label: "C", x: 4, y: -2, free: true, color: "#17835e" },
      { op: "polygon", id: "triangle", label: "Tam giác ABC", parents: ["A", "B", "C"], color: "#4f67d8" },
      { op: "line", id: "baseLine", label: "BC", parents: ["B", "C"], color: "#92a39a" },
      { op: "projection", id: "H", label: "H", parents: ["A", "baseLine"], color: "#dc7d3b" },
      { op: "segment", id: "altitude", label: "AH", parents: ["A", "H"], color: "#dc7d3b" },
      { op: "angle", id: "rightAngle", label: "90°", parents: ["A", "H", "B"], color: "#dc7d3b" },
    ],
  });
}

function triangleMedianProgram(): VisualProgram {
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "geometry",
    title: "Đường trung tuyến trong tam giác",
    description: "Kéo các đỉnh. M luôn là trung điểm của BC, do đó AM là đường trung tuyến từ A.",
    viewport: { x: [-6, 6], y: [-4, 6] },
    parameters: [],
    primitives: [
      { op: "point", id: "A", label: "A", x: -1, y: 4, free: true, color: "#17835e" },
      { op: "point", id: "B", label: "B", x: -4, y: -2, free: true, color: "#17835e" },
      { op: "point", id: "C", label: "C", x: 4, y: -2, free: true, color: "#17835e" },
      { op: "polygon", id: "triangle", label: "Tam giác ABC", parents: ["A", "B", "C"], color: "#4f67d8" },
      { op: "midpoint", id: "M", label: "M", parents: ["B", "C"], color: "#dc7d3b" },
      { op: "segment", id: "median", label: "AM", parents: ["A", "M"], color: "#dc7d3b" },
    ],
  });
}

function cubicFunctionProgram(): VisualProgram {
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "cartesian",
    title: "Đồ thị hàm số bậc ba",
    description: "Thay đổi các hệ số để quan sát điểm uốn, chiều biến thiên và vị trí của đồ thị hàm số bậc ba.",
    viewport: { x: [-6, 6], y: [-8, 8] },
    parameters: [
      { id: "a", label: "a", min: -2, max: 2, value: 1, step: 0.1 },
      { id: "b", label: "b", min: -4, max: 4, value: 0, step: 0.1 },
      { id: "c", label: "c", min: -5, max: 5, value: 0, step: 0.1 },
      { id: "d", label: "d", min: -5, max: 5, value: 0, step: 0.1 },
    ],
    primitives: [
      { op: "functionGraph", id: "graph", label: "f(x)", expression: "a*x^3+b*x^2+c*x+d", color: "#07885f" },
    ],
  });
}

function vectorDotProductProgram(): VisualProgram {
  return VisualProgramSchema.parse({
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "cartesian",
    title: "Tích vô hướng hai vectơ",
    description: "Kéo các mút U và V. Giá trị u·v, độ dài và góc giữa hai vectơ được cập nhật theo thời gian thực.",
    viewport: { x: [-6, 6], y: [-5, 5] },
    parameters: [],
    primitives: [
      { op: "point", id: "O", label: "O", x: 0, y: 0, color: "#244f3c" },
      { op: "point", id: "U", label: "U", x: 3, y: 1, free: true, color: "#315fbd" },
      { op: "point", id: "V", label: "V", x: -1, y: 2, free: true, color: "#07885f" },
      { op: "segment", id: "uLine", label: "u", parents: ["O", "U"], color: "#315fbd" },
      { op: "segment", id: "vLine", label: "v", parents: ["O", "V"], color: "#07885f" },
    ],
  });
}

/** A deterministic fallback for common constructions when no model is configured. */
export function programFromPrompt(prompt: string): VisualProgram | null {
  const normalized = prompt.toLocaleLowerCase("vi");
  const equation=/(?:y|f\s*\(x\))\s*=\s*([\d.x²³+\-*^/(){}\s−]+)/i.exec(prompt)?.[1].trim().replace(/[.\s]+$/,"");
  if(equation && !/đường\s*tròn|tam\s*giác|giao\s*điểm|tiếp\s*tuyến|\bđỉnh\b|\bnghiệm\b/i.test(prompt) && polynomialCoefficients(equation.replace(/²/g,"^2").replace(/³/g,"^3").replace(/−/g,"-").replace(/(\d)x/g,"$1*x"))?.length===3) {
    return sketchProgram({title:"Hàm số bậc hai",description:"Đồ thị theo biểu thức đã nhập. Điều chỉnh a, b, c; c=0 vẫn là hệ số có thể thay đổi.",expression:equation,transcription:equation,points:[],edges:[],circles:[],polygons:[],ambiguities:[]});
  }
  const exact=exactExploreProgram(prompt);
  if(exact)return exact;
  if (rectangleAltitudeIntent(prompt)) return rectangleAltitudeProgram();
  if (/tích\s*vô\s*hướng|nhân\s*(hai|2)?\s*(véc\s*tơ|vector)|dot\s*product/.test(normalized))
    return vectorDotProductProgram();
  const isTriangle = /tam\s*giác|triangle/.test(normalized);
  // Do not replace named/numeric geometry facts with an unrelated illustrative template.
  const simpleTriangle=isTriangle && /(?:tam\s*giác|triangle)\s*ABC/i.test(prompt)
    && !/\b[A-Z]{2}\s*=\s*[\dA-Z]/.test(prompt)
    && !/tam\s*giác\s*(?:cân|đều|tù|vuông)|góc\s*[A-Z]{3}\s*(?:=|bằng)\s*(?!90\b)\d/i.test(prompt);
  if (simpleTriangle && /đường\s*cao|hình\s*chiếu|vuông\s*góc|altitude/.test(normalized))
    return triangleAltitudeProgram();
  if (simpleTriangle && /trung\s*tuyến|trung\s*điểm|median/.test(normalized))
    return triangleMedianProgram();
  if (/bậc\s*3|bậc\s*ba|cubic|x\s*(\^\s*3|³)/.test(normalized))
    return cubicFunctionProgram();
  return null;
}
