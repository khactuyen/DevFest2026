export { makeMaterial } from "./material-factory";
import { z } from "zod";
import { AppError } from "./app-error";
import { VisualSpecSchema,type AgentResult,type ThreeVisualSpec,type VisualSpec } from "./contracts";
import { namedCube } from "./explore-constructions";
import { compileExpression } from "./expression";
import { isOpenRouterConfigured,requestOpenRouterJson } from "./openrouter";
import { pattern,patternNames } from "./patterns";
import { recognizedProblemVisual } from "./recognized-problem-visual";
import { analyzeSolveProblem,solveProblem } from "./solve-engine";
import { buildConstrainedTetrahedron,isConstrainedTetrahedronProblem } from "./tetrahedron-problem";
import { threePatternNames } from "./three-patterns";
import { validateAgent } from "./validation";
import { instantiateVisualPattern,visualPatterns } from "./visual-patterns";
import { compileVisualProgram } from "./visual-program";
import { generateVisualProgram } from "./visual-program-generation";
export const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  method: z.enum(["formula", "square", "isolate", "sign-chart"]).optional(),
  pattern: z.string().max(64).optional(),
  visual: z.unknown().optional(),
  state: z.unknown().optional(),
});

const modelNames: Record<string, string> = { ...patternNames, ...threePatternNames };
const supportedPatternKeys = new Set(visualPatterns.map((item) => item.key));
type PatternMatch = { key: string; reason: string; score: number };
const patternMatchers: Array<{ key: string; pattern: RegExp; reason: string }> = [
  { key: "cube-slice", pattern: /thiết\s*diện|mặt\s*phẳng\s*cắt/i, reason: "nhận diện bài toán thiết diện không gian" },
  { key: "dodecahedron", pattern: /mười\s*hai\s*mặt|dodeca/i, reason: "nhận diện đa diện đều mười hai mặt" },
  { key: "icosahedron", pattern: /hai\s*mươi\s*mặt|icosa/i, reason: "nhận diện đa diện đều hai mươi mặt" },
  { key: "tetrahedron", pattern: /tứ\s*diện|tetra/i, reason: "nhận diện tứ diện" },
  { key: "octahedron", pattern: /bát\s*diện|octa/i, reason: "nhận diện bát diện" },
  { key: "triangular-prism", pattern: /lăng\s*trụ/i, reason: "nhận diện lăng trụ" },
  { key: "square-pyramid", pattern: /hình\s*chóp|kim\s*tự\s*tháp/i, reason: "nhận diện hình chóp" },
  { key: "cylinder", pattern: /hình\s*trụ|cylinder/i, reason: "nhận diện hình trụ" },
  { key: "cone", pattern: /hình\s*nón|cone/i, reason: "nhận diện hình nón" },
  { key: "sphere", pattern: /hình\s*cầu|mặt\s*cầu|sphere/i, reason: "nhận diện hình cầu" },
  { key: "cube", pattern: /lập\s*phương|cube/i, reason: "nhận diện hình lập phương" },
  { key: "triangle-thales", pattern: /thales|thalès|nửa\s*đường\s*tròn/i, reason: "nhận diện định lý Thales" },
  { key: "similar-triangles", pattern: /đồng\s*dạng|similar/i, reason: "nhận diện tam giác đồng dạng" },
  { key: "circle-line", pattern: /đường\s*thẳng.*đường\s*tròn|đường\s*tròn.*đường\s*thẳng|tiếp\s*tuyến|cát\s*tuyến/i, reason: "nhận diện quan hệ đường thẳng và đường tròn" },
  { key: "unit-circle", pattern: /đường\s*tròn\s*lượng\s*giác|unit\s*circle/i, reason: "nhận diện đường tròn lượng giác" },
  { key: "sine-wave", pattern: /sóng|sin\s*\(|hàm\s*sin|dao\s*động/i, reason: "nhận diện sóng hình sin" },
  { key: "vector-dot-product", pattern: /tích\s*vô\s*hướng|nhân\s*(hai|2)?\s*(véc\s*tơ|vector)|dot\s*product/i, reason: "nhận diện tích vô hướng hai vectơ" },
  { key: "vector-addition", pattern: /vect|vector/i, reason: "nhận diện phép toán vectơ" },
  { key: "function-transform", pattern: /biến\s*đổi|tịnh\s*tiến|đối\s*xứng.*đồ\s*thị|transform/i, reason: "nhận diện biến đổi đồ thị" },
  { key: "linear-function", pattern: /bậc\s*nhất|linear|đường\s*thẳng\s*y\s*=/i, reason: "nhận diện hàm số bậc nhất" },
  { key: "quadratic-roots", pattern: /bậc\s*hai|parabol|quadratic|x\s*(\^\s*2|²)/i, reason: "nhận diện hàm số bậc hai" },
  { key: "triangle-angles", pattern: /tam\s*giác|triangle|góc\s*trong/i, reason: "nhận diện quan hệ góc trong tam giác" },
];
function identifyPatterns(prompt: string, explicit?: string): PatternMatch[] {
  if (explicit && supportedPatternKeys.has(explicit)) return [{ key: explicit, reason: "mô hình do người dùng chọn", score: 100 }];
  const unique = new Map<string, PatternMatch>();
  for (const item of patternMatchers) {
    if (!item.pattern.test(prompt.toLocaleLowerCase("vi"))) continue;
    const match = { key: item.key, reason: item.reason, score: item.pattern.source.length };
    if (!unique.has(match.key) || unique.get(match.key)!.score < match.score) unique.set(match.key, match);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}
function coefficients(prompt: string): number[] {
  let s = prompt
    .toLowerCase()
    .replace(/²/g, "^2")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\{2\}/g, "2")
    .replace(/\s/g, "");
  s = s.replace(/^y=/, "");
  if (s.endsWith("=0")) s = s.slice(0, -2);
  if (s === "ax^2" || s === "a*x^2" || s === "y=ax^2") return [1, 0, 0];
  if (!/^[\d.x+\-*/^()]+$/.test(s))
    throw Error(
      "Chế độ mẫu giải biểu thức dạng x^2-5*x+6=0. Hãy nhập công thức hoặc cấu hình LLM cho đề bài tự do.",
    );
  s = s.replace(/(\d|\))x/g, "$1*x");
  const f = compileExpression(s);
  const c = f({ x: 0 }),
    a = (f({ x: 1 }) + f({ x: -1 }) - 2 * c) / 2,
    b = (f({ x: 1 }) - f({ x: -1 })) / 2;
  if (
    ![a, b, c].every(Number.isFinite) ||
    Math.abs(a) < 1e-9 ||
    [2, 3, -2, 0.5].some(
      (x) => Math.abs(f({ x }) - (a * x * x + b * x + c)) > 1e-7,
    )
  )
    throw Error("Chế độ mẫu hiện chỉ giải phương trình bậc hai với hệ số số.");
  if (Math.max(...[a, b, c].map(Math.abs)) > 1000)
    throw Error("Hệ số quá lớn cho canvas mẫu");
  return [a, b, c];
}

