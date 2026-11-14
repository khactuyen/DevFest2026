"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Circle, Dot, Group, Minus, MousePointer2, MoveHorizontal, Palette, Pentagon, Redo2, Ruler, Tags, Triangle, Undo2, X } from "lucide-react";
import type { VisualRuntime, VertexHit, LineHit } from "@/lib/runtime";
import type { DirectTool } from "@/lib/explore-direct-constructions";
import type { StrokePatch } from "@/lib/visual-edge-style";
import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";
import { DRAWING_TOOLS, type DrawingStyle, type DrawingTool } from "@/lib/explore-drawing-constructions";
import { ExploreGeometryEditor } from "./ExploreGeometryEditor";

type Props = {
  stage: HTMLElement | null; disabled: boolean; sceneKey: string; cancelRevision: number;
  getRuntime: () => VisualRuntime | BlankBoardRuntime | null;
  onCommit: (tool: DrawingTool, hits: VertexHit[], style: DrawingStyle) => void;
  onDirect: (tool: DirectTool, lines: LineHit[], through: VertexHit | null, style: DrawingStyle) => void;
  selectedStyle: { color: string; strokeWidth: number; lineStyle: "solid" | "dashed"; label: string } | null;
  onSelectedStyle: (patch: StrokePatch) => void;
  onActiveChange: (active: boolean) => void;
  onTranslate: (ids: string[], dx: number, dy: number) => void;
  onLabel: (id: string, offset: [number, number]) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
};
type Choice = { hit: VertexHit; x: number; y: number };
const BASIC_TOOL_ICONS = { point: Dot, segment: Minus, line: MoveHorizontal, ray: ArrowUpRight, circle: Circle, triangle: Triangle, polygon: Pentagon };
const BASIC_TOOLS = Object.keys(BASIC_TOOL_ICONS) as (keyof typeof BASIC_TOOL_ICONS)[];

