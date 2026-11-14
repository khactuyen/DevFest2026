"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ImagePlus,
  Table2,
  Sigma,
  BarChart3,
  GripVertical,
  X,
  Copy,
  Pencil,
  Maximize2,
  ScanLine,
} from "lucide-react";
import {
  BoardItemSchema,
  freeBoardPosition,
  descriptiveStatistics,
  bayesProbability,
  type BoardItem,
} from "@/lib/board-content";
import { TwoDVisualSpecSchema, type VisualSpec } from "@/lib/contracts";
import type { ExploreRuntime } from "./explore/shared";
import { uid } from "@/lib/drawing-id";
import { FormattedAIAnswer } from "./FormattedMath";
import { BoardChart } from "./BoardChart";
import { functionTable } from "@/lib/function-analysis";
import { MathInput } from "./MathInput";
import { exportBoardCanvas, downloadBoard } from "@/lib/board-export";
import { BoardNoteEditor } from "./BoardNoteEditor";

export function ExploreBoardContent({
  stage,
  getRuntime,
  onCommit,
}: {
  stage: HTMLElement | null;
  getRuntime: () => ExploreRuntime | null | undefined;
  onCommit: (s: VisualSpec, label?: string) => void;
}) {
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  const [newNote, setNewNote] = useState<BoardItem | null>(null);
  const [chart, setChart] = useState<BoardItem["kind"]>("bar"),
    [values, setValues] = useState("3, 5, 2, 8, 4"),
    [labels, setLabels] = useState("A, B, C, D, E");
  const uploader = useRef<HTMLInputElement>(null),
    drag = useRef<{
      id: string;
      x: number;
      y: number;
      original: BoardItem;
      resize: boolean;
      pointerId: number;
      capture: HTMLElement;
    } | null>(null),
    [moving, setMoving] = useState<BoardItem | null>(null);
  function beginGesture(
    e: React.PointerEvent<HTMLElement>,
    item: BoardItem,
    resize = false,
  ) {
    if (e.button !== 0 || drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: item.id,
      x: e.clientX,
      y: e.clientY,
      original: item,
      resize,
      pointerId: e.pointerId,
      capture: e.currentTarget,
    };
  }
  function previewGesture(clientX: number, clientY: number) {
    const d = drag.current;
    if (!d) return null;
    const dx = clientX - d.x,
      dy = clientY - d.y;
    if (Math.hypot(dx, dy) < 3) return d.original;
    const width = stage?.clientWidth || 1200,
      height = stage?.clientHeight || 650;
    return {
      ...d.original,
      ...(d.resize
        ? {
            width: Math.min(
              Math.max(160, d.original.width + dx),
              Math.max(160, width - d.original.x - 4),
            ),
            height: Math.min(
              Math.max(80, d.original.height + dy),
              Math.max(80, height - d.original.y - 4),
            ),
          }
        : {
            x: Math.max(
              0,
              Math.min(
                d.original.x + dx,
                Math.max(0, width - d.original.width),
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                d.original.y + dy,
                Math.max(0, height - d.original.height),
              ),
            ),
          }),
    };
  }
  function cancelGesture() {
    const d = drag.current;
    drag.current = null;
    setMoving(null);
    if (d?.capture.hasPointerCapture(d.pointerId))
      d.capture.releasePointerCapture(d.pointerId);
  }
  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    return () => {
      window.removeEventListener("blur", cancelGesture);
      const d = drag.current;
      if (d?.capture.hasPointerCapture(d.pointerId))
        d.capture.releasePointerCapture(d.pointerId);
    };
  }, []);
  const snapshot = (): VisualSpec =>
    (getRuntime()?.serialized() as VisualSpec) ||
    TwoDVisualSpecSchema.parse({
      id: uid(),
      version: 1,
      dimension: "2d",
      engine: "jsxgraph",
      kind: "geometry",
      parameters: [],
      viewport: { x: [-10, 10], y: [-7, 7] },
      objects: [{ id: uid(), type: "point", x: 0, y: 0, visible: false }],
    });
  // Runtime snapshots are authoritative; the parent re-renders after every history action.
  const scene = snapshot();
  const items = (scene.boardItems || []).map((item) => {
    if (!item.graphLink || item.graphLink.manual || scene.dimension !== "2d")
      return item;
    const graph = scene.objects.find((o) => o.id === item.graphLink!.sourceId);
    if (!graph?.expression)
      return {
        ...item,
        text: "Đồ thị nguồn đã bị xóa. Bảng giữ kết quả cuối; hãy chọn lại nguồn.",
      };
    try {
      const link = item.graphLink;
      return {
        ...item,
        cells: functionTable(
          graph.expression,
          link.min,
          link.max,
          Object.fromEntries(scene.parameters.map((p) => [p.id, p.value])),
          link.mode,
        ),
      };
    } catch (e) {
      return {
        ...item,
        cells: [
          ["Chưa xác định"],
          [e instanceof Error ? e.message : "Kiểm tra miền khảo sát"],
        ],
      };
    }
  });
  const commit = (items: BoardItem[], label: string) => {
    onCommit(
      { ...snapshot(), boardItems: items.map((i) => BoardItemSchema.parse(i)) },
      label,
    );
    setRevision(revision + 1);
  };
  const patch = (id: string, change: Partial<BoardItem>) =>
    commit(
      (snapshot().boardItems || []).map((i) =>
        i.id === id ? { ...i, ...change } : i,
      ),
      "Đã sửa nội dung bảng",
    );
  const add = (
    kind: BoardItem["kind"],
    extra: Partial<BoardItem> = {},
    persist = true,
  ) => {
    const width = Math.min(
        extra.width || (kind === "formula" ? 270 : 380),
        Math.max(100, (stage?.clientWidth || 1200) - 36),
      ),
      height = extra.height || (kind === "formula" ? 150 : 300);
    const position = freeBoardPosition(
      items,
      width,
      height,
      stage?.clientWidth,
      stage?.clientHeight,
    );
    const item = BoardItemSchema.parse({
      id: uid(),
      kind,
      ...position,
      text: kind === "formula" ? "$x^2 + y^2 = r^2$" : "",
      ...extra,
      width,
      height,
    });
    if (persist) commit([...items, item], "Đã thêm nội dung bảng");
    else setNewNote(item);
    return item.id;
  };
  function run(f: () => void) {
    try {
      f();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nội dung không hợp lệ.");
    }
  }
  function readImage(file: File) {
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setError("Chọn ảnh PNG, JPEG, WebP dưới 12 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas"),
          scale = Math.min(1, 1200 / img.width, 1200 / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        run(() =>
          add("image", {
            image: canvas.toDataURL("image/jpeg", 0.8),
            width: 360,
            height: Math.max(80, Math.min(600, (360 * img.height) / img.width)),
          }),
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  return (
    <>
      <div
        className="explore-spatial-tools board-content-tools"
        role="toolbar"
        aria-label="Nội dung bảng"
      >
        <button
          onClick={() => {
            const id = add("formula", {}, false);
            setEditing(id);
            setDraft("$x^2 + y^2 = r^2$");
          }}
        >
          <Sigma size={14} />
          Chữ / Công thức
        </button>
        <button
          onClick={() =>
            add("table", {
              cells: Array.from({ length: 3 }, () => ["", "", ""]),
              height: 180,
            })
          }
        >
          <Table2 size={14} />
          Bảng
        </button>
        <button onClick={() => uploader.current?.click()}>
          <ImagePlus size={14} />
          Ảnh
        </button>
        <details>
          <summary className="object-actions-summary">Xuất</summary>
          <div className="explore-spatial-menu">
            <button
              className="tool-menu-close"
              aria-label="Đóng xuất bảng"
              onClick={(e) =>
                e.currentTarget.closest("details")?.removeAttribute("open")
              }
            >
              <X size={14} />
            </button>
            <button
              onClick={async () => {
                try {
                  const active = getRuntime();
                  if (!stage || !active) throw Error("Bảng chưa sẵn sàng.");
                  downloadBoard(await exportBoardCanvas(stage, active));
                  setError("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Không xuất được ảnh.",
                  );
                }
              }}
            >
              Tải PNG vùng bảng
            </button>
            <button
              onClick={() => {
                const preview = window.open("", "_blank");
                if (!preview) {
                  setError("Cho phép mở cửa sổ để in / lưu PDF.");
                  return;
                }
                const active = getRuntime();
                if (!stage || !active) {
                  preview.close();
                  return;
                }
                exportBoardCanvas(stage, active)
                  .then((canvas) => {
                    preview.document.title = "MathCos · Bảng vẽ";
                    preview.document.body.style.margin = "0";
                    const image = preview.document.createElement("img");
                    image.style.width = "100%";
                    image.src = canvas.toDataURL("image/png");
                    preview.document.body.append(image);
                    image.onload = () => {
                      preview.focus();
                      preview.print();
                    };
                  })
                  .catch((e) => {
                    preview.close();
                    setError(
                      e instanceof Error ? e.message : "Không in được bảng.",
                    );
                  });
              }}
            >
              In / Lưu PDF vùng bảng
            </button>
          </div>
        </details>
        <details className="board-chart-menu">
          <summary>
            <BarChart3 size={14} />
            Thống kê
          </summary>
          <div className="explore-spatial-menu">
            <button
              className="tool-menu-close"
              aria-label="Đóng thống kê"
              onClick={(e) =>
                e.currentTarget.closest("details")?.removeAttribute("open")
              }
            >
              <X size={14} />
            </button>
            <select
              aria-label="Loại biểu đồ"
              value={chart}
              onChange={(e) => setChart(e.target.value as BoardItem["kind"])}
            >
              {[
                ["bar", "Biểu đồ cột"],
                ["line", "Biểu đồ đường"],
                ["pie", "Biểu đồ quạt"],
                ["histogram", "Tần số ghép nhóm"],
                ["boxplot", "Biểu đồ hộp"],
                ["tree", "Cây xác suất / Bayes"],
                ["venn", "Biểu đồ Ven"],
                ["intervals", "Khoảng trên trục số"],
                ["network", "Đồ thị đỉnh–cạnh"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <label>
              Dữ liệu, cách nhau bằng dấu phẩy
              <input
                aria-label="Dữ liệu biểu đồ"
                value={values}
                onChange={(e) => setValues(e.target.value)}
              />
            </label>
            <label>
              Nhãn
              <input
                aria-label="Nhãn biểu đồ"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
              />
            </label>
            {chart === "tree" && (
              <small>Nhập P(A), P(B|A), P(B|¬A), ví dụ 0.1, 0.9, 0.05.</small>
            )}
            <button
              onClick={() =>
                run(() => {
                  const data = values
                    .split(/[,;\s]+/)
                    .filter(Boolean)
                    .map(Number);
                  descriptiveStatistics(data);
                  if (
                    chart === "pie" &&
                    (data.some((v) => v < 0) || !data.some((v) => v > 0))
                  )
                    throw Error(
                      "Biểu đồ quạt cần dữ liệu không âm và tổng dương.",
                    );
                  if (chart === "tree")
                    bayesProbability(data[0], data[1], data[2]);
                  add(chart, {
                    data,
                    labels: labels.split(",").map((l) => l.trim()),
                    regions: [7],
                    text: chart === "tree" ? "Cây xác suất" : "",
                  });
                })
              }
            >
              Thêm biểu diễn
            </button>
          </div>
        </details>
        <input
          ref={uploader}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) readImage(file);
          }}
        />
        {error && (
          <span role="alert" className="spatial-error">
            {error}
            <button onClick={() => setError("")}>
              <X size={12} />
            </button>
          </span>
        )}
      </div>
      {stage &&
        createPortal(
          <div
            className="board-content-layer"
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.pointerId !== e.pointerId) return;
              e.preventDefault();
              e.stopPropagation();
              setMoving(previewGesture(e.clientX, e.clientY));
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              if (!d || d.pointerId !== e.pointerId) return;
              e.preventDefault();
              e.stopPropagation();
              const next = previewGesture(e.clientX, e.clientY);
              cancelGesture();
              if (next && next !== d.original) patch(next.id, next);
            }}
            onPointerCancel={cancelGesture}
            onLostPointerCapture={(e) => {
              if (drag.current?.pointerId === e.pointerId) cancelGesture();
            }}
          >
            {items
              .filter((i) => i.visible)
              .map((original) => {
                const item = moving?.id === original.id ? moving : original;
                return (
                  <section
                    key={item.id}
                    className={`board-content-item ${moving?.id === item.id ? "is-moving" : ""} ${editing === item.id ? "is-editing" : ""}`}
                    data-kind={item.kind}
                    data-content-id={item.id}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.width,
                      height: item.height,
                      fontSize: item.fontSize,
                    }}
                    aria-label={`Nội dung ${item.kind}`}
                  >
                    <header className="board-content-handle">
                      <button
                        type="button"
                        className="board-content-drag-handle"
                        title="Kéo để di chuyển"
                        aria-label="Kéo nội dung"
                        onPointerDown={(e) => beginGesture(e, item)}
                      >
                        <GripVertical size={15} />
                        <span>
                          {["formula", "text"].includes(item.kind)
                            ? "Chữ & công thức"
                            : item.kind === "image"
                              ? "Hình ảnh"
                              : item.kind === "table"
                                ? "Bảng"
                                : "Biểu diễn"}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Sửa nội dung"
                        title="Sửa nội dung"
                        onClick={() => {
                          setEditing(item.id);
                          setDraft(item.text);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      {["formula", "text"].includes(item.kind) && (
                        <button
                          type="button"
                          aria-label="Vừa nội dung"
                          title="Thu gọn theo nội dung"
                          onClick={(e) => {
                            const note = e.currentTarget
                              .closest("section")
                              ?.querySelector(".formatted-ai-answer");
                            if (note)
                              patch(item.id, {
                                height: Math.min(
                                  stage?.clientHeight || 650,
                                  Math.max(
                                    90,
                                    Math.ceil(
                                      note.getBoundingClientRect().height,
                                    ) + 60,
                                  ),
                                ),
                              });
                          }}
                        >
                          <ScanLine size={14} />
                        </button>
                      )}
                      <button
                        aria-label="Nhân bản nội dung"
                        title="Nhân bản nội dung"
                        onClick={() =>
                          commit(
                            [
                              ...items,
                              {
                                ...item,
                                id: uid(),
                                x: item.x + 25,
                                y: item.y + 25,
                              },
                            ],
                            "Đã nhân bản nội dung",
                          )
                        }
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        aria-label="Xóa nội dung"
                        title="Xóa nội dung"
                        onClick={() =>
                          commit(
                            items.filter((i) => i.id !== item.id),
                            "Đã xóa nội dung bảng",
                          )
                        }
                      >
                        <X size={13} />
                      </button>
                    </header>
                    <div
                      className="board-content-body"
                      title={
                        ["formula", "text"].includes(item.kind)
                          ? "Kéo để di chuyển · Nhấp đúp để sửa"
                          : undefined
                      }
                      onPointerDown={(e) => {
                        if (
                          ["formula", "text", "image"].includes(item.kind) &&
                          editing !== item.id &&
                          !(e.target as Element).closest(
                            "button,input,textarea,select,a,[contenteditable=true]",
                          )
                        )
                          beginGesture(e, item);
                      }}
                      onDoubleClick={() => {
                        setEditing(item.id);
                        setDraft(item.text);
                      }}
                    >
                      {editing === item.id &&
                      !["formula", "text"].includes(item.kind) ? (
                        <div className="board-content-editor">
                          <textarea
                            aria-label="Sửa chữ và công thức"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Dán văn bản từ Word; đặt LaTeX trong $...$"
                          />
                          {item.kind === "formula" && (
                            <MathInput
                              value={draft.replace(/^\$|\$$/g, "")}
                              onChange={(latex) => setDraft(`$${latex}$`)}
                            />
                          )}
                          {item.data && (
                            <label>
                              Dữ liệu
                              <input
                                aria-label="Sửa dữ liệu biểu đồ"
                                defaultValue={item.data.join(", ")}
                                onBlur={(e) =>
                                  run(() => {
                                    const data = e.target.value
                                      .split(/[,;\s]+/)
                                      .filter(Boolean)
                                      .map(Number);
                                    descriptiveStatistics(data);
                                    if (item.kind === "tree")
                                      bayesProbability(
                                        data[0],
                                        data[1],
                                        data[2],
                                      );
                                    if (
                                      item.kind === "pie" &&
                                      (data.some((v) => v < 0) ||
                                        !data.some((v) => v > 0))
                                    )
                                      throw Error(
                                        "Dữ liệu quạt cần không âm và tổng dương.",
                                      );
                                    patch(item.id, { data });
                                  })
                                }
                              />
                            </label>
                          )}
                          <label>
                            Cỡ chữ
                            <input
                              aria-label="Cỡ chữ nội dung"
                              type="number"
                              min="10"
                              max="80"
                              defaultValue={item.fontSize}
                              onBlur={(e) =>
                                run(() =>
                                  patch(item.id, {
                                    fontSize: Number(e.target.value),
                                  }),
                                )
                              }
                            />
                          </label>
                          <button
                            onClick={() => {
                              patch(item.id, { text: draft });
                              setEditing(null);
                            }}
                          >
                            Xong
                          </button>
                          <button onClick={() => setEditing(null)}>Hủy</button>
                        </div>
                      ) : null}
                      {(item.kind === "text" || item.kind === "formula") && (
                        <FormattedAIAnswer text={item.text} />
                      )}
                      {item.kind === "image" && (item.image || item.assetUrl) && (
                        <img
                          alt={item.text || "Ảnh trên bảng"}
                          src={item.image || item.assetUrl}
                          draggable={false}
                        />
                      )}
                      {item.kind === "table" && (
                        <div>
                          {item.graphLink && (
                            <small>
                              {item.graphLink.manual
                                ? "Bảng sửa tay · ngừng đồng bộ"
                                : "Đồng bộ theo đồ thị · giá trị gần đúng"}
                              <button
                                onClick={() =>
                                  patch(item.id, {
                                    graphLink: {
                                      ...item.graphLink!,
                                      manual: false,
                                    },
                                  })
                                }
                              >
                                Lập lại theo hàm
                              </button>
                            </small>
                          )}
                          {item.text && <small>{item.text}</small>}
                          <table>
                            <tbody>
                              {(item.cells || []).map((row, r) => (
                                <tr key={r}>
                                  {row.map((cell, c) => (
                                    <td key={`${r}-${c}`}>
                                      <input
                                        aria-label={`Ô ${r + 1}, ${c + 1}`}
                                        defaultValue={cell}
                                        key={cell}
                                        onBlur={(e) => {
                                          if (e.target.value !== cell) {
                                            const cells = (
                                              item.cells || []
                                            ).map((row) => [...row]);
                                            cells[r][c] = e.target.value;
                                            patch(item.id, {
                                              cells,
                                              ...(item.graphLink
                                                ? {
                                                    graphLink: {
                                                      ...item.graphLink,
                                                      manual: true,
                                                    },
                                                  }
                                                : {}),
                                            });
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === "Tab" &&
                                            !e.shiftKey &&
                                            r === item.cells!.length - 1 &&
                                            c === row.length - 1
                                          ) {
                                            e.preventDefault();
                                            const cells = item.cells!.map(
                                              (row) => [...row],
                                            );
                                            cells[r][c] = e.currentTarget.value;
                                            cells.push(row.map(() => ""));
                                            patch(item.id, { cells });
                                            requestAnimationFrame(() =>
                                              document
                                                .querySelector<HTMLInputElement>(
                                                  `[aria-label="Ô ${r + 2}, 1"]`,
                                                )
                                                ?.focus(),
                                            );
                                          }
                                        }}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="board-table-controls">
                            <button
                              disabled={(item.cells?.length || 0) >= 50}
                              onClick={() =>
                                patch(item.id, {
                                  cells: [
                                    ...item.cells!,
                                    item.cells![0].map(() => ""),
                                  ],
                                })
                              }
                            >
                              + Hàng
                            </button>
                            <button
                              disabled={(item.cells?.[0].length || 0) >= 20}
                              onClick={() =>
                                patch(item.id, {
                                  cells: item.cells!.map((r) => [...r, ""]),
                                })
                              }
                            >
                              + Cột
                            </button>
                            <button
                              disabled={(item.cells?.length || 0) <= 1}
                              onClick={() =>
                                patch(item.id, {
                                  cells: item.cells!.slice(0, -1),
                                })
                              }
                            >
                              − Hàng
                            </button>
                            <button
                              disabled={(item.cells?.[0].length || 0) <= 1}
                              onClick={() =>
                                patch(item.id, {
                                  cells: item.cells!.map((r) => r.slice(0, -1)),
                                })
                              }
                            >
                              − Cột
                            </button>
                          </div>
                        </div>
                      )}
                      {!["text", "formula", "image", "table"].includes(
                        item.kind,
                      ) && (
                        <>
                          <BoardChart
                            item={item}
                            onRegions={(regions) => patch(item.id, { regions })}
                            onEdges={(graphEdges) =>
                              patch(item.id, { graphEdges })
                            }
                          />
                          {item.kind === "venn" && (
                            <div className="board-table-controls">
                              <button
                                onClick={() =>
                                  patch(item.id, {
                                    setCount: 2,
                                    regions: (item.regions || []).filter(
                                      (r) => r < 4,
                                    ),
                                  })
                                }
                              >
                                2 tập
                              </button>
                              <button
                                onClick={() => patch(item.id, { setCount: 3 })}
                              >
                                3 tập
                              </button>
                            </div>
                          )}
                          {!["venn", "intervals", "network"].includes(
                            item.kind,
                          ) &&
                            item.data?.length && (
                              <small>
                                {item.kind === "tree"
                                  ? (() => {
                                      const r = bayesProbability(
                                        item.data![0],
                                        item.data![1],
                                        item.data![2],
                                      );
                                      return `P(B) = ${+r.total.toFixed(5)}; P(A|B) = ${+r.posterior.toFixed(5)}`;
                                    })()
                                  : (() => {
                                      const s = descriptiveStatistics(
                                        item.data!,
                                      );
                                      return `n=${s.count}; TB=${+s.mean.toFixed(3)}; Trung vị=${s.median}; Q1=${s.q1}; Q3=${s.q3}; σ=${+s.standardDeviation.toFixed(3)}`;
                                    })()}
                              </small>
                            )}
                        </>
                      )}
                    </div>
                    <button
                      className="board-content-resize"
                      aria-label="Đổi kích thước nội dung"
                      title="Kéo góc để đổi kích thước"
                      onPointerDown={(e) => beginGesture(e, item, true)}
                    >
                      <Maximize2 size={12} />
                    </button>
                  </section>
                );
              })}
          </div>,
          stage,
        )}
      {editing &&
        (newNote?.id === editing ||
          items.some(
            (i) => i.id === editing && ["formula", "text"].includes(i.kind),
          )) && (
          <BoardNoteEditor
            key={editing}
            value={draft}
            onChange={setDraft}
            fontSize={
              (newNote?.id === editing
                ? newNote
                : items.find((i) => i.id === editing))!.fontSize
            }
            onClose={() => {
              setEditing(null);
              setNewNote(null);
            }}
            onSave={(fontSize) => {
              if (newNote?.id === editing)
                commit(
                  [...items, { ...newNote, text: draft, fontSize }],
                  "Đã thêm chữ và công thức",
                );
              else patch(editing, { text: draft, fontSize });
              setEditing(null);
              setNewNote(null);
            }}
          />
        )}
    </>
  );
}