function explicitMeasure(prompt: string, names: string[]): number | undefined {
  const number = "([+-]?\\d+(?:[.,]\\d+)?)";
  for (const name of names) {
    const symbolOnly = /^[arh]\\s/.test(name);
    const match = new RegExp(`(?:${name})\\s*(?:=|:|là|bằng|dài|cao)?\\s*${number}\\s*(?:mm|cm|dm|m)?\\b`, symbolOnly ? "" : "i").exec(prompt);
    if (!match) continue;
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0 && value <= 100) return value;
  }
  return undefined;
}

function explicitSignedMeasure(prompt: string, names: string[]): number | undefined {
  const number = "([+-]?\\d+(?:[.,]\\d+)?)";
  for (const name of names) {
    const match = new RegExp(`(?:${name})\\s*(?:=|:|là|ở|tại|bằng)?\\s*${number}\\s*(?:mm|cm|dm|m)?\\b`, "i").exec(prompt);
    if (!match) continue;
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value) && Math.abs(value) <= 100) return value;
  }
  return undefined;
}

function setVisualParameter(spec: ThreeVisualSpec, id: string, value: number) {
  const parameter = spec.parameters.find((item) => item.id === id);
  if (!parameter) return;
  parameter.value = value;
  parameter.min = Math.min(parameter.min, value * 0.8);
  parameter.max = Math.max(parameter.max, value * 1.2);
  parameter.step = Math.max(0.01, Number((value / 100).toPrecision(1)));
}

