"use client";
import {
  useEffect,
  useRef,
  useState,
  useId,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { RotateCcw, Play, Pause } from "lucide-react";
import { RuntimeOwner } from "@/lib/workspace/runtime-lifecycle";
import {
  isThreeVisual,
  type TwoDVisualSpec,
  type VisualSpec,
  type VisualStateSummary,
} from "@/lib/contracts";
import type { VisualRuntime, VisualSelection } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import {
  createBlankBoardRuntime,
  type BlankBoardRuntime,
} from "@/lib/blank-board-runtime";

type AnyVisualRuntime = VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime;
export const Visual = forwardRef<
  AnyVisualRuntime | undefined,
  {
    spec: VisualSpec | null;
    compact?: boolean;
    fitContent?: boolean;
    keepAspectRatio?: boolean;
    dragWholeShapes?: boolean;
    blankView?: [number, number, number, number];
    interactionHint?: string;
    onState?: (state: VisualStateSummary) => void;
    onRuntimeReady?: (runtime: AnyVisualRuntime) => void;
    onSelect?: (selection: VisualSelection) => void;
    onProjectedMove?: (next: TwoDVisualSpec, selection: VisualSelection) => void;
    onObjectContextMenu?: (
      selection: VisualSelection,
      position: { x: number; y: number },
    ) => void;
    overlay?: ReactNode;
  }
>(function Visual(
  {
    spec,
    compact,
    fitContent,
    keepAspectRatio,
    dragWholeShapes,
    blankView,
    interactionHint,
    onState,
    onRuntimeReady,
    onSelect,
    onProjectedMove,
    onObjectContextMenu,
    overlay,
  },
  ref,
) {
  const id = "board_" + useId().replace(/[^a-zA-Z0-9]/g, ""),
    runtime = useRef<AnyVisualRuntime>(undefined);
  const [values, setValues] = useState<Record<string, number>>({}),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false);
  const cb = useRef(onState);
  const runtimeCb = useRef(onRuntimeReady);
  const selectionCb = useRef(onSelect);
  const projectedMoveCb = useRef(onProjectedMove);
  cb.current = onState;
  runtimeCb.current = onRuntimeReady;
  selectionCb.current = onSelect;
  projectedMoveCb.current = onProjectedMove;
  useImperativeHandle(ref, () => runtime.current, [ready]);
  useEffect(() => {
    let cancelled = false;
    const owner=new RuntimeOwner<AnyVisualRuntime>();
    const cleanup = () => {
      cancelled = true;
      const owned=owner.active;
      owner.dispose();
      if (runtime.current === owned) runtime.current = undefined;
    };
    setReady(false);
    setError("");
    const publishState = (state: VisualStateSummary) => {
      setValues(state.parameters);
      cb.current?.(state);
    };
    const select = (selection: VisualSelection) => selectionCb.current?.(selection);
    const loadRuntime = async () => {
      if (spec && isThreeVisual(spec)) {
        const { createThreeRuntime } = await import("@/lib/three-runtime");
        if (cancelled) return;
        const container = document.getElementById(id);
        if (!container) throw Error("Không tìm thấy vùng dựng mô hình 3D.");
        runtime.current = createThreeRuntime(container, spec, publishState, select);
      } else if (spec) {
        const [jsxgraph, { createRuntime }] = await Promise.all([
          import("jsxgraph"),
          import("@/lib/runtime"),
        ]);
        if (cancelled) return;
        runtime.current = createRuntime(jsxgraph.default, id, spec, publishState, select, {
          fitContent, keepAspectRatio, dragWholeShapes,
          onProjectedMove: (next, selection) => projectedMoveCb.current?.(next, selection),
        });
      } else {
        const jsxgraph = await import("jsxgraph");
        if (cancelled) return;
        runtime.current = createBlankBoardRuntime(jsxgraph.default, id, blankView);
      }
      owner.attach(runtime.current);
      runtimeCb.current?.(runtime.current);
      setReady(true);
    };
    void loadRuntime().catch((error) => { if (!cancelled) setError(String(error)); });
    return cleanup;
  }, [spec, id, fitContent, keepAspectRatio, dragWholeShapes, blankView]);
  return (
    <div
      className={
        "visual-shell " +
        (compact ? "compact" : "") +
        (spec?.dimension === "3d" && spec.source?.key === "geometry-problem"
          ? " geometry-visual"
          : "")
      }
    >
      <div className="visual-toolbar">
        <span>
          <i className="live-dot" /> Không gian tương tác
        </span>
        <button
          title="Đặt lại"
          onClick={() => {
            runtime.current?.fitView();
            setPlaying(false);
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div
        className="math-board-stage"
        onContextMenu={(event) => {
          const active = runtime.current;
          if (!active || !("pickObjectAt" in active)) return;
          const selected = active.pickObjectAt(event.clientX, event.clientY);
          if (!selected) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onObjectContextMenu?.(selected, {
            x: Math.max(
              8,
              Math.min(event.clientX - rect.left, rect.width - 264),
            ),
            y: Math.max(
              8,
              Math.min(event.clientY - rect.top, rect.height - 246),
            ),
          });
        }}
      >
        <div
          key={spec?.dimension || "blank"}
          id={id}
          className="math-board"
          role="img"
          aria-label={
            spec?.accessibility?.description ||
            (spec ? "Hình toán học tương tác" : "Bảng vẽ trắng")
          }
        />
        {ready && overlay}
      </div>
      {error && (
        <div role="alert" className="error">
          Không thể dựng hình: {error}
        </div>
      )}
      {!ready && !error && <p className="muted">Đang khởi tạo hình…</p>}
      <div className="parameters">
        {(spec?.parameters || []).map((p) => (
          <label key={p.id}>
            <span>
              {p.label}
              <strong>{Number((values[p.id] ?? p.value).toFixed(2))}</strong>
            </span>
            <input
              aria-label={`Tham số ${p.label}`}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={values[p.id] ?? p.value}
              onChange={(e) => {
                runtime.current?.stop();
                setPlaying(false);
                runtime.current?.setParameter(p.id, Number(e.target.value));
              }}
            />
          </label>
        ))}
        {(spec?.parameters.length || 0) > 0 && (
          <button
            className="subtle"
            aria-pressed={playing}
            aria-label={playing ? "Dừng chạy tham số" : "Chạy tham số"}
            onClick={() => {
              if (playing) runtime.current?.stop();
              else {
                const p = spec?.parameters[0];
                if (!p) return;
                runtime.current?.actions([
                  {
                    type: "animateParameter",
                    parameter: p.id,
                    from: p.min,
                    to: p.max,
                    durationMs: 5000,
                    loop: true,
                  },
                ]);
              }
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
            {playing ? "Dừng" : "Chạy tham số"}
          </button>
        )}
      </div>
      <div className="visual-foot">
        {interactionHint ||
          (!spec
            ? "Bảng vẽ · JSXGraph"
            : spec.dimension === "3d"
              ? "Kéo để xoay · Cuộn để phóng to"
              : "Kéo điểm tự do · Chọn cạnh/đối tượng để xem thông tin · Cuộn để phóng to")}
        <span>
          {spec?.dimension === "3d" ? "3D / Three.js" : "2D / JSXGraph"}
        </span>
      </div>
    </div>
  );
});
