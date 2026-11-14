import { AppError } from "./app-error";
import type { VisualProgram, VisualSpec } from "./contracts";
import { compileExpression } from "./expression";
import { isOpenRouterConfigured } from "./openrouter";
import { normalizeFunctionExpression, sketchProgram } from "./sketch-geometry";
import { knownContradictions } from "./solve-guided";
import { isSpatialProblem, normalizeSpatialMath } from "./solve-pyramid-visual";
import { readQuestionParts } from "./solve-question";
import { readMidpointRelations } from "./geometry-relations";
import { compileSpatialScene } from "./solve-spatial-scene";
import { solveVisualTo3d } from "./solve-visual-3d";
import { CYLINDER_DIMENSIONS_KEY } from "./cylinder-problem-visual";
import { examCoordinateIllustration, examRoundSolidIllustration, examSpatialIllustration } from "./exam-spatial-illustration";
import { compileProblemIllustration, knownProblemVisual } from "./solve-visual";
import { generateVisualProgram } from "./visual-program-generation";
import { validateVisual } from "./validation";

const reviewNote = "Đối chiếu tên điểm, quan hệ và số đo với đề trước khi chèn. Kích thước đề không cho chỉ dùng để bố trí hình.";
const proofStart = /chứng\s*(?:minh|tỏ)/iu;

function triangleIllustration(givens: string) {
  const text = normalizeSpatialMath(givens);
  const match = /tam\s*giác\s+([A-Z]{3})(?![A-Z])/u.exec(text);
  if (!match || /[=<>∠∈]|\d|vuông\s*góc|song\s*song|phân\s*giác|đường\s*cao|hình\s*chiếu|giao\s*điểm|góc\s+[A-Z]|đường\s*tròn|tiếp\s*tuyến/iu.test(text)) return null;
  const names = [...match[1]];
  if (new Set(names).size !== 3) throw new AppError(422, "Tên ba đỉnh tam giác phải khác nhau.", "needs_review");
  const right = /\bvuông(?:\s*cân)?\s+tại\s+([A-Z])\b/iu.exec(text);
  const isosceles = /\bcân\s+tại\s+([A-Z])\b/iu.exec(text);
  const special = right ?? isosceles;
  const corner = special ? names.indexOf(special[1]) : 0;
  if (corner < 0) throw new AppError(422, "Đỉnh được nêu không thuộc tam giác đã cho.", "needs_review");
  const shape = right ? [[0, 0], [3, 0], [0, /cân/iu.test(right[0]) ? 3 : 2.1]]
    : isosceles ? [[0, 2.7], [-1.8, 0], [1.8, 0]]
      : /tam\s*giác(?:\s+[A-Z]{3})?\s*đều/iu.test(text) ? [[-1.5, 0], [1.5, 0], [0, 1.5 * Math.sqrt(3)]]
        : [[-1.6, 0], [2.1, 0], [-.5, 2.7]];
  const primitives: VisualProgram["primitives"] = names.map((id, index) => {
    const [x, y] = shape[(index - corner + 3) % 3];
    return { op: "point", id, label: id, x, y, free: true };
  });
  const { issues, relations } = readMidpointRelations(text);
  if (issues.length) throw new AppError(422, issues[0], "needs_review");
  if (relations.some(({ point, ends }) => names.includes(point) || ends.some((end) => !names.includes(end)))) return null;
  primitives.push({ op: "polygon", id: "triangle", parents: names });
  for (const { point, ends } of relations) primitives.push({ op: "midpoint", id: point, label: point, parents: ends });
  const note = "Hình minh họa tam giác và các trung điểm có trong đề. Kích thước được chọn để bố trí hình.";
  return { visual: compileProblemIllustration({ version: 1, dimension: "2d", engine: "jsxgraph", kind: "geometry", title: `Tam giác ${match[1]}`,
    description: note, viewport: { x: [-3, 4], y: [-1.3, 4] }, parameters: [], primitives }, givens, []), note };
}