function visualForPrompt(key: string, prompt: string): VisualSpec {
  const initial = instantiateVisualPattern(key);
  if (initial.dimension !== "3d") return initial;
  const spec = structuredClone(initial) as ThreeVisualSpec;
  const side = explicitMeasure(prompt, [
    "độ dài cạnh(?: đáy)?",
    "cạnh(?: của (?:hình )?lập phương| lập phương| đáy)?",
    "a\\s*(?:=|:)",
  ]);
  const radius = explicitMeasure(prompt, ["bán kính(?: đáy)?", "r\\s*(?:=|:)"]);
  const height = explicitMeasure(prompt, ["chiều cao", "độ cao", "h\\s*(?:=|:)"]);

  if (["cube", "tetrahedron", "octahedron", "dodecahedron", "icosahedron"].includes(key) && side) {
    setVisualParameter(spec, "size", side);
  } else if (key === "cube-slice" && side) {
    setVisualParameter(spec, "size", side);
  }
  if (["sphere", "cylinder", "cone"].includes(key) && radius) setVisualParameter(spec, "radius", radius);
  if (["cylinder", "cone", "triangular-prism", "square-pyramid"].includes(key) && height) setVisualParameter(spec, "height", height);
  if (["triangular-prism", "square-pyramid"].includes(key)) {
    const baseSide = explicitMeasure(prompt, ["cạnh đáy", "cạnh của đáy"]);
    const object = spec.objects.find((item) => item.type === (key === "triangular-prism" ? "prism" : "pyramid"));
    if (baseSide && object?.sides) {
      const circumradius = baseSide / (2 * Math.sin(Math.PI / object.sides));
      setVisualParameter(spec, "radius", circumradius);
    }
  }
  if (key === "cube-slice") {
    const slice = explicitSignedMeasure(prompt, ["vị trí mặt phẳng cắt", "mặt phẳng cắt tại y", "y\\s*(?:=|:)"]);
    const sideLength = spec.parameters.find((item) => item.id === "size")?.value || 3.2;
    const sliceParameter = spec.parameters.find((item) => item.id === "sliceY");
    if (sliceParameter) {
      sliceParameter.min = -sideLength / 2;
      sliceParameter.max = sideLength / 2;
      if (slice !== undefined) sliceParameter.value = Math.min(sliceParameter.max, slice);
    }
  }
  return VisualSpecSchema.parse(spec);
}

function isThreeDimensionalKey(key: string | undefined): key is keyof typeof threePatternNames {
  return Boolean(key && Object.prototype.hasOwnProperty.call(threePatternNames, key));
}

function unsupportedSolidDescription(prompt: string) {
  const text = prompt.toLocaleLowerCase("vi");
  if (/hình hộp chữ nhật|khối hộp chữ nhật/.test(text)) return "hình hộp chữ nhật";
  if (/lăng trụ/.test(text) && !/lăng trụ tam giác/.test(text)) return "dạng lăng trụ này";
  if (/hình chóp/.test(text) && /đáy tam giác|chóp tam giác|đáy ngũ giác|chóp ngũ giác/.test(text)) return "hình chóp có đáy không phải hình vuông";
  if (/thiết diện|mặt phẳng cắt/.test(text) && !/lập phương|cube/.test(text)) return "thiết diện của khối này";
  return null;
}

