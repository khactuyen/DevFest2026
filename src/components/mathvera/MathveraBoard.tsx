"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Circle, Download, Eraser, ImagePlus, Minus, MousePointer2, Move, PenLine, Plus, Redo2, RotateCcw, Shapes, Trash2, Triangle, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { distance, fitView, graphPaths, removeFromScene, resolvePoints, uid, type BoardItem, type BoardPoint, type Scene, type Vec } from "@/lib/mathvera-model";
import { FormattedAIAnswer } from "@/components/FormattedMath";

type Props = { scene: Scene; onChange: (scene: Scene) => void; notify: (text: string) => void };
const toolNames: Record<string, string> = { select: "Chọn", point: "Điểm", segment: "Đoạn", line: "Đường", ray: "Tia", circle: "Tròn", polygon: "Đa giác", stroke: "Bút", erase: "Tẩy", midpoint: "Trung điểm", foot: "Đường cao / hình chiếu", centroid: "Trọng tâm", circumcenter: "Đường tròn ngoại tiếp", incenter: "Đường tròn nội tiếp", intersection: "Giao hai đường" };
const constructCounts: Record<string, number> = { midpoint: 2, foot: 3, centroid: 3, circumcenter: 3, incenter: 3, intersection: 4 };
const colors = ["#3877e9", "#202b3d", "#e4523a", "#159b80", "#8c58cf", "#e2a22b"];

export async function readImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error("Chọn ảnh PNG, JPEG hoặc WebP.");
  if (file.size > 3 * 1024 * 1024) throw Error("Mỗi ảnh tối đa 3 MB.");
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error("Không đọc được ảnh.")); reader.readAsDataURL(file); });
}