function rightIsoscelesPrism(prompt: string) {
  const text = normalizeSpatialMath(readQuestionParts(prompt).stem);
  if (!/lăng\s*trụ\s*đứng\s+ABC\s*[.·]?\s*A'\s*B'\s*C'/iu.test(text)
    || !/đáy\s+ABC\s+là\s+tam\s+giác\s+vuông\s+cân\s+tại\s+A\b/iu.test(text)) return null;
  const length = /\bAB\s*=\s*(\d+(?:[.,]\d+)?)\s*(\*?\s*a)?(?=\s*[,.;]|\s+góc|$)/iu.exec(text);
  const angle = /góc\s+giữa\s+đường\s+thẳng\s+BC'\s+và\s+mặt\s+phẳng\s*\(\s*ACC'\s*A'\s*\)\s*(?:bằng|là|=)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ|\^?\s*\\circ)/iu.exec(text);
  if (!angle && /góc\s+giữa[^.]{0,100}(?:bằng|=)\s*\d|[A-Z]{2}'?\s*=/u.test(text.replace(length?.[0] ?? "", ""))) return null;
  const side = length ? Number(length[1].replace(",", ".")) : 3;
  const degrees = angle ? Number(angle[1].replace(",", ".")) : undefined;
  if (!(side > 0) || (degrees !== undefined && !(degrees > 0 && degrees < 45))) throw new AppError(422, "Độ dài AB hoặc góc với mặt phẳng chưa phù hợp với lăng trụ đứng có đáy vuông cân.", "needs_review");
  // The component of BC' normal to ACC'A' is AB. The other horizontal component is AC.
  const height = degrees === undefined ? side * .9 : side * Math.sqrt(1 / Math.sin(degrees * Math.PI / 180) ** 2 - 2);
  const diagonal = angle || /\bBC'/.test(text);
  return compileSpatialScene({
    key: "exam-right-prism",
    points: { A: [0, 0, 0], B: [side, 0, 0], C: [0, 0, side],
      "A'": [0, height, 0], "B'": [side, height, 0], "C'": [0, height, side] },
    edges: [
      { ends: ["A", "B"], ...(length ? { measurement: `${length[1]}${length[2] ? "a" : ""}` } : {}) },
      { ends: ["B", "C"] }, { ends: ["C", "A"] },
      { ends: ["A'", "B'"] }, { ends: ["B'", "C'"] }, { ends: ["C'", "A'"] },
      { ends: ["A", "A'"] }, { ends: ["B", "B'"] }, { ends: ["C", "C'"] },
      ...(diagonal ? [{ ends: ["B", "C'"] as [string, string] }, { ends: ["A", "C'"] as [string, string], helper: true }] : []),
    ],
    faces: [["A", "B", "C"], ["A'", "B'", "C'"], ["A", "C", "C'", "A'"]],
    note: `Lăng trụ đứng có đáy ABC vuông cân tại A. ${angle ? `Góc giữa BC' và mặt phẳng (ACC'A') là ${angle[1]}°. AC' là hình chiếu của BC' lên mặt phẳng đó.` : "Chiều cao được chọn để minh họa."}`,
  }).visual3d;
}

function explicitGraph(prompt: string) {
  // Require one complete assignment. Expressions with other variables,
  // domains or unfamiliar LaTeX syntax fall through to the planner.
  const assignments = [...prompt.matchAll(/(?<![\p{L}\p{N}_])(?:y|f\s*\(x\))\s*=/giu)];
  if (assignments.length !== 1 || /\btập\s*xác\s*định|(?<![\p{L}\p{N}_])x\s*(?:∈|\\in|[<>≤≥])/iu.test(prompt)) return null;
  const [assignment] = assignments;
  const start = assignment.index;
  const tail = prompt.slice(start + assignment[0].length);
  const sourceExpression = (/\$\s*$/.test(prompt.slice(0, start))
    ? /^([^$\n]+)\$/.exec(tail)
    : /^([ \t]*[\dx²³+−–\-*/^().{} \t]+?)(?=\.(?!\d)|[;!?\n]|$)/i.exec(tail))?.[1].trim();
  if (!sourceExpression || sourceExpression.length > 180) return null;
  const expression = normalizeSpatialMath(sourceExpression.replace(/\^\s*\{([^{}]+)\}/g, "^($1)"));
  if (/[{}]/.test(expression)) return null;
  try { compileExpression(normalizeFunctionExpression(expression)); } catch { return null; }
  const program = sketchProgram({
    title: "Đồ thị hàm số", description: "Đồ thị theo biểu thức trong đề.",
    expression, transcription: "y = " + sourceExpression, points: [], edges: [], circles: [], polygons: [], ambiguities: [],
  });
  return compileProblemIllustration(program, "", []);
}

function simplePlaneFigure(givens: string) {
  const text = normalizeSpatialMath(givens);
  if (/[=<>∠∈]|\d|vuông\s*góc|song\s*song|tiếp\s*tuyến|giao\s*điểm|nội\s*tiếp|ngoại\s*tiếp|hình\s*chiếu|trung\s*điểm|đường\s*chéo/iu.test(text)) return null;
  const quadrilateral = /hình\s*(vuông|chữ\s*nhật|bình\s*hành)\s*([A-Z]{4})(?![A-Z])/u.exec(text);
  const circle = /đường\s*tròn\s*(?:tâm\s*([A-Z])|\(([A-Z])\))(?:\s*đi\s*qua\s*([A-Z])(?![A-Z]))?/u.exec(text);
  if ((!quadrilateral && !circle) || (quadrilateral && circle)) return null;
  const primitives: VisualProgram["primitives"] = [];
  if (quadrilateral) {
    const names = [...quadrilateral[2]];
    if (new Set(names).size !== 4) throw new AppError(422, "Tên bốn đỉnh của hình phải khác nhau.", "needs_review");
    const slant = quadrilateral[1] === "bình hành" ? .7 : 0;
    const height = quadrilateral[1] === "vuông" ? 3 : 2;
    const points = [[-1.5, -1], [1.5, -1], [1.5 + slant, height - 1], [-1.5 + slant, height - 1]];
    names.forEach((id, index) => primitives.push({ op: "point", id, label: id, x: points[index][0], y: points[index][1], free: true }));
    primitives.push({ op: "polygon", id: "outline", parents: names });
  } else if (circle) {
    const center = circle[1] ?? circle[2], through = circle[3];
    if (center === through) throw new AppError(422, "Điểm trên đường tròn phải khác tâm.", "needs_review");
    primitives.push({ op: "point", id: center, label: center, x: 0, y: 0, free: true });
    if (through) primitives.push({ op: "point", id: through, label: through, x: 2, y: 0, free: true });
    primitives.push({ op: "circle", id: "outline", parents: through ? [center, through] : [center], ...(through ? {} : { radius: 2 }) });
  }
  const title = quadrilateral ? `Hình ${quadrilateral[1]} ${quadrilateral[2]}` : "Đường tròn";
  const note = "Hình minh họa. Kích thước còn thiếu được chọn để bố trí hình.";
  return { visual: compileProblemIllustration({ version: 1, dimension: "2d", engine: "jsxgraph", kind: "geometry",
    title, description: note, viewport: { x: [-4, 4], y: [-3, 3] }, parameters: [], primitives }, givens, []), note };
}

export async function drawExamFigure(prompt: string, signal: AbortSignal): Promise<{ visual: VisualSpec; note: string }> {
  signal.throwIfAborted();
  const stem = readQuestionParts(prompt).stem;
  if (knownContradictions(stem).length) {
    throw new AppError(422, "Đề có dữ kiện mâu thuẫn. Hãy kiểm tra lại trước khi dựng hình.", "needs_review");
  }
  const givens = stem.split(proofStart)[0];
  const coordinate = examCoordinateIllustration(givens);
  if (coordinate) return coordinate;
  const known = knownProblemVisual(stem, stem, [givens], true);
  if (known) {
    const asSolid = [CYLINDER_DIMENSIONS_KEY, "solve-cylinder-revolution", "tunnel-parabolic"].some((key) => key === known.visual.source?.key);
    const visual = known.visual3d ?? (asSolid ? solveVisualTo3d(known.visual) : known.visual);
    return { visual: validateVisual(visual), note: `${known.note} ${reviewNote}` };
  }
  const prism = rightIsoscelesPrism(prompt);
  if (prism) return { visual: prism, note: `${prism.accessibility?.description ?? ""} ${reviewNote}`.trim() };
  const spatial = examSpatialIllustration(givens) ?? (!/O\s*x\s*y\s*z/iu.test(givens) ? examRoundSolidIllustration(givens) : null);
  if (spatial) return spatial;
  if (isSpatialProblem(stem) || /O\s*x\s*y\s*z|hình\s*(?:trụ|nón|cầu)|mặt\s*cầu|đường\s*hầm/iu.test(stem)) {
    throw new AppError(422, "Chưa nhận diện được cấu trúc 3D để dựng từ câu này. Hãy kiểm tra tên khối, tên các đỉnh hoặc hình nguồn.", "spatial_unsupported");
  }
  const graph = explicitGraph(givens);
  if (graph) return { visual: graph, note: "Đồ thị được dựng theo biểu thức trong đề. Hãy kiểm tra lại trước khi chèn." };
  if (/đồ\s*thị|đường\s*cong/iu.test(stem) && /(?:hình\s*(?:bên|dưới|vẽ)|đồ\s*thị\s*(?:bên|dưới))/iu.test(stem)
    && !/(?<!\p{L})(?:y|f\s*\(x\))\s*=\s*(?![\s.,;?!]|$)/iu.test(stem)) {
    throw new AppError(422, "Câu này nhận dạng đồ thị từ hình gốc. Bạn có thể dùng hình đã nhập từ PDF hoặc bổ sung công thức nếu muốn dựng lại đồ thị tương tác.", "needs_source_figure");
  }
  const planar = triangleIllustration(givens) ?? simplePlaneFigure(givens);
  if (planar) return planar;
  if (!isOpenRouterConfigured()) {
    throw new AppError(503, "Cần cấu hình dịch vụ AI để dựng hình cho câu này. Bạn vẫn có thể tự vẽ.", "ai_not_configured");
  }
  const generated = await generateVisualProgram(stem, signal, { useTemplates: false, examFigure: { givens } });
  if (!generated) {
    throw new AppError(422, "Chưa dựng được hình từ câu này. Bạn có thể bổ sung dữ kiện hoặc tự vẽ.", "unsupported");
  }
  const visual = compileProblemIllustration(generated.program, givens, []);
  return { visual, note: "Hình do AI đề xuất. " + reviewNote };
}
