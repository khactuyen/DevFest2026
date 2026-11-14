import { AppError } from "./app-error";
import { compileExpression } from "./expression";
import { readMidpointRelations } from "./geometry-relations";
import { readQuestionParts } from "./solve-question";
import { compileSpatialScene, type SpatialPoint, type SpatialScene } from "./solve-spatial-scene";

export function normalizeSpatialMath(source: string): string {
  let text = source.normalize("NFC")
    .replace(/[′’]/g, "'")
    .replace(/([A-Z])\s*\^\s*(?:\{\s*\\prime\s*\}|\\prime\b)/g, "$1'")
    .replace(/([A-Z])\s+'(?=\s*[A-Z]|[\s).,;]|$)/g, "$1'");
  for (let i = 0; i < 4; i++) text = text
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\(?:mathrm|text|operatorname)\s*\{([^{}]+)\}/g, "$1");
  return text.replace(/\\perp|⊥|⟂/g, " vuông góc ")
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\[,;!]|\\quad|\\qquad/g, " ")
    .replace(/\\[()[\]]|[$\{\}]/g, " ")
    .replace(/([A-Z])\s+(?=[A-Z])/g, "$1")
    .replace(/\s+/g, " ").trim();
}

/** Only source hypotheses are construction facts; titles and requested conclusions are excluded. */
export function spatialHypotheses(source: string) {
  const stem = readQuestionParts(source).stem;
  const start = /(?:cho\s+)?hình\s+chóp\s+/iu.exec(stem);
  const text = start ? stem.slice(start.index) : stem;
  return normalizeSpatialMath(text.split(/(?:chứng\s*minh|hãy\s*(?:tính|tìm)|tính\s+(?:góc|khoảng|thể|diện)|hỏi\s+|cần\s+chứng)/iu)[0]);
}

export function isSpatialProblem(source: string) {
  return /hình\s*chóp|tứ\s*diện|lăng\s*trụ|hình\s*hộp|lập\s*phương|hình\s*học\s*không\s*gian|đường\s*chéo\s*nhau/iu.test(source);
}

function fail(message: string): never { throw new AppError(422, message, "spatial_unsupported"); }
const key = (a: string, b: string) => [a, b].sort().join("");
type Length = { value: number; label: string; edge: string; symbolic: boolean };

