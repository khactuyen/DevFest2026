"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Hand, MousePointer2, PenLine, Redo2, Square, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import { compileVisualProgram } from "@/lib/visual-program";
import { sketchProgram, type InkPoint, type InkStroke } from "@/lib/sketch-geometry";
import { planGraphInk, prepareGraphInk, type InkPlacement, type InkShapeChoice } from "@/lib/graph-ink-geometry";
import { compactInkStrokes, resizeInkDraft, type GraphInkDraft } from "@/lib/graph-ink-draft";
import type { VertexHit } from "@/lib/runtime";
import { drawSelectionFrame, selectionCaptureError, selectionSvgDataUrl } from "@/lib/graph-selection-capture";

type Mode = "off" | "draw" | "select" | "connect";
type Rect = { x: number; y: number; width: number; height: number };
type Props = {
  onNormalize: (spec: ReturnType<typeof compileVisualProgram>, placement: InkPlacement, stage: DOMRect) => void;
  onAskAI?: (imageDataUrl: string, rect: Rect, inkStrokeCount: number, stage: DOMRect) => void;
  captureFrame?: () => string | null;
  onSelectRegion?: (rect: Rect, stage: DOMRect) => void;
  regionOnly?: boolean;
  regionSelectionCount?: number;
  initialDraft?: GraphInkDraft | null;
  onDraftChange?: (draft: GraphInkDraft | null) => void;
  pickVertex?: (x: number, y: number, snap?: boolean) => VertexHit | null;
  onConnect?: (first: VertexHit, second: VertexHit, style: "solid" | "dashed") => void;
  vertices?: VertexHit[];
  externalToolActive?: boolean;
  onModeChange?: (mode: Mode) => void;
};

