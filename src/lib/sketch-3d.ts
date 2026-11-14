import { TwoDVisualSpecSchema, VisualSpecSchema, type ThreeVisualObject, type ThreeVisualSpec, type TwoDVisualSpec } from "./contracts";
import { compileExpression } from "./expression";
import { constructionPoint } from "./geometry-construction-point";
import { relationMarkGeometry, relationMarkSourcesVisible } from "./geometry-relation-mark";
import { validateVisual } from "./validation";
import { CYLINDER_DIMENSIONS_KEY, cylinderDimensions3d } from "./cylinder-problem-visual";

export type Sketch3dMode = "auto" | "planar" | "cylinder";

const numberParam = (id: string, label: string, value: number, range: number) => ({
  id,
  label,
  min: 0.001,
  max: Math.max(range, value * 3, 1),
  value,
  step: Math.max(0.01, Math.max(range, value * 3, 1) / 100),
});

/** Convert a validated 2D construction to a constrained, rotatable Three.js scene. */
export function convertSketchTo3d(
  input: TwoDVisualSpec,
  mode: Sketch3dMode = "planar",
  livePositions: Record<string, [number, number]> = {},
): ThreeVisualSpec {
  const source = validateVisual(input) as TwoDVisualSpec;
  if (source.savedNative3d) {
    const { savedNative3d, boardItems, ...planarBoard } = source;
    return { ...savedNative3d, planarBoard, boardItems };
  }
  if (source.source?.key === CYLINDER_DIMENSIONS_KEY) {
    const scene = cylinderDimensions3d(source);
    return {
      ...scene,
      boardItems: source.boardItems,
      objects: [
        ...scene.objects,
        ...(source.savedSpatialObjects || []).filter(
          (object) => !scene.objects.some((existing) => existing.id === object.id),
        ),
      ],
      parameters: [...scene.parameters, ...(source.savedSpatialParameters || [])],
    };
  }
  const values = Object.fromEntries(source.parameters.map((parameter) => [parameter.id, parameter.value]));
  const coordinates = new Map<string, [number, number]>();
  const valueOf = (value: number | string | undefined) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return NaN;
    return compileExpression(value, Object.keys(values))(values);
  };
  for (const object of source.objects) {
    if (["point", "glider"].includes(object.type) && !object.offset && !object.construction && !object.angleParameter && object.x !== undefined && object.y !== undefined) {
      const point: [number, number] = [valueOf(object.x), valueOf(object.y)];
      if (point.every(Number.isFinite)) coordinates.set(object.id, point);
    }
  }
  // JSXGraph has already solved dependent constructions and user-dragged points.
  // Its live coordinates take precedence over the initial expressions.
  for (const [id, point] of Object.entries(livePositions)) {
    const object = source.objects.find((candidate) => candidate.id === id);
    if (object && (object.free || object.construction || !["point", "glider"].includes(object.type)) &&
      point.length === 2 && point.every(Number.isFinite)) coordinates.set(id, point);
  }
  // Resolve dependent point chains, not just one pass in array order.
  const resolvePoint = (id:string):[number,number]|undefined => {
    const cached=coordinates.get(id); if(cached)return cached;
    const object=source.objects.find(o=>o.id===id); if(!object)return undefined;
    let point:[number,number]|undefined;
    if (object.type === "point" && object.construction) {
      const parents = object.parents.map(resolvePoint);
      if (parents.every(Boolean)) { const p = constructionPoint(object.construction, parents.map(p => ({ x: p![0], y: p![1] })),object.constructionFactor===undefined?1:valueOf(object.constructionFactor)); if (p) point = [p.x, p.y]; }
    } else if(object.type==="glider" && object.angleParameter){const circle=source.objects.find(o=>o.id===object.parents[0])!,center=resolvePoint(circle.parents[0]),angle=values[object.angleParameter],radius=valueOf(circle.radius);if(center)point=[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle)];
    } else if(object.type==="point" && object.offset) {
      const center=resolvePoint(object.parents[0]);
      if(center)point=[center[0]+valueOf(object.x),center[1]+valueOf(object.y)];
    } else if(object.type==="midpoint") {
      const a=resolvePoint(object.parents[0]),b=resolvePoint(object.parents[1]);
      if(a && b)point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    } else if (object.type === "projection") {
      const p = resolvePoint(object.parents[0]), line = resolveLine(object.parents[1]);
      const a = line?.[0], b = line?.[1];
      if (p && a && b) {
        const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
        if (length2 > 1e-16) { const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2; point = [a[0] + t * dx, a[1] + t * dy]; }
      }
    } else if (object.type === "intersection") {
      const l = resolveLine(object.parents[0]), m = resolveLine(object.parents[1]);
      if (l && m) {
        const dx = l[1][0] - l[0][0], dy = l[1][1] - l[0][1], ex = m[1][0] - m[0][0], ey = m[1][1] - m[0][1], d = dx * ey - dy * ex;
        if (Math.abs(d) > 1e-12 * Math.hypot(dx, dy) * Math.hypot(ex, ey)) {
          const t = ((m[0][0] - l[0][0]) * ey - (m[0][1] - l[0][1]) * ex) / d;
          point = [l[0][0] + t * dx, l[0][1] + t * dy];
        }
      }
    }
    if(point?.every(Number.isFinite))coordinates.set(id,point);
    return point;
  };
  function resolveLine(id: string): [[number, number], [number, number]] | undefined {
    const o = source.objects.find(o => o.id === id); if (!o) return undefined;
    if (["line", "segment", "arrow"].includes(o.type)) { const a = resolvePoint(o.parents[0]), b = resolvePoint(o.parents[1]); return a && b ? [a, b] : undefined; }
    if (o.type === "parallel" || o.type === "perpendicular") {
      const base = resolveLine(o.parents[0]), a = resolvePoint(o.parents[1]); if (!base || !a) return undefined;
      const dx = base[1][0] - base[0][0], dy = base[1][1] - base[0][1];
      return [a, o.type === "parallel" ? [a[0] + dx, a[1] + dy] : [a[0] - dy, a[1] + dx]];
    }
    return undefined;
  }
  source.objects.forEach(o=>resolvePoint(o.id));
  // Attached edge points are reconstructed from their parent, never from a
  // stale snapshot of x/y after resizing or returning from another dimension.
  const anchored=source.objects.filter((o)=>o.type === "glider" && o.edgeRatio!==undefined);
  for (let pass=0;pass<anchored.length;pass++) for (const object of anchored) {
    const target=source.objects.find((o)=>o.id===object.parents[0]);
    const a=target && coordinates.get(target.parents[0]), b=target && coordinates.get(target.parents[1]);
    if (!target || !a) continue;
    if (target.type === "circle") {
      const radius=target.radius!==undefined ? Math.abs(valueOf(target.radius)) : b ? Math.hypot(b[0]-a[0],b[1]-a[1]) : NaN;
      const theta=object.edgeRatio!*2*Math.PI;
      if (Number.isFinite(radius)) coordinates.set(object.id,[a[0]+radius*Math.cos(theta),a[1]+radius*Math.sin(theta)]);
    } else if (b) coordinates.set(object.id,[a[0]*(1-object.edgeRatio!)+b[0]*object.edgeRatio!,a[1]*(1-object.edgeRatio!)+b[1]*object.edgeRatio!]);
  }
  const at = (id: string) => coordinates.get(id);
  const byId = new Map(source.objects.map((object) => [object.id, object]));
  const endpoints = (id: string): readonly [[number, number], [number, number]] | undefined => {
    const line = byId.get(id);
    if (!line) return undefined;
    if (line.type === "parallel" || line.type === "perpendicular") {
      const base = endpoints(line.parents[0]), a = at(line.parents[1]); if (!base || !a) return undefined;
      const dx = base[1][0] - base[0][0], dy = base[1][1] - base[0][1];
      return [a, line.type === "parallel" ? [a[0] + dx, a[1] + dy] : [a[0] - dy, a[1] + dx]];
    }
    const first = at(line.parents[0]), second = at(line.parents[1]);
    return first && second ? [first, second] as const : undefined;
  };
  const objects: (Omit<ThreeVisualObject, "marker"> & { marker?: boolean })[] = [];
  const parameters = source.parameters.map((parameter) => ({ ...parameter }));
  const radiusLinks: Array<{ circleId: string; parameterId: string }> = [];
  const color = (object: TwoDVisualSpec["objects"][number]) => object.color || "#168265";
  const label = (object: TwoDVisualSpec["objects"][number]) => object.label || object.id;
  const point3 = ([x, y]: [number, number]): [number, number, number] => [x, 0, y];
  const addParameter = (id: string, name: string, value: number) => {
    if (parameters.length >= 12) return undefined;
    const base = id.slice(0, 56);
    let uniqueId = base, suffix = 2;
    while (parameters.some((parameter) => parameter.id === uniqueId)) uniqueId = `${base}_${suffix++}`;
    parameters.push(numberParam(uniqueId, name, Math.max(0.001, value), Math.max(5, Math.abs(value) * 1.5)));
    values[uniqueId] = value;
    return uniqueId;
  };

  for (const object of source.objects) {
    if (!object.visible) continue;
    if (object.type === "relationMark") {
      const count = object.markKind === "equal-length" ? 4 : object.markKind === "equal-angle" ? 6 : Math.min(4, object.parents.length);
      const p = object.parents.slice(0, count).map(at).map(p => p ? { x: p[0], y: p[1] } : { x: NaN, y: NaN });
      const mark = relationMarkGeometry(object.markKind!, p, .12, object.markCount || 1);
      const points3d = mark.strokes.flatMap(stroke => stroke.slice(1).flatMap((p, i) => [point3([stroke[i].x, stroke[i].y]), point3([p.x, p.y])]));
      objects.push({ id: `curve_${object.id}`, type: "curve3d", segments: true, visible: mark.valid && relationMarkSourcesVisible(source, object), points3d: points3d.length ? points3d : [[0, 0, 0], [0, 0, 0]], label: "Ký hiệu quan sát, không phải chứng minh", color: color(object), position: [0, 0, 0], rotation: [0, 0, 0], annotationKind: object.annotationKind });
      continue;
    }
    if (object.type === "functionGraph" && object.expression) {
      objects.push({
        id: `curve_${object.id}`,
        type: "curve3d",
        visible: true,
        label: label(object),
        color: color(object),
        expression: object.expression,
        lineStyle: object.lineStyle,
        xRange: object.domain || source.viewport.x,
        samples: 220,
        thickness: 0.025,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });
      continue;
    }
    if (object.type === "circle") {
      const center = at(object.parents[0]), through = at(object.parents[1]);
      if (!center) continue;
      const existingRadius = object.radius === undefined ? undefined : valueOf(object.radius);
      const radius = Number.isFinite(existingRadius) ? Math.abs(existingRadius!) : through ? Math.hypot(through[0] - center[0], through[1] - center[1]) : NaN;
      if (!Number.isFinite(radius) || radius < 0.001) continue;
      if (mode !== "planar") {
        const nativeRadius = typeof object.radius === "string" && source.parameters.some((p) => p.id === object.radius)
          ? object.radius : undefined;
        const throughObject = byId.get(object.parents[1]);
        // Do not offer an independent radius for a constrained/expression-driven circle.
        const canResize = typeof object.radius === "number" || object.radius === undefined && throughObject?.type === "point" && throughObject.free;
        const parameterId = nativeRadius || (canResize ? addParameter(`radius_${object.id}`, "Bán kính r", radius) : undefined);
        if (parameterId && !nativeRadius) radiusLinks.push({ circleId: object.id, parameterId });
        {
          if (mode === "cylinder") {
            const height = Math.max(1, radius * 1.5);
            const heightId = addParameter(`height_${object.id}`.slice(0, 63), "Chiều cao h", height);
            objects.push({
              id: `solid_${object.id}`,
              type: "cylinder",
              visible: true,
              label: `Hình trụ từ ${label(object)}`,
              color: color(object),
              position: [center[0], 0, center[1]],
              rotation: [0, 0, 0],
              radius,
              height,
              parameterBindings: { ...(parameterId ? { radius: parameterId } : {}), ...(heightId ? { height: heightId } : {}) },
            });
          } else objects.push({
            id: `solid_${object.id}`,
            type: "sphere",
            visible: true,
            label: `Mặt cầu từ ${label(object)}`,
            color: color(object),
            position: [center[0], 0, center[1]],
            rotation: [0, 0, 0],
            radius,
            parameterBindings: parameterId ? { radius: parameterId } : {},
          });
        }
      }
      const samples = 96;
      objects.push({
        id: `curve_${object.id}`,
        type: "curve3d",
        visible: true,
        label: label(object),
        color: color(object),
        closed: true,
        lineStyle: object.lineStyle,
        thickness: 0.025,
        points3d: Array.from({ length: samples }, (_, index) => {
          const angle = index * Math.PI * 2 / samples;
          return [center[0] + radius * Math.cos(angle), 0, center[1] + radius * Math.sin(angle)] as [number, number, number];
        }),
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });
      continue;
    }
    if (object.type === "polygon") {
      const vertices = object.parents.map(at);
      if (vertices.length < 3 || vertices.some((point) => !point)) continue;
      const points = vertices as Array<[number, number]>;
      if (mode !== "planar") {
        const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
        const depth = Math.max(0.4, Math.min(2.5, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.22));
        const parameterId = addParameter(`depth_${object.id}`.slice(0, 63), "Độ sâu khối", depth);
        if (parameterId) {
          objects.push({
            id: `solid_${object.id}`,
            type: "extrudedPolygon",
            visible: true,
            label: `Khối đùn từ ${label(object)}`,
            color: color(object),
            vertices2d: points,
            depth,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            parameterBindings: { depth: parameterId },
          });
        }
      }
      objects.push({
        id: `curve_${object.id}`,
        type: "curve3d",
        label: label(object),
        color: color(object),
        closed: true,
        lineStyle: object.lineStyle,
        visible: object.strokeOpacity !== 0,
        points3d: points.map(point3),
        thickness: 0.025,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });
    }
    if (object.type === "angle") {
      const first = at(object.parents[0]), vertex = at(object.parents[1]), last = at(object.parents[2]);
      if (!first || !vertex || !last) continue;
      const start = Math.atan2(first[1] - vertex[1], first[0] - vertex[0]);
      const end = Math.atan2(last[1] - vertex[1], last[0] - vertex[0]);
      const sweep = Math.atan2(Math.sin(end - start), Math.cos(end - start));
      const radius = Math.min(0.6, Math.hypot(first[0] - vertex[0], first[1] - vertex[1]) * 0.35,
        Math.hypot(last[0] - vertex[0], last[1] - vertex[1]) * 0.35);
      if (radius > 0.001) objects.push({
        id: `curve_${object.id}`, type: "curve3d", visible: true, label: label(object), color: color(object),
        points3d: Array.from({ length: 25 }, (_, index) => point3([
          vertex[0] + radius * Math.cos(start + sweep * index / 24),
          vertex[1] + radius * Math.sin(start + sweep * index / 24),
        ])), position: [0, 0, 0], rotation: [0, 0, 0],
      });
    }
  }

  const segments = source.objects.filter((object) => object.visible && ["segment", "arrow", "line", "parallel", "perpendicular"].includes(object.type));
  const segmentObjects = segments.flatMap((object) => {
    let first = at(object.parents[0]), second = at(object.parents[1]);
    if (object.type === "parallel" || object.type === "perpendicular") {
      const basis = endpoints(object.parents[0]), through = at(object.parents[1]);
      if (!basis || !through) return [];
      const dx = basis[1][0] - basis[0][0], dy = basis[1][1] - basis[0][1];
      first = through;
      second = object.type === "parallel" ? [through[0] + dx, through[1] + dy] : [through[0] - dy, through[1] + dx];
    }
    if (!first || !second) return [];
    let start = first, end = second;
    if (["line", "parallel", "perpendicular"].includes(object.type)) {
      const dx = second[0] - first[0], dy = second[1] - first[1];
      const length = Math.max(source.viewport.x[1] - source.viewport.x[0], source.viewport.y[1] - source.viewport.y[0]);
      const norm = Math.hypot(dx, dy) || 1;
      start = object.ray ? first : [first[0] - dx / norm * length, first[1] - dy / norm * length];
      end = [first[0] + dx / norm * length, first[1] + dy / norm * length];
    }
    return [{
      id: `edge_${object.id}`,
      type: "curve3d" as const,
      visible: true,
      label: label(object),
      color: color(object),
      lineStyle: object.lineStyle,
      points3d: [point3(start), point3(end)],
      thickness: 0.025,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    }];
  });
  if (objects.length + segmentObjects.length <= 120) objects.push(...segmentObjects);
  else if (segmentObjects.length) {
    const endpoints = segmentObjects.flatMap((object) => object.points3d || []);
    objects.push({
      id: "edges_group",
      type: "curve3d",
      visible: true,
      label: "Các cạnh và đoạn thẳng",
      color: "#168265",
      points3d: endpoints,
      segments: true,
      thickness: 0.025,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    });
  }

  for (const object of source.objects) {
    if (!["point", "glider", "intersection", "midpoint", "projection"].includes(object.type) || !object.visible) continue;
    const point = at(object.id);
    if (!point || objects.length >= 120) continue;
    objects.push({
      id: `point_${object.id}`,
      type: "sphere",
      visible: true,
      marker: true,
      label: label(object),
      note: object.note,
      color: color(object),
      radius: 0.075,
      position: point3(point),
      rotation: [0, 0, 0],
    });
    if (object.label && objects.length < 120) objects.push({
      id: `label_${object.id}`, type: "label3d", visible: true, annotationKind: "vertex", text: object.label,
      label: object.label, color: color(object), position: [point[0] + 0.15, 0.1, point[1] + 0.15], rotation: [0, 0, 0],
    });
  }

  for (const object of source.objects) {
    if (!object.visible || objects.length >= 120) continue;
    if (object.type === "verticalMarker" || object.type === "horizontalMarker") {
      const ordinate = valueOf(object.type === "verticalMarker" ? object.x : object.y);
      if (!Number.isFinite(ordinate)) continue;
      const first: [number, number] = object.type === "verticalMarker" ? [ordinate, source.viewport.y[0]] : [source.viewport.x[0], ordinate];
      const second: [number, number] = object.type === "verticalMarker" ? [ordinate, source.viewport.y[1]] : [source.viewport.x[1], ordinate];
      objects.push({ id: `edge_${object.id}`, type: "curve3d", visible: true, label: label(object), color: color(object), points3d: [point3(first), point3(second)], position: [0, 0, 0], rotation: [0, 0, 0] });
    } else if (object.type === "text" && object.x !== undefined && object.y !== undefined) {
      const position: [number, number] = [valueOf(object.x), valueOf(object.y)];
      if (position.every(Number.isFinite)) objects.push({ id: `label_${object.id}`, type: "label3d", visible: true, annotationKind: "helper", text: object.text || label(object), label: label(object), color: color(object), position: point3(position), rotation: [0, 0, 0] });
    }
  }

  if (!objects.length) throw Error("Chưa có đối tượng hình học có thể hiển thị ở chế độ 3D.");
  if (objects.length > 120) throw Error("Hình có quá nhiều thành phần để dựng 3D cùng lúc. Hãy ẩn bớt đối tượng rồi thử lại.");
  const represented = new Set(objects.map((object) => object.id.replace(/^(?:solid|curve|edge|point|label)_/, "")));
  if (objects.some((object) => object.id === "edges_group"))
    segmentObjects.forEach((object) => represented.add(object.id.replace(/^edge_/, "")));
  for (const point of source.spatialPoints || []) objects.push({id:point.id,type:"sphere",marker:true,annotationKind:"vertex",position:point.position,rotation:[0,0,0],radius:.075,color:point.color,label:"Điểm tự do",visible:true});
  const availableIds = new Set(objects.map((o) => o.id));
  const pending=[...(source.spatialConnections || [])];
  for (let pass=0;pass<(source.spatialConnections?.length || 0);pass++) for (const connection of [...pending]) {
    if (!connection.endpoints.every((a) => availableIds.has(a.objectId))) continue;
    objects.push({ id: connection.id, type: "curve3d", label: connection.label, note: connection.note, measurement: connection.measurement,
      showAnnotationLabel: connection.showAnnotationLabel ?? Boolean(connection.measurement), color: connection.color,
      lineStyle: connection.lineStyle, strokeWidth: connection.strokeWidth, vertexEndpoints: connection.endpoints, annotationKind: "helper",
      visible: true, position: [0,0,0], rotation: [0,0,0] });
    availableIds.add(connection.id);
    pending.splice(pending.indexOf(connection),1);
  }
  for (const object of objects) {
    const sourceObject = object.type === "curve3d" ? source.objects.find((o)=>o.id === object.id.replace(/^(?:curve|edge)_/, "")) : undefined;
    const annotationSource = sourceObject || (object.type === "label3d" ? source.objects.find(o=>o.id===object.id.replace(/^label_/,"")) : undefined);
    if (annotationSource?.annotationKind) object.annotationKind = annotationSource.annotationKind;
    if (sourceObject) {
      object.strokeWidth = sourceObject.strokeWidth;
      object.edgeStyles = sourceObject.edgeStyles;
      object.measurement = sourceObject.measurement;
      object.note = sourceObject.note;
      object.showAnnotationLabel = sourceObject.showAnnotationLabel ?? Boolean(sourceObject.measurement);
    }
    const savedStyle = source.spatialStyles?.find((s)=>s.objectId === object.id);
    if (savedStyle) {
      const { objectId, color, lineStyle, label, showAnnotationLabel, ...metadata } = savedStyle;
      Object.assign(object, metadata, {
        ...(color ? { color } : {}), ...(lineStyle ? { lineStyle } : {}),
        ...(showAnnotationLabel !== undefined ? { label, showAnnotationLabel } : {}),
      });
    }
  }
  if (objects.length > 120) throw Error("Mô hình vượt giới hạn 120 đối tượng khi giữ đường nối không gian.");
  const missing = source.objects.filter((object) => object.visible && !represented.has(object.id));
  if (missing.length) throw Error(`Chưa chuyển được sang 3D: ${missing.map((object) => object.label || object.id).join(", ")}. Hãy kiểm tra điểm/quan hệ phụ thuộc hoặc ẩn đối tượng này trước khi chuyển.`);
  const parsed = VisualSpecSchema.parse({
    id: source.id,
    version: 1,
    dimension: "3d",
    engine: "threejs",
    source: { key: "sketch-3d", version: 1 },
    kind: "derived-sketch",
    surfaceFill: source.surfaceFill,
    boardItems: source.boardItems,
    parameters:[...parameters,...(source.savedSpatialParameters||[]).filter(p=>!parameters.some(q=>q.id===p.id))],
    objects:[...objects,...(source.savedSpatialObjects||[]).filter(o=>!objects.some(p=>p.id===o.id))],
    camera: { position: [6, 6, 8], target: [0, 0, 0] },
    accessibility: { description: "Mô hình 3D được dựng từ nét vẽ toán học trên mặt phẳng." },
    derivedFrom2d: { source, mode, positions: livePositions, radiusLinks },
  });
  return parsed as ThreeVisualSpec;
}