export function ExploreDrawingTools({ stage, disabled, sceneKey, cancelRevision, getRuntime, onCommit, onDirect, selectedStyle, onSelectedStyle, onActiveChange, onTranslate, onLabel, onUndo, onRedo, canUndo, canRedo }: Props) {
  const [editing, setEditing] = useState<"group" | "labels" | null>(null);
  const [tool, setTool] = useState<DrawingTool | null>(null), [choices, setChoices] = useState<Choice[]>([]), [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [style, setStyle] = useState<DrawingStyle>({ color: "#168265", strokeWidth: 2.25, lineStyle: "solid", autoMarks: true });
  const [direct, setDirect] = useState(true), [lines, setLines] = useState<LineHit[]>([]);
  const [scope, setScope] = useState<"new" | "selected">("new");
  const selectedScope = scope === "selected" && selectedStyle !== null;
  const shownStyle = selectedScope ? selectedStyle! : style;
  const updateStyle = (patch: StrokePatch) => { if (selectedScope) onSelectedStyle(patch); else setStyle(s => ({ ...s, ...patch })); };
  const supportsDirect = tool && ["parallel", "perpendicular", "intersection", "markLength"].includes(tool);
  const stepCount = supportsDirect && direct ? 2 : tool ? DRAWING_TOOLS[tool].count : 0;
  const stepIndex = supportsDirect && direct ? lines.length : choices.length;
  const directHelp = tool === "parallel" || tool === "perpendicular" ? "Bấm thân đường/cạnh → chọn điểm đi qua. Điểm trống hoặc điểm trên cạnh đều được." : tool === "markLength" ? "Bấm hai đoạn/cạnh khác nhau. Ký hiệu chỉ xuất hiện khi độ dài theo tọa độ bằng nhau; không phải chứng minh." : "Bấm hai đường/cạnh. Dựng giao hai đường thẳng chứa cạnh, kể cả ngoài đoạn.";
  const [snap, setSnap] = useState(true), [failure, setFailure] = useState("");
  const [hoverLabel, setHoverLabel] = useState("");
  const down = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { onActiveChange(Boolean(tool || editing) && !disabled); }, [tool, editing, disabled, onActiveChange]);
  useEffect(() => { setTool(null); setEditing(null); setChoices([]); setLines([]); setCursor(null); setFailure(""); }, [sceneKey, disabled, cancelRevision]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setTool(null); setEditing(null); setChoices([]); setLines([]); setCursor(null); setFailure(""); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  useEffect(() => { if (!stage) return; const resize = new ResizeObserver(() => { setChoices([]); setLines([]); setCursor(null); }); resize.observe(stage); return () => resize.disconnect(); }, [stage]);
  function choose(next: DrawingTool | null) { setEditing(null); setTool(next); setChoices([]); setLines([]); setCursor(null); setFailure(""); }
  function finish(selected = choices) {
    if (!tool) return;
    try { onCommit(tool, selected.map(c => c.hit), style); setChoices([]); setCursor(null); setFailure(""); }
    catch (error) { setFailure(error instanceof Error ? error.message : "Không dựng được hình. Hãy chọn lại điểm."); setChoices([]); }
  }
  function click(e: React.PointerEvent) {
    if (!tool || !stage || disabled) return;
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 8) { down.current = null; return; }
    down.current = null;
    const active = getRuntime(); if (!active) { setFailure("Bảng đang khởi tạo. Hãy thử lại khi hình đã hiển thị."); return; }
    if (direct && supportsDirect) {
      try {
        if (!lines.length || tool === "intersection" || tool === "markLength") {
          const hit = "pickLineAt" in active ? active.pickLineAt(e.clientX, e.clientY) : null;
          if (!hit) { setFailure("Hãy bấm thân một đường hoặc cạnh đang hiện, không chọn vùng trống/đường tròn."); return; }
          if (lines.some(l => l.sourceId === hit.sourceId && l.edgeIndex === hit.edgeIndex)) { setFailure("Chọn đường/cạnh khác."); return; }
          const next = [...lines, hit]; setFailure("");
          if (next.length === 2) { onDirect(tool as DirectTool, next, null, style); setLines([]); }
          else setLines(next);
        } else {
          const point = "pickConnectionPointAt" in active ? active.pickConnectionPointAt(e.clientX, e.clientY, snap) : null;
          if (!point) throw Error("Chưa đọc được điểm đi qua.");
          onDirect(tool as DirectTool, lines, point, style); setLines([]); setFailure("");
        }
      } catch (error) { setFailure(error instanceof Error ? error.message : "Không dựng được từ cạnh đã chọn."); setLines([]); }
      return;
    }
    let hit = "pickConnectionPointAt" in active ? active.pickConnectionPointAt(e.clientX, e.clientY, snap) : null;
    if (!hit) { const p = active.screenToUser(e.clientX, e.clientY); if (p) hit = { objectId: "free", label: "Điểm tự do", position: [p.x, p.y, 0], free: true }; }
    if (!hit) return;
    const rect = stage.getBoundingClientRect(), screen = active.userToScreen(hit.position[0], hit.position[1]);
    const next = { hit, x: (screen?.x ?? e.clientX) - rect.left, y: (screen?.y ?? e.clientY) - rect.top };
    const same = (a: VertexHit, b: VertexHit) => Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) < 1e-7;
    if (tool === "polygon" && choices.length >= 3 && same(hit, choices[0].hit)) { finish(); return; }
    if (Object.hasOwn(BASIC_TOOL_ICONS, tool) && choices.some(c => same(c.hit, hit))) { setFailure("Điểm đã chọn. Hãy chọn điểm khác hoặc bấm Khép hình với đa giác."); return; }
    setFailure(""); const selected = [...choices, next];
    if (tool === "polygon") { if (selected.length > 12) { setFailure("Đa giác tối đa 12 đỉnh."); return; } setChoices(selected); }
    else if (selected.length === DRAWING_TOOLS[tool].count) finish(selected);
    else setChoices(selected);
  }
  return <>
    {tool && ["rotate","dilate","translate"].includes(tool) && <label style={{fontSize:12,display:"inline-flex",gap:6,alignItems:"center"}}>Giá trị {tool==="rotate"?"góc (°)":"k"}<input aria-label="Giá trị phép biến hình" type="number" value={style.factor ?? 1} onChange={e=>setStyle(s=>({...s,factor:Number(e.target.value)}))} style={{width:72,border:"1px solid #d5e4db",borderRadius:5,padding:4}}/></label>}
    <div className="explore-drawing-toolbar" data-active={Boolean(tool || editing)} role="toolbar" aria-label="Vẽ và dựng hình chính xác">
      <div className="explore-drawing-primary" role="group" aria-label="Công cụ cơ bản">
      <button type="button" title="Nhấp để chọn, giữ và kéo thân hình để di chuyển" className={!tool && !editing ? "active" : ""} aria-pressed={!tool && !editing} onClick={() => choose(null)}><MousePointer2 size={13} />Chọn / Kéo</button>
      <button type="button" title="Kéo nhóm" disabled={disabled} aria-pressed={editing === "group"} className={editing === "group" ? "active" : ""} onClick={() => { const next = editing === "group" ? null : "group"; choose(null); setEditing(next); }}><Group size={14} aria-hidden="true"/>Kéo nhóm</button>
      <button type="button" title="Kéo nhãn" disabled={disabled} aria-pressed={editing === "labels"} className={editing === "labels" ? "active" : ""} onClick={() => { const next = editing === "labels" ? null : "labels"; choose(null); setEditing(next); }}><Tags size={14} aria-hidden="true"/>Kéo nhãn</button>
      {BASIC_TOOLS.map(t => { const Icon = BASIC_TOOL_ICONS[t]; return <button key={t} type="button" disabled={disabled} title={DRAWING_TOOLS[t].help} className={tool === t ? "active" : ""} aria-pressed={tool === t} onClick={() => choose(tool === t ? null : t)}><Icon size={14} aria-hidden="true"/>{DRAWING_TOOLS[t].label}</button>; })}
      </div>
      <label className="explore-construction-select" title={tool ? DRAWING_TOOLS[tool].label : "Dựng hình"}><Ruler size={14} aria-hidden="true"/><select aria-label="Phép dựng hình 2D" disabled={disabled} value={tool && !Object.hasOwn(BASIC_TOOL_ICONS, tool) ? tool : ""} onChange={e => choose((e.target.value || null) as DrawingTool | null)}><option value="">Dựng hình</option>{Object.entries(DRAWING_TOOLS).filter(([t]) => !Object.hasOwn(BASIC_TOOL_ICONS, t)).map(([t, v]) => <option key={t} value={t}>{v.label}</option>)}</select></label>
      <details className="explore-drawing-options"><summary title="Kiểu nét và bắt điểm" aria-label={selectedScope ? "Cạnh đang chọn" : "Nét mới"}><Palette size={14} aria-hidden="true"/><span>{selectedScope ? "Cạnh đang chọn ▾" : "Nét mới ▾"}</span></summary><div className="explore-drawing-style">{supportsDirect && <label className="explore-direct-toggle"><input type="checkbox" aria-label="Chọn cạnh trực tiếp" checked={direct} onChange={e => { setDirect(e.target.checked); setLines([]); setChoices([]); setFailure(""); }} />Chọn cạnh trực tiếp</label>}<label>Phạm vi<select aria-label="Phạm vi kiểu nét" value={selectedScope ? "selected" : "new"} onChange={e => setScope(e.target.value as "new" | "selected")}><option value="new">Mặc định hình mới</option><option value="selected" disabled={!selectedStyle}>Chỉ cạnh đang chọn</option></select></label><small>{selectedScope ? `${selectedStyle!.label} · Không đổi mặc định hình mới.` : "Chỉ áp dụng cho hình dựng tiếp theo, không sửa hình đã có."}</small><label>Màu<input aria-label="Màu trong phạm vi" type="color" value={shownStyle.color} onChange={e => updateStyle({ color: e.target.value })} /></label><label>Độ dày<select aria-label="Độ dày trong phạm vi" value={shownStyle.strokeWidth} onChange={e => updateStyle({ strokeWidth: Number(e.target.value) })}>{[1, 2.25, 4, 6].map(w => <option key={w} value={w}>{w} px</option>)}</select></label><label><input aria-label="Nét đứt trong phạm vi" type="checkbox" checked={shownStyle.lineStyle === "dashed"} onChange={e => updateStyle({ lineStyle: e.target.checked ? "dashed" : "solid" })} />Nét đứt</label><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Bắt đỉnh và cạnh</label><label><input aria-label="Tự vẽ ký hiệu" type="checkbox" checked={style.autoMarks !== false} onChange={e => setStyle(s => ({ ...s, autoMarks: e.target.checked }))} />Tự vẽ ký hiệu quan sát</label><small>Ký hiệu không phải chứng minh. Mất quan hệ sẽ ẩn ký hiệu và cảnh báo.</small></div></details>

      <span className="explore-drawing-history"><button type="button" aria-label="Hoàn tác hình học" disabled={!canUndo} onClick={() => { choose(null); onUndo(); }}><Undo2 size={14} /></button><button type="button" aria-label="Làm lại hình học" disabled={!canRedo} onClick={() => { choose(null); onRedo(); }}><Redo2 size={14} /></button></span>
      <div className="explore-drawing-instruction" role="status"><b>{editing === "group" ? "Kéo nhóm" : editing === "labels" ? "Kéo nhãn" : tool ? DRAWING_TOOLS[tool].label : "Chọn / Kéo"}</b><span>{editing === "group" ? "Kéo khung chọn hình, rồi kéo bên trong khung để dời các điểm gốc. Hình dùng chung điểm gốc cũng cập nhật theo. Thả để áp dụng; Esc: thoát." : editing === "labels" ? "Kéo khung quanh nhãn để dời tên, không đổi tọa độ hình. Thả để áp dụng; Esc: thoát." : supportsDirect && direct ? directHelp : tool ? DRAWING_TOOLS[tool].help : "Kéo điểm gốc để thay đổi hình. Chọn cạnh để sửa màu, nét và thông tin."}</span>{tool && <><small aria-live="polite">{tool === "polygon" ? `${choices.length} đỉnh · chọn đỉnh đầu để khép` : `Bước ${stepIndex + 1}/${stepCount}`} · {lines.length ? `${lines.length} cạnh đã chọn` : `${choices.length} điểm đã chọn`}</small>{tool === "polygon" && choices.length >= 3 && <button type="button" onClick={() => finish()}><Check size={12} />Khép hình</button>}<button type="button" aria-label="Hủy phép dựng" onClick={() => choose(null)}><X size={13} /></button></>}</div>
      {disabled && <small className="explore-drawing-disabled">Chuyển về 2D để dựng hình có ràng buộc.</small>}
      {failure && <div className="explore-drawing-error" role="alert">{failure}<button type="button" onClick={() => setFailure("")} aria-label="Đóng lỗi phép dựng"><X size={12} /></button></div>}
    </div>
    {stage && editing && !disabled && <ExploreGeometryEditor stage={stage} mode={editing} getRuntime={getRuntime} onTranslate={onTranslate} onLabel={onLabel} />}
    {stage && tool && !disabled && createPortal(<div className="explore-drawing-capture" data-tool={tool} aria-label="Vùng chọn điểm dựng hình" onPointerDown={e => { down.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={click} onPointerMove={e => {
      const rect = stage.getBoundingClientRect(), active = getRuntime();
      const hit = active && "pickConnectionPointAt" in active ? active.pickConnectionPointAt(e.clientX, e.clientY, snap) : null;
      const screen = hit && active ? active.userToScreen(hit.position[0], hit.position[1]) : null;
      setHoverLabel(hit && !hit.free ? `Bắt: ${hit.label}` : "Vị trí tự do");
      setCursor({ x: (screen?.x ?? e.clientX) - rect.left, y: (screen?.y ?? e.clientY) - rect.top });
    }}>
      <svg aria-hidden="true" width="100%" height="100%">{lines.map((line, i) => { const r = stage.getBoundingClientRect(), rt = getRuntime(); return <polyline key={i} points={line.coordinates.map(([x,y]) => { const p = rt?.userToScreen(x,y); return p ? `${p.x-r.left},${p.y-r.top}` : ""; }).join(" ")} fill="none" stroke="#d97706" strokeWidth="5" opacity=".7" />; })}<polyline points={[...choices, ...(cursor ? [cursor] : [])].map(c => `${c.x},${c.y}`).join(" ")} fill="none" stroke={style.color} strokeWidth="1.5" strokeDasharray="5 5" />{choices.map((c, i) => <g key={i}><circle cx={c.x} cy={c.y} r="8" fill="white" stroke={style.color} strokeWidth="2" /><text x={c.x + 12} y={c.y - 10} fontSize="12" fill="#145c42">{c.hit.free ? `Điểm ${i + 1}` : c.hit.label}</text></g>)}{cursor && <g><circle cx={cursor.x} cy={cursor.y} r="5" fill={style.color} /><text x={cursor.x+10} y={cursor.y-12} fill="#145c42" fontSize="11">{hoverLabel}</text></g>}</svg>
    </div>, stage)}
  </>;
}
