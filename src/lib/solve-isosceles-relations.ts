import { AppError } from "./app-error";

type Pair = [string, string];
type Facts = {
  triangles: string[][];
  isosceles: Array<{ triangle: string[]; vertex?: string }>;
  equalities: Array<[Pair, Pair]>;
  midpoints: Array<{ point: string; edge: Pair }>;
  collinear: string[][];
  onSegments: Array<{ point: string; edge: Pair }>;
  unknown: boolean;
};
export type IsoscelesMedianRelations = { vertex: string; base: Pair; midpoint: string };
/** OCR may flatten the document title and the first sentence onto one line.
 * Remove only this known title, never an actual proof instruction or fact. */
export function stripGeometryProofHeading(source: string) {
  return source.normalize("NFC").replace(
    /^\s*CHỨNG\s+MINH\s+HÌNH\s+HỌC(?:[ \t]*[\r\n]+|[ \t]*[:–-]?[ \t]+(?=(?:Cho|Xét|Trong|Tam\s+giác|\\triangle|△|Δ)(?:\s|$)))/iu,
    "",
  );
}
const names = (value: string) => value.replace(/\s/g, "").toUpperCase().split("");
const key = (points: string[]) => [...points].sort().join("");
const equalKey = (pair: [Pair, Pair]) => [key(pair[0]), key(pair[1])].sort().join("=");

/** Normalize notation, not meaning. In particular, never erase negations,
 * numbers, unfamiliar relations or additional construction instructions. */