/** Give native solids a separate planar board while keeping the full spatial scene. */
export function restoreExploreBoard2d(input: ThreeVisualSpec): TwoDVisualSpec {
  if (input.derivedFrom2d) return restoreSketch2d(input);
  const { planarBoard, derivedFrom2d, boardItems, ...savedNative3d } = input;
  return TwoDVisualSpecSchema.parse({
    ...(planarBoard ?? {
      id: input.id,
      version: 1,
      dimension: "2d",
      source: input.source,
      kind: "geometry",
      viewport: { x: [-10, 10], y: [-7, 7] },
      parameters: [],
      objects: [{ id: "planar_origin", type: "point", x: 0, y: 0, visible: false }],
    }),
    boardItems,
    savedNative3d,
  });
}

/** Restore the construction, not a camera projection; never weaken its parent rules. */
export function restoreSketch2d(input: ThreeVisualSpec): TwoDVisualSpec {
  const derived = input.derivedFrom2d;
  if (!derived) throw Error("Mô hình 3D này không có bản vẽ 2D gốc.");
  const restored=restoreConstruction(derived,input.parameters,input.surfaceFill),additions=input.objects.filter(o=>o.userCreated || o.spatialConstruction || o.net);
  const referencedParameters=new Set(additions.flatMap(o=>[...Object.values(o.parameterBindings||{}),...(o.net?[o.net.parameter]:[])]));
  const parameters=input.parameters.filter(p=>referencedParameters.has(p.id)&&!derived.source.parameters.some(q=>q.id===p.id));
  if(input.boardItems!==undefined)restored.boardItems=input.boardItems;
  if(additions.length)restored.savedSpatialObjects=additions;else delete restored.savedSpatialObjects;
  if(parameters.length)restored.savedSpatialParameters=parameters;else delete restored.savedSpatialParameters;
  return restored;
}

