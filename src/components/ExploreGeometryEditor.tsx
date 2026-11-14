"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VisualRuntime } from "@/lib/runtime";
import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";

type Rect = { x: number; y: number; width: number; height: number };
type LabelHandle = ReturnType<VisualRuntime["labelHandles"]>[number];
type Props = {
  stage: HTMLElement; mode: "group" | "labels";
  getRuntime: () => VisualRuntime | BlankBoardRuntime | null;
  onTranslate: (ids: string[], dx: number, dy: number) => void;
  onLabel: (id: string, offset: [number, number]) => void;
};

export function ExploreGeometryEditor({ stage, mode, getRuntime, onTranslate, onLabel }: Props) {
  const [labels, setLabels] = useState<LabelHandle[]>([]), [box, setBox] = useState<Rect | null>(null);
  const [ids, setIds] = useState<string[]>([]), [error, setError] = useState("");
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const callbacks = useRef({ getRuntime, onTranslate, onLabel }); callbacks.current = { getRuntime, onTranslate, onLabel };
  const gesture = useRef<{ pointerId: number; x: number; y: number; kind: "select" | "move"; before: Rect | null } | null>(null);
  const labelGesture = useRef<{ pointerId: number; label: LabelHandle; x: number; y: number } | null>(null);
  useEffect(() => {
    setBox(null); setIds([]); setError(""); setDelta({ x: 0, y: 0 });
    const refresh = () => { const rt = callbacks.current.getRuntime(); if (rt && "labelHandles" in rt && !labelGesture.current) setLabels(rt.labelHandles()); };
    refresh(); const timer = window.setInterval(refresh, 250);
    const resize = new ResizeObserver(() => { setBox(null); setIds([]); }); resize.observe(stage);
    return () => { clearInterval(timer); resize.disconnect(); };
  }, [stage, mode]);
  const relative = (e: React.PointerEvent) => { const rect = stage.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
  const selection = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
  const end = (e: React.PointerEvent) => {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return; gesture.current = null;
    const p = relative(e), rt = callbacks.current.getRuntime(); if (!rt) return;
    if (g.kind === "select") {
      const rect = selection(g, p), origin = stage.getBoundingClientRect();
      const objects = "objectsInScreenRect" in rt ? rt.objectsInScreenRect({ ...rect, x: rect.x + origin.left, y: rect.y + origin.top }) : [];
      setIds(objects.map(o => o.id)); setBox(objects.length ? rect : null);
      if (!objects.length) setError("Không có hình trong khung. Kéo một khung khác để chọn.");
    } else {
      const origin = stage.getBoundingClientRect();
      const a = rt.screenToUser(g.x + origin.left, g.y + origin.top), b = rt.screenToUser(e.clientX, e.clientY);
      if (!a || !b || Math.hypot(p.x - g.x, p.y - g.y) < 2) return;
      try { callbacks.current.onTranslate(ids, b.x - a.x, b.y - a.y); }
      catch (err) { setBox(g.before); setError(err instanceof Error ? err.message : "Không thể kéo nhóm này."); }
    }
  };
  const rect = stage.getBoundingClientRect();
  return createPortal(<div className={`explore-geometry-editor is-${mode}`} aria-label={mode === "group" ? "Chọn và kéo nhóm hình" : "Kéo nhãn hình"}
    onPointerDown={e => {
      if (mode !== "group" || e.button !== 0 || gesture.current) return;
      const p = relative(e), move = box && ids.length && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
      gesture.current = { ...p, pointerId: e.pointerId, kind: move ? "move" : "select", before: box }; setError("");
      if (!move) { setBox({ ...p, width: 0, height: 0 }); setIds([]); }
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {
      const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return; const p = relative(e);
      setBox(g.kind === "move" && g.before ? { ...g.before, x: g.before.x + p.x - g.x, y: g.before.y + p.y - g.y } : selection(g, p));
    }} onPointerUp={end} onPointerCancel={e => { if (gesture.current?.pointerId === e.pointerId) { setBox(gesture.current.before); gesture.current = null; } }}>
    {mode === "group" && box && <div className="explore-group-box" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}><span>{ids.length ? `${ids.length} đối tượng · kéo khung để dời nhóm` : "Đang chọn nhóm…"}</span></div>}
    {mode === "labels" && labels.map(label => <button type="button" key={label.id} className="explore-label-handle" aria-label={`Kéo nhãn ${label.text}`} data-label-id={label.id}
      style={{ left: label.x - rect.left - 4 + (labelGesture.current?.label.id === label.id ? delta.x : 0), top: label.y - rect.top - 4 + (labelGesture.current?.label.id === label.id ? delta.y : 0), width: Math.max(20, label.width + 8), height: Math.max(22, label.height + 8) }}
      onPointerDown={e => { e.stopPropagation(); if (e.button !== 0 || labelGesture.current) return; labelGesture.current = { pointerId: e.pointerId, label, x: e.clientX, y: e.clientY }; setDelta({ x: 0, y: 0 }); setError(""); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { e.stopPropagation(); const g = labelGesture.current; if (g?.pointerId === e.pointerId) setDelta({ x: e.clientX - g.x, y: e.clientY - g.y }); }}
      onPointerUp={e => {
        e.stopPropagation(); const g = labelGesture.current; if (!g || g.pointerId !== e.pointerId) return; labelGesture.current = null; setDelta({ x: 0, y: 0 });
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 2) return;
        try { callbacks.current.onLabel(g.label.id, [g.label.offset[0] + e.clientX - g.x, g.label.offset[1] - e.clientY + g.y]); }
        catch (err) { setError(err instanceof Error ? err.message : "Không dời được nhãn."); }
      }} onPointerCancel={e => { e.stopPropagation(); if (labelGesture.current?.pointerId === e.pointerId) { labelGesture.current = null; setDelta({ x: 0, y: 0 }); } }} />)}
    {error && <div className="explore-editor-error" role="alert">{error}<button type="button" onClick={e => { e.stopPropagation(); setError(""); }}>Đóng</button></div>}
  </div>, stage);
}