function fallback(input: z.infer<typeof RequestSchema>): AgentResult {
  const matches = identifyPatterns(input.prompt, input.pattern);
  const key = matches[0]?.key;
  if (!key)
    throw Error(
      "Chưa nhận diện được chủ đề. Hãy mô tả rõ hơn hoặc chọn mô hình trong danh sách.",
    );
  let abc: number[] | undefined;
  if (
    key === "quadratic-roots" &&
    /^[\s\d.xyab+c=*^²{}\\()\-]+$/i.test(input.prompt)
  )
    abc = coefficients(input.prompt);
  const visual = key === "quadratic-roots" && abc
        ? { ...pattern(key, abc), source: { key, version: 1 } }
        : visualForPrompt(key, input.prompt);
  const result: AgentResult = {
    title: modelNames[key],
    explanation: `Đã chọn ${modelNames[key]}: ${matches[0].reason}. Hãy thay đổi một tham số hoặc chọn đối tượng trên hình để kiểm chứng nhận xét của bạn.`,
    visual,
    entities: visual.objects
      .filter((o) => o.type !== "text" && o.type !== "verticalMarker" && o.type !== "horizontalMarker")
      .map((o) => ({
        id: o.id,
        type:
          o.type === "functionGraph"
            ? "function"
            : (["point", "circle", "polygon", "line"].includes(o.type)
                ? o.type
                : "derived") as "point" | "circle" | "polygon" | "line" | "derived",
        label: o.label || o.id,
        expression: "expression" in o ? o.expression : undefined,
        role: "given",
      })),
    methods: [],
    steps: [],
    suggestions: ["Giới thiệu", "Tính chất", "Ứng dụng", "Thử ví dụ"],
    exploration: {
            detected: matches[0].reason,
            question: `Trước khi đọc lời giải thích, hãy thay đổi một tham số của ${modelNames[key]} và nêu điều gì vẫn được giữ nguyên.`,
            alternatives: matches.map(({ key: matchKey, reason }) => ({
              key: matchKey,
              label: modelNames[matchKey],
              reason,
            })),
          },
    source: "template",
  };
  return validateAgent(result);
}