/** Recover a 2D snapshot already saved after the old failed return transition. */
export function repairLegacySketch2d(input: TwoDVisualSpec): TwoDVisualSpec {
  if (!input.objects.some((o) => o.type === "circle" && o.parents.length === 2 && o.radius !== undefined))
    return validateVisual(input) as TwoDVisualSpec;
  return restoreConstruction({ source: input, mode: "planar" }, input.parameters, input.surfaceFill);
}

function restoreConstruction(
  derived: NonNullable<ThreeVisualSpec["derivedFrom2d"]>,
  parameters: ThreeVisualSpec["parameters"],
  surfaceFill: boolean,
): TwoDVisualSpec {
  const source = structuredClone(derived.source);
  const current = new Map(parameters.map((p) => [p.id, p.value]));
  const links = [...(derived.radiusLinks || [])];
  // Repair sessions produced by the old converter: it added radius to a two-parent circle.
  for (const circle of source.objects) {
    if (circle.type !== "circle" || circle.parents.length !== 2 || circle.radius === undefined) continue;
    const legacyId = `radius_${circle.id}`.slice(0, 63);
    if (circle.radius !== legacyId) throw Error(`Cấu trúc đường tròn không hợp lệ: ${circle.label || circle.id}`);
    if (!links.some((link) => link.circleId === circle.id)) links.push({ circleId: circle.id, parameterId: legacyId });
    delete circle.radius;
    const usedElsewhere = source.objects.some((o) => [o.x, o.y, o.radius, o.expression].some((value) =>
      typeof value === "string" && value.match(/[a-zA-Z_]\w*/g)?.includes(legacyId)));
    if (!usedElsewhere) source.parameters = source.parameters.filter((p) => p.id !== legacyId);
  }
  source.parameters.forEach((p) => { if (current.has(p.id)) p.value = current.get(p.id)!; });
  const values = Object.fromEntries(source.parameters.map((p) => [p.id, p.value]));
  const scalar = (value: number | string | undefined) => typeof value === "number" ? value
    : typeof value === "string" ? compileExpression(value, Object.keys(values))(values) : NaN;
  const byId = new Map(source.objects.map((o) => [o.id, o]));
  // Persist free-point positions; fixed/dependent point definitions must stay intact.
  for (const point of source.objects) {
    const position = derived.positions?.[point.id];
    if (position && point.type === "point" && point.free) [point.x, point.y] = position;
  }
  const at = (id: string): [number, number] | undefined => {
    const o = byId.get(id);
    if (!o) return undefined;
    if (o.type === "point" && o.construction) {
      const parents = o.parents.map(at);
      const p = parents.every(Boolean) ? constructionPoint(o.construction, parents.map(p => ({ x: p![0], y: p![1] })),o.constructionFactor===undefined?1:scalar(o.constructionFactor)) : null;
      return p ? [p.x, p.y] : undefined;
    }
    if (o.type === "point" && o.offset) {
      const center=at(o.parents[0]);
      return center ? [center[0]+scalar(o.x),center[1]+scalar(o.y)] : undefined;
    }
    if (o.type === "point" || o.type === "glider") return [scalar(o.x), scalar(o.y)];
    if (o.type === "midpoint") {
      const a = at(o.parents[0]), b = at(o.parents[1]);
      if (a && b) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    return derived.positions?.[id];
  };
  // Validate dependencies before traversing them or committing any restored model.
  validateVisual(source);
  for (const link of links) {
    const circle = byId.get(link.circleId), radius = current.get(link.parameterId);
    if (!circle || circle.type !== "circle" || radius === undefined) continue;
    if (!Number.isFinite(radius) || radius <= 0) throw Error("Bán kính phải lớn hơn 0 để trở lại 2D.");
    if (circle.parents.length === 1 && typeof circle.radius === "number") circle.radius = radius;
    else if (circle.parents.length === 2) {
      const center = at(circle.parents[0]), through = at(circle.parents[1]);
      const point = byId.get(circle.parents[1]);
      if (!center || !through) throw Error("Không xác định được tâm và điểm của đường tròn.");
      const dx = through[0] - center[0], dy = through[1] - center[1], previous = Math.hypot(dx, dy);
      if (Math.abs(previous - radius) < 1e-8) continue;
      if (!previous || point?.type !== "point" || !point.free)
        throw Error("Không thể đổi bán kính độc lập vì điểm trên đường tròn đang bị ràng buộc.");
      point.x = center[0] + dx * radius / previous;
      point.y = center[1] + dy * radius / previous;
    }
  }
  source.surfaceFill = surfaceFill;
  return validateVisual(source) as TwoDVisualSpec;
}

/** Rebuild from the latest shared geometry, retaining 3D-only controls and camera. */
export function rebuildSketch3d(input: ThreeVisualSpec, mode: Sketch3dMode = input.derivedFrom2d?.mode || "planar"): ThreeVisualSpec {
  const source = restoreSketch2d(input);
  const positions = Object.fromEntries(Object.entries(input.derivedFrom2d?.positions || {})
    .filter(([id]) => !source.objects.some((o) => o.id === id && (o.type === "point" && o.free || o.angleParameter))));
  const next = convertSketchTo3d(source, mode, positions);
  // Radius is already synchronized to source; height/depth remain 3D-only.
  for (const p of next.parameters) {
    const previous = input.parameters.find((candidate) => candidate.id === p.id);
    if (previous && !next.derivedFrom2d?.radiusLinks?.some((link) => link.parameterId === p.id))
      p.value = Math.min(p.max, Math.max(p.min, previous.value));
  }
  next.camera = structuredClone(input.camera);
  const ids = new Set(next.objects.map((o) => o.id));
  const connections = input.objects.filter((o) => o.vertexEndpoints && !ids.has(o.id) && o.vertexEndpoints.every((a) => ids.has(a.objectId)));
  if (next.objects.length + connections.length > 120) throw Error("Mô hình vượt giới hạn 120 đối tượng khi giữ đường nối.");
  next.objects.push(...connections);
  next.objects.push(...input.objects.filter(o=>(o.spatialConstruction || o.userCreated) && !next.objects.some(p=>p.id===o.id)));
  next.boardItems=input.boardItems;
  return validateVisual(next) as ThreeVisualSpec;
}
