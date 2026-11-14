"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VisualSpec } from "@/lib/contracts";
import type { LessonBoard } from "@/lib/lesson-board";
import { copySceneObjects } from "@/lib/scene-clipboard";
import { restoreExploreBoard2d } from "@/lib/sketch-3d";
import { validateVisual } from "@/lib/validation";
import { LessonBoardView } from "./LessonBoardView";

export type BoardTransfer = { visual: VisualSpec | null; board: LessonBoard };

export function ExploreBoardTransfer({
  data,
  selection,
  context,
  onClose,
  onApply,
}: {
  data: BoardTransfer;
  selection: string[];
  context?: string;
  onClose: () => void;
  onApply: (value: BoardTransfer) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [onlySelection, setOnlySelection] = useState(Boolean(selection.length));
  const [project, setProject] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  const { preview, error } = useMemo(() => {
    try {
      let visual = data.visual;
      let board = data.board;
      if (visual && onlySelection && selection.length) {
        const subset = copySceneObjects(visual, selection);
        const included = new Set(subset.objects.map((object) => object.id));
        const boardItems = visual.boardItems?.filter(
          (item) => item.graphLink && included.has(item.graphLink.sourceId),
        );
        if (subset.dimension === "2d") {
          const {
            savedNative3d,
            savedSpatialObjects,
            savedSpatialParameters,
            spatialConnections,
            spatialStyles,
            spatialPoints,
            ...plane
          } = subset;
          visual = { ...plane, boardItems };
        } else {
          const {
            derivedFrom2d,
            planarBoard,
            cubeConstruction,
            construction,
            ...space
          } = subset;
          visual = { ...space, boardItems };
        }
        board = { ...board, ink: undefined };
      }
      if (project && visual?.dimension === "3d")
        visual = restoreExploreBoard2d(visual);
      return {
        preview: { visual: visual ? validateVisual(visual) : null, board },
        error: "",
      };
    } catch (reason) {
      return {
        preview: null,
        error:
          reason instanceof Error
            ? reason.message
            : "Chưa tạo được bản xem trước.",
      };
    }
  }, [data, onlySelection, project, selection]);

  return (
    <dialog
      ref={dialog}
      className="explore-board-transfer"
      aria-label="Xem trước nội dung đưa vào bài soạn"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2>Xem trước nội dung chèn</h2>
      {context && <p>{context}</p>}
      <div className="spatial-form">
        <label>
          Phạm vi
          <select
            value={onlySelection ? "selection" : "all"}
            onChange={(event) =>
              setOnlySelection(event.target.value === "selection")
            }
          >
            <option value="all">Toàn bảng</option>
            {selection.length > 0 && (
              <option value="selection">Đối tượng đã chọn</option>
            )}
          </select>
        </label>
        {data.visual?.dimension === "3d" && (
          <label>
            Khung nhìn
            <select
              value={project ? "2d" : "3d"}
              onChange={(event) => setProject(event.target.value === "2d")}
            >
              <option value="3d">Khung nhìn 3D</option>
              <option value="2d">Hình chiếu 2D</option>
            </select>
          </label>
        )}
      </div>
      {preview && (
        <div inert>
          <LessonBoardView board={preview.board} spec={preview.visual} />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={onClose}>
          Quay lại bảng
        </button>
        <button
          type="button"
          disabled={!preview}
          onClick={() => preview && onApply(preview)}
        >
          {context ? "Xác nhận chèn" : "Tiếp tục vào bài soạn"}
        </button>
      </footer>
    </dialog>
  );
}
