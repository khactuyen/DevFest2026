"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Sparkles, Trash2 } from "lucide-react";
import { createHandwritingImageDataUrl } from "@/lib/handwriting-image";
import {
  INK_WIDTH,
  INK_HEIGHT,
  normalizeInk,
  sketchProgram,
  type InkPoint,
  type InkStroke,
} from "@/lib/sketch-geometry";
import {
  AgentResultSchema,
  type AgentResult,
  type VisualProgram,
} from "@/lib/contracts";
import { request } from "@/lib/client";

type Props = {
  active: boolean;
  onPreview: (program: VisualProgram | null) => void;
  onRecognized: (result: AgentResult) => void;
};
export function LiveSketchPad({ active, onPreview, onRecognized }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<InkStroke[]>([]),
    undo = useRef<InkStroke[][]>([]),
    redo = useRef<InkStroke[][]>([]);
  const pointer = useRef<number | null>(null),
    revision = useRef(0),
    controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onPreview, onRecognized });
  callbacks.current = { onPreview, onRecognized };
  const [live, setLive] = useState(true),
    [erasing, setErasing] = useState(false),
    [color, setColor] = useState("#173e31");
  const [status, setStatus] = useState(
      "Vẽ hình hoặc công thức; hình phác xuất hiện ngay phía trên.",
    ),
    [failure, setFailure] = useState("");
  const [processing, setProcessing] = useState(false);
  function cancel() {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    timer.current = null;
    previewTimer.current = null;
  }
  useEffect(() => {
    if (!active) {
      cancel();
      pointer.current = null;
      setProcessing(false);
    }
    return cancel;
  }, [active]);

  function paint() {
    const c = canvas.current,
      ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) {
      if (!s.points.length) continue;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      s.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  }
  function preview() {
    previewTimer.current = null;
    const plan = normalizeInk(strokes.current);
    callbacks.current.onPreview(plan ? sketchProgram(plan) : null);
    if (plan?.ambiguities.length) setStatus(plan.ambiguities.join(" "));
    else if (plan?.description.includes("Đã tự nắn"))
      setStatus(plan.description);
  }
  function changed() {
    paint();
    if (!previewTimer.current) previewTimer.current = setTimeout(preview, 100);
  }
  function saveUndo() {
    undo.current.push(structuredClone(strokes.current));
    undo.current = undo.current.slice(-20);
    redo.current = [];
  }
  function position(event: React.PointerEvent<HTMLCanvasElement>): InkPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          INK_WIDTH,
          ((event.clientX - rect.left) * INK_WIDTH) / rect.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          INK_HEIGHT,
          ((event.clientY - rect.top) * INK_HEIGHT) / rect.height,
        ),
      ),
    };
  }
  function erase(p: InkPoint) {
    // Whole-stroke eraser keeps bitmap, vector preview and AI input in sync.
    strokes.current = strokes.current.filter(
      (s) =>
        !s.points.some((b, i) => {
          const a = s.points[Math.max(0, i - 1)],
            dx = b.x - a.x,
            dy = b.y - a.y,
            length = dx * dx + dy * dy;
          const t = length
            ? Math.max(
                0,
                Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
              )
            : 0;
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 16;
        }),
    );
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== null || event.button !== 0) return;
    cancel();
    setProcessing(false);
    setFailure("");
    saveUndo();
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (erasing) erase(position(event));
    else {
      if (strokes.current.length >= 80) {
        pointer.current = null;
        setFailure("Bảng đạt 80 nét. Hãy xóa bớt trước khi vẽ tiếp.");
        return;
      }
      strokes.current.push({ color, points: [position(event)] });
    }
    setStatus(
      "Chuẩn hóa nét trực tiếp tại máy · chưa xác nhận quan hệ toán học",
    );
    changed();
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    const p = position(event);
    if (erasing) erase(p);
    else {
      const s = strokes.current.at(-1);
      if (!s) return;
      const last = s.points.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      if (s.points.length >= 1200)
        s.points = s.points.filter((_, i) => i % 2 === 0);
      s.points.push(p);
    }
    changed();
  }
  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (live && active && strokes.current.some((s) => s.points.length > 1)) {
      setStatus("Hình phác đã cập nhật · AI sẽ đọc sau khi dừng bút 1 giây…");
      timer.current = setTimeout(() => void recognize(), 1000);
    } else if (!strokes.current.length) setStatus("Bảng trống. Vẽ để bắt đầu.");
  }
  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    move(event);
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    preview();
    schedule();
  }
  async function recognize() {
    if (!canvas.current || pointer.current !== null) return;
    cancel();
    const current = revision.current,
      abort = new AbortController();
    controller.current = abort;
    setProcessing(true);
    setFailure("");
    setStatus("AI đang đọc toàn bộ hình; bạn có thể tiếp tục vẽ.");
    try {
      const imageDataUrl = await createHandwritingImageDataUrl(canvas.current);
      if (current !== revision.current) return;
      const draft = normalizeInk(strokes.current);
      const data = await request<{
        result: AgentResult;
        ambiguities: string[];
      }>("/api/sketch", {
        method: "POST",
        signal: abort.signal,
        body: JSON.stringify({
          imageDataUrl,
          mode: "handwriting",
          ...(draft && !draft.ambiguities.length ? { draft } : {}),
        }),
      });
      if (current !== revision.current || abort.signal.aborted) return;
      const result = AgentResultSchema.parse(data.result);
      callbacks.current.onRecognized(result);
      setStatus(
        `AI đã dựng lại hình theo ảnh · cần đối chiếu với nét gốc.${data.ambiguities.length ? ` Chưa chắc: ${data.ambiguities.join("; ")}` : ""}`,
      );
    } catch (reason) {
      if (current !== revision.current || abort.signal.aborted) return;
      setFailure((reason as Error).message);
      setStatus("Đang giữ bản chuẩn hóa tại máy. Vẽ thêm hoặc nhấn thử lại.");
    } finally {
      if (current === revision.current) {
        setProcessing(false);
        controller.current = null;
      }
    }
  }
  function restore(direction: "undo" | "redo") {
    const src = direction === "undo" ? undo : redo,
      dest = direction === "undo" ? redo : undo;
    const snapshot = src.current.pop();
    if (!snapshot) return;
    cancel();
    setProcessing(false);
    setFailure("");
    dest.current.push(structuredClone(strokes.current));
    strokes.current = snapshot;
    paint();
    preview();
    schedule();
  }
  return (
    <section
      className="explore-handwriting explore-v2-handwriting live-sketch-pad"
      aria-label="Bảng vẽ trực tiếp"
    >
      <header>
        <b>Viết công thức hoặc vẽ hình phác</b>
        <div>
          <button
            type="button"
            aria-pressed={live}
            onClick={() => {
              cancel();
              setProcessing(false);
              setLive(!live);
              setStatus(
                live
                  ? "AI tự động đã tạm dừng. Nét vẽ vẫn chuẩn hóa trực tiếp."
                  : "AI tự động đã bật. Vẽ tiếp hoặc nhấn nhận diện.",
              );
            }}
          >
            AI tự động: {live ? "Bật" : "Tắt"}
          </button>
          <button
            type="button"
            onClick={() => restore("undo")}
            aria-label="Hoàn tác nét viết"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => restore("redo")}
            aria-label="Làm lại nét viết"
          >
            ↷
          </button>
          <button
            type="button"
            aria-pressed={erasing}
            onClick={() => setErasing(!erasing)}
          >
            <Eraser size={13} />
            {erasing ? "Bút" : "Tẩy nét"}
          </button>
          <button
            type="button"
            onClick={() => {
              cancel();
              setProcessing(false);
              setFailure("");
              saveUndo();
              strokes.current = [];
              paint();
              preview();
              setStatus("Bảng trống. Vẽ để bắt đầu.");
            }}
          >
            <Trash2 size={13} /> Xóa
          </button>
        </div>
      </header>
      <div className="explore-v2-pen-colors" aria-label="Màu bút">
        {["#173e31", "#2563eb", "#dc493a"].map((c) => (
          <button
            type="button"
            key={c}
            aria-label={`Chọn màu bút ${c}`}
            aria-pressed={color === c}
            style={{ backgroundColor: c }}
            onClick={() => {
              setColor(c);
              setErasing(false);
            }}
          />
        ))}
      </div>
      <canvas
        ref={canvas}
        width={INK_WIDTH}
        height={INK_HEIGHT}
        aria-label="Vẽ hình hoặc công thức"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      />
      <footer>
        <small role="status">{status}</small>
        <button
          type="button"
          disabled={processing}
          onClick={() => void recognize()}
        >
          <Sparkles size={14} />
          {processing ? "Đang nhận diện…" : "Nhận diện ngay"}
        </button>
      </footer>
      {failure && (
        <p role="alert" className="explore-recognition-warning">
          {failure}
        </p>
      )}
    </section>
  );
}