/** Transparent ink layer aligned exactly with the live JSXGraph plotting area. */
export function GraphInkOverlay({ onNormalize, onAskAI, captureFrame, onSelectRegion, regionOnly = false, regionSelectionCount = 0, initialDraft, onDraftChange, pickVertex, onConnect, vertices = [], externalToolActive = false, onModeChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureGenerationRef=useRef(0);
  useEffect(()=>()=>{captureGenerationRef.current+=1;},[]);
  const strokesRef = useRef<InkStroke[]>(initialDraft?.strokes || []);
  const pastRef = useRef<InkStroke[][]>(initialDraft?.past || []);
  const futureRef = useRef<InkStroke[][]>(initialDraft?.future || []);
  const pointerRef = useRef<number | null>(null);
  const startRef = useRef<InkPoint | null>(null);
  const currentRef = useRef<InkPoint | null>(null);
  const selectedRef = useRef<number[]>([]);
  const callbackRef = useRef(onNormalize);
  callbackRef.current = onNormalize;
  const [mode, setMode] = useState<Mode>("off");
  const modeCallback = useRef(onModeChange); modeCallback.current = onModeChange;
  useEffect(() => { modeCallback.current?.(mode); }, [mode]);
  useEffect(() => { if (externalToolActive) { setMode("off"); firstVertexRef.current = null; setFirstVertex(null); } }, [externalToolActive]);
  const [selection, setSelection] = useState<Rect | null>(initialDraft?.selection || null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectionReady, setSelectionReady] = useState(false);
  const savedSelection = initialDraft?.selection;
  useEffect(() => {
    if (savedSelection) return;
    setSelection(null);
    setSelectionReady(false);
    selectedRef.current = [];
    setSelectedCount(0);
  }, [savedSelection]);
  const [askingAI, setAskingAI] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [failure, setFailure] = useState("");
  const [shape, setShape] = useState<InkShapeChoice>("auto");
  const [lineStyle, setLineStyle] = useState<"solid" | "dashed">("solid");
  const [snapConnections, setSnapConnections] = useState(true);
  const [, setHistoryRevision] = useState(0);
  const restoredRef = useRef(false);
  const firstVertexRef = useRef<VertexHit | null>(null);
  const [firstVertex, setFirstVertex] = useState<VertexHit | null>(null);
  const dimensionModeRef = useRef(regionOnly);
  useEffect(() => {
    if (dimensionModeRef.current === regionOnly) return;
    dimensionModeRef.current = regionOnly;
    if (pointerRef.current !== null && canvasRef.current?.hasPointerCapture(pointerRef.current))
      canvasRef.current.releasePointerCapture(pointerRef.current);
    pointerRef.current = null;
    firstVertexRef.current = null;
    setFirstVertex(null); setMode("off"); setFailure("");
    setSelection(null); setSelectionReady(false); selectedRef.current = []; setSelectedCount(0);
  }, [regionOnly]);
  function chooseVertex(vertex: VertexHit) {
    if (!firstVertexRef.current) {
      firstVertexRef.current = vertex; setFirstVertex(vertex); setFailure(""); return;
    }
    try {
      onConnect?.(firstVertexRef.current, vertex, lineStyle);
      firstVertexRef.current = null; setFirstVertex(null); setFailure("");
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : "Không nối được hai điểm."); }
  }
  useEffect(() => {
    if (mode !== "connect") { firstVertexRef.current = null; setFirstVertex(null); }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pointerRef.current = null; firstVertexRef.current = null; setFirstVertex(null);
      setMode("off"); setFailure("");
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mode]);

  function selectedIndices(rect: Rect) {
    return strokesRef.current.flatMap((stroke, index) => {
      const inside = stroke.points.filter((point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height).length;
      return inside >= Math.max(1, Math.ceil(stroke.points.length * 0.55)) ? [index] : [];
    });
  }

  function publish(selectionValue: Rect | null = selection) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
    const strokes = compactInkStrokes(strokesRef.current);
    const past = pastRef.current.map(compactInkStrokes);
    const future = futureRef.current.map(compactInkStrokes);
    while ([strokes, ...past, ...future].reduce((sum, state) => sum + state.reduce((n, item) => n + item.points.length, 0), 0) > 17500) {
      if (past.length) past.shift(); else if (future.length) future.shift(); else break;
    }
    onDraftChange?.(strokes.length || past.length || future.length || selectionValue
      ? { width, height, strokes, selection: selectionValue, past, future } : null);
    setHistoryRevision((value) => value + 1);
  }

  function checkpoint() {
    pastRef.current = [...pastRef.current, compactInkStrokes(strokesRef.current)].slice(-6);
    futureRef.current = [];
  }

  function travel(direction: "undo" | "redo") {
    const source = direction === "undo" ? pastRef : futureRef;
    const destination = direction === "undo" ? futureRef : pastRef;
    if (!source.current.length) return;
    destination.current = [...destination.current, compactInkStrokes(strokesRef.current)].slice(-6);
    strokesRef.current = source.current.at(-1)!;
    source.current = source.current.slice(0, -1);
    selectedRef.current = []; setSelectedCount(0); setSelection(null); setSelectionReady(false);
    publish(null); paint();
  }

  function paint() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (regionOnly ? [] : strokesRef.current).forEach((stroke, index) => {
      if (!stroke.points.length) return;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = selectedRef.current.includes(index) ? 5 : 3;
      ctx.strokeStyle = selectedRef.current.includes(index) ? "#2463eb" : stroke.color;
      ctx.setLineDash(stroke.lineStyle === "dashed" ? [10, 7] : []);
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    });
    if (selection) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.fillStyle = "rgba(37, 99, 235, .10)";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
      ctx.restore();
    }
    if (mode === "connect" && pointerRef.current !== null && startRef.current && currentRef.current) {
      ctx.save();
      ctx.strokeStyle = "#17835e"; ctx.fillStyle = "#17835e"; ctx.lineWidth = 2;
      ctx.setLineDash(lineStyle === "dashed" ? [8, 5] : []);
      ctx.beginPath(); ctx.moveTo(startRef.current.x,startRef.current.y);
      ctx.lineTo(currentRef.current.x,currentRef.current.y); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(startRef.current.x,startRef.current.y,5,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      if (!restoredRef.current && initialDraft && rect.width > 0 && rect.height > 0) {
        const restored = resizeInkDraft(initialDraft, rect.width, rect.height);
        strokesRef.current = restored.strokes;
        pastRef.current = restored.past;
        futureRef.current = restored.future;
        setSelection(restored.selection);
        if (restored.selection) {
          selectedRef.current = selectedIndices(restored.selection);
          setSelectedCount(selectedRef.current.length);
          setSelectionReady(restored.selection.width >= 24 && restored.selection.height >= 24);
        }
        restoredRef.current = true;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, [selection, selectedCount]);

  useEffect(() => { paint(); }, [mode, selection, selectedCount, lineStyle, regionOnly]);

  useEffect(() => {
    if (mode === "off" || regionOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      travel(event.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, regionOnly]);

  function position(event: React.PointerEvent<HTMLCanvasElement>): InkPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode === "off" || event.button !== 0 || pointerRef.current !== null) return;
    event.preventDefault();
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event);
    if (mode === "connect") {
      const vertex = pickVertex?.(event.clientX,event.clientY,snapConnections && !event.altKey);
      if (!vertex) {
        pointerRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setFailure("Không xác định được vị trí ở góc nhìn này. Hãy xoay hình rồi thử lại.");
        return;
      }
      if (firstVertexRef.current) {
        chooseVertex(vertex);
        pointerRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      chooseVertex(vertex);
      startRef.current = point;
      currentRef.current = point;
      paint();
      return;
    }
    startRef.current = point;
    currentRef.current = point;
    if (mode === "draw") {
      if (strokesRef.current.length >= 30) {
        setMode("select");
        pointerRef.current = null;
        return;
      }
      checkpoint();
      strokesRef.current.push({ color: "#168265", lineStyle, points: [point] });
    } else { setSelectionReady(false); setSelection({ x: point.x, y: point.y, width: 0, height: 0 }); }
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    currentRef.current = point;
    if (mode === "connect") { paint(); return; }
    if (mode === "draw") {
      const stroke = strokesRef.current.at(-1);
      if (stroke && stroke.points.length < 1200) stroke.points.push(point);
    } else if (startRef.current) {
      const a = startRef.current;
      setSelection({ x: Math.min(a.x, point.x), y: Math.min(a.y, point.y), width: Math.abs(point.x - a.x), height: Math.abs(point.y - a.y) });
    }
    paint();
  }
  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return;
    move(event);
    pointerRef.current = null;
    if (mode === "connect") {
      if (event.type !== "pointercancel" && startRef.current && Math.hypot(position(event).x-startRef.current.x,position(event).y-startRef.current.y) > 8) {
        const endVertex = pickVertex?.(event.clientX,event.clientY,snapConnections && !event.altKey);
        if (endVertex) chooseVertex(endVertex);
        else setFailure("Chưa xác định được điểm cuối. Điểm đầu được giữ để bạn chọn tiếp.");
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      paint();
      return;
    }
    const end = position(event);
    const origin = startRef.current;
    const rect = origin ? { x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), width: Math.abs(end.x - origin.x), height: Math.abs(end.y - origin.y) } : null;
    if (mode === "select" && rect) {
      const selected = selectedIndices(rect);
      selectedRef.current = selected;
      setSelectedCount(selected.length);
      setSelection(rect);
      setSelectionReady(rect.width >= 24 && rect.height >= 24);
      const stage = event.currentTarget.parentElement?.getBoundingClientRect();
      if (stage && rect.width >= 12 && rect.height >= 12) onSelectRegion?.(rect, stage);
      publish(rect);
    }
    if (mode === "draw") publish();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    paint();
  }
  async function askAboutSelection() {
    const overlayCanvas = canvasRef.current;
    const stage = overlayCanvas?.parentElement;
    if (!overlayCanvas || !stage || !selection || !onAskAI || askingAI) return;
    const generation=captureGenerationRef.current;
    try {
      setAskingAI(true);
      setFailure("");
      const stageRect = stage.getBoundingClientRect();
      const pad = 8;
      const crop = {
        x: Math.max(0, selection.x - pad), y: Math.max(0, selection.y - pad),
        width: Math.min(stageRect.width, selection.x + selection.width + pad) - Math.max(0, selection.x - pad),
        height: Math.min(stageRect.height, selection.y + selection.height + pad) - Math.max(0, selection.y - pad),
      };
      if (crop.width < 2 || crop.height < 2) throw Error("Khung chọn quá nhỏ. Hãy khoanh vùng lớn hơn.");
      const output = document.createElement("canvas");
      const scale = Math.min(1.5, 1200 / Math.max(crop.width, crop.height));
      output.width = Math.max(1, Math.round(crop.width * scale));
      output.height = Math.max(1, Math.round(crop.height * scale));
      const context = output.getContext("2d");
      if (!context) throw Error("Không tạo được ảnh vùng chọn.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, output.width, output.height);
      const boardStage=stage.closest(".math-board-stage") || stage;
      const svg = boardStage.querySelector<SVGSVGElement>(".math-board svg");
      if (regionOnly) {
        const frame=captureFrame?.();
        const scene=boardStage.querySelector<HTMLCanvasElement>(".math-board canvas");
        if(!frame || !scene)throw Error("Không chụp được hình 3D. Hãy thử lại sau khi hình đã hiển thị.");
        const image=new Image();image.src=frame;await image.decode();
        const bounds=scene.getBoundingClientRect();
        drawSelectionFrame(context,image,bounds,stageRect,crop,scale);
        context.save();context.scale(scale,scale);context.translate(-crop.x,-crop.y);
        for(const label of boardStage.querySelectorAll<HTMLElement>(".three-scene-label")) {
          const style=getComputedStyle(label),box=label.getBoundingClientRect();
          if(style.display==="none" || style.visibility==="hidden")continue;
          context.font=style.font || "16px sans-serif";context.fillStyle=style.color;
          context.textBaseline="top";context.fillText(label.textContent||"",box.left-stageRect.left,box.top-stageRect.top);
        }
        context.restore();
      } else if (svg) {
        const svgRect = svg.getBoundingClientRect();
        const image = new Image();
        image.src = selectionSvgDataUrl(svg);
        await image.decode();
        drawSelectionFrame(context,image,svgRect,stageRect,crop,scale);
      }
      context.save();
      context.translate(-crop.x * scale, -crop.y * scale);
      context.scale(scale, scale);
      strokesRef.current.forEach((stroke, index) => {
        if (!selectedRef.current.includes(index) || stroke.points.length < 1) return;
        context.beginPath();
        context.lineCap = "round"; context.lineJoin = "round";
        context.lineWidth = 3; context.strokeStyle = stroke.color;
        context.setLineDash(stroke.lineStyle === "dashed" ? [10, 7] : []);
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.stroke();
      });
      context.restore();
      const pixels=context.getImageData(0,0,output.width,output.height).data;
      let contentPixels=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]<235 || pixels[i+1]<235 || pixels[i+2]<235)contentPixels++;
      if(contentPixels<8)throw Error("Vùng khoanh chưa có nội dung nhìn thấy. Hãy chọn lại vùng chứa hình hoặc nét vẽ.");
      const imageDataUrl = output.toDataURL("image/jpeg", 0.82);
      if(generation!==captureGenerationRef.current)return;
      onAskAI(imageDataUrl, selection, selectedRef.current.length, stageRect);
    } catch (reason) {
      setFailure(selectionCaptureError(reason));
    } finally { setAskingAI(false); }
  }
  function normalize() {
    const canvas = canvasRef.current;
    if (!canvas || !selectedRef.current.length) return;
    const chosen = strokesRef.current.filter((_, index) => selectedRef.current.includes(index));
    const stage = canvas.parentElement?.getBoundingClientRect();
    if (!stage) return;
    const prepared = prepareGraphInk(chosen);
    if (!prepared) { setFailure("Nét vẽ quá ngắn. Hãy vẽ thêm rồi thử lại."); return; }
    try {
      setNormalizing(true);
      setFailure("");
      const normalized = planGraphInk(prepared.strokes, shape);
      if (!normalized) throw Error("Chưa nhận dạng được hình từ các nét đã chọn.");
      if (normalized.ambiguities.length) throw Error(normalized.ambiguities.join(" "));
      const points = chosen.length === 1 ? chosen[0].points : [];
      const extent = points.length ? Math.max(
        Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
        Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
      ) : 0;
      const closedStroke = points.length > 8 && Math.hypot(
        points[0].x - points.at(-1)!.x,
        points[0].y - points.at(-1)!.y,
      ) < extent * 0.18;
      if (shape === "auto" && closedStroke && !normalized.circles.length && !normalized.polygons.length)
        throw Error("Nét khép kín chưa xác định được hình. Hãy chọn kiểu hình bên cạnh rồi thử lại.");
      const spec = compileVisualProgram(sketchProgram(normalized), `ink_${Date.now().toString(36)}`);
      callbackRef.current(spec, prepared.placement, stage);
      strokesRef.current = strokesRef.current.filter((_, index) => !selectedRef.current.includes(index));
      pastRef.current = [];
      futureRef.current = [];
      selectedRef.current = [];
      setSelectedCount(0);
      setSelection(null);
      publish(null);
      setMode("off");
      setShape("auto");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setFailure(reason instanceof TypeError || (reason instanceof Error && reason.name === "ZodError")
        ? "Nét vẽ này chưa tạo được hình hợp lệ. Hãy chọn đúng kiểu hình hoặc khoanh từng hình riêng rồi thử lại."
        : message || "Không chuẩn hóa được nét đã chọn.");
    } finally { setNormalizing(false); }
  }

  return <div className={`graph-ink-tools ${mode !== "off" ? "is-active" : ""}`}>
    <div className="graph-ink-toolbar" aria-label="Công cụ vẽ trực tiếp trên đồ thị">
      {regionOnly ? <>
        <button type="button" className={mode === "off" ? "active" : ""} onClick={() => setMode("off")}><Hand size={14}/> Xoay hình</button>
        <button type="button" className={mode === "select" ? "active" : ""} onClick={() => { setMode(mode === "select" ? "off" : "select"); setSelection(null); setSelectionReady(false); }}><MousePointer2 size={14}/> {mode === "select" ? "Đang khoanh vùng" : "Chọn vùng đối tượng"}</button>
        {regionSelectionCount > 0 && <span className="graph-ink-selected"><Check size={12}/>{regionSelectionCount} đối tượng</span>}
        {mode === "select" && <span className="graph-ink-hint"><Square size={12}/> Kéo khung quanh các đối tượng muốn chọn</span>}
      </> : <>
      <button type="button" className={mode === "off" ? "active" : ""} onClick={() => setMode("off")} title="Tương tác với đồ thị"><Hand size={14}/> Kéo đồ thị</button>
      <button type="button" className={mode === "draw" ? "active" : ""} onClick={() => { setMode(mode === "draw" ? "off" : "draw"); setSelection(null); setSelectionReady(false); selectedRef.current = []; setSelectedCount(0); }}><PenLine size={14}/> Vẽ trên hình</button>
      {mode === "draw" && <div className="graph-ink-line-styles" role="group" aria-label="Kiểu nét vẽ">
        <button type="button" className={lineStyle === "solid" ? "active" : ""} aria-pressed={lineStyle === "solid"} onClick={() => setLineStyle("solid")}><span className="graph-ink-style-sample"/>Nét liền</button>
        <button type="button" className={lineStyle === "dashed" ? "active" : ""} aria-pressed={lineStyle === "dashed"} onClick={() => setLineStyle("dashed")}><span className="graph-ink-style-sample dashed"/>Nét đứt</button>
      </div>}
      <button type="button" className={mode === "select" ? "active" : ""} onClick={() => { setMode(mode === "select" ? "off" : "select"); setSelection(null); setSelectionReady(false); selectedRef.current = []; setSelectedCount(0); }}><MousePointer2 size={14}/> Khoanh chọn</button>
      <button type="button" title="Hoàn tác nét phác" aria-label="Hoàn tác nét phác" disabled={!pastRef.current.length} onClick={() => travel("undo")}><Undo2 size={14}/></button>
      <button type="button" title="Làm lại nét phác" aria-label="Làm lại nét phác" disabled={!futureRef.current.length} onClick={() => travel("redo")}><Redo2 size={14}/></button>
      {mode === "select" && selectedCount > 0 && <>
        <span className="graph-ink-selected"><Check size={12}/>{selectedCount} nét</span>
        <select aria-label="Kiểu hình cần chuẩn hóa" value={shape} onChange={(event) => { setShape(event.target.value as InkShapeChoice); setFailure(""); }}>
          <option value="auto">Tự nhận dạng</option>
          <option value="line">Đoạn thẳng</option>
          <option value="triangle">Tam giác</option>
          <option value="rectangle">Hình chữ nhật</option>
          <option value="square">Hình vuông</option>
          <option value="circle">Đường tròn</option>
        </select>
        <button type="button" className="graph-ink-normalize" disabled={normalizing} onClick={normalize}><WandSparkles size={14}/> Chuẩn hóa hình</button>
        <button type="button" title="Xóa nét đã chọn" onClick={() => { checkpoint(); strokesRef.current = strokesRef.current.filter((_, index) => !selectedRef.current.includes(index)); selectedRef.current = []; setSelectedCount(0); setSelection(null); publish(null); paint(); }}><Trash2 size={14}/></button>
      </>}
      {strokesRef.current.length > 0 && <button type="button" title="Xóa toàn bộ nét phác" onClick={() => { checkpoint(); strokesRef.current = []; selectedRef.current = []; setSelectedCount(0); setSelection(null); publish(null); paint(); }}><X size={14}/></button>}
      {mode === "draw" && <span className="graph-ink-hint">Vẽ trực tiếp trên mặt phẳng tọa độ</span>}
      </>}
      {onConnect && <button type="button" className={mode === "connect" ? "active" : ""} aria-pressed={mode === "connect"} onClick={() => { setMode(mode === "connect" ? "off" : "connect"); setSelection(null); setSelectionReady(false); setFailure(""); }}><PenLine size={14}/> Vẽ đoạn</button>}
      {mode === "connect" && <>
        <label className="graph-ink-snap"><input type="checkbox" checked={snapConnections} onChange={(event)=>setSnapConnections(event.target.checked)}/>Bám điểm/cạnh</label>
        <div className="graph-ink-line-styles" role="group" aria-label="Kiểu đường nối">
          <button type="button" aria-pressed={lineStyle === "solid"} onClick={() => setLineStyle("solid")}><span className="graph-ink-style-sample"/>Nét liền</button>
          <button type="button" aria-pressed={lineStyle === "dashed"} onClick={() => setLineStyle("dashed")}><span className="graph-ink-style-sample dashed"/>Nét đứt</button>
        </div>
        {vertices.length > 0 && <select aria-label={firstVertex ? "Đỉnh kết thúc đường nối" : "Đỉnh bắt đầu đường nối"} value="" onChange={(event) => { const vertex = vertices[Number(event.target.value)]; if (vertex) chooseVertex(vertex); }}><option value="">{firstVertex ? "Chọn đỉnh thứ hai" : "Chọn đỉnh đầu"}</option>{vertices.map((vertex,index) => <option key={`${vertex.objectId}-${vertex.vertexIndex ?? "point"}`} value={index}>{vertex.label}</option>)}</select>}
        <span className="graph-ink-hint">{firstVertex ? `Đã chọn ${firstVertex.label} · Chọn điểm cuối` : "Bấm hai điểm hoặc kéo để nối đỉnh, cạnh hay vị trí tự do"} · Alt: bỏ bám · Esc: thoát</span>
        {regionOnly && <span className="graph-ink-hint">Điểm trống: {"mặt phẳng nhìn hoặc mặt phẳng hình gốc"}</span>}
      </>}
      {mode === "select" && !regionOnly && regionSelectionCount > 0 && <span className="graph-ink-selected"><Check size={12}/>{regionSelectionCount} đối tượng</span>}
      {onAskAI && mode === "select" && selectionReady && <button type="button" className="graph-ink-ask" disabled={askingAI} onClick={() => void askAboutSelection()}><Bot size={14}/>{askingAI ? "Đang gửi…" : "Ask AI"}</button>}
      {mode === "select" && !selectedCount && !regionSelectionCount && <span className="graph-ink-hint"><Square size={12}/> Kéo khung quanh nét hoặc đối tượng muốn chọn</span>}
    </div>
    {failure && <div className="graph-ink-error" role="alert">{failure}<button type="button" onClick={() => setFailure("")} aria-label="Đóng thông báo"><X size={12}/></button></div>}
    <canvas ref={canvasRef} className="graph-ink-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} style={{ pointerEvents: mode === "off" ? "none" : "auto", cursor: mode === "draw" ? "crosshair" : mode === "select" ? "crosshair" : "default" }} aria-label="Lớp vẽ trên đồ thị" />
  </div>;
}
