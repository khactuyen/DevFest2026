"use client";
import { useEffect, useState } from "react";
import { Copy, ClipboardPaste, Eye, EyeOff, Undo2, Redo2 } from "lucide-react";
import type { VisualSpec } from "@/lib/contracts";
import type { VisualSelection } from "@/lib/runtime";
import type { ExploreRuntime } from "./explore/shared";
import { copySceneObjects, pasteSceneObjects } from "@/lib/scene-clipboard";
import {
  transformPlanarObject,
  type PlanarTransform,
} from "@/lib/planar-transform";
const key = "mathcos:geometry-clipboard";
export function ExploreObjectActions({
  getRuntime,
  onCommit,
  selected,
  undo,
  redo,
  canUndo,
  canRedo,
}: {
  getRuntime: () => ExploreRuntime | null | undefined;
  onCommit: (s: VisualSpec, label?: string) => void;
  selected: VisualSelection[];
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const [notice, setNotice] = useState("");
  const [label, setLabel] = useState("");
  const [transform, setTransform] = useState<PlanarTransform>("rotate"),
    [amount, setAmount] = useState(90),
    [center, setCenter] = useState("0,0"),
    [delta, setDelta] = useState("1,0");
  function run(action: () => void) {
    try {
      action();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Không thực hiện được thao tác.",
      );
    }
  }
  function copy() {
    const s = getRuntime()?.serialized();
    if (!s) return;
    localStorage.setItem(
      key,
      JSON.stringify(
        copySceneObjects(
          s,
          selected.map((o) => o.id),
        ),
      ),
    );
    setNotice(
      "Đã sao chép hình và các nguồn phụ thuộc. Có thể dán sang bảng khác cùng chế độ.",
    );
  }
  function paste() {
    const s = getRuntime()?.serialized(),
      data = localStorage.getItem(key);
    if (!s || !data) throw Error("Chưa có hình trong bộ nhớ sao chép.");
    onCommit(
      pasteSceneObjects(s, JSON.parse(data)),
      "Đã dán hình với định danh mới",
    );
    setNotice("");
  }
  function visibility(show: boolean) {
    const s = getRuntime()?.serialized();
    if (!s) return;
    onCommit(
      {
        ...s,
        objects: s.objects.map((o) =>
          show || selected.some((p) => p.id === o.id)
            ? { ...o, visible: show }
            : o,
        ),
      } as VisualSpec,
      show ? "Đã hiện các đối tượng" : "Đã ẩn đối tượng",
    );
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target?.closest(".legacy-canvas-card") ||
        target.closest(
          "input,textarea,select,[contenteditable=true],math-field",
        )
      )
        return;
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "v"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        run(e.key.toLowerCase() === "c" ? copy : paste);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return (
    <div className="explore-spatial-tools">
      <details>
        <summary className="object-actions-summary">Chỉnh sửa</summary>
        <div className="explore-spatial-menu spatial-tool-grid">
          <button type="button" className="tool-menu-close" aria-label="Đóng chỉnh sửa" onClick={e=>e.currentTarget.closest("details")?.removeAttribute("open")}>×</button>
          <label style={{ gridColumn: "1/-1" }}>
            Tên đối tượng
            <input
              aria-label="Tên đối tượng đã chọn"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            disabled={!selected.length}
            onClick={() =>
              run(() => {
                const s = getRuntime()?.serialized();
                if (s)
                  onCommit(
                    {
                      ...s,
                      objects: s.objects.map((o) =>
                        o.id === selected[0].id
                          ? { ...o, label: label.slice(0, 100) }
                          : o,
                      ),
                    } as VisualSpec,
                    "Đã đổi tên đối tượng",
                  );
              })
            }
          >
            Đổi tên
          </button>
          <label>
            Kiểu điểm
            <select
              aria-label="Kiểu hiển thị điểm"
              defaultValue="dot"
              onChange={(e) =>
                run(() => {
                  const s = getRuntime()?.serialized();
                  if (s?.dimension !== "2d" || !selected.length)
                    throw Error("Chọn một điểm trên bảng 2D.");
                  const target = s.objects.find((o) => o.id === selected[0].id);
                  if (
                    !target ||
                    ![
                      "point",
                      "midpoint",
                      "intersection",
                      "glider",
                      "projection",
                    ].includes(target.type)
                  )
                    throw Error("Kiểu này chỉ dùng cho điểm.");
                  onCommit(
                    {
                      ...s,
                      objects: s.objects.map((o) =>
                        o.id === target.id
                          ? { ...o, pointStyle: e.target.value as "dot" }
                          : o,
                      ),
                    },
                    "Đã đổi kiểu điểm",
                  );
                })
              }
            >
              {[
                ["dot", "Chấm"],
                ["circle", "Tròn rỗng"],
                ["cross", "Dấu chéo"],
                ["square", "Vuông"],
                ["diamond", "Thoi"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: "1/-1" }}>
            Biến hình đối tượng đã chọn
            <select
              value={transform}
              onChange={(e) => {
                setTransform(e.target.value as PlanarTransform);
                setAmount(e.target.value === "rotate" ? 90 : 1);
              }}
            >
              <option value="rotate">Quay</option>
              <option value="dilate">Vị tự / nhân vectơ</option>
              <option value="translate">Tịnh tiến</option>
              <option value="reflect-axis">Đối xứng qua trục</option>
              <option value="reflect-center">Đối xứng tâm</option>
            </select>
          </label>
          <label>
            Tâm x,y
            <input
              aria-label="Tâm biến hình"
              value={center}
              onChange={(e) => setCenter(e.target.value)}
            />
          </label>
          <label>
            Góc / hệ số
            <input
              aria-label="Góc hoặc hệ số biến hình"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          {transform === "translate" && (
            <label>
              Vectơ dx,dy
              <input
                aria-label="Vectơ tịnh tiến"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </label>
          )}
          <button
            disabled={!selected.length}
            onClick={() =>
              run(() => {
                const active = getRuntime(),
                  s = active?.serialized();
                if (!active || s?.dimension !== "2d")
                  throw Error("Chuyển về 2D để biến hình phẳng.");
                const c = center
                    .split(/[,;\s]+/)
                    .filter(Boolean)
                    .map(Number),
                  d = delta
                    .split(/[,;\s]+/)
                    .filter(Boolean)
                    .map(Number);
                if (c.length !== 2 || d.length !== 2)
                  throw Error("Nhập hai tọa độ cách nhau bằng dấu phẩy.");
                onCommit(
                  transformPlanarObject(
                    s,
                    selected[0].id,
                    transform,
                    c as [number, number],
                    amount,
                    d as [number, number],
                    "state" in active ? active.state().objects : {},
                  ),
                  "Đã biến hình và giữ liên kết nguồn",
                );
              })
            }
          >
            Dựng ảnh của hình
          </button>
          <button onClick={() => run(copy)}>
            <Copy size={13} />
            Sao chép
          </button>
          <button onClick={() => run(paste)}>
            <ClipboardPaste size={13} />
            Dán hình
          </button>
          <button
            disabled={!selected.length}
            onClick={() => run(() => visibility(false))}
          >
            <EyeOff size={13} />
            Ẩn đã chọn
          </button>
          <button onClick={() => run(() => visibility(true))}>
            <Eye size={13} />
            Hiện tất cả
          </button>
          <button disabled={!canUndo} onClick={undo}>
            <Undo2 size={13} />
            Hoàn tác
          </button>
          <button disabled={!canRedo} onClick={redo}>
            <Redo2 size={13} />
            Làm lại
          </button>
          {notice && (
            <p role="status" className="spatial-tool-notice">
              {notice}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