function normalize(source: string) {
  return source.normalize("NFC")
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:mathrm|mathbf|text|operatorname)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\triangle\b|△|Δ/g, "tam giác ")
    .replace(/\\perp\b|⊥/g, "⟂")
    .replace(/\\in\b/g, "∈")
    .replace(/\\(?:,|;|!|quad\b|qquad\b)/g, " ")
    .replace(/\\[()[\]]|\$/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** A bounded relation reader. A matching fragment is not sufficient: every
 * source fact must be consumed before using the reviewed illustration. */
function readFacts(source: string): Facts {
  const facts: Facts = { triangles: [], isosceles: [], equalities: [], midpoints: [], collinear: [], onSegments: [], unknown: false };
  let rest = normalize(source);
  rest = rest.replace(/(?<![\p{L}\p{N}_])tam\s*giác\s+([A-Z]\s*[A-Z]\s*[A-Z])(?![\p{L}\p{N}_])(?:\s+cân(?:\s+tại\s+([A-Z])(?![\p{L}\p{N}_]))?)?/giu,
    (_, triangle: string, vertex?: string) => {
      const points = names(triangle);
      facts.triangles.push(points);
      if (/cân/iu.test(_)) facts.isosceles.push({ triangle: points, vertex: vertex?.toUpperCase() });
      return " ";
    });
  rest = rest.replace(/(?<![\p{L}\p{N}_])([A-Z])(?![\p{L}\p{N}_])\s*(?:là\s*)?trung\s*điểm\s*(?:của\s*)?(?:(?:cạnh|đoạn\s*thẳng|đoạn)\s*)?([A-Z]\s*[A-Z])(?![\p{L}\p{N}_])/giu,
    (_, point: string, edge: string) => { facts.midpoints.push({ point: point.toUpperCase(), edge: names(edge) as Pair }); return " "; });
  rest = rest.replace(/(?<![\p{L}\p{N}_])([A-Z])\s*(?:,\s*|và\s+)([A-Z])\s*(?:,\s*|và\s+)([A-Z])(?![\p{L}\p{N}_])\s*(?:thẳng\s*hàng|cùng\s*nằm\s*trên\s*(?:một\s*)?đường\s*thẳng)/giu,
    (_, a: string, b: string, c: string) => { facts.collinear.push([a, b, c].map(p => p.toUpperCase())); return " "; });
  rest = rest.replace(/(?<![\p{L}\p{N}_])([A-Z])(?![\p{L}\p{N}_])\s*(?:thuộc|∈|nằm\s*trên)\s*(?:(?:cạnh|đoạn\s*thẳng|đoạn)\s*)?([A-Z]\s*[A-Z])(?![\p{L}\p{N}_])/giu,
    (_, point: string, edge: string) => { facts.onSegments.push({ point: point.toUpperCase(), edge: names(edge) as Pair }); return " "; });
  rest = rest.replace(/(?<![\p{L}\p{N}_])([A-Z]\s*[A-Z])\s*(?:=|bằng|có\s*độ\s*dài\s*bằng)\s*([A-Z]\s*[A-Z])(?![\p{L}\p{N}_])/giu,
    (_, first: string, second: string) => { facts.equalities.push([names(first) as Pair, names(second) as Pair]); return " "; });
  rest = rest.replace(/(?<![\p{L}\p{N}_])(?:cho|xét|trong|có|và|biết|nên|do\s*đó|suy\s*ra|tức\s*là|ba\s*điểm|các\s*điểm|điểm)(?![\p{L}\p{N}_])/giu, " ")
    .replace(/[,.;:()\[\]·]/g, " ").trim();
  facts.unknown = Boolean(rest);
  return facts;
}

function fits(facts: Facts, model: IsoscelesMedianRelations) {
  const { vertex: a, base: [b, c], midpoint: m } = model;
  const triangleKey = key([a, b, c]);
  const baseKey = key([b, c]);
  const allowedEqualities = new Set([
    equalKey([[a, b], [a, c]]), equalKey([[b, m], [m, c]]),
  ]);
  return !facts.unknown &&
    facts.triangles.every(points => new Set(points).size === 3 && key(points) === triangleKey) &&
    facts.isosceles.every(item => key(item.triangle) === triangleKey && (!item.vertex || item.vertex === a)) &&
    facts.equalities.every(pair => allowedEqualities.has(equalKey(pair))) &&
    facts.midpoints.every(item => item.point === m && key(item.edge) === baseKey) &&
    facts.collinear.every(points => new Set(points).size === 3 && key(points) === key([b, m, c])) &&
    facts.onSegments.every(item => item.point === m && key(item.edge) === baseKey);
}

function modelFrom(facts: Facts): IsoscelesMedianRelations | null {
  if (facts.unknown || !facts.triangles.length) return null;
  const triangle = facts.triangles[0];
  if (new Set(triangle).size !== 3) return null;
  let vertex = facts.isosceles.find(item => item.vertex)?.vertex;
  const equalSides = facts.equalities.find(([first, second]) => {
    const shared = first.filter(p => second.includes(p));
    return shared.length === 1 && new Set([...first, ...second]).size === 3 &&
      [...first, ...second].every(p => triangle.includes(p));
  });
  if (equalSides) vertex ||= equalSides[0].find(p => equalSides[1].includes(p));
  if (!vertex || !triangle.includes(vertex)) return null;
  const base = triangle.filter(p => p !== vertex) as Pair;
  let midpoint = facts.midpoints.find(item => key(item.edge) === key(base))?.point;
  if (!midpoint) {
    // Equal halves plus incidence is exactly a midpoint, not a new assumption.
    const candidates = [...facts.onSegments.map(item => item.point), ...facts.collinear.flat()];
    midpoint = candidates.find(p => !triangle.includes(p) &&
      facts.equalities.some(pair => equalKey(pair) === equalKey([[base[0], p], [p, base[1]]])) &&
      (facts.onSegments.some(item => item.point === p && key(item.edge) === key(base)) ||
        facts.collinear.some(points => key(points) === key([...base, p]))));
  }
  if (!midpoint || triangle.includes(midpoint)) return null;
  const model = { vertex, base, midpoint };
  return fits(facts, model) ? model : null;
}

function isPerpendicularGoal(source: string, model: IsoscelesMedianRelations) {
  const text = normalize(source).replace(/^(?:rằng\s+)?/iu, "");
  const goal = /^(?:rằng\s+)?([A-Z]\s*[A-Z])\s*(?:vuông\s*góc\s*(?:với\s*)?|⟂\s*)([A-Z]\s*[A-Z])\s*[.!]?$/iu.exec(text);
  if (!goal) return false;
  const pairs = [key(names(goal[1])), key(names(goal[2]))].sort();
  return pairs.join("=") === [key([model.vertex, model.midpoint]), key(model.base)].sort().join("=");
}

/** Source text is authoritative. AI wording may repeat equivalent relations,
 * but may not introduce additional or contradictory construction facts. */
export function readIsoscelesMedian(prompt: string, givens: string[]): IsoscelesMedianRelations | null {
  const source = normalize(stripGeometryProofHeading(prompt));
  const proof = /(?:chứng\s*minh|chứng\s*tỏ)(?:\s+rằng)?/iu.exec(source);
  if (!proof || !givens.length) return null;
  const facts = readFacts(source.slice(0, proof.index));
  const model = modelFrom(facts);
  if (!model || !isPerpendicularGoal(source.slice(proof.index + proof[0].length), model)) return null;
  const analyzed = readFacts(givens.join(". "));
  if (!fits(analyzed, model))
    throw new AppError(422, "Dữ kiện AI đã đọc chưa khớp với đề gốc hoặc có điều kiện bổ sung chưa được hỗ trợ. Hãy kiểm tra lại phần dữ kiện trước khi vẽ.", "needs_review");
  return model;
}