function readLengths(text: string, names: string[]) {
  const lengths = new Map<string, Length>();
  const equalities: Array<[string, string]> = [];
  const atom = "(?:sqrt\\([^)]{1,40}\\)|\\d+(?:[.,]\\d+)?|a|\\([^)]{1,40}\\))";
  const scalar = `${atom}(?:\\s*[*/+-]?\\s*${atom})*`;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])((?:[A-Z]{2}\\s*=\\s*)+)(${scalar})\\s*(mm|cm|dm|m)?(?![\\p{L}\\p{N}_²³])`, "gu");
  const parsed = [...text.matchAll(pattern)];
  const units = new Set(parsed.map(m => m[3]).filter(Boolean));
  if (units.size > 1) fail("Các cạnh đang dùng nhiều đơn vị; hãy quy đổi về cùng đơn vị trước khi dựng hình chóp.");
  const set = (edge: string, length: Length) => {
    if ([...edge].some(name => !names.includes(name))) fail(`Cạnh ${edge} chứa điểm chưa khai báo trong hình chóp.`);
    const id = key(edge[0], edge[1]), previous = lengths.get(id);
    if (previous && (Math.abs(previous.value - length.value) > 1e-8 || previous.symbolic !== length.symbolic))
      fail(`Hai số đo của ${edge} không khớp nhau; hãy đối chiếu lại đề.`);
    lengths.set(id, previous || length);
  };
  for (const match of parsed) {
    const raw = match[2].trim().replace(/,/g, ".");
    const expr = raw.replace(/(\d|\))\s*(?=a|sqrt\()/g, "$1*")
      .replace(/a\s*(?=\d|\(|sqrt\()/g, "a*");
    let value: number;
    try {
      const evaluate = compileExpression(expr, ["a"]);
      value = evaluate({ a: 1 });
      if (raw.includes("a") && [2, 3].some(a => Math.abs(evaluate({ a }) - value * a) > Math.max(1, Math.abs(value * a)) * 1e-9))
        fail("Số đo theo a chưa có cùng tỉ lệ tuyến tính; cần giá trị a để dựng đúng hình.");
    }
    catch { fail(`Chưa đọc được số đo ${match[0]}; hãy kiểm tra công thức.`); }
    if (!Number.isFinite(value!) || value! <= 0) fail("Độ dài cạnh phải dương và hữu hạn.");
    const edges = match[1].match(/[A-Z]{2}/g)!;
    for (const edge of edges) set(edge, { value: value!, label: `${raw}${match[3] ? ` ${match[3]}` : ""}`, edge, symbolic: raw.includes("a") });
  }
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_])([A-Z]{2})\s*=\s*([A-Z]{2})(?![\p{L}\p{N}_])/gu))
    equalities.push([key(match[1][0], match[1][1]), key(match[2][0], match[2][1])]);
  for (let i = 0; i < names.length; i++) for (const [first, second] of equalities) {
    if (lengths.has(first) && !lengths.has(second)) lengths.set(second, { ...lengths.get(first)!, edge: second });
    if (lengths.has(second) && !lengths.has(first)) lengths.set(first, { ...lengths.get(second)!, edge: first });
    if (lengths.has(first) && lengths.has(second) && Math.abs(lengths.get(first)!.value - lengths.get(second)!.value) > 1e-8)
      fail(`Quan hệ cạnh bằng nhau ${first} = ${second} không khớp số đo.`);
  }
  return { lengths, equalities };
}

/** A family of exact right-base pyramids, with arbitrary vertex names and midpoint dependencies. */
export function rightBasePyramidVisuals(source: string, allowLayout = false) {
  const text = spatialHypotheses(source);
  const solid = /hình\s*chóp\s*([A-Z])\s*[.·]\s*([A-Z]{3,4})(?![A-Z])/iu.exec(text);
  if (!solid || /chóp\s*cụt/iu.test(text)) return null;
  const apex = solid[1], base = [...solid[2]];
  if (new Set([apex, ...base]).size !== base.length + 1) fail("Tên đỉnh và đáy hình chóp bị trùng nhau.");
  const triangle = new RegExp(`(?:đáy\\s*)?${base.join("")}\\s*(?:là\\s*)?tam\\s*giác\\s*vuông(?:\\s*cân)?\\s*tại\\s*([A-Z])`, "iu").exec(text);
  const quadrilateral = new RegExp(`(?:đáy\\s*)?${base.join("")}\\s*(?:là\\s*)?hình\\s*(vuông|chữ\\s*nhật)`, "iu").exec(text);
  if (base.length === 3 && !triangle || base.length === 4 && !quadrilateral) return null;
  const right = triangle?.[1] || base[0];
  if (!base.includes(right)) fail("Đỉnh góc vuông không thuộc đáy đã khai báo.");
  const perpendicular = /([A-Z]{2})\s*vuông\s*góc\s*(?:với\s*)?(?:mặt\s*phẳng\s*)?(?:\(\s*([A-Z]{3,4})\s*\)|(đáy)(?!\p{L}))/iu.exec(text);
  if (!perpendicular || !perpendicular[1].includes(apex)
    || (perpendicular[2] && [...perpendicular[2]].sort().join("") !== [...base].sort().join(""))) {
    if (allowLayout) return null;
    fail("Chưa đọc được cạnh bên vuông góc với mặt đáy; hãy giữ rõ ký hiệu như SA ⟂ (ABC).");
  }
  const foot = [...perpendicular[1]].find(name => name !== apex)!;
  if (!base.includes(foot)) {
    if (allowLayout) return null;
    fail("Chân đường cao chưa nằm ở một đỉnh đáy được hỗ trợ.");
  }
  const neighbors = triangle ? base.filter(name => name !== right) : [base[1], base[3]];
  const { lengths, equalities } = readLengths(text, [apex, ...base]);
  const firstKey = key(right, neighbors[0]), secondKey = key(right, neighbors[1]);
  const isEqual = triangle ? /vuông\s*cân/iu.test(triangle[0]) : quadrilateral![1] === "vuông";
  if (isEqual) {
    if (!lengths.has(firstKey) && lengths.has(secondKey)) lengths.set(firstKey, { ...lengths.get(secondKey)!, edge: firstKey });
    if (!lengths.has(secondKey) && lengths.has(firstKey)) lengths.set(secondKey, { ...lengths.get(firstKey)!, edge: secondKey });
    if (lengths.has(firstKey) && lengths.has(secondKey) && Math.abs(lengths.get(firstKey)!.value - lengths.get(secondKey)!.value) > 1e-8)
      fail("Đáy vuông/cân nhưng hai cạnh đáy được cho không bằng nhau.");
  }
  const first = lengths.get(firstKey), second = lengths.get(secondKey), heightKey = key(apex, foot), height = lengths.get(heightKey);
  const illustrative = !first || !second || !height;
  if (illustrative && !allowLayout) fail(`Chưa đọc đủ độ dài ${right}${neighbors[0]}, ${right}${neighbors[1]} và ${apex}${foot} để dựng đúng tỉ lệ.`);
  const stated = [first, second, height].filter((item): item is Length => !!item);
  if (stated.some(item => item.symbolic) && !stated.every(item => item.symbolic))
    fail("Số đo chứa cả tham số a và số cố định; cần giá trị a hoặc các tỉ lệ đầy đủ để dựng đúng hình.");
  if (illustrative && ([...lengths.keys()].some(edge => ![firstKey, secondKey, heightKey].includes(edge))
    || equalities.some(([a, b]) => !lengths.has(a) || !lengths.has(b)))) return null;
  const scale = first?.value ?? second?.value ?? height?.value ?? 3;
  const width = first?.value ?? scale;
  const depth = second?.value ?? (isEqual ? width : scale * .76);
  const elevation = height?.value ?? scale * .9;
  const points: Record<string, SpatialPoint> = {
    [right]: [0, 0, 0], [neighbors[0]]: [width, 0, 0], [neighbors[1]]: [0, 0, depth],
  };
  if (!triangle) points[base[2]] = [width, 0, depth];
  const bottom = points[foot];
  points[apex] = [bottom[0], elevation, bottom[2]];
  const distance = (a: string, b: string) => Math.hypot(...points[a].map((v, axis) => v - points[b][axis]));
  for (const [edge, length] of lengths) if (Math.abs(distance(edge[0], edge[1]) - length.value) > Math.max(1, length.value) * 1e-8)
    fail(`Hình dựng không khớp số đo ${edge} = ${length.label}; hãy đối chiếu dữ kiện bổ sung.`);
  for (const [a, b] of equalities) if (Math.abs(distance(a[0], a[1]) - distance(b[0], b[1])) > 1e-8)
    fail(`Các cạnh ${a} và ${b} không bằng nhau theo những số đo đã cho.`);
  const midpointData = readMidpointRelations(text);
  if (midpointData.issues.length) fail(midpointData.issues[0]);
  const remaining = [...midpointData.relations], midpoints: NonNullable<SpatialScene["midpoints"]> = [];
  while (remaining.length) {
    const index = remaining.findIndex(item => item.ends.every(name => points[name]));
    if (index < 0) {
      if (allowLayout) return null;
      fail("Trung điểm tham chiếu điểm chưa dựng hoặc có phụ thuộc vòng.");
    }
    const relation = remaining.splice(index, 1)[0];
    if (points[relation.point]) fail(`Tên trung điểm ${relation.point} trùng với điểm đã dựng.`);
    const p = points[relation.ends[0]], q = points[relation.ends[1]];
    points[relation.point] = p.map((v, axis) => (v + q[axis]) / 2) as SpatialPoint;
    midpoints.push(relation);
  }
  // Extra construction facts must be accounted for, rather than silently drawing a simpler solid.
  const consumedPerpendicular = text.replace(perpendicular[0], "");
  const extraRelations = /vuông\s*góc|song\s*song|\/\/|\|\||∥|∠|giao\s*điểm|hình\s*chiếu|phân\s*giác|góc\s+\S+\s*=|thuộc\s*(?:mặt|đường|cạnh)|∈|chia\s*(?:cạnh|đoạn)|tỉ\s*(?:lệ|số)/iu.test(consumedPerpendicular);
  if (extraRelations && !allowLayout) fail("Đề có thêm quan hệ dựng hình chưa được đối chiếu trong bộ dựng hình chóp này. Hãy giữ phần giả thiết và tên điểm đầy đủ để kiểm tra.");
  const edges: SpatialScene["edges"] = [];
  const seen = new Set<string>();
  const addEdge = (a: string, b: string, helper = false) => {
    const id = key(a, b);
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ ends: [a, b], helper, ...(lengths.get(id) ? { label: lengths.get(id)!.edge, measurement: lengths.get(id)!.label } : {}) });
  };
  base.forEach((name, i) => { addEdge(name, base[(i + 1) % base.length]); addEdge(apex, name); });
  for (const relation of midpoints) {
    if (relation.ends.every(name => base.includes(name))) {
      addEdge(apex, relation.point, true);
      for (const name of base.filter(name => !relation.ends.includes(name))) addEdge(name, relation.point, true);
    } else addEdge(right, relation.point, true);
  }
  const name = `Hình chóp ${apex}.${base.join("")}`;
  const constructionNote = illustrative
    ? `${name} giữ quan hệ vuông góc với đáy và các trung điểm đã cho. Kích thước còn thiếu được chọn để minh họa.${stated.some(item => item.symbolic) ? " Dùng a = 1 để bố trí hình; nhãn vẫn giữ biểu thức theo a." : ""} Bản 2D là hình chiếu; chọn 3D để xoay khối.`
    : `${name} dựng từ cạnh đáy, cạnh vuông góc đáy và trung điểm đã cho.${first?.symbolic ? " Dùng a = 1 để bố trí hình theo tỉ lệ; nhãn vẫn giữ biểu thức theo a, không gán đơn vị số." : " Số đo trên nhãn được giữ theo đề."} Bản 2D là hình chiếu; chọn 3D để xoay khối.`;
  const note = extraRelations ? constructionNote + " Hình mới dựng phần khối cơ bản. Các quan hệ bổ sung cần đối chiếu với đề." : constructionNote;
  const scene: SpatialScene = { key: "solve-right-pyramid", points, edges,
    faces: [base, ...base.map((name, i) => [apex, name, base[(i + 1) % base.length]])], midpoints, note };
  return compileSpatialScene(scene);
}