export function resultFromProgram(
  program: NonNullable<AgentResult["program"]>,
  source: "template" | "llm",
): AgentResult {
  const visual = compileVisualProgram(program, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
  const graph = visual.objects.find((object) => object.type === "functionGraph");
  if(source==="template" && graph?.expression==="a*x^2+b*x+c")visual.source={key:"quadratic-roots",version:1};
  const isFunctionModel = Boolean(graph);
  const hasParameters = program.parameters.length > 0;
  const formula = graph && "expression" in graph ? graph.expression : undefined;
  return validateAgent({
    title: program.title,
    explanation: program.description || (isFunctionModel
      ? "Mô hình biểu diễn hàm số từ đề bài. Thay đổi hệ số để quan sát đồ thị và các đại lượng liên quan cập nhật theo thời gian thực."
      : "Mô hình được tạo từ các quan hệ hình học của đề bài. Kéo các điểm tự do để kiểm chứng các đối tượng phụ thuộc."),
    visual,
    program,
    entities: visual.objects
      .filter((object) => object.type !== "text")
      .map((object) => ({
        id: object.id,
        type: (["point", "circle", "polygon", "line", "functionGraph"].includes(object.type)
          ? (object.type === "functionGraph" ? "function" : object.type)
          : "derived") as "point" | "circle" | "polygon" | "line" | "function" | "derived",
        label: object.label || object.id,
        expression: "expression" in object ? object.expression : undefined,
        role: ["point"].includes(object.type) ? "given" : "derived",
      })),
    methods: [],
    steps: [
      {
        id: "observe_construction",
        title: isFunctionModel ? "Đọc công thức và hệ số" : "Quan sát cấu trúc",
        content: isFunctionModel
          ? `Xác định biểu thức ${formula ? `f(x) = ${formula}` : "của hàm số"} và vai trò của từng hệ số điều khiển.`
          : "Xác định các điểm tự do, các đối tượng phụ thuộc và quan hệ hình học được giữ lại.",
        visualId: visual.id,
        visualActions: [{ type: "highlight", targets: visual.objects.slice(0, Math.min(4, visual.objects.length)).map((object) => object.id) }],
      },
      {
        id: "test_construction",
        title: isFunctionModel ? "Thay đổi hệ số và kiểm chứng" : "Kéo điểm và kiểm chứng",
        content: isFunctionModel
          ? (hasParameters
            ? "Thay đổi từng hệ số một, dự đoán dạng đồ thị rồi kiểm tra bằng hình vẽ và bảng thông số."
            : "Quan sát đồ thị và đối chiếu các giá trị với biểu thức đã nhận diện.")
          : "Kéo từng điểm tự do, sau đó kiểm tra xem các đối tượng dựng phụ thuộc có còn thỏa mãn quan hệ đã nêu không.",
        visualId: visual.id,
        visualActions: [],
      },
    ],
    suggestions: ["Quan sát", "Dự đoán", "Kiểm chứng", "Giải thích"],
    exploration: {
      detected: `${isFunctionModel ? "Đã tạo mô hình hàm số" : "Đã tạo cấu trúc"}: ${program.title}.`,
      question: isFunctionModel
        ? "Hãy thay đổi một hệ số. Dáng điệu nào của đồ thị đổi trước, và đặc điểm nào vẫn được giữ nguyên?"
        : "Khi kéo một điểm tự do, đối tượng phụ thuộc nào thay đổi? Quan hệ hình học nào vẫn được giữ nguyên?",
      alternatives: [],
    },
    source,
  });
}

export async function runAgent(mode: string, raw: unknown) {
  const input = RequestSchema.parse(raw);
  if (mode === "solve") {
    // Both the native space and the old Playground use one exact algebra engine.
    const problem = analyzeSolveProblem(input.prompt);
    const solved = solveProblem(input.prompt, input.method || problem.methods[0].id);
    if (!solved.visual) throw new AppError(422, "Đề này không cần hoặc không thể vẽ trong Playground. Mở Không gian giải để xem lời giải.", "unsupported");
    const visual = structuredClone(solved.visual);
    visual.objects.forEach(object => { object.visible = !object.id.startsWith("root_") || Boolean(input.method); });
    return validateAgent({
      title: problem.degree === 2 ? "Giải phương trình bậc hai" : "Giải bài toán đại số",
      explanation: `Đề: ${input.prompt}. ${problem.goal} Chọn phương pháp trước khi xem lời giải.`,
      visual, entities: [{id:"graph",type:"function",label:"Đa thức sau thu gọn",role:"given"}],
      methods: problem.methods,
      steps: input.method ? solved.steps.map(step => ({ id:step.id,title:step.title,content:step.content,visualId:visual.id,
        visualActions: step.targets.length ? [{type:"highlight",targets:step.targets}] : [],
      })) : [], suggestions: ["Đối chiếu kết quả với đề gốc."], source:"template",
    });
  }
  if (mode === "explore") {
    const recognized = recognizedProblemVisual(input.prompt);
    if (recognized) return recognized;
    if (isConstrainedTetrahedronProblem(input.prompt))
      return buildConstrainedTetrahedron(input.prompt);
    const matches = identifyPatterns(input.prompt, input.pattern);
    const unsupportedSolid = unsupportedSolidDescription(input.prompt);
    const supportedCubeSection = /(?:thiết diện|mặt phẳng cắt).{0,40}(?:lập phương|cube)|(?:lập phương|cube).{0,40}(?:thiết diện|mặt phẳng cắt)/i.test(input.prompt);
    if (unsupportedSolid && !supportedCubeSection) {
      throw new AppError(422, `Chưa có bộ dựng an toàn cho ${unsupportedSolid}. Hiện hệ thống dựng chắc chắn các mẫu hình lập phương, lăng trụ tam giác, chóp đáy vuông, trụ, nón, cầu và một số đa diện đều.`, "unsupported");
    }
    const solidKey = matches.find((match) => isThreeDimensionalKey(match.key))?.key;
    if (solidKey) {
      const result=fallback({ ...input, pattern: solidKey });
      if(solidKey==="cube") {
        const side=result.visual.parameters.find(p=>p.id==="size")?.value || 2;
        const cube=namedCube(input.prompt,side);
        if(cube){result.visual=cube;result.explanation=cube.accessibility?.description||result.explanation;}
      }
      // Do not silently claim a template covers extra incidence constructions.
      if(!(result.visual.dimension==="3d" && result.visual.cubeConstruction) && /đường\s*chéo|trung\s*điểm|giao\s*điểm/i.test(input.prompt))
        throw new AppError(422,"Mẫu khối hiện tại chưa dựng đủ các đối tượng bổ sung trong đề. Hãy dùng yêu cầu được hỗ trợ; hệ thống không tự bỏ dữ kiện.","unsupported");
      return validateAgent(result);
    }
  }
  // For an open-ended 2D construction, let the model emit the restricted
  // VisualProgram first. The compiler and semantic validator remain the sole
  // route to JSXGraph, so generated output cannot execute browser code.
  if (mode === "explore" && !input.pattern) {
    const generated = await generateVisualProgram(input.prompt);
    if (generated) return resultFromProgram(generated.program, generated.source);
    if (!isOpenRouterConfigured() && !identifyPatterns(input.prompt).length)
      throw new AppError(503, "Chưa cấu hình OpenRouter cho đề tự do. Mô hình mẫu vẫn dùng được khi bạn chọn một chủ đề có sẵn.", "ai_not_configured");
  }
  // Explore is deliberately template-first: a tested, constrained visual is
  // safer and more useful than an unvalidated free-form generated scene.
  if (!isOpenRouterConfigured()) return fallback(input);
  const example = fallback({
    prompt: "Hàm số bậc hai",
    pattern: "quadratic-roots",
  });
  const instruction = `You are a Vietnamese mathematics teacher. Return JSON only matching this example shape: ${JSON.stringify(example)}. Mode: ${mode}. Solve: list at least two methods before method selection; if method selected, produce mathematically correct steps. Only generate expressions using numeric literals, x, parameter IDs, + - * / ^ and sin cos tan sqrt abs exp log. No code, HTML or arbitrary attributes. Supported objects: point, line, segment, circle, polygon, angle, glider, intersection, functionGraph, text, verticalMarker, horizontalMarker. Parents are object IDs, dependent coordinates are arithmetic expressions using parameter IDs. Only free points have numeric coordinates. Parameters cannot be named x. Actions only focus/highlight/show/hide with targets, setParameter with parameter/value, animateParameter with parameter/from/to/durationMs/loop, reset. Respect the example schema strictly. source=llm. You may use one of these templates: ${JSON.stringify(Object.keys(modelNames))}.`;
  let repair = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const generated = await requestOpenRouterJson({
        task: mode as "explore" | "solve" | "material",
        system: instruction,
        user: JSON.stringify(input),
        routing: { prompt: input.prompt, pattern: input.pattern },
        repair,
      });
      return validateAgent(generated);
    } catch (e) {
      repair = `\nPrevious output invalid: ${String(e)}. Repair and return valid JSON.`;
    }
  }
  if (mode === "explore") return fallback(input);
  throw Error("Agent không tạo được kết quả hợp lệ sau repair.");
}
