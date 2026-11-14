"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { createHandwritingImageDataUrl } from "@/lib/handwriting-image";
import { request } from "@/lib/client";
import type { ProblemRecognition } from "@/lib/problem-recognition";

type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[] };
type Props = {
  onRecognized: (
    result: ProblemRecognition & { imageDataUrl: string },
    sourceRevision?: number,
  ) => void;
  sourceRevision?: number;
  draft?: Stroke[];
  onDraftChange?: (strokes: Stroke[]) => void;
  history?: { current: Stroke[][] };
  active?: boolean;
  getSourceRevision?: () => number;
};

export function HandwritingInputPad({
  onRecognized,
  sourceRevision = 0,
  draft,
  onDraftChange,
  history,
  active = true,
  getSourceRevision,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const ownUndo = useRef<Stroke[][]>([]);
  const undoRef = history || ownUndo;
  const sourceRef = useRef(sourceRevision);
  sourceRef.current = sourceRevision;
  const pointerRef = useRef<number | null>(null);
  const callbacksRef = useRef(onRecognized);
  const requestRevisionRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [color, setColor] = useState("#173e31");
  const [eraser, setEraser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Viết công thức hoặc câu hỏi; hệ thống sẽ nhận diện sau khi bạn dừng bút.",
  );
  const [failure, setFailure] = useState("");
  callbacksRef.current = onRecognized;

  function cancelPending() {
    requestRevisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function paint() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      if (!stroke.points.length) continue;
      context.beginPath();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = stroke.color;
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points
        .slice(1)
        .forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    }
  }

  async function recognize() {
    const canvas = canvasRef.current;
    if (!canvas || pointerRef.current !== null || !strokesRef.current.length)
      return;
    cancelPending();
    const revision = requestRevisionRef.current;
    const source = getSourceRevision?.() ?? sourceRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setFailure("");
    setStatus("Đang nhận diện chữ viết tay và công thức…");
    try {
      const imageDataUrl = await createHandwritingImageDataUrl(canvas);
      if (revision !== requestRevisionRef.current) return;
      const result = await request<ProblemRecognition>(
        "/api/problem-recognition",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ imageDataUrl, mode: "handwriting" }),
        },
      );
      if (
        revision !== requestRevisionRef.current ||
        source !== (getSourceRevision?.() ?? sourceRef.current) ||
        controller.signal.aborted
      )
        return;
      callbacksRef.current({ ...result, imageDataUrl }, source);
      setStatus("Đã nhận diện. Kiểm tra nội dung bên dưới rồi chọn cách dùng.");
    } catch (reason) {
      if (
        revision !== requestRevisionRef.current ||
        source !== (getSourceRevision?.() ?? sourceRef.current) ||
        controller.signal.aborted
      )
        return;
      const message =
        (reason as Error).message || "Không nhận diện được nét viết.";
      setFailure(message);
      setStatus("Bản viết vẫn được giữ lại. Bạn có thể sửa nét rồi thử lại.");
    } finally {
      if (revision === requestRevisionRef.current) {
        setBusy(false);
        controllerRef.current = null;
      }
    }
  }

  useEffect(() => () => cancelPending(), []);
  useEffect(() => {
    cancelPending();
    setBusy(false);
  }, [sourceRevision, active]);
  useEffect(() => {
    if (draft) {
      strokesRef.current = structuredClone(draft);
      paint();
    }
  }, [draft]);
  function publish() {
    onDraftChange?.(structuredClone(strokesRef.current));
  }
  function trimUndo() {
    while (
      undoRef.current.length > 8 ||
      undoRef.current.reduce(
        (n, snapshot) =>
          n + snapshot.reduce((m, stroke) => m + stroke.points.length, 0),
        0,
      ) > 10_000
    )
      undoRef.current.shift();
  }
  function pointAt(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget,
      rect = canvas.getBoundingClientRect();
    return {
      x:
        Math.round(
          Math.max(
            0,
            Math.min(
              1120,
              ((event.clientX - rect.left) * canvas.width) / rect.width,
            ),
          ) * 10,
        ) / 10,
      y:
        Math.round(
          Math.max(
            0,
            Math.min(
              320,
              ((event.clientY - rect.top) * canvas.height) / rect.height,
            ),
          ) * 10,
        ) / 10,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || pointerRef.current !== null) return;
    if (
      strokesRef.current.length >= 40 ||
      strokesRef.current.reduce((n, s) => n + s.points.length, 0) >= 6000
    ) {
      setFailure(
        "Bảng đã đạt giới hạn nét. Nhận diện hoặc xóa bớt trước khi viết tiếp.",
      );
      return;
    }
    event.preventDefault();
    cancelPending();
    setBusy(false);
    setFailure("");
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointerRef.current = event.pointerId;
    undoRef.current.push(structuredClone(strokesRef.current));
    trimUndo();
    const point = pointAt(event);
    strokesRef.current.push({
      color: eraser ? "#ffffff" : color,
      points: [point],
    });
    paint();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = pointAt(event);
    const stroke = strokesRef.current.at(-1);
    const last = stroke?.points.at(-1);
    if (
      stroke &&
      (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 2) &&
      stroke.points.length < 1600 &&
      strokesRef.current.reduce((n, s) => n + s.points.length, 0) < 6000
    )
      stroke.points.push(point);
    paint();
  }

  function finish(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return;
    move(event);
    pointerRef.current = null;
    publish();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setStatus("Đang chờ bạn viết tiếp… AI sẽ đọc sau khi bạn dừng bút.");
    timerRef.current = setTimeout(() => void recognize(), 1050);
  }

  return (
    <section
      className="handwriting-recognition-pad"
      aria-label="Nhận diện chữ viết tay"
    >
      <header>
        <b>Viết câu hỏi hoặc công thức</b>
        <span>{busy ? "Đang nhận diện" : "Tự đọc sau khi dừng bút"}</span>
      </header>
      <div className="handwriting-recognition-tools">
        <div>
          {["#173e31", "#2563eb", "#dc493a"].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Màu bút ${value}`}
              aria-pressed={color === value && !eraser}
              style={{ background: value }}
              onClick={() => {
                setColor(value);
                setEraser(false);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-pressed={eraser}
          onClick={() => setEraser((value) => !value)}
        >
          <Eraser size={13} />
          {eraser ? "Bút" : "Tẩy"}
        </button>
        <button
          type="button"
          disabled={!undoRef.current.length}
          onClick={() => {
            const previous = undoRef.current.pop();
            if (previous) {
              cancelPending();
              setBusy(false);
              strokesRef.current = previous;
              paint();
              publish();
              setStatus("Đã hoàn tác nét cuối.");
            }
          }}
        >
          <RotateCcw size={13} />
          Hoàn tác
        </button>
        <button
          type="button"
          onClick={() => {
            cancelPending();
            setBusy(false);
            undoRef.current.push(structuredClone(strokesRef.current));
            trimUndo();
            strokesRef.current = [];
            paint();
            publish();
            setFailure("");
            setStatus("Bảng viết trống. Bắt đầu viết để nhận diện.");
          }}
        >
          <Trash2 size={13} />
          Xóa bảng
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={1120}
        height={320}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        aria-label="Vùng viết công thức bằng tay"
      />
      <footer>
        <span role={failure ? "alert" : "status"}>{failure || status}</span>
        <button
          type="button"
          onClick={() => void recognize()}
          disabled={busy || !strokesRef.current.length}
        >
          <Sparkles size={14} />
          {busy ? "Đang đọc…" : "Nhận diện ngay"}
        </button>
      </footer>
    </section>
  );
}
