import { INK_HEIGHT, INK_WIDTH, normalizeInk, type InkPoint, type InkStroke, type SketchPlan } from "./sketch-geometry";
import { fitInkLine } from "./ink-line-fit";
import { ObjectSchema,type TwoDVisualSpec } from "./contracts";

export type InkPlacement = {
  centerX: number;
  centerY: number;
  pixelsPerUnit: number;
};
export type InkShapeChoice = "auto" | "line" | "triangle" | "rectangle" | "square" | "circle";

function distance(a: InkPoint, b: InkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToEdge(point: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function fitCircle(points: InkPoint[]): { center: InkPoint; radius: number } {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0, xy = 0, yy = 0, xr = 0, yr = 0;
  for (const point of points) {
    const x = point.x - meanX, y = point.y - meanY, r2 = x * x + y * y;
    xx += x * x; xy += x * y; yy += y * y;
    xr += x * r2; yr += y * r2;
  }
  const determinant = xx * yy - xy * xy;
  const center = determinant > 1e-10
    ? { x: meanX + (xr * yy - yr * xy) / (2 * determinant),
        y: meanY + (yr * xx - xr * xy) / (2 * determinant) }
    : { x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
        y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2 };
  return { center, radius: points.reduce((sum, point) => sum + distance(point, center), 0) / points.length };
}

/** Reassemble a closed contour drawn in several pen strokes. Never join
 * disconnected objects merely because they share a selection rectangle. */
function closedContour(strokes: InkStroke[]): InkPoint[] | null {
  if (strokes.length === 1) return worldPoints(strokes);
  if (strokes.length > 8 || strokes.some((stroke) => stroke.points.length < 2)) return null;
  const parts = strokes.map((stroke) => worldPoints([stroke]));
  const all = parts.flat();
  const extent = Math.max(
    Math.max(...all.map((point) => point.x)) - Math.min(...all.map((point) => point.x)),
    Math.max(...all.map((point) => point.y)) - Math.min(...all.map((point) => point.y)),
  );
  const tolerance = extent * 0.12;
  if (extent < 0.06) return null;
  const contour = parts.shift()!;
  while (parts.length) {
    const tail = contour.at(-1)!;
    let best = { index: -1, reverse: false, gap: Infinity };
    parts.forEach((part, index) => {
      const forward = distance(tail, part[0]);
      const reverse = distance(tail, part.at(-1)!);
      if (forward < best.gap) best = { index, reverse: false, gap: forward };
      if (reverse < best.gap) best = { index, reverse: true, gap: reverse };
    });
    if (best.index < 0 || best.gap > tolerance) return null;
    const part = parts.splice(best.index, 1)[0];
    contour.push(...(best.reverse ? part.reverse() : part).slice(1));
  }
  return distance(contour[0], contour.at(-1)!) <= extent * 0.18 ? contour : null;
}

function autoClosedPlan(strokes: InkStroke[]): SketchPlan | null {
  if (new Set(strokes.map((stroke) => stroke.lineStyle || "solid")).size > 1) return null;
  const points = closedContour(strokes);
  if (!points) return null;
  if (points.length < 12) return null;
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
  const width = maxX - minX, height = maxY - minY;
  const extent = Math.max(width, height);
  if (extent < 0.06 || distance(points[0], points.at(-1)!) > extent * 0.18) return null;
  const candidates: { plan: SketchPlan; score: number; error: number; shape: "circle" | "triangle" | "rectangle" }[] = [];
  for (const shape of ["circle", "triangle", "rectangle"] as const) {
    const plan = planGraphInk(strokes, shape);
    if (!plan || plan.ambiguities.length || (shape === "circle" ? !plan.circles.length : !plan.polygons.length)) continue;
    let error = 0;
    if (shape === "circle") {
      if (Math.min(width, height) / extent < 0.72) continue;
      const circle = plan.circles[0];
      const center = plan.points[circle.center], radius = distance(center, plan.points[circle.through]);
      error = points.reduce((sum, point) => sum + Math.abs(distance(point, center) - radius), 0) / points.length / Math.max(radius, 0.01);
    } else {
      const vertices = plan.polygons[0].map((index) => plan.points[index]);
      const shortSide = Math.min(...vertices.map((point, index) => distance(point, vertices[(index + 1) % vertices.length])));
      error = points.reduce((sum, point) => sum + Math.min(...vertices.map((vertex, index) =>
        distanceToEdge(point, vertex, vertices[(index + 1) % vertices.length]))), 0) / points.length / Math.max(shortSide, 0.01);
    }
    const limit = shape === "circle" ? 0.12 : 0.085;
    if (error < limit) candidates.push({ plan, score: error / limit, error, shape });
  }
  candidates.sort((a, b) => a.score - b.score);
  if (!candidates.length) {
    const uncertain = normalizeInk(strokes);
    if (uncertain) uncertain.ambiguities.push("Không xác định chắc chắn hình khép kín. Hãy chọn rõ Tam giác, Hình chữ nhật hoặc Đường tròn rồi thử lại.");
    return uncertain;
  }
  // Circle and polygon scores use different geometric normalizers. A hand-
  // drawn circle often also fits a loose rectangle candidate, so don't call
  // that ambiguous unless the polygon boundary is a substantially better fit.
  const circle = candidates.find((candidate) => candidate.shape === "circle");
  const polygon = candidates.filter((candidate) => candidate.shape !== "circle")
    .sort((a, b) => a.error - b.error)[0];
  if (circle && Math.min(width, height) / extent >= 0.78 && circle.error <= 0.12) {
    const polygonIsClear = Boolean(polygon && polygon.error <= 0.035 && polygon.error < circle.error * 0.5);
    return polygonIsClear ? polygon!.plan : circle.plan;
  }
  if (candidates.length > 1 && candidates[1].score - candidates[0].score < 0.12) {
    candidates[0].plan.ambiguities.push("Hình khép kín có nhiều cách hiểu. Hãy chọn kiểu hình trước khi chuẩn hóa.");
  }
  return candidates[0].plan;
}

function worldPoints(strokes: InkStroke[]): InkPoint[] {
  return strokes.flatMap((stroke) => stroke.points.map((point) => ({
    x: (point.x - INK_WIDTH / 2) * 20 / INK_WIDTH,
    y: (INK_HEIGHT / 2 - point.y) * 20 / INK_WIDTH,
  })));
}

function convexHull(points: InkPoint[]): InkPoint[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: InkPoint, b: InkPoint, c: InkPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: InkPoint[] = [], upper: InkPoint[] = [];
  for (const point of sorted) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of sorted.reverse()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Explicit shape choice fits geometry to the ink while keeping its location. */
export function planGraphInk(strokes: InkStroke[], shape: InkShapeChoice): SketchPlan | null {
  if (shape === "auto") return autoClosedPlan(strokes) || normalizeInk(strokes);
  const points = worldPoints(strokes);
  if (points.length < 2) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const extent = Math.max(maxX - minX, maxY - minY);
  if (extent < 0.06) return null;
  const base: SketchPlan = {
    title: "Hình chuẩn hóa từ nét vẽ",
    description: "Hình học được khớp với nét đã chọn; hãy kiểm tra tên và số đo theo đề bài.",
    transcription: "", ambiguities: [], points: [], edges: [], circles: [], polygons: [], expression: "",
  };
  const uniformDashed = strokes.every((stroke) => stroke.lineStyle === "dashed");
  if (new Set(strokes.map((stroke) => stroke.lineStyle || "solid")).size > 1)
    base.ambiguities.push("Các nét đã chọn có kiểu liền và đứt khác nhau. Hãy chọn từng phần để chuẩn hóa, hoặc dùng Tự nhận dạng.");
  const put = (source: InkPoint[]) => { base.points = source.map((point) => ({ ...point, label: "" })); };
  if (shape === "line") {
    const fitted = fitInkLine(points);
    if (!fitted) return null;
    if (strokes.length > 1 && fitted.ratio > 0.08) {
      base.ambiguities.push("Vùng chọn chứa nhiều hướng nét khác nhau. Hãy khoanh riêng đoạn thẳng muốn chuẩn hóa.");
      return base;
    }
    put(fitted.endpoints);
    base.edges = [[0, 1]];
    if (uniformDashed) base.dashedEdges = [0];
    base.description = "Đã khớp một đoạn thẳng qua các nét phác.";
    return base;
  }
  if (shape === "circle") {
    const contour = closedContour(strokes);
    if (!contour || Math.min(maxX - minX, maxY - minY) / extent < 0.5) {
      base.ambiguities.push("Các nét chưa tạo thành một đường tròn khép kín. Hãy khoanh riêng đường tròn hoặc vẽ nối các cung.");
      return base;
    }
    const { center, radius } = fitCircle(points);
    if (radius < 0.03) return null;
    const radialError = points.reduce((sum, point) => sum + Math.abs(distance(point, center) - radius), 0) / points.length / radius;
    if (radialError > 0.22) {
      base.ambiguities.push("Độ lệch nét quá lớn để chuẩn hóa thành đường tròn. Hãy chọn đúng vùng hoặc vẽ lại một vòng khép kín.");
      return base;
    }
    put([center, { x: center.x + radius, y: center.y }]);
    base.circles = [{ center: 0, through: 1 }];
    if (uniformDashed) base.dashedCircles = [0];
    base.description = "Đã khớp một đường tròn theo vùng nét phác.";
    return base;
  }
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const contour = closedContour(strokes);
  if (!contour) {
    base.ambiguities.push("Các cạnh chưa khép kín hoặc vùng chọn chứa nhiều hình. Hãy khoanh từng hình riêng.");
    return base;
  }
  if (shape === "triangle") {
    const candidates = hull.length <= 60 ? hull : hull.filter((_, index) => index % Math.ceil(hull.length / 60) === 0);
    let best: [InkPoint, InkPoint, InkPoint] | null = null;
    let largest = 0;
    for (let i = 0; i < candidates.length - 2; i++)
      for (let j = i + 1; j < candidates.length - 1; j++)
        for (let k = j + 1; k < candidates.length; k++) {
          const a = candidates[i], b = candidates[j], c = candidates[k];
          const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
          if (area > largest) { largest = area; best = [a, b, c]; }
        }
    if (!best || largest < 0.01) return null;
    const side = Math.min(distance(best[0], best[1]), distance(best[1], best[2]), distance(best[2], best[0]));
    const error = contour.reduce((sum, point) => sum + Math.min(...best!.map((vertex, index) =>
      distanceToEdge(point, vertex, best![(index + 1) % 3]))), 0) / contour.length / side;
    if (error > 0.18) {
      base.ambiguities.push("Nét không đủ giống tam giác. Hãy chọn đúng vùng hoặc chỉnh nét phác.");
      return base;
    }
    put(best);
    base.edges = [[0, 1], [1, 2], [2, 0]];
    if (uniformDashed) base.dashedEdges = [0, 1, 2];
    base.polygons = [[0, 1, 2]];
    base.description = "Đã khớp ba đỉnh và ba cạnh của tam giác.";
    return base;
  }
  let bestBox: { u: InkPoint; v: InkPoint; loU: number; hiU: number; loV: number; hiV: number; area: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const v = { x: -u.y, y: u.x };
    const us = hull.map((point) => point.x * u.x + point.y * u.y);
    const vs = hull.map((point) => point.x * v.x + point.y * v.y);
    const loU = Math.min(...us), hiU = Math.max(...us), loV = Math.min(...vs), hiV = Math.max(...vs);
    const area = (hiU - loU) * (hiV - loV);
    if (!bestBox || area < bestBox.area) bestBox = { u, v, loU, hiU, loV, hiV, area };
  }
  if (!bestBox || bestBox.area < 0.01) return null;
  let { loU, hiU, loV, hiV } = bestBox;
  if (shape === "square") {
    const side = ((hiU - loU) + (hiV - loV)) / 2;
    const cu = (loU + hiU) / 2, cv = (loV + hiV) / 2;
    loU = cu - side / 2; hiU = cu + side / 2;
    loV = cv - side / 2; hiV = cv + side / 2;
  }
  const p = (u: number, v: number) => ({
    x: u * bestBox.u.x + v * bestBox.v.x,
    y: u * bestBox.u.y + v * bestBox.v.y,
  });
  put([p(loU, loV), p(hiU, loV), p(hiU, hiV), p(loU, hiV)]);
  const fitted = base.points;
  const side = Math.min(...fitted.map((vertex, index) => distance(vertex, fitted[(index + 1) % 4])));
  const error = contour.reduce((sum, point) => sum + Math.min(...fitted.map((vertex, index) =>
    distanceToEdge(point, vertex, fitted[(index + 1) % 4]))), 0) / contour.length / side;
  if (error > 0.19) {
    base.ambiguities.push("Nét không đủ giống hình bốn cạnh đã chọn. Hãy chọn từng hình riêng hoặc chỉnh nét phác.");
    return base;
  }
  base.edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
  if (uniformDashed) base.dashedEdges = [0, 1, 2, 3];
  base.polygons = [[0, 1, 2, 3]];
  base.description = shape === "square" ? "Đã khớp hình vuông với bốn cạnh bằng nhau." : "Đã khớp hình chữ nhật với bốn góc vuông.";
  return base;
}

/** Keep the same scale on both axes, regardless of the selection box ratio. */
export function prepareGraphInk(strokes: InkStroke[]): {
  strokes: InkStroke[];
  placement: InkPlacement;
} | null {
  const points = strokes.flatMap((stroke) => stroke.points).filter((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (points.length < 2) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min((INK_WIDTH - 48) / width, (INK_HEIGHT - 48) / height);
  const placement = { centerX, centerY, pixelsPerUnit: INK_WIDTH / (20 * scale) };
  return {
    placement,
    strokes: strokes.map((stroke) => ({
      color: stroke.color,
      lineStyle: stroke.lineStyle,
      points: stroke.points.map((point) => ({
        x: INK_WIDTH / 2 + (point.x - centerX) * scale,
        y: INK_HEIGHT / 2 + (point.y - centerY) * scale,
      })),
    })),
  };
}

export function inkPointOnBoard(
  x: number,
  y: number,
  placement: InkPlacement,
): { x: number; y: number } {
  return {
    x: placement.centerX + x * placement.pixelsPerUnit,
    y: placement.centerY - y * placement.pixelsPerUnit,
  };
}

/** Remove dependent constructions and discard their unused automatic points. */
export function removeVisualObject(
  spec: TwoDVisualSpec,
  targetId: string,
  removedAutomaticPoints?: Set<string>,
): TwoDVisualSpec | null {
  if (!spec.objects.some((object) => object.id === targetId)) return spec;
  const removed = new Set([targetId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of spec.objects) {
      if (!removed.has(object.id) && (object.parents.some((parent) => removed.has(parent)) || object.tangentOf && removed.has(object.tangentOf.sourceId))) {
        removed.add(object.id);
        grew = true;
      }
    }
  }
  const sourceId = (id: string) => id.replace(/^(?:solid_|curve_|edge_|point_|label_)/, "");
  const missing = (id: string) => removed.has(id) || removed.has(sourceId(id));
  let spatialGrew = true;
  while (spatialGrew) {
    spatialGrew = false;
    for (const connection of spec.spatialConnections ?? []) {
      if (!removed.has(connection.id) && connection.endpoints.some(({ objectId }) => missing(objectId))) {
        removed.add(connection.id);
        spatialGrew = true;
      }
    }
  }
  const spatialConnections = spec.spatialConnections?.filter((connection) => !removed.has(connection.id));
  const spatialReferences = (object: NonNullable<TwoDVisualSpec["savedSpatialObjects"]>[number]) => [
    ...(object.vertexEndpoints?.map((anchor) => anchor.objectId) ?? []),
    ...(object.spatialConstruction?.inputs.flatMap(({ anchor }) => anchor ? [anchor.objectId] : []) ?? []),
    ...(object.spatialConstruction?.sourceId ? [object.spatialConstruction.sourceId] : []),
    ...(object.net ? [object.net.sourceId] : []),
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of spec.savedSpatialObjects ?? []) {
      if (!removed.has(object.id) && spatialReferences(object).some(missing)) {
        removed.add(object.id);
        changed = true;
      }
    }
  }
  const savedSpatialObjects = spec.savedSpatialObjects?.filter((object) => !removed.has(object.id));
  const affectedParents = new Set<string>();
  const usedParents = new Set<string>();
  for (const object of spec.objects) {
    const references = removed.has(object.id) ? affectedParents : usedParents;
    object.parents.forEach((id) => references.add(id));
  }
  const spatialParents = [
    ...(spatialConnections?.flatMap(({ endpoints }) => endpoints.map(({ objectId }) => objectId)) ?? []),
    ...(savedSpatialObjects?.flatMap(spatialReferences) ?? []),
  ];
  for (const id of spatialParents) {
    usedParents.add(id);
    usedParents.add(sourceId(id));
  }
  for (const object of spec.objects) {
    if (
      (object.type === "point" || object.type === "glider") &&
      object.removeWhenUnused &&
      affectedParents.has(object.id) &&
      !usedParents.has(object.id) &&
      !removed.has(object.id)
    ) {
      removed.add(object.id);
      removedAutomaticPoints?.add(object.id);
    }
  }
  const spatialStyles = spec.spatialStyles?.filter((style) => !missing(style.objectId));
  const objects = spec.objects.filter((object) => !removed.has(object.id));
  if (!objects.length && (spec.boardItems?.length || spatialConnections?.length ||
    spec.spatialPoints?.length || savedSpatialObjects?.length || spec.savedNative3d)) {
    objects.push(ObjectSchema.parse({ id: "content_anchor", type: "point", x: 0, y: 0, visible: false }));
  }
  return objects.length
    ? { ...spec, objects, savedSpatialObjects, ...(spatialConnections ? { spatialConnections } : {}), ...(spatialStyles ? { spatialStyles } : {}) }
    : null;
}
