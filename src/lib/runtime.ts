import type { VisualCorePort,CoordinatePort,SelectionPort,StatePort } from "./visual-ports";
import { compileExpression } from "./expression";
import { notebookGridOptions } from "./notebook-grid";
import { compileGraphExpression, compileRegionExpression, implicitSegments,tangentSlope } from "./function-analysis";
import { constructionPoint } from "./geometry-construction-point";
import { relationMarkGeometry, relationMarkSourcesVisible } from "./geometry-relation-mark";
import { validateActions } from "./validation";
import { repairLegacySketch2d } from "./sketch-3d";
import { resizeRectangle } from "./rectangle-constraint";
import type { TwoDVisualSpec, VisualAction, VisualStateSummary } from "./contracts";
import type { CircularEdgeKey } from "./circular-edge";
import { spatialProjection, translateProjectedPosition } from "./three/planar-projection";
import { annotationCaption, edgeAnnotation, selectedAnnotation } from "./object-annotations";
import { projectedObjects } from "./projected-objects";
import { groupTranslationRoots } from "./explore-geometry-edit";
// The third-party board API is isolated here; external JSON never reaches board.create directly.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type VisualSelection = {
  id: string;
  label: string;
  type: string;
  parents: string[];
  editable: boolean;
  kind?: string;
  details?: string[];
  edgeIndex?: number;
  edgePart?: number;
  edgeKey?: CircularEdgeKey;
  vertexIndex?: number;
  faceIndex?: number;
};
export type VertexHit = {
  objectId: string;
  vertexIndex?: number;
  edgeIndex?: number;
  edgeRatio?: number;
  edgeKey?: CircularEdgeKey;
  edge?: { objectId?: string; parents?: [string, string]; ratio: number };
  free?: boolean;
  label: string;
  position: [number, number, number];
};
export type LineHit = { sourceId: string; objectId?: string; pointIds?: [string, string]; edgeIndex?: number; label: string; coordinates: [[number, number], [number, number]] };
export function createRuntime(
  JXG: any,
  container: string,
  input: TwoDVisualSpec,
  onChange?: (s: VisualStateSummary) => void,
  onSelect?: (selection: VisualSelection) => void,
  options: {
    fitContent?: boolean;
    keepAspectRatio?: boolean;
    dragWholeShapes?: boolean;
    onProjectedMove?: (next: TwoDVisualSpec, selection: VisualSelection) => void;
  } = {},
) {
  const keepAspectRatio = options.keepAspectRatio ?? true;
  const spec = repairLegacySketch2d(input),
    values = Object.fromEntries(spec.parameters.map((p) => [p.id, p.value]));
  const projection = spatialProjection(spec);
  const spatialObjects = new Map(projectedObjects(spec).map((object) => [object.id, object]));
  const projectedNodes = new Map<string, any[]>();
  const offsets = new Map<string, [number, number]>();
  const offset = (id: string, axis: 0 | 1) => offsets.get(id)?.[axis] ?? 0;
  const projectionFaces: any[] = [], projectionLabels: any[] = [];
  const initialCamera = spec.camera2d || spec.viewport;
  let board:any;
  const gridOptions=notebookGridOptions(()=>board);
  board = JXG.JSXGraph.initBoard(container, {
    boundingbox: [
      initialCamera.x[0],
      initialCamera.y[1],
      initialCamera.x[1],
      initialCamera.y[0],
    ],
    // A coordinate frame makes every 2D construction easier to read, even
    // when the lesson is primarily geometric.
    axis: true,
    grid: gridOptions,
    showCopyright: false,
    showNavigation: false,
    keepaspectratio: keepAspectRatio,
    resize: { enabled: true },
    pan: { enabled: true, needShift: false, needTwoFingers: false },
    zoom: { wheel: true, needShift: false },
    keyboard: { enabled: true },
    renderer: "svg",
  });
  // JSXGraph's default axis ticks span the whole board, which visually
  // behaves like a grid even when the learner turns the grid off.
  board.defaultAxes?.x?.setAttribute({ ticks: { majorHeight: 7, minorHeight: 3 } });
  board.defaultAxes?.y?.setAttribute({ ticks: { majorHeight: 7, minorHeight: 3 } });
  const registry: Record<string, any> = {};
  const rectangleFrames=new Map<string, [number,number][]>();
  function constrainPoint(id:string) {
    for(const polygon of spec.objects.filter(o=>o.type==="polygon" && o.constraint && o.parents.includes(id))) {
      const index=polygon.parents.indexOf(id),previous=rectangleFrames.get(polygon.id);
      if(!previous)continue;
      const moved=registry[id];
      const points=resizeRectangle(previous,index,[moved.X(),moved.Y()],polygon.constraint==="square");
      points.forEach((p,i)=>registry[polygon.parents[i]].moveTo(p));
      rectangleFrames.set(polygon.id,points);board.update();
    }
  }
  let surfaceFillVisible = spec.surfaceFill;
  let snapToGrid = false;
  const selectionStage = typeof document === "undefined"
    ? undefined
    : document.getElementById(container)?.closest<HTMLElement>(".math-board-stage");
  const selectionFrame = selectionStage ? document.createElement("div") : null;
  if (selectionFrame) {
    selectionFrame.className = "whole-shape-selection-frame";
    selectionFrame.setAttribute("aria-hidden", "true");
    selectionFrame.hidden = true;
    selectionStage?.append(selectionFrame);
  }
  let selectedShapeId: string | undefined;
  let tintedShape: Element | undefined;
  function updateSelectionFrame() {
    if (!selectionFrame || !selectionStage) return;
    const projected = selectedShapeId ? projectedNodes.get(selectedShapeId) : undefined;
    const element = selectedShapeId ? registry[selectedShapeId] ?? projected?.[0] : undefined;
    const node: Element | undefined = element?.visProp?.visible === false ? undefined : element?.rendNode;
    if (tintedShape && (tintedShape !== node || !surfaceFillVisible)) {
      tintedShape.removeAttribute("data-whole-shape-selected");
      tintedShape = undefined;
    }
    if (!node) {
      selectionFrame.hidden = true;
      return;
    }
    const boxes = (projected ?? [element]).flatMap((item) =>
      item.rendNode ? [item.rendNode.getBoundingClientRect() as DOMRect] : [],
    );
    const bounds = {
      left: Math.min(...boxes.map((box) => box.left)),
      top: Math.min(...boxes.map((box) => box.top)),
      right: Math.max(...boxes.map((box) => box.right)),
      bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
    const stage = selectionStage.getBoundingClientRect();
    const left = Math.max(0, bounds.left - stage.left);
    const top = Math.max(0, bounds.top - stage.top);
    const right = Math.min(stage.width, bounds.right - stage.left);
    const bottom = Math.min(stage.height, bounds.bottom - stage.top);
    selectionFrame.hidden = right <= left || bottom <= top;
    if (selectionFrame.hidden) return;
    Object.assign(selectionFrame.style, {
      left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
    });
    if (surfaceFillVisible && tintedShape !== node && (!projected || projectionFaces.includes(element))) {
      node.setAttribute("data-whole-shape-selected", "");
      tintedShape = node;
    }
  }
  function setSelection(selection: VisualSelection | null) {
    selectedShapeId = selection && selection.edgeIndex === undefined &&
      selection.vertexIndex === undefined &&
      (selection.type === "circle" || selection.type === "polygon" || spatialObjects.has(selection.id))
      ? selection.id : undefined;
    updateSelectionFrame();
  }
  const selectionFor = (o: TwoDVisualSpec["objects"][number]): VisualSelection => ({
    id: o.id,
    label: o.label || o.id,
    type: o.type,
    parents: o.parents,
    editable: o.type === "point" && o.free,
  });
  const polygonEdgeSelection = (object: TwoDVisualSpec["objects"][number], edgeIndex: number): VisualSelection => ({
    ...selectionFor(object), edgeIndex,
    label: edgeAnnotation(object, { edgeIndex })?.label || `${object.label || "Đa giác"} · cạnh ${edgeIndex + 1}`,
    kind: "Cạnh của đa giác",
  });
  let currentViewport: [number, number, number, number] = [
    initialCamera.x[0], initialCamera.y[1], initialCamera.x[1], initialCamera.y[0],
  ];
  let frame = 0,
    destroyed = false,
    labelsVisible = true;
  const annotationVisibility: Record<string, boolean> = { vertex: true, length: true, angle: true };
  const scalar = (v: number | string | undefined) => {
    if (typeof v === "number") return () => v;
    if (typeof v === "string") {
      const f = compileExpression(
        v,
        spec.parameters.map((p) => p.id),
      );
      return () => f(values);
    }
    return () => 0;
  };
  function pointCoordinates(id: string): [number, number] | null {
    const point = registry[id];
    if (!point || typeof point.X !== "function" || typeof point.Y !== "function") return null;
    const x = Number(point.X()), y = Number(point.Y());
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }
  function contentBounds(): [number, number, number, number] | null {
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      left = Math.min(left, x); right = Math.max(right, x);
      bottom = Math.min(bottom, y); top = Math.max(top, y);
    };
    for (const path of projection.paths) for (const [x, y] of path.points) include(x, y);
    for (const { point } of [...projection.markers, ...projection.labels]) include(...point);
    for (const object of spec.objects) {
      if (["point", "glider", "intersection", "midpoint", "projection"].includes(object.type)) {
        const position = pointCoordinates(object.id);
        if (position) include(position[0], position[1]);
      }
      if (object.type === "circle") {
        const center = pointCoordinates(object.parents[0]);
        if (!center) continue;
        let radius = 0;
        if (object.radius !== undefined) radius = Math.abs(scalar(object.radius)());
        else {
          const radiusPoint = pointCoordinates(object.parents[1]);
          if (radiusPoint) radius = Math.hypot(radiusPoint[0] - center[0], radiusPoint[1] - center[1]);
        }
        if (Number.isFinite(radius)) {
          include(center[0] - radius, center[1] - radius);
          include(center[0] + radius, center[1] + radius);
        }
      }
      if (object.type === "functionGraph" && object.expression) {
        const evaluate = compileGraphExpression(object.expression, spec.parameters.map((parameter) => parameter.id));
        const [xMin, xMax] = object.domain || spec.viewport.x;
        for (let index = 0; index <= 160; index++) {
          const x = xMin + (xMax - xMin) * index / 160;
          const y = evaluate({ ...values, x });
          // Infinite graphs have no finite bounding box. Fit only the useful
          // original vertical window, never the camera widened by aspect/zoom.
          if (Number.isFinite(y) && y >= spec.viewport.y[0] && y <= spec.viewport.y[1]) include(x, y);
        }
      }
    }
    if (![left, right, bottom, top].every(Number.isFinite)) return null;
    const spanX = Math.max(right - left, 1);
    const spanY = Math.max(top - bottom, 1);
    const padX = Math.max(spanX * 0.14, 0.4);
    const padY = Math.max(spanY * 0.14, 0.4);
    return [left - padX, top + padY, right + padX, bottom - padY];
  }
  function preserveBoardAspect(box: [number, number, number, number]): [number, number, number, number] {
    if (!keepAspectRatio) return box;
    let [left, top, right, bottom] = box;
    const width = right - left, height = top - bottom;
    const canvasWidth = Number(board.canvasWidth || board.containerObj?.clientWidth);
    const canvasHeight = Number(board.canvasHeight || board.containerObj?.clientHeight);
    const fallbackAspect = (spec.viewport.x[1] - spec.viewport.x[0]) /
      (spec.viewport.y[1] - spec.viewport.y[0]);
    const aspect = canvasWidth > 0 && canvasHeight > 0 ? canvasWidth / canvasHeight : fallbackAspect;
    if (!Number.isFinite(aspect) || aspect <= 0) return box;
    if (width / height < aspect) {
      const expandedWidth = height * aspect;
      const center = (left + right) / 2;
      left = center - expandedWidth / 2;
      right = center + expandedWidth / 2;
    } else {
      const expandedHeight = width / aspect;
      const center = (top + bottom) / 2;
      top = center + expandedHeight / 2;
      bottom = center - expandedHeight / 2;
    }
    return [left, top, right, bottom];
  }
  function expandViewportToContent() {
    if (options.fitContent === false) return;
    const content = contentBounds();
    if (!content) return;
    const current = typeof board.getBoundingBox === "function"
      ? board.getBoundingBox() as [number, number, number, number]
      : currentViewport;
    if (!Array.isArray(current) || current.length !== 4 || !current.every(Number.isFinite)) return;
    const epsilon = Math.max(current[2] - current[0], current[1] - current[3]) * 0.002;
    const alreadyFits = content[0] >= current[0] + epsilon &&
      content[1] <= current[1] - epsilon &&
      content[2] <= current[2] - epsilon &&
      content[3] >= current[3] + epsilon;
    if (alreadyFits) return;
    const expanded = preserveBoardAspect([
      Math.min(current[0], content[0]),
      Math.max(current[1], content[1]),
      Math.max(current[2], content[2]),
      Math.min(current[3], content[3]),
    ]);
    currentViewport = expanded;
    board.setBoundingBox(expanded, keepAspectRatio, "update");
    board.update();
  }
  function state(): VisualStateSummary {
    const objects: VisualStateSummary["objects"] = {};
    for (const o of spec.objects) {
      const r = registry[o.id];
      objects[o.id] = { visible: r.visProp?.visible !== false };
      if (["point", "glider", "intersection", "midpoint", "projection"].includes(o.type)) {
        if (Number.isFinite(r.X()) && Number.isFinite(r.Y())) { objects[o.id].x = r.X(); objects[o.id].y = r.Y(); }
      }
    }
    return { visualId: spec.id, parameters: { ...values }, objects };
  }
  function emit() {
    if (!destroyed) {
      expandViewportToContent();
      onChange?.(state());
    }
  }
  function add(id: string) {
    if (registry[id]) return registry[id];
    const o = spec.objects.find((o) => o.id === id)!;
    const parents = o.parents.map(add);
    const defaultColor =
      o.color ||
      (o.type === "functionGraph"
        ? "#07885f"
        : o.id === "vertex"
          ? "#d57a43"
          : o.id === "rootL" || o.id === "rootR"
            ? "#315fbd"
            : o.type === "verticalMarker" || o.type === "horizontalMarker"
              ? "#9070c6"
              : "#244f3c");
    const attrs = {
      name: !spec.projectionOf3d && o.type==="segment" && (/^[A-Z]{2}$/.test(o.label||"") || /^Bán kính(?: r)?$/.test(o.label||"")) && !o.measurement ? ()=>`${o.label} = ${Number(Math.hypot(parents[0].X()-parents[1].X(),parents[0].Y()-parents[1].Y()).toFixed(2))}` : o.measurement ? `${o.label ? `${o.label} = ` : ""}${o.measurement}` : o.label || "",
      strokeColor: defaultColor,
      fillColor: defaultColor,
      fillOpacity: o.type === "polygon" || o.type === "circle" || o.type === "angle"
        ? surfaceFillVisible ? o.type === "polygon" ? 0.1 : 0.08 : 0
        : ["point", "glider", "intersection", "midpoint", "projection"].includes(o.type) ? 1 : 0,
      strokeWidth: o.strokeWidth ?? (o.type === "functionGraph" ? 3.25 : 2.25),
      ...(o.lineStyle === "dashed" ? { dash: 2 } : {}),
      ...(o.strokeOpacity !== undefined ? { strokeOpacity: o.strokeOpacity } : {}),
      size: o.type === "point" || o.type === "glider" || o.type === "intersection" ? 3.8 : 3,
      ...(o.pointStyle?{face:({dot:"o",circle:"o",cross:"x",square:"[]",diamond:"<>"} as Record<string,string>)[o.pointStyle],...(o.pointStyle==="circle"?{fillColor:"white"}:{})}:{}),
      fixed: !o.free,
      ...(o.ray ? { straightFirst: false, straightLast: true } : {}),
      visible: o.visible,
      highlight: true,
      highlightStrokeColor: "#e28743",
      highlightFillColor: "#e28743",
      withLabel: !!(o.label || o.measurement) && !["vertex", "rootL", "rootR"].includes(o.id),
      label: {fontSize:14,parse:false,offset:o.labelOffset || (o.type==="polygon" ? [0,-24] : o.type==="segment" ? [8,14] : [10,10])},
      tabIndex: 0,
      aria: {
        enabled: true,
        label: [o.label || o.id, o.measurement, o.note || o.ariaLabel].filter(Boolean).join(". "),
      },
    };
    let result: any;
    switch (o.type) {
      case "relationMark": {
        result = board.create("curve", [[], []], { ...attrs, fillOpacity: 0, withLabel: false, fixed: true });
        result.updateDataArray = function () {
          const points = o.parents.map(id => registry[id]).filter(p => typeof p?.X === "function").map(p => ({ x: p.X(), y: p.Y() }));
          const mark = relationMarkGeometry(o.markKind!, points, 7 / Math.max(1, board.unitX || 40), o.markCount || 1);
          if (!relationMarkSourcesVisible(spec, o)) mark.strokes = [];
          this.rendNode?.setAttribute?.("data-relation-mark", o.id);
          this.rendNode?.setAttribute?.("data-relation-valid", String(mark.valid));
          this.dataX = mark.strokes.flatMap(s => [...s.map(p => p.x), NaN]);
          this.dataY = mark.strokes.flatMap(s => [...s.map(p => p.y), NaN]);
        };
        break;
      }
      case "point":
        result = board.create(
          "point",
          o.construction ? [() => constructionPoint(o.construction!, parents.map((p: any) => ({ x: p.X(), y: p.Y() })), o.constructionFactor === undefined ? 1 : scalar(o.constructionFactor)())?.x ?? NaN, () => constructionPoint(o.construction!, parents.map((p: any) => ({ x: p.X(), y: p.Y() })), o.constructionFactor === undefined ? 1 : scalar(o.constructionFactor)())?.y ?? NaN]
            : o.offset ? [() => parents[0].X()+scalar(o.x)(), () => parents[0].Y()+scalar(o.y)()]
            : o.free ? [o.x, o.y] : [scalar(o.x), scalar(o.y)],
          attrs,
        );
        break;
      case "line":
      case "segment":
      case "arrow":
        result = board.create(o.type, parents, attrs);
        break;
      case "polygon":
        result = board.create("polygon", parents, { ...attrs, hasInnerPoints: true });
        break;
      case "angle": {
        const degrees = () => {
          const ax=parents[0].X()-parents[1].X(), ay=parents[0].Y()-parents[1].Y(), bx=parents[2].X()-parents[1].X(), by=parents[2].Y()-parents[1].Y();
          const norm=Math.hypot(ax,ay)*Math.hypot(bx,by);
          return norm>1e-12 ? Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/norm)))*180/Math.PI : NaN;
        };
        result=board.create("angle", parents, {...attrs,selection:"minor",type:"sector",orthoType:"square",orthoSensitivity:0.01,name:()=>Number.isFinite(degrees()) ? `${Number(degrees().toFixed(1))}°` : "Góc không xác định"});
        break;
      }
      case "circle":
        result = board.create(
          "circle",
          o.radius === undefined ? parents : [parents[0], scalar(o.radius)],
          { ...attrs, hasInnerPoints: true },
        );
        break;
      case "glider":
        if (o.edgeRatio !== undefined) {
          const target = spec.objects.find((object) => object.id === o.parents[0])!;
          const ratio = o.edgeRatio;
          const coordinate = (axis: "X" | "Y") => {
            const a = registry[target.parents[0]], b = registry[target.parents[1]];
            if (target.type === "circle") {
              const radius = target.radius !== undefined ? Math.abs(scalar(target.radius)()) : Math.hypot(b.X()-a.X(), b.Y()-a.Y());
              return a[axis]() + radius*(axis === "X" ? Math.cos(ratio*2*Math.PI) : Math.sin(ratio*2*Math.PI));
            }
            return a[axis]()*(1-ratio) + b[axis]()*ratio;
          };
          result = board.create("point", [() => coordinate("X"), () => coordinate("Y")], attrs);
        } else result = board.create(
          "glider",
          [scalar(o.x)(), scalar(o.y)(), parents[0]],
          attrs,
        );
        if(o.angleParameter){const circle=parents[0],angle=values[o.angleParameter];result.moveTo([circle.center.X()+circle.Radius()*Math.cos(angle),circle.center.Y()+circle.Radius()*Math.sin(angle)]);}
        break;
      case "intersection":
        result = board.create("intersection", [...parents, o.intersectionIndex || 0], { ...attrs, alwaysIntersect: true });
        break;
      case "midpoint":
        result = board.create("midpoint", parents, attrs);
        break;
      case "projection":
        result = board.create("perpendicularpoint", parents, attrs);
        break;
      case "perpendicular":
        result = board.create("perpendicular", parents, attrs);
        break;
      case "parallel":
        result = board.create("parallel", parents, attrs);
        break;
      case "parametric": {
        const allowed=["t",...spec.parameters.map(p=>p.id)],fx=compileExpression(o.expression!,allowed),fy=compileExpression(o.expressionY!,allowed);
        result=board.create("curve",[(t:number)=>fx({...values,t}),(t:number)=>fy({...values,t}),...(o.domain||[0,2*Math.PI])],attrs);break;
      }
      case "implicit":
      case "inequality":
      case "sequence": {
        result=board.create("curve",[[],[]],{...attrs,...(o.type==="inequality"?{fillOpacity:.2,fillColor:o.color,strokeWidth:0}:{})});
        result.updateDataArray=function(){
          const xs:number[]=[],ys:number[]=[],push=(x:number,y:number)=>{xs.push(x);ys.push(y);};
          if(o.type==="sequence") {const f=compileExpression(o.expression!,["t",...spec.parameters.map(p=>p.id)]),[a,b]=o.domain||[1,20];for(let t=Math.ceil(a);t<=Math.min(b,a+200);t++){const y=f({...values,t});push(t,0);push(t,y);push(NaN,NaN);}}
          else if(o.type==="implicit") {for(const segment of implicitSegments(o.expression!,[...spec.viewport.x,...spec.viewport.y] as [number,number,number,number],values)) {segment.forEach(p=>push(...p));push(NaN,NaN);}}
          else {const f=compileRegionExpression(o.expression!,spec.parameters.map(p=>p.id)),[a,b]=spec.viewport.x,[c,d]=spec.viewport.y,n=48;for(let i=0;i<n;i++)for(let j=0;j<n;j++){const x=a+(b-a)*i/n,y=c+(d-c)*j/n,w=(b-a)/n,h=(d-c)/n;if(f({...values,x:x+w/2,y:y+h/2})<=0){[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].forEach(p=>push(p[0],p[1]));push(NaN,NaN);}}}
          this.dataX=xs;this.dataY=ys;
        };result.updateDataArray();break;
      }
      case "functionGraph": {
        let f = compileGraphExpression(
          o.expression!,
          spec.parameters.map((p) => p.id),
        );
        if(o.tangentOf){const source=spec.objects.find(p=>p.id===o.tangentOf!.sourceId),original=compileGraphExpression(source!.expression!,spec.parameters.map(p=>p.id)),at=o.tangentOf.at;f=variables=>{try{const evaluate=(x:number)=>original({...variables,x});return evaluate(at)+tangentSlope(evaluate,at)*(variables.x-at);}catch{return NaN;}};}
        result = board.create(
          "functiongraph",
          [
            (x: number) => {
              if (o.domain && (x < o.domain[0] || x > o.domain[1])) return NaN;
              const y = f({ ...values, x });
              return Number.isFinite(y) ? y : NaN;
            },
            ...(o.domain || []),
          ],
          attrs,
        );
        break;
      }
      case "verticalMarker":
        result = board.create("line", [() => -scalar(o.x)(), 1, 0], {
          ...attrs,
          dash: 2,
          strokeWidth: o.strokeWidth ?? 2.25,
        });
        break;
      case "horizontalMarker":
        result = board.create("line", [() => -scalar(o.y)(), 0, 1], {
          ...attrs,
          dash: 2,
        });
        break;
      case "text":
        result = board.create(
          "text",
          [scalar(o.x), scalar(o.y), () => o.text || o.label || ""],
          { ...attrs, display: "internal", parse: false },
        );
        break;
    }
    registry[id] = result;
    // Composite JSXGraph point factories may assign a generated name; preserve
    // source labels for dependent points instead of showing a default P/Q.
    if (["midpoint", "projection", "intersection"].includes(o.type))
      result.setAttribute({ name: o.label || "", withLabel: Boolean(o.label) });
    if (o.type === "polygon") {
      result.borders?.forEach((border: any, edgeIndex: number) => {
        const style = o.edgeStyles?.find((s) => s.edgeIndex === edgeIndex && s.edgePart === 0);
        border.setAttribute({visible:o.visible && !style?.hidden,strokeColor: style?.color || defaultColor, strokeWidth: style?.strokeWidth ?? o.strokeWidth ?? 2.25, ...(o.strokeOpacity !== undefined ? {strokeOpacity:o.strokeOpacity} : {}), dash: (style?.lineStyle || o.lineStyle) === "dashed" ? 2 : 0});
        if (style?.label || style?.measurement) {
          const a = parents[edgeIndex], b = parents[(edgeIndex + 1) % parents.length];
          const caption = () => annotationCaption({ label: style.label, measurement: annotationVisibility.length ? style.measurement : undefined });
          const label = board.create("text", [
            () => (a.X() + b.X()) / 2 + 8 / board.unitX,
            () => (a.Y() + b.Y()) / 2 + 10 / board.unitY,
            caption,
          ], {
            display: "internal", parse: false, fixed: true, highlight: false,
            visible: () => labelsVisible && !style.hidden && border.visProp.visible !== false && Boolean(caption()),
            strokeColor: style.color || defaultColor, fontSize: 12,
          });
          label.hasPoint = () => false;
        }
        border.on("down", (event: PointerEvent) => {
          if (style?.hidden || event?.button > 0) return;
          const picked = Number.isFinite(event?.clientX)
            ? pickObjectAt(event.clientX, event.clientY) : polygonEdgeSelection(o, edgeIndex);
          if (picked) onSelect?.(picked);
        });
      });
    }
    if (o.free) {
      result.on("drag", () => {if(o.angleParameter){const circle=parents[0];values[o.angleParameter]=Math.atan2(result.Y()-circle.center.Y(),result.X()-circle.center.X());board.update();}constrainPoint(id);emit();});
      result.on("up", () => {constrainPoint(id);emit();});
    }
    if (o.type !== "text") result.on("down", (event: PointerEvent) => {
      if (event?.button > 0) return;
      const picked = Number.isFinite(event?.clientX) ? pickObjectAt(event.clientX, event.clientY) : selectionFor(o);
      if (picked) onSelect?.(picked);
    });
    return result;
  }
  try {
    board.suspendUpdate();
    const projected = (objectId: string, type: string, args: unknown[], attributes: object) => {
      const element = board.create(type, args, {
        fixed: true, highlight: false, layer: 4, ...attributes,
      });
      element.hasPoint = () => false;
      element.rendNode?.setAttribute("data-spatial-projection", type);
      element.rendNode?.setAttribute("pointer-events", "none");
      if (type !== "text") {
        const nodes = projectedNodes.get(objectId) ?? [];
        nodes.push(element);
        projectedNodes.set(objectId, nodes);
      }
      return element;
    };
    for (const path of projection.paths) {
      const curve = projected(path.objectId, "curve", [path.points.map(p => p[0]), path.points.map(p => p[1])], {
        strokeColor: path.color, strokeWidth: path.width, dash: path.dashed ? 2 : 0,
        ...(path.filled ? { fillColor: path.color, fillOpacity: surfaceFillVisible ? 0.16 : 0 } : {}),
      });
      let previousOffset = offsets.get(path.objectId);
      curve.updateDataArray = () => {
        const currentOffset = offsets.get(path.objectId);
        if (currentOffset === previousOffset) return;
        previousOffset = currentOffset;
        curve.dataX = path.points.map((p) => p[0] + offset(path.objectId, 0));
        curve.dataY = path.points.map((p) => p[1] + offset(path.objectId, 1));
      };
      if (path.filled) projectionFaces.push(curve);
    }
    for (const { objectId, point, color } of projection.markers) {
      projected(objectId, "point", [() => point[0] + offset(objectId, 0), () => point[1] + offset(objectId, 1)], {
        name: "", withLabel: false, size: 2.5, fillColor: color, strokeColor: color,
      });
    }
    for (const { objectId, point, text, color } of projection.labels) {
      projectionLabels.push(projected(objectId, "text", [
        () => point[0] + offset(objectId, 0), () => point[1] + offset(objectId, 1), text,
      ], {
        display: "internal", parse: false, fontSize: 12, strokeColor: color,
      }));
    }
    spec.objects.forEach((o) => add(o.id));
    board.unsuspendUpdate();
    // A user zoom/pan changes the view, not the geometry. Auto-fitting here
    // would immediately undo zoom-in and prevent inspecting a detail.
    if (typeof board.on === "function") board.on("boundingbox", () => {
      if (!destroyed) onChange?.(state());
    });
  } catch (e) {
    JXG.JSXGraph.freeBoard(board);
    throw e;
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function setParameter(id: string, value: number) {
    const p = spec.parameters.find((p) => p.id === id);
    if (!p || !Number.isFinite(value)) return;
    values[id] = Math.min(p.max, Math.max(p.min, value));
    for(const object of spec.objects.filter(o=>o.angleParameter===id)){const circle=registry[object.parents[0]],angle=values[id];registry[object.id].moveTo([circle.center.X()+circle.Radius()*Math.cos(angle),circle.center.Y()+circle.Radius()*Math.sin(angle)]);}
    board.update();
    emit();
  }
  function setPoint(id: string, x: number, y: number) {
    const point = spec.objects.find((object) => object.id === id);
    if (!point || point.type !== "point" || !point.free || !Number.isFinite(x) || !Number.isFinite(y)) return;
    registry[id].moveTo([x, y]);
    constrainPoint(id);
    board.update();
    emit();
  }
  function reset() {
    stop();
    for (const p of spec.parameters) values[p.id] = p.value;
    for (const o of spec.objects) {
      registry[o.id].setAttribute({
        visible: o.visible,
        strokeColor: o.color,
        strokeWidth: o.strokeWidth ?? (o.type === "functionGraph" ? 3.25 : 2.25),
      });
      restorePolygonStroke(o);
      if (o.free) registry[o.id].moveTo([scalar(o.x)(), scalar(o.y)()]);
    }
    for(const polygon of spec.objects.filter(o=>o.type==="polygon" && o.constraint))rectangleFrames.set(polygon.id,polygon.parents.map(id=>[registry[id].X(),registry[id].Y()]));
    currentViewport = [spec.viewport.x[0], spec.viewport.y[1], spec.viewport.x[1], spec.viewport.y[0]];
    board.setBoundingBox(currentViewport, keepAspectRatio);
    board.update();
    emit();
  }
  function restorePolygonStroke(object: TwoDVisualSpec["objects"][number]) {
    if (object.type !== "polygon") return;
    registry[object.id].borders?.forEach((border:any,index:number)=>{
      const style=object.edgeStyles?.find((s)=>s.edgeIndex===index && s.edgePart===0);
      border.setAttribute({visible:object.visible && !style?.hidden,strokeColor:style?.color || object.color,strokeWidth:style?.strokeWidth ?? object.strokeWidth ?? 2.25,dash:(style?.lineStyle || object.lineStyle) === "dashed" ? 2 : 0,...(object.strokeOpacity!==undefined ? {strokeOpacity:object.strokeOpacity} : {})});
    });
  }
  function actions(list: VisualAction[]) {
    validateActions(list, spec);
    stop();
    for (const a of list) {
      if (a.type === "reset") {
        reset();
        continue;
      }
      if (a.type === "setParameter") {
        setParameter(a.parameter, a.value);
        continue;
      }
      if (a.type === "animateParameter") {
        let start = performance.now();
        const tick = (now: number) => {
          if (destroyed) return;
          const t = Math.min(1, (now - start) / a.durationMs);
          setParameter(a.parameter, a.from + (a.to - a.from) * t);
          if (t < 1 || a.loop) {
            if (t === 1) start = now;
            frame = requestAnimationFrame(tick);
          } else emit();
        };
        frame = requestAnimationFrame(tick);
        continue;
      }
      if (a.type === "highlight" || a.type === "focus")
        for (const o of spec.objects) {
          registry[o.id].setAttribute({
            strokeColor: o.color,
            strokeWidth: o.strokeWidth ?? (o.type === "functionGraph" ? 3.25 : 2.25),
          });
          restorePolygonStroke(o);
        }
      for (const id of a.targets) {
        const o = registry[id];
        if (a.type === "show" || a.type === "hide")
          o.setAttribute({ visible: a.type === "show" });
        else o.setAttribute({ strokeColor: "#e89a3c", strokeWidth: 5 });
      }
      board.update();
    }
    emit();
  }
  function snapshot() {
    const svg = document.getElementById(container)?.querySelector("svg");
    return svg ? new XMLSerializer().serializeToString(svg) : "";
  }
  function screenToUser(clientX: number, clientY: number): { x: number; y: number } | null {
    if (typeof board.getUsrCoordsOfMouse !== "function") return null;
    const coords = board.getUsrCoordsOfMouse({ clientX, clientY });
    const x = Number(coords?.[0]), y = Number(coords?.[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  function projectedSelection(id: string, part?: { edgeIndex?: number; edgeKey?: CircularEdgeKey; vertexIndex?: number }): VisualSelection {
    const object = spatialObjects.get(id)!;
    const type = part?.vertexIndex !== undefined ? "vertex" : part?.edgeIndex !== undefined ? "edge" : object.type;
    const selection = { id, type, label: object.label || id, parents: [], editable: false, ...part };
    const label = part ? selectedAnnotation(object, selection).label : undefined;
    return { ...selection, label: label ?? (type === "edge" ? "Cạnh của khối" : type === "vertex" ? "Đỉnh của khối" : selection.label) };
  }
  function pickProjection(clientX: number, clientY: number, parts: boolean) {
    const point = screenToUser(clientX, clientY);
    if (!point) return null;
    const relative = (id: string, p: [number, number]) => [
      (p[0] + offset(id, 0) - point.x) * board.unitX,
      (p[1] + offset(id, 1) - point.y) * board.unitY,
    ] as const;
    const nearSegment = (id: string, a: [number, number], b: [number, number]) => {
      const [x, y] = relative(id, a), [bx, by] = relative(id, b);
      const dx = bx - x, dy = by - y;
      const ratio = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x + ratio * dx, y + ratio * dy) <= 5;
    };
    const vertex = projection.vertices.findLast(({ objectId, point: p }) => Math.hypot(...relative(objectId, p)) <= 7);
    if (parts && vertex) return projectedSelection(vertex.objectId, { vertexIndex: vertex.vertexIndex });
    const edge = projection.edges.findLast(({ objectId, points }) => nearSegment(objectId, points[0], points[1]));
    if (parts && edge) return projectedSelection(edge.objectId, { edgeIndex: edge.edgeIndex, edgeKey: edge.edgeKey });
    const marker = projection.markers.findLast(({ objectId, point: p }) => Math.hypot(...relative(objectId, p)) <= 7);
    if (marker) return projectedSelection(marker.objectId);
    const face = projection.paths.findLast(({ objectId, points, filled }) => {
      if (!filled) return false;
      let inside = false;
      for (let i = 1; i < points.length; i++) {
        const [x, y] = relative(objectId, points[i - 1]), [bx, by] = relative(objectId, points[i]);
        if ((y > 0) !== (by > 0) && x - y * (bx - x) / (by - y) > 0) inside = !inside;
      }
      return inside;
    });
    const path = face ?? projection.paths.findLast(({ objectId, points }) =>
      points.some((p, index) => index > 0 && nearSegment(objectId, points[index - 1], p)),
    );
    const id = path?.objectId ?? vertex?.objectId ?? edge?.objectId;
    return id ? projectedSelection(id) : null;
  }
  function pickObjectAt(clientX: number, clientY: number, parts = true): VisualSelection | null {
    if (typeof board.getAllObjectsUnderMouse !== "function") return null;
    const hits = board.getAllObjectsUnderMouse({ clientX, clientY }) as any[];
    const priority = (type: string) =>
      ["point", "glider", "intersection", "midpoint", "projection"].includes(type) ? 0 :
      type === "relationMark" ? 0.5 :
      ["segment", "arrow", "line", "perpendicular", "parallel"].includes(type) ? 1 :
      type === "circle" || type === "polygon" ? 3 : 2;
    const candidates = spec.objects.flatMap((object, order) => {
      const element = registry[object.id];
      if (object.type === "text" || !object.visible || !element || element.visProp?.visible === false) return [];
      const edge = object.type === "polygon" ? element.borders?.findIndex((border: any, index: number) =>
        hits.includes(border) && !object.edgeStyles?.some((style) => style.edgeIndex === index && style.hidden)) ?? -1 : -1;
      if (edge < 0 && !hits.includes(element)) return [];
      return [{
        selection: edge >= 0 ? polygonEdgeSelection(object, edge) : selectionFor(object),
        rank: edge >= 0 ? 1.5 : priority(object.type),
        layer: Number(element.visProp?.layer) || 0,
        order,
      }];
    });
    return candidates.sort((a, b) => a.rank - b.rank || b.layer - a.layer || b.order - a.order)[0]?.selection ??
      (options.dragWholeShapes ? pickProjection(clientX, clientY, parts) : null);
  }
  const dragTarget = options.dragWholeShapes ? board.containerObj as HTMLElement : null;
  let shapeDrag: {
    pointerId: number;
    start: { x: number; y: number };
    clientX: number;
    clientY: number;
    selection: VisualSelection;
    roots: { id: string; x: number; y: number }[];
    projected?: boolean;
    moved: boolean;
  } | null = null;
  function beginShapeDrag(event: PointerEvent) {
    if (shapeDrag || !event.isPrimary || event.button !== 0 ||
      event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const selection = pickObjectAt(event.clientX, event.clientY, false);
    if (!selection) return;
    const spatial = spatialObjects.get(selection.id);
    if (!spatial && event.pointerType !== "mouse") return;
    if (!spatial && !["circle", "polygon", "segment", "line", "arrow"].includes(selection.type)) return;
    const start = screenToUser(event.clientX, event.clientY);
    if (!start) return;
    let ids: string[] = [];
    try {
      if (!spatial) ids = groupTranslationRoots(spec, [selection.id]);
    } catch {
      return; // A fixed or parameter-driven construction keeps its normal click behavior.
    }
    const roots = ids.map((id) => ({ id, x: registry[id].X() as number, y: registry[id].Y() as number }));
    if (roots.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return;
    if (spatial && (!options.onProjectedMove || !spatial.userCreated || spatial.spatialConstruction ||
      spatial.vertexEndpoints || spatial.net || Object.keys(spatial.parameterBindings ?? {}).some((key) => key.startsWith("position")))) {
      onSelect?.(selection);
      return;
    }
    shapeDrag = { pointerId: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, selection, roots, projected: !!spatial, moved: false };
    dragTarget?.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
    onSelect?.(selection);
  }
  function positionShape(roots: NonNullable<typeof shapeDrag>["roots"], dx: number, dy: number) {
    if (roots.some(({ x, y }) => Math.abs(x + dx) > 1e6 || Math.abs(y + dy) > 1e6)) return;
    for (const { id, x, y } of roots) {
      const point = registry[id];
      // Snap the shared displacement, so each point keeps its offset from the others.
      const snap = point.visProp.snaptogrid;
      point.visProp.snaptogrid = false;
      try {
        point.setPosition(JXG.COORDS_BY_USER, [x + dx, y + dy]);
      } finally {
        point.visProp.snaptogrid = snap;
      }
    }
    for (const polygon of spec.objects.filter((object) => object.constraint)) {
      rectangleFrames.set(polygon.id, polygon.parents.map((id) => [registry[id].X(), registry[id].Y()]));
    }
    board.update();
  }
  function moveShapeDrag(event: PointerEvent) {
    const drag = shapeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopImmediatePropagation();
    if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
    const position = screenToUser(event.clientX, event.clientY);
    if (!position) return;
    if (!drag.moved && drag.selection.edgeIndex !== undefined) {
      const object = spec.objects.find(({ id }) => id === drag.selection.id);
      if (object) onSelect?.(selectionFor(object));
    }
    drag.moved = true;
    const dx = position.x - drag.start.x, dy = position.y - drag.start.y;
    if (drag.projected) {
      const move: [number, number] = snapToGrid ? [Math.round(dx), Math.round(dy)] : [dx, dy];
      const target = spatialObjects.get(drag.selection.id)!;
      if (translateProjectedPosition(target.position, ...move).every((value) => Math.abs(value) <= 1e4)) {
        offsets.set(target.id, move);
        board.update();
      }
      return;
    }
    positionShape(drag.roots, snapToGrid ? Math.round(dx) : dx, snapToGrid ? Math.round(dy) : dy);
  }
  function endShapeDrag(event: PointerEvent) {
    const drag = shapeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    shapeDrag = null;
    event.stopImmediatePropagation();
    if (!drag.moved) return;
    if (drag.projected) {
      const id = drag.selection.id;
      const move = offsets.get(id);
      offsets.delete(id);
      if (event.type === "pointerup" && move?.some((value) => value !== 0)) {
        const next = serialized();
        const object = projectedObjects(next).find((candidate) => candidate.id === id)!;
        object.position = translateProjectedPosition(object.position, ...move);
        options.onProjectedMove?.(next, drag.selection);
      } else board.update();
      return;
    }
    if (event.type !== "pointerup") positionShape(drag.roots, 0, 0);
    onChange?.(state());
  }
  dragTarget?.addEventListener("pointerdown", beginShapeDrag, true);
  dragTarget?.addEventListener("pointermove", moveShapeDrag, true);
  dragTarget?.addEventListener("pointerup", endShapeDrag, true);
  dragTarget?.addEventListener("pointercancel", endShapeDrag, true);
  dragTarget?.addEventListener("lostpointercapture", endShapeDrag, true);
  function pickVertexAt(clientX: number, clientY: number): VertexHit | null {
    const rect = document.getElementById(container)?.getBoundingClientRect();
    if (!rect) return null;
    let nearest: VertexHit | null = null, threshold = 20;
    for (const object of spec.objects) {
      const point = registry[object.id];
      if (!["point", "glider", "intersection", "midpoint", "projection"].includes(object.type) || !point?.visProp.visible) continue;
      const coords = point.coords?.scrCoords;
      if (!coords) continue;
      const distance = Math.hypot(clientX-rect.left-coords[1],clientY-rect.top-coords[2]);
      if (distance < threshold) {
        threshold = distance;
        const vertexNumber = spec.objects.filter((o) => ["point", "glider", "intersection", "midpoint", "projection"].includes(o.type)).findIndex((o) => o.id === object.id) + 1;
        nearest = { objectId: object.id, label: object.label || `Điểm ${vertexNumber}`, position: [point.X(),point.Y(),0] };
      }
    }
    return nearest;
  }
  function pickLineAt(clientX: number, clientY: number): LineHit | null {
    const p = screenToUser(clientX, clientY); if (!p) return null;
    const ends = (id: string): [[number, number], [number, number]] | null => {
      const o = spec.objects.find(o => o.id === id); if (!o) return null;
      if (["line", "segment", "arrow"].includes(o.type)) { const a = pointCoordinates(o.parents[0]), b = pointCoordinates(o.parents[1]); return a && b ? [a, b] : null; }
      if (o.type === "parallel" || o.type === "perpendicular") {
        const base = ends(o.parents[0]), a = pointCoordinates(o.parents[1]); if (!base || !a) return null;
        const dx = base[1][0] - base[0][0], dy = base[1][1] - base[0][1];
        return [a, o.type === "parallel" ? [a[0] + dx, a[1] + dy] : [a[0] - dy, a[1] + dx]];
      }
      return null;
    };
    let best: LineHit | null = null, threshold = 13;
    for (const o of spec.objects) {
      if (!o.visible || o.strokeOpacity === 0 || registry[o.id]?.visProp?.visible === false) continue;
      const edges = o.type === "polygon" ? o.parents.map((a, i) => ({ pair: [pointCoordinates(a), pointCoordinates(o.parents[(i + 1) % o.parents.length])], i })) : [{ pair: ends(o.id), i: undefined }];
      for (const { pair, i } of edges) {
        if (!pair || !pair[0] || !pair[1] || i !== undefined && o.edgeStyles?.some(s => s.edgeIndex === i && s.hidden)) continue;
        const [a, b] = pair, dx = b[0] - a[0], dy = b[1] - a[1], n = dx * dx + dy * dy; if (n < 1e-16) continue;
        let t = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / n;
        if (i !== undefined || ["segment", "arrow"].includes(o.type)) t = Math.max(0, Math.min(1, t)); else if (o.ray) t = Math.max(0, t);
        const distance = Math.hypot((p.x - a[0] - t * dx) * board.unitX, (p.y - a[1] - t * dy) * board.unitY);
        if (distance >= threshold) continue;
        threshold = distance;
        best = { sourceId: o.id, objectId: i === undefined ? o.id : undefined, pointIds: i === undefined ? ["line", "segment", "arrow"].includes(o.type) ? o.parents as [string, string] : undefined : [o.parents[i], o.parents[(i + 1) % o.parents.length]], edgeIndex: i, label: i === undefined ? o.label || "Đường đã chọn" : `Cạnh ${i + 1}`, coordinates: [a, b] };
      }
    }
    return best;
  }
  function pickConnectionPointAt(clientX: number, clientY: number, snap = true): VertexHit | null {
    if (snap) { const vertex = pickVertexAt(clientX,clientY); if (vertex) return vertex; }
    const location = screenToUser(clientX,clientY);
    const rect = document.getElementById(container)?.getBoundingClientRect();
    if (!location || !rect) return null;
    let best: VertexHit | null = null, threshold = 12;
    const consider = (objectId: string, x: number, y: number, edge: NonNullable<VertexHit["edge"]>, label: string) => {
      const sx = rect.left + board.origin.scrCoords[1] + x*board.unitX;
      const sy = rect.top + board.origin.scrCoords[2] - y*board.unitY;
      const distance = Math.hypot(clientX-sx,clientY-sy);
      if (distance < threshold) { threshold = distance; best = {objectId,label,position:[x,y,0],edge}; }
    };
    if (snap) for (const object of spec.objects) {
      if (!object.visible) continue;
      if (object.type === "circle") {
        const a = registry[object.parents[0]], b = registry[object.parents[1]];
        if (!a) continue;
        const r = object.radius !== undefined ? Math.abs(scalar(object.radius)()) : b ? Math.hypot(b.X()-a.X(),b.Y()-a.Y()) : NaN;
        const theta = Math.atan2(location.y-a.Y(),location.x-a.X());
        const ratio = (theta/(2*Math.PI)+1)%1;
        consider(object.id,a.X()+r*Math.cos(theta),a.Y()+r*Math.sin(theta),{objectId:object.id,ratio},"Điểm trên đường tròn");
      }
      const pairs = ["segment","line","arrow"].includes(object.type) ? [object.parents.slice(0,2)]
        : object.type === "polygon" && object.strokeOpacity !== 0 ? object.parents.map((id,i)=>[id,object.parents[(i+1)%object.parents.length]]) : [];
      for (const [pairIndex, pair] of pairs.entries()) {
        if (object.type === "polygon" && object.edgeStyles?.some((s)=>s.edgeIndex===pairIndex && s.hidden)) continue;
        const a = registry[pair[0]], b = registry[pair[1]];
        if (!a?.coords || !b?.coords) continue;
        const dx = b.X()-a.X(), dy=b.Y()-a.Y(), squared=dx*dx+dy*dy;
        if (squared < 1e-12) continue;
        let ratio=((location.x-a.X())*dx+(location.y-a.Y())*dy)/squared;
        if (object.type !== "line") ratio=Math.max(0,Math.min(1,ratio));
        else if (object.ray) ratio=Math.max(0,ratio);
        consider(object.id,a.X()+ratio*dx,a.Y()+ratio*dy,{...(object.type === "polygon" ? {parents:pair as [string,string]} : {objectId:object.id}),ratio},"Điểm trên cạnh");
      }
    }
    return best || {objectId:"free",label:"Điểm tự do",position:[location.x,location.y,0],free:true};
  }
  function objectsInScreenRect(rect: { x: number; y: number; width: number; height: number }): VisualSelection[] {
    const right = rect.x + rect.width, bottom = rect.y + rect.height;
    const area = Math.max(1, rect.width * rect.height);
    const canvas = board.containerObj.getBoundingClientRect();
    function intersectsCurve(curve: { points: { scrCoords: number[] }[]; numberPoints: number }) {
      let previous: [number, number] | undefined;
      for (let i = 0; i < Math.min(curve.numberPoints, curve.points.length); i++) {
        const coordinates = curve.points[i]?.scrCoords;
        if (!coordinates || !Number.isFinite(coordinates[1]) || !Number.isFinite(coordinates[2])) {
          previous = undefined;
          continue;
        }
        const point: [number, number] = [canvas.left + coordinates[1], canvas.top + coordinates[2]];
        if (point[0] >= rect.x && point[0] <= right && point[1] >= rect.y && point[1] <= bottom) return true;
        if (previous) {
          let from = 0, to = 1;
          for (const [axis, min, max] of [[0, rect.x, right], [1, rect.y, bottom]] as const) {
            const start = previous[axis], delta = point[axis] - start;
            if (delta === 0) {
              if (start < min || start > max) { from = 1; to = 0; }
              continue;
            }
            const a = (min - start) / delta, b = (max - start) / delta;
            from = Math.max(from, Math.min(a, b));
            to = Math.min(to, Math.max(a, b));
          }
          if (from <= to) return true;
        }
        previous = point;
      }
      return false;
    }
    const planar = spec.objects.filter((object) => {
      const element = registry[object.id];
      if (object.type === "text" || !object.visible || element?.visProp?.visible === false) return false;
      // A parabola's bounding rectangle includes empty space between its branches.
      if (["functionGraph", "parametric", "implicit", "sequence"].includes(object.type) && element?.points)
        return object.strokeOpacity !== 0 && intersectsCurve(element);
      const node = element?.rendNodeStroke || element?.rendNode;
      const bounds = node?.getBoundingClientRect?.();
      if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return false;
      const overlapW = Math.max(0, Math.min(right, bounds.right) - Math.max(rect.x, bounds.left));
      const overlapH = Math.max(0, Math.min(bottom, bounds.bottom) - Math.max(rect.y, bounds.top));
      const objectArea = Math.max(1, bounds.width * bounds.height);
      return (overlapW * overlapH) / Math.min(area, objectArea) >= 0.18 ||
        (bounds.left + bounds.right) / 2 >= rect.x && (bounds.left + bounds.right) / 2 <= right &&
        (bounds.top + bounds.bottom) / 2 >= rect.y && (bounds.top + bounds.bottom) / 2 <= bottom;
    }).map(selectionFor);
    if (!options.dragWholeShapes) return planar;
    const projected = [...projectedNodes].flatMap(([id, nodes]) =>
      nodes.some((node) => {
        if (node.points) return intersectsCurve(node);
        const bounds = node.rendNode?.getBoundingClientRect();
        return bounds && bounds.left <= right && bounds.right >= rect.x &&
          bounds.top <= bottom && bounds.bottom >= rect.y;
      }) ? [projectedSelection(id)] : [],
    );
    return [...planar, ...projected];
  }
  function setAxesVisible(visible: boolean) {
    const axes = board.defaultAxes;
    axes?.x?.setAttribute({ visible, withLabel: labelsVisible, ticks: { drawLabels: labelsVisible } });
    axes?.y?.setAttribute({ visible, withLabel: labelsVisible, ticks: { drawLabels: labelsVisible } });
    board.update();
  }
  function setGridVisible(visible: boolean) {
    if (visible && !board.grids?.length) board.create("grid",[],notebookGridOptions(()=>board));
    else if (!visible && board.grids?.length) board.removeGrids();
    board.update();
    if (visible) board.fullUpdate();
  }
  function setSnapToGrid(visible: boolean) {
    snapToGrid = visible;
    for (const object of spec.objects) {
      if (object.type !== "point" || !object.free) continue;
      registry[object.id]?.setAttribute({ snapToGrid: visible, snapSizeX: 1, snapSizeY: 1 });
    }
    board.update();
  }
  function setLabelsVisible(visible: boolean) {
    labelsVisible = visible;
    projectionLabels.forEach((label) => label.setAttribute({ visible }));
    board.defaultAxes?.x?.setAttribute({ withLabel: visible, ticks: { drawLabels: visible } });
    board.defaultAxes?.y?.setAttribute({ withLabel: visible, ticks: { drawLabels: visible } });
    for (const object of spec.objects) {
      const hasLabel = Boolean(object.label || object.measurement);
      const point = ["point", "glider", "midpoint", "projection", "intersection"].includes(object.type);
      const shouldShow = object.type !== "relationMark" && visible && hasLabel && !["vertex", "rootL", "rootR"].includes(object.id) &&
        (!point || annotationVisibility.vertex) && (!object.measurement || annotationVisibility.length) &&
        (object.type !== "angle" || annotationVisibility.angle);
      registry[object.id]?.setAttribute({ withLabel: shouldShow });
    }
    board.update();
  }
  function setAnnotationVisibility(kind: string, visible: boolean) {
    if (!(kind in annotationVisibility)) return;
    annotationVisibility[kind] = visible;
    for (const object of spec.objects) if (object.annotationKind === kind) registry[object.id]?.setAttribute({ visible: object.visible && visible });
    if (kind === "angle") for (const object of spec.objects) {
      if (object.type === "angle") registry[object.id]?.setAttribute({ visible: object.visible && visible });
    }
    setLabelsVisible(labelsVisible);
  }
  function setSurfaceFillVisible(visible: boolean) {
    surfaceFillVisible = visible;
    spec.surfaceFill = visible;
    projectionFaces.forEach((face) => face.setAttribute({ fillOpacity: visible ? 0.16 : 0 }));
    for (const object of spec.objects) {
      if (!["polygon", "circle", "angle"].includes(object.type)) continue;
      registry[object.id]?.setAttribute({
        fillOpacity: visible ? object.type === "polygon" ? 0.1 : 0.08 : 0,
      });
    }
    board.update();
  }
  function zoomIn() { if (!destroyed) board.zoomIn(); }
  function zoomOut() { if (!destroyed) board.zoomOut(); }
  function fitView() {
    if (destroyed) return;
    const box = options.fitContent === false ? null : contentBounds();
    const fitted = box ? preserveBoardAspect(box) : [spec.viewport.x[0], spec.viewport.y[1], spec.viewport.x[1], spec.viewport.y[0]] as [number, number, number, number];
    currentViewport = fitted;
    board.setBoundingBox(fitted, keepAspectRatio, "reset");
  }
  function boundingBox(): [number, number, number, number] {
    return [...(board.getBoundingBox?.() || currentViewport)] as [number, number, number, number];
  }
  function serialized() {
    const copy = structuredClone(spec);
    copy.parameters.forEach((p) => (p.value = values[p.id]));
    const [left, top, right, bottom] = (board.getBoundingBox?.() || currentViewport) as [number, number, number, number];
    if ([left, top, right, bottom].every(n=>Number.isFinite(n) && Math.abs(n)<=1e6) && left<right && bottom<top) copy.camera2d = { x: [left, right], y: [bottom, top] };
    for (const o of copy.objects) {
      if (o.free) {
        o.x = registry[o.id].X();
        o.y = registry[o.id].Y();
      }
      o.visible = registry[o.id].visProp.visible !== false;
    }
    return copy;
  }
  for(const polygon of spec.objects.filter(o=>o.type==="polygon" && o.constraint)) rectangleFrames.set(polygon.id,polygon.parents.map(id=>[registry[id].X(),registry[id].Y()]));
  if (spec.camera2d && !projection.paths.length && !projection.markers.length) onChange?.(state()); else emit();
  board.on?.("update", updateSelectionFrame);
  return ({
    state,
    labelHandles() {
      return spec.objects.flatMap(o => {
        const label = registry[o.id]?.label;
        const node = label?.rendNode;
        const rect = node?.getBoundingClientRect?.();
        if (!o.visible || !labelsVisible || !rect || rect.width <= 0 || rect.height <= 0 || label?.visProp?.visible === false) return [];
        return [{ id: o.id, text: o.label || o.measurement || o.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, offset: o.labelOffset || (o.type === "polygon" ? [0, -24] : o.type === "segment" ? [8, 14] : [10, 10]) as [number, number] }];
      });
    },
    userToScreen(x: number, y: number) { const rect = document.getElementById(container)?.getBoundingClientRect(); return rect ? { x: rect.left + board.origin.scrCoords[1] + x * board.unitX, y: rect.top + board.origin.scrCoords[2] - y * board.unitY } : null; },
    setParameter,
    setPoint,
    actions,
    reset,
    stop,
    snapshot,
    serialized,
    screenToUser,
    pickObjectAt,
    setSelection,
    pickVertexAt,
    pickLineAt,
    pickConnectionPointAt,
    objectsInScreenRect,
    setAxesVisible,
    setGridVisible,
    setSnapToGrid,
    setLabelsVisible,
    setAnnotationVisibility,
    setSurfaceFillVisible,
    zoomIn,
    zoomOut,
    fitView,
    boundingBox,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      board.off?.("update", updateSelectionFrame);
      dragTarget?.removeEventListener("pointerdown", beginShapeDrag, true);
      dragTarget?.removeEventListener("pointermove", moveShapeDrag, true);
      dragTarget?.removeEventListener("pointerup", endShapeDrag, true);
      dragTarget?.removeEventListener("pointercancel", endShapeDrag, true);
      dragTarget?.removeEventListener("lostpointercapture", endShapeDrag, true);
      selectionFrame?.remove();
      board.off?.("boundingbox", emit);
      JXG.JSXGraph.freeBoard(board);
    },
  } satisfies VisualCorePort & CoordinatePort & SelectionPort & StatePort & Record<string,unknown>);
}
export type VisualRuntime = ReturnType<typeof createRuntime>;