export function MathveraBoard({ scene, onChange, notify }: Props) {
  const svg = useRef<SVGSVGElement>(null), uploader = useRef<HTMLInputElement>(null);
  const latest = useRef(scene); latest.current = scene;
  const [tool, setTool] = useState("select"), [pending, setPending] = useState<string[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState(colors[0]), [width, setWidth] = useState(2), [dashed, setDashed] = useState(false), [grid, setGrid] = useState(true);
  const [view, setView] = useState({ x: 0, y: 0, width: 1000, height: 760 });
  const [dialog, setDialog] = useState<"text" | "graph" | "problem" | null>(null), [value, setValue] = useState("");
  const [history, setHistory] = useState<{ past: Scene[]; future: Scene[] }>({ past: [], future: [] });
  const gesture = useRef<{ id?: string; start: Vec; before: Scene; view: typeof view; path?: Vec[]; moved: boolean } | null>(null);
  const points = useMemo(() => resolvePoints(scene), [scene]);
  const change = useCallback((next: Scene) => { const before = latest.current; setHistory(h => ({ past: [...h.past.slice(-39), before], future: [] })); onChange(next); }, [onChange]);
  const undo = useCallback(() => { if (!history.past.length) return; onChange(history.past[history.past.length - 1]); setHistory({ past: history.past.slice(0, -1), future: [latest.current, ...history.future] }); setPending([]); setSelected(null); }, [onChange, history]);
  const redo = useCallback(() => { if (!history.future.length) return; onChange(history.future[0]); setHistory({ past: [...history.past, latest.current], future: history.future.slice(1) }); setPending([]); setSelected(null); }, [onChange, history]);
  function choose(next: string) { setTool(next); setPending([]); setSelected(null); }
  const deleteSelection = useCallback(() => { if (selected) { change(removeFromScene(latest.current, selected)); setSelected(null); } }, [selected, change]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (dialog || (e.target instanceof HTMLElement && (e.target.closest("input,textarea,select,math-field,[contenteditable=true]") || e.target.isContentEditable))) return;
      if (e.key === "Escape") { setPending([]); setSelected(null); setTool("select"); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [deleteSelection, dialog, undo, redo]);
  function position(e: React.PointerEvent): Vec {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); return { x: pt.x, y: pt.y };
  }
  function newPoint(v: Vec, current: Scene): BoardPoint {
    let index = current.points.length, label = "";
    do { label = `${String.fromCharCode(65 + index % 26)}${index >= 26 ? Math.floor(index / 26) : ""}`; index++; } while (current.points.some(p => p.label === label));
    return { id: uid(), label, ...v };
  }
  function addAt(v: Vec) {
    const current = latest.current;
    const snap = [...points.values()].find(p => distance(p, v) < 15 * view.width / 1000);
    if (tool === "point") { change({ ...current, points: [...current.points, newPoint(v, current)] }); return; }
    if (tool === "select" || tool === "stroke" || tool === "erase") return;
    const point = snap || newPoint(v, current), next = snap ? current : { ...current, points: [...current.points, point] };
    if (tool === "polygon" && pending.length >= 3 && point.id === pending[0]) { change({ ...next, items: [...next.items, { id: uid(), kind: "polygon", refs: pending, color, width, fill: true, dashed }] }); setPending([]); return; }
    if (pending.includes(point.id)) { notify(tool === "polygon" ? "Chọn đỉnh mới hoặc bấm đỉnh đầu để khép đa giác." : "Hãy chọn các điểm khác nhau."); return; }
    const refs = [...pending, point.id], count = constructCounts[tool] || (tool === "polygon" ? Infinity : 2);
    if (refs.length < count) { if (!snap) change(next); setPending(refs); return; }
    if (tool in constructCounts) {
      const kind = tool as NonNullable<BoardPoint["construction"]>["kind"];
      const built = { ...newPoint(v, next), construction: { kind, refs } };
      const updated = { ...next, points: [...next.points, built] };
      const resolved = resolvePoints(updated);
      if (!resolved.has(built.id)) { notify("Các điểm đang trùng, thẳng hàng hoặc hai đường song song. Hãy chọn lại."); setPending([]); return; }
      const items: BoardItem[] = [];
      if (tool === "foot") items.push({ id: uid(), kind: "segment", refs: [refs[0], built.id], color, width, dashed });
      if (tool === "circumcenter") items.push({ id: uid(), kind: "circle", refs: [built.id, refs[0]], color, width });
      if (tool === "incenter") {
        const foot = { ...newPoint(v, updated), construction: { kind: "foot" as const, refs: [built.id, refs[1], refs[2]] } };
        updated.points.push(foot); items.push({ id: uid(), kind: "circle", refs: [built.id, foot.id], color, width });
      }
      change({ ...updated, items: [...updated.items, ...items] });
    } else change({ ...next, items: [...next.items, { id: uid(), kind: tool as BoardItem["kind"], refs, color, width, dashed }] });
    setPending([]);
  }
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const v = position(e), target = (e.target as Element).closest<SVGElement>("[data-object]")?.dataset.object;
    if (tool === "erase") { if (target) change(removeFromScene(scene, target)); return; }
    if (tool === "select") { setSelected(target || null); gesture.current = { id: target, start: v, before: scene, view, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    if (tool === "stroke") { gesture.current = { start: v, before: scene, view, path: [v], moved: false }; e.currentTarget.setPointerCapture(e.pointerId); return; }
    addAt(v);
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current; if (!g) return;
    const v = position(e), dx = v.x - g.start.x, dy = v.y - g.start.y;
    if (Math.hypot(dx, dy) < 1 && !g.moved) return; g.moved = true;
    if (g.path) {
      if (g.path.length >= 2000) return;
      g.path.push(v); onChange({ ...g.before, items: [...g.before.items, { id: "drawing", kind: "stroke", refs: [], color, width, path: [...g.path], dashed }] });
    } else if (!g.id) {
      // Convert client delta against the original viewport to avoid cumulative drift.
      const rect = e.currentTarget.getBoundingClientRect(), scale = Math.max(g.view.width / rect.width, g.view.height / rect.height);
      const previousMatrix = svg.current?.getScreenCTM();
      if (previousMatrix) { const originScreen = new DOMPoint(g.start.x, g.start.y).matrixTransform(previousMatrix); setView(current => ({ ...current, x: current.x - (e.clientX - originScreen.x) * scale, y: current.y - (e.clientY - originScreen.y) * scale })); }
    } else {
      const p = g.before.points.find(p => p.id === g.id);
      if (p?.construction) return;
      if (p) onChange({ ...g.before, points: g.before.points.map(point => point.id === g.id ? { ...point, x: p.x + dx, y: p.y + dy } : point) });
      else {
        const shape = g.before.items.find(item => item.id === g.id), ancestors = new Set(shape?.refs || []);
        // A translated figure moves its free ancestors; derived geometry follows.
        for (let pass = 0; pass < g.before.points.length; pass++) {
          let added = false;
          for (const point of g.before.points) if (ancestors.has(point.id)) for (const ref of point.construction?.refs || []) if (!ancestors.has(ref)) { ancestors.add(ref); added = true; }
          if (!added) break;
        }
        onChange({ ...g.before, points: g.before.points.map(point => ancestors.has(point.id) && !point.construction ? { ...point, x: point.x + dx, y: point.y + dy } : point), items: g.before.items.map(item => item.id !== g.id ? item : { ...item, x: (item.x || 0) + dx, y: (item.y || 0) + dy, path: item.path?.map(p => ({ x: p.x + dx, y: p.y + dy })) }) });
      }
    }
  }
  function pointerUp() { const g = gesture.current; if (g?.moved && (g.id || g.path)) { setHistory(h => ({ past: [...h.past.slice(-39), g.before], future: [] })); if (g.path) onChange({ ...latest.current, items: latest.current.items.map(i => i.id === "drawing" ? { ...i, id: uid() } : i) }); } gesture.current = null; }
  function style(next: { color?: string; width?: number; dashed?: boolean }) {
    if (next.color) setColor(next.color); if (next.width) setWidth(next.width); if (next.dashed !== undefined) setDashed(next.dashed);
    if (selected && scene.items.some(i => i.id === selected)) change({ ...scene, items: scene.items.map(i => i.id === selected ? { ...i, ...next } : i) });
  }
  function insertText(kind: "text" | "graph" | "problem") { setValue(kind === "problem" ? scene.problem : kind === "graph" ? "x^2" : ""); setDialog(kind); }
  function applyDialog(e: React.FormEvent) {
    e.preventDefault(); if (!value.trim() && dialog !== "problem") return;
    if (dialog === "problem") change({ ...scene, problem: value.trim() });
    else { if (dialog === "graph") { try { if (!graphPaths(value).length) throw Error(); } catch { notify("Biểu thức chưa hợp lệ. Ví dụ: x^2, sin(x), 1/x. Dùng dấu * để nhân."); return; } }
      change({ ...scene, items: [...scene.items, { id: uid(), kind: dialog === "graph" ? "graph" : "text", refs: [], text: value.trim(), x: view.x + view.width * .25, y: view.y + view.height * .65, color, width }] }); }
    setDialog(null);
  }
  function solid(kind: string) {
    const current = latest.current, start = { x: view.x + view.width * .35, y: view.y + view.height * .35 };
    const coords = kind === "pyramid" ? [[0, 180], [200, 180], [275, 95], [75, 95], [135, -80]] : [[0, 180], [200, 180], [275, 95], [75, 95], [0, -20], [200, -20], [275, -105], [75, -105]];
    const ps: BoardPoint[] = [];
    coords.forEach(([x, y]) => ps.push(newPoint({ x: start.x + x, y: start.y + y }, { ...current, points: [...current.points, ...ps] })));
    const edges = kind === "pyramid" ? [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3]] : [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    change({ ...current, points: [...current.points, ...ps], items: [...current.items, ...edges.map(([a, b], index) => ({ id: uid(), kind: "segment" as const, refs: [ps[a].id, ps[b].id], color, width, dashed: [2, 3, 11].includes(index) }))] });
    notify("Đã thêm hình biểu diễn không gian trên bảng 2D. Kéo các đỉnh để điều chỉnh.");
  }
  async function exportPng() {
    if (!svg.current) return;
    try {
      const clone = svg.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", "1600"); clone.setAttribute("height", "1100");
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try { const image = new window.Image(); image.src = url; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 1100; const ctx = canvas.getContext("2d"); if (!ctx) throw Error(); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1600, 1100); ctx.drawImage(image, 0, 0); const anchor = document.createElement("a"); anchor.download = "mathvera-bang-toan.png"; anchor.href = canvas.toDataURL("image/png"); anchor.click(); } finally { URL.revokeObjectURL(url); }
    } catch { notify("Không xuất được ảnh. Hãy thử lại sau khi ảnh trên bảng đã tải xong."); }
  }
  function item(i: BoardItem) {
    const ps = i.refs.map(id => points.get(id)); if (i.refs.length && ps.some(p => !p)) return null;
    const [a, b] = ps as BoardPoint[];
    const props = { stroke: i.color, strokeWidth: i.width, strokeDasharray: i.dashed ? "8 6" : undefined, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    let content: React.ReactNode;
    if (["segment", "line", "ray"].includes(i.kind) && a && b) {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 1e-8) return null;
      const extent = Math.max(view.width, view.height) * 5 / len;
      const p = i.kind === "line" ? { x: a.x - dx * extent, y: a.y - dy * extent } : a;
      const q = i.kind === "segment" ? b : { x: a.x + dx * extent, y: a.y + dy * extent };
      content = <><line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={16} /><line {...props} x1={p.x} y1={p.y} x2={q.x} y2={q.y} /></>;
    } else if (i.kind === "circle" && a && b) content = <><circle cx={a.x} cy={a.y} r={distance(a, b)} fill="none" stroke="transparent" strokeWidth={16} /><circle {...props} cx={a.x} cy={a.y} r={distance(a, b)} /></>;
    else if (i.kind === "polygon") content = <polygon {...props} points={(ps as BoardPoint[]).map(p => `${p.x},${p.y}`).join(" ")} fill={i.fill ? i.color : "none"} fillOpacity={.075} />;
    else if (i.kind === "stroke") content = <path {...props} d={i.path?.map((p, n) => `${n ? "L" : "M"}${p.x},${p.y}`).join(" ")} />;
    else if (i.kind === "text") content = <g transform={`translate(${i.x},${i.y})`}><rect x={-8} y={-25} width={Math.min(650, Math.max(160, (i.text?.length || 0) * 10))} height={(i.text?.split("\n").length || 1) * 28 + 12} rx={6} fill="white" fillOpacity={.85} />{i.text?.split("\n").map((line, n) => <text key={n} y={n * 28} fill={i.color} fontFamily="Georgia,serif" fontSize={21}>{line}</text>)}</g>;
    else if (i.kind === "image" && i.data) content = <image href={i.data} x={i.x} y={i.y} width={280} height={200} preserveAspectRatio="xMidYMid meet" />;
    else if (i.kind === "graph") { let paths: string[] = []; try { paths = graphPaths(i.text || ""); } catch { return null; } content = <g><path d="M110 390H890M500 30V750" stroke="#a1a9ba" strokeWidth={1} />{paths.map((d, n) => <path key={n} {...props} d={d} />)}<text x={520} y={45} fill={i.color} fontSize={15}>y = {i.text}</text></g>; }
    return <g key={i.id} data-object={i.id} className={selected === i.id ? "mv-object-selected" : ""}>{content}</g>;
  }
  const instruction = tool in constructCounts ? `${toolNames[tool]} · chọn ${constructCounts[tool]} điểm theo thứ tự${tool === "foot" ? ": đỉnh, hai điểm trên cạnh" : tool === "intersection" ? ": hai điểm đường thứ nhất, hai điểm đường thứ hai" : ""} (${pending.length}/${constructCounts[tool]})` : tool === "polygon" ? `Chọn các đỉnh, bấm lại đỉnh đầu để khép hình (${pending.length} đỉnh)` : tool === "select" ? "Kéo điểm để thay đổi hình · Kéo vùng trống để di chuyển bảng" : `${toolNames[tool]} · bấm hoặc kéo trên bảng${pending.length ? " · chọn điểm tiếp theo" : ""}`;
  return <div className="mv-board-wrap">
    <div className="mv-toolbar" role="toolbar" aria-label="Công cụ bảng toán">
      <button className={tool === "select" ? "active" : ""} onClick={() => choose("select")}><MousePointer2 size={16} />Chọn</button>
      <button className={tool === "point" ? "active" : ""} onClick={() => choose("point")}>• Điểm</button>
      <button onClick={() => insertText("text")}>ƒ Công thức / Chữ</button>
      <button className={tool === "stroke" ? "active" : ""} onClick={() => choose("stroke")}><PenLine size={15} />Bút</button>
      <button className={tool === "erase" ? "active" : ""} onClick={() => choose("erase")}><Eraser size={15} />Tẩy</button>
      <details className="mv-tool-menu"><summary><span style={{ background: color }} className="mv-color-dot" />Màu & nét</summary><div className="mv-popover"><span>{selected ? "Đối tượng đang chọn" : "Hình vẽ tiếp theo"}</span><div className="mv-swatches">{colors.map(c => <button key={c} aria-label={`Màu ${c}`} style={{ background: c }} onClick={() => style({ color: c })} />)}</div><label>Độ dày<select aria-label="Độ dày nét" value={width} onChange={e => style({ width: Number(e.target.value) })}>{[1, 2, 3, 5, 8].map(w => <option key={w} value={w}>{w} px</option>)}</select></label><label><input type="checkbox" checked={dashed} onChange={e => style({ dashed: e.target.checked })} /> Nét đứt</label></div></details>
      <button onClick={() => uploader.current?.click()}><ImagePlus size={16} />Ảnh</button>
      {(["segment", "line", "ray", "circle", "polygon"] as const).map(t => <button key={t} className={tool === t ? "active" : ""} onClick={() => choose(t)}>{t === "circle" ? <Circle size={15} /> : t === "polygon" ? <Triangle size={15} /> : <Minus size={15} />}{toolNames[t]}</button>)}
      <select aria-label="Dựng hình" value={tool in constructCounts ? tool : ""} onChange={e => { if (e.target.value) choose(e.target.value); }}><option value="">△ Dựng hình</option>{Object.keys(constructCounts).map(t => <option key={t} value={t}>{toolNames[t]}</option>)}</select>
      <details className="mv-tool-menu"><summary><Shapes size={15} />Không gian</summary><div className="mv-popover"><button onClick={() => solid("pyramid")}>△ Hình chóp</button><button onClick={() => solid("box")}>▱ Hình hộp</button><small>Hình biểu diễn 2D</small></div></details>
      <button onClick={() => insertText("graph")}>ƒ Đồ thị</button>
      <span className="mv-toolbar-divider" /><button title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác" disabled={!history.past.length} onClick={undo}><Undo2 size={17} /></button><button title="Làm lại" aria-label="Làm lại" disabled={!history.future.length} onClick={redo}><Redo2 size={17} /></button>
      <button title="Xóa đối tượng" aria-label="Xóa đối tượng" disabled={!selected} onClick={deleteSelection}><Trash2 size={16} /></button><button onClick={exportPng}><Download size={16} />PNG</button>
    </div>
    <div className="mv-board-surface">
      <svg ref={svg} role="application" aria-label="Bảng toán tương tác" className={`mv-canvas tool-${tool}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>
        <defs><pattern id="mv-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#e5e9f0" strokeWidth=".7" /></pattern></defs>
        <rect x={view.x - 50000} y={view.y - 50000} width={100000} height={100000} fill="#fcfdff" />
        {grid && <rect x={view.x - 50000} y={view.y - 50000} width={100000} height={100000} fill="url(#mv-grid)" />}
        {scene.items.map(item)}
        {scene.points.map(p => { const v = points.get(p.id); if (!v) return null; return <g key={p.id} data-object={p.id} className="mv-board-point"><circle cx={v.x} cy={v.y} r={pending.includes(p.id) || selected === p.id ? 10 : 5} fill={pending.includes(p.id) ? "#f4a329" : "#3877e9"} stroke="white" strokeWidth={1.5} /><circle cx={v.x} cy={v.y} r={15} fill="transparent" /><text x={v.x + 10} y={v.y - 10} fontSize={18} fill="#24354c" fontFamily="Georgia,serif">{p.label}</text></g>; })}
        {scene.points.filter(p => p.construction?.kind === "foot").map(p => { const q = points.get(p.id), source = points.get(p.construction!.refs[0]), base = points.get(p.construction!.refs[1]); if (!q || !source || !base) return null; const u = { x: source.x - q.x, y: source.y - q.y }, v = { x: base.x - q.x, y: base.y - q.y }, a = Math.hypot(u.x, u.y), b = Math.hypot(v.x, v.y); if (a < 1 || b < 1) return null; const x = u.x / a * 12, y = u.y / a * 12, xx = v.x / b * 12, yy = v.y / b * 12; return <path key={`angle-${p.id}`} d={`M${q.x + x},${q.y + y}l${xx},${yy}l${-x},${-y}`} fill="none" stroke="#139c81" strokeWidth={2} pointerEvents="none" />; })}
      </svg>
      {!!scene.problem && <aside className="mv-board-problem"><div><span>▤ ĐỀ BÀI</span><button title="Sửa đề" onClick={() => insertText("problem")}><PenLine size={13} /></button></div><FormattedAIAnswer text={scene.problem} /></aside>}
      <div className="mv-board-bottom"><button onClick={() => setView(fitView(scene))}><Move size={14} />Vừa khung</button><div className="mv-zoom"><button aria-label="Thu nhỏ" onClick={() => setView(v => ({ x: v.x - v.width * .1, y: v.y - v.height * .1, width: Math.min(20000, v.width * 1.2), height: Math.min(15200, v.height * 1.2) }))}><ZoomOut size={17} /></button><span>{Math.round(100000 / view.width)}%</span><button aria-label="Phóng to" onClick={() => setView(v => ({ x: v.x + v.width / 12, y: v.y + v.height / 12, width: Math.max(150, v.width / 1.2), height: Math.max(114, v.height / 1.2) }))}><ZoomIn size={17} /></button></div><label className="mv-grid-toggle"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />Lưới</label></div>
      <div className="mv-instruction" role="status">{instruction}</div>
    </div>
    <input ref={uploader} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const data = await readImage(file); change({ ...latest.current, items: [...latest.current.items, { id: uid(), kind: "image", refs: [], data, x: view.x + 200, y: view.y + 200, color, width }] }); } catch (error) { notify((error as Error).message); } }} />
    {dialog && <div className="mv-modal-backdrop"><form className="mv-modal" role="dialog" aria-modal="true" aria-label={dialog === "problem" ? "Chỉnh đề bài" : dialog === "graph" ? "Thêm đồ thị" : "Thêm công thức"} onSubmit={applyDialog}><div className="mv-modal-title"><h2>{dialog === "problem" ? "Đề bài trên bảng" : dialog === "graph" ? "Vẽ đồ thị hàm số" : "Viết công thức & lời giải"}</h2><button type="button" aria-label="Đóng" onClick={() => setDialog(null)}><X size={18} /></button></div><label>{dialog === "graph" ? "Biểu thức y =" : "Nội dung"}<textarea autoFocus required={dialog !== "problem"} aria-label="Nội dung trên bảng" rows={5} maxLength={dialog === "graph" ? 256 : 4000} value={value} onChange={e => setValue(e.target.value)} /></label><small>{dialog === "graph" ? "Ví dụ: x^2, sin(x), 1/x, sqrt(x). Dùng * để nhân; đồ thị dùng tỷ lệ cố định." : "Công thức LaTeX hiển thị dạng nguồn trên bảng; xem công thức đã định dạng trong bài học."}</small><div className="mv-modal-actions"><button type="button" onClick={() => setDialog(null)}>Hủy</button><button className="mv-primary" type="submit">{dialog === "problem" ? "Cập nhật" : "Thêm lên bảng"}<ArrowRight size={15} /></button></div></form></div>}
  </div>;
}
