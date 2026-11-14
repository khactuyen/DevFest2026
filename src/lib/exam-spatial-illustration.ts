import { AppError } from "./app-error";
import { readCylinderDimensions } from "./cylinder-problem-visual";
import { readMidpointRelations } from "./geometry-relations";
import { normalizeSpatialMath, spatialHypotheses } from "./solve-pyramid-visual";
import { compileSpatialScene, type SpatialPoint, type SpatialScene } from "./solve-spatial-scene";
import { threePattern } from "./three-patterns";
import { validateVisual } from "./validation";

const layoutNote = "Hình minh họa. Tỉ lệ và vị trí chưa xác định được chọn để bố trí hình. Đối chiếu các quan hệ bổ sung với đề trước khi chèn.";

function validateBaseLengths(base: string[], text: string, shape: string) {
  const lengths = new Map<string, { value: number; unit: string }>();
  for (const [, a, b, raw, unit = ""] of text.matchAll(/\b([A-Z])([A-Z])\s*=\s*([+−-]?\d+(?:[.,]\d+)?)(?:\s*(mm|cm|dm|m))?(?![\p{L}\p{N}_'′]|[.,]\d|\s*a\b)/gu)) {
    if (!base.includes(a) || !base.includes(b)) continue;
    const value = Number(raw.replace(",", ".").replace("−", "-"));
    const edge = [a, b].sort().join("");
    const earlier = lengths.get(edge);
    if (!(value > 0) || a === b || (earlier && unit === earlier.unit && value !== earlier.value)) {
      throw new AppError(422, `Độ dài ${a}${b} của đáy không hợp lệ hoặc có hai giá trị khác nhau.`, "needs_review");
    }
    lengths.set(edge, { value, unit });
  }
  const sides = base.map((name, index) => lengths.get([name, base[(index + 1) % base.length]].sort().join(""))).filter((item) => !!item);
  if (new Set(sides.map(({ unit }) => unit)).size !== 1) return;
  const values = sides.map(({ value }) => value).sort((a, b) => a - b);
  if (base.length === 3 && values.length === 3 && values[0] + values[1] <= values[2]) {
    throw new AppError(422, "Ba độ dài đã cho không tạo thành tam giác đáy.", "needs_review");
  }
  if ((/đều|lập\s*phương/iu.test(shape) || /đáy.{0,30}hình\s*vuông/iu.test(text)) && values.some((value) => value !== values[0])) {
    throw new AppError(422, "Các cạnh đáy đã cho không bằng nhau theo loại hình trong đề.", "needs_review");
  }
}

function basePoints(names: string[], text: string, shape: string): SpatialPoint[] {
  const regular = /đều|lập\s*phương/iu.test(shape);
  const right = /tam\s*giác\s*vuông(?:\s*cân)?\s*tại\s*([A-Z])\b/iu.exec(text);
  if (names.length === 3 && right) {
    const index = names.indexOf(right[1]);
    if (index < 0 || regular) throw new AppError(422, "Dữ kiện góc vuông của đáy tam giác không phù hợp với tên đỉnh hoặc loại đáy.", "needs_review");
    const points: SpatialPoint[] = [[0, 0, 0], [3, 0, 0], [0, 0, /vuông\s*cân/iu.test(right[0]) ? 3 : 2.1]];
    return names.map((_, i) => points[(i - index + 3) % 3]);
  }
  const isosceles = /tam\s*giác\s*cân\s*tại\s*([A-Z])\b/iu.exec(text);
  if (names.length === 3 && isosceles && !regular) {
    const index = names.indexOf(isosceles[1]);
    if (index < 0) throw new AppError(422, "Đỉnh cân không thuộc tam giác đáy.", "needs_review");
    const points: SpatialPoint[] = [[0, 0, 2.2], [-1.5, 0, 0], [1.5, 0, 0]];
    return names.map((_, i) => points[(i - index + 3) % 3]);
  }
  if (names.length === 3) return [[0, 0, 0], [3, 0, 0], regular || /tam\s*giác\s*đều/iu.test(text)
    ? [1.5, 0, 1.5 * Math.sqrt(3)] : [.75, 0, 2.1]];
  if (names.length > 4) return names.map((_, index) => [2 * Math.cos(index * 2 * Math.PI / names.length), 0,
    2 * Math.sin(index * 2 * Math.PI / names.length)]);
  const square = regular || /đáy.{0,30}hình\s*vuông/iu.test(text);
  const rectangle = square || /chữ\s*nhật/iu.test(`${shape} ${text}`);
  if (rectangle) return [[0, 0, 0], [3, 0, 0], [3, 0, square ? 3 : 2], [0, 0, square ? 3 : 2]];
  if (/bình\s*hành/iu.test(text) || /hình\s*hộp/iu.test(shape)) return [[0, 0, 0], [3, 0, 0], [3.75, 0, 2], [.75, 0, 2]];
  if (/hình\s*thang/iu.test(text)) {
    const positions: SpatialPoint[] = [[0, 0, 0], [3, 0, 0], [2.65, 0, 2], [/thang\s*cân/iu.test(text) ? .35 : .6, 0, 2]];
    const [a, b, c, d] = names;
    const parallel = "(?:song\\s*song(?:\\s*với)?|∥|//|\\|\\|)";
    const sideBases = new RegExp(`(?:${a}${d}|${d}${a})\\s*${parallel}\\s*(?:${b}${c}|${c}${b})|(?:${b}${c}|${c}${b})\\s*${parallel}\\s*(?:${a}${d}|${d}${a})`, "u");
    return sideBases.test(text) ? names.map((_, i) => positions[(i + 3) % 4]) : positions;
  }
  return [[0, 0, 0], [3, 0, 0], [2.7, 0, 2.2], [.5, 0, 1.8]];
}

function statedSolidLength(text: string, role: string) {
  const match = new RegExp(`(?:${role})\\s*(?:=|bằng|là|dài)?\\s*([+−-]?\\d+(?:[.,]\\d+)?)(?:\\s*(mm|cm|dm|m))?(?![\\p{L}\\p{N}_]|[.,]\\d|\\s*(?:[a-z](?!\\p{L})|sqrt|[+*/^√−-]))`, "iu").exec(text);
  if (!match) return;
  const value = Number(match[1].replace(",", ".").replace("−", "-"));
  if (!(value > 0)) throw new AppError(422, "Kích thước của khối phải lớn hơn 0.", "needs_review");
  return { value, label: [match[1], match[2]].filter(Boolean).join(" "), unit: match[2] ?? "" };
}

export function examCoordinateIllustration(prompt: string) {
  if (!/O\s*x\s*y\s*z/iu.test(prompt)) return null;
  const text = normalizeSpatialMath(prompt).replace(/−/g, "-");
  const coordinate = "([+-]?\\d+(?:[.,]\\d+)?)";
  const pattern = new RegExp(`([A-Z])\\s*\\(\\s*${coordinate}\\s*;\\s*${coordinate}\\s*;\\s*${coordinate}\\s*\\)`, "gu");
  const points: Record<string, SpatialPoint> = {};
  for (const [, label, x, y, z] of text.matchAll(pattern)) {
    const position = [x, y, z].map((value) => Number(value.replace(",", "."))) as SpatialPoint;
    if (points[label] && points[label].some((value, i) => value !== position[i])) {
      throw new AppError(422, `Tọa độ của điểm ${label} xuất hiện với hai giá trị khác nhau.`, "needs_review");
    }
    points[label] = position;
  }
  const triangle = /tam\s*giác\s*([A-Z]{3})(?![A-Z])/u.exec(text);
  const names = triangle ? [...triangle[1]] : [];
  if (!names.length || !names.every((name) => points[name])) return null;
  const [a, b, c] = names.map((name) => points[name]);
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    <= Math.hypot(...u) * Math.hypot(...v) * 1e-10) {
    throw new AppError(422, "Ba điểm đã cho thẳng hàng hoặc trùng nhau, không tạo thành tam giác.", "needs_review");
  }
  const edges: SpatialScene["edges"] = names.map((name, index) => ({ ends: [name, names[(index + 1) % names.length]] }));
  const note = `Tam giác ${triangle![1]} được dựng theo tọa độ trong đề. Hình thể hiện các điểm và cạnh đã cho.`;
  return { visual: compileSpatialScene({ key: "exam-coordinate-triangle", points, edges, faces: [names], note }).visual3d, note };
}

export function examSpatialIllustration(prompt: string) {
  const text = spatialHypotheses(prompt).replace(/(chóp(?:\s+(?:tam|tứ|ngũ|lục)\s*giác)?(?:\s+đều)?\s*)\.\s*([A-Z])\s*([A-Z]{3,6})(?![A-Z])/gu, "$1$2.$3");
  const pyramid = /(?:hình|khối)\s*chóp\s*((?:(?:tam|tứ|ngũ|lục)\s*giác\s*)?(?:đều\s*)?)\s*([A-Z])\s*[.·]\s*([A-Z]{3,6})(?![A-Z])/iu.exec(text);
  const tetrahedron = /tứ\s*diện(\s*đều)?\s+([A-Z])([A-Z]{3})(?![A-Z])/iu.exec(text);
  const pointed = pyramid ?? tetrahedron;
  const prism = /((?:lăng\s*trụ(?:\s*(?:đứng|đều))?|hình\s*hộp(?:\s*chữ\s*nhật)?|(?:hình\s*)?lập\s*phương)(?:\s*tam\s*giác\s*đều)?)\s+([A-Z]{3,4})\s*[.·]?\s*((?:[A-Z]'\s*){3,4}|[A-Z]{3,4})(?![A-Z'])/iu.exec(text);
  const unnamed = !pointed && !prism && !/cụt|thiết\s*diện|cắt|ghép|hai\s*(?:hình|khối)/iu.test(text)
    ? /(?:(?:hình|khối)\s*chóp\s*(?:tam|tứ|ngũ|lục)\s*giác(?:\s*đều)?|lăng\s*trụ\s*(?:đứng|đều)|hình\s*hộp\s*chữ\s*nhật|hình\s*lập\s*phương|tứ\s*diện\s*đều)/iu.exec(text)?.[0]
    : undefined;
  if (!pointed && !prism && !unnamed) return null;
  const shape = prism?.[1] ?? pointed?.[1] ?? unnamed ?? "";
  const baseName = /lục\s*giác/iu.test(text) ? "ABCDEF" : /ngũ\s*giác/iu.test(text) ? "ABCDE"
    : /tam\s*giác|tứ\s*diện/iu.test(text) && !/tứ\s*giác/iu.test(text) ? "ABC" : "ABCD";
  const base = [...(pointed?.[3] ?? prism?.[2] ?? baseName)];
  const apex = pointed?.[2] ?? (unnamed && /chóp|tứ\s*diện/iu.test(unnamed) ? "S" : undefined);
  const top = prism?.[3].match(/[A-Z]'?/g) ?? (apex ? [] : base.map(name => name + "'"));
  const names = [...base, ...(apex ? [apex] : top)];
  if ((!apex && top.length !== base.length) || (base.length !== 4 && /lập\s*phương|hình\s*hộp/iu.test(prism?.[1] ?? ""))
    || new Set(names).size !== names.length) {
    throw new AppError(422, "Tên đỉnh bị trùng hoặc hai đáy không có cùng số đỉnh.", "needs_review");
  }
  validateBaseLengths(base, text, shape);
  const baseSize = statedSolidLength(text, "cạnh\\s*đáy|đáy\\s*là\\s*hình\\s*vuông\\s*(?:có\\s*)?cạnh|hình\\s*lập\\s*phương\\s*(?:có\\s*)?cạnh");
  const sideSize = statedSolidLength(text, "cạnh\\s*bên");
  const solidHeight = statedSolidLength(text, "chiều\\s*cao");
  const uniform = /đều|lập\s*phương/iu.test(shape) || /đáy.{0,30}hình\s*vuông/iu.test(text);
  const vertices = basePoints(base, text, shape);
  if (baseSize && uniform) {
    const first = vertices[0], next = vertices[1];
    const factor = baseSize.value / Math.hypot(first[0] - next[0], first[2] - next[2]);
    vertices.forEach((vertex) => { vertex[0] *= factor; vertex[2] *= factor; });
  }
  const points: Record<string, SpatialPoint> = Object.fromEntries(base.map((name, index) => [name, vertices[index]]));
  const edges: SpatialScene["edges"] = base.map((name, index) => ({ ends: [name, base[(index + 1) % base.length]],
    ...(baseSize && uniform && index === 0 ? { measurement: baseSize.label } : {}) }));
  const faces = [base];
  if (apex) {
    const feet = [...text.matchAll(/([A-Z]{2})\s*vuông\s*góc\s*(?:với\s*)?(?:mặt\s*phẳng\s*)?(?:\(\s*([A-Z]{3,6})\s*\)|(đáy)(?!\p{L}))/giu)]
      .filter(([, edge, plane]) => edge.includes(apex) && (!plane || [...plane].sort().join("") === [...base].sort().join("")))
      .map(([, edge]) => [...edge].find((name) => name !== apex));
    const foot = feet[0];
    if (new Set(feet).size > 1 || (foot && (!points[foot] || /đều/iu.test(shape)))) {
      throw new AppError(422, "Các quan hệ đường cao và đáy của hình chóp không khớp nhau.", "needs_review");
    }
    const center = (axis: number) => vertices.reduce((sum, point) => sum + point[axis], 0) / base.length;
    const radius = Math.hypot(vertices[0][0] - center(0), vertices[0][2] - center(2));
    const compatibleSide = baseSize && sideSize && baseSize.unit === sideSize.unit && /đều/iu.test(shape) ? sideSize : undefined;
    if (compatibleSide && compatibleSide.value <= radius) throw new AppError(422, "Cạnh bên đã cho quá ngắn so với đáy của hình chóp đều.", "needs_review");
    const elevation = compatibleSide ? Math.sqrt(compatibleSide.value ** 2 - radius ** 2)
      : tetrahedron && /đều/iu.test(shape) ? Math.sqrt(2) * radius : 2.7;
    points[apex] = foot ? [points[foot][0], elevation, points[foot][2]] : [center(0), elevation, center(2)];
    base.forEach((name, index) => {
      edges.push({ ends: [apex, name], ...(compatibleSide && index === 0 ? { measurement: compatibleSide.label } : {}) });
      faces.push([apex, name, base[(index + 1) % base.length]]);
    });
  } else {
    const straight = /đứng|đều|chữ\s*nhật|lập\s*phương/iu.test(shape);
    const givenHeight = solidHeight ?? (straight ? sideSize : undefined);
    const usableHeight = givenHeight && (!baseSize || givenHeight.unit === baseSize.unit) ? givenHeight : undefined;
    const height = /lập\s*phương/iu.test(shape) ? baseSize?.value ?? 3 : usableHeight?.value ?? 2.7;
    const [dx, dz] = straight ? [0, 0] : [.6, .25];
    faces.push(top);
    top.forEach((name, index) => {
      const next = (index + 1) % top.length;
      points[name] = [vertices[index][0] + dx, height, vertices[index][2] + dz];
      edges.push({ ends: [name, top[next]] }, { ends: [base[index], name],
        ...(straight && index === 0 && usableHeight?.value === height ? { measurement: usableHeight.label } : {}) });
      faces.push([base[index], base[next], top[next], name]);
    });
  }
  const relations = readMidpointRelations(text);
  if (relations.issues.length) throw new AppError(422, relations.issues[0], "needs_review");
  const remaining = [...relations.relations];
  const midpoints: NonNullable<SpatialScene["midpoints"]> = [];
  while (remaining.length) {
    const index = remaining.findIndex(({ ends }) => ends.every((end) => points[end]));
    if (index < 0) break;
    const { point, ends } = remaining.splice(index, 1)[0];
    if (points[point]) throw new AppError(422, `Trung điểm ${point} trùng tên một đỉnh đã có.`, "needs_review");
    const [a, b] = ends.map((end) => points[end]);
    points[point] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    midpoints.push({ point, ends });
  }
  const note = layoutNote + (unnamed ? " Tên đỉnh được đặt để tiện quan sát." : "")
    + (remaining.length ? ` Chưa dựng được các trung điểm ${remaining.map(({ point }) => point).join(", ")}.` : "");
  return { visual: compileSpatialScene({ key: "exam-spatial-layout", points, edges, faces, midpoints, note }).visual3d, note };
}

export function examRoundSolidIllustration(prompt: string) {
  const text = normalizeSpatialMath(prompt);
  const solid = /(?:hình|khối)\s*(nón|cầu)\b/iu.exec(text);
  if (!solid || /rỗng|xiên|mặt\s*cắt|thiết\s*diện|giao\s*tuyến|tiếp\s*xúc|nón\s*cụt/iu.test(text)) return null;
  const kind = solid[1].toLowerCase() === "nón" ? "cone" : "sphere";
  const dimensions = readCylinderDimensions(text.replace(solid[0], "hình trụ"));
  if (!dimensions || (kind === "sphere" && dimensions.height)) return null;
  const radius = dimensions.radius?.value ?? (dimensions.height ? dimensions.height.value * .6 : 2);
  const height = dimensions.height?.value ?? radius * 1.6;
  const span = kind === "sphere" ? radius * 2 : Math.max(height, radius * 2);
  const model = threePattern(kind);
  const note = `Hình ${solid[1].toLowerCase()}. ${layoutNote}`;
  return { visual: validateVisual({ ...model, parameters: [],
    objects: [{ ...model.objects[0], parameterBindings: undefined, radius, ...(kind === "cone" ? { height } : {}) }],
    camera: { position: [span * 1.4, span, span * 1.6], target: [0, 0, 0] }, accessibility: { description: note },
  }), note };
}
