"use client";

import { useEffect } from "react";
import { Box, Scan, Trash2, X } from "lucide-react";
import type { ThreeVisualSpec } from "@/lib/contracts";
import type { VisualSelection } from "@/lib/runtime";
import { wholeSolidSelection } from "@/lib/three-selection";

type Props = {
  visual: ThreeVisualSpec;
  selection: VisualSelection;
  onSelect: (selection: VisualSelection) => void;
  onClose: () => void;
  onDelete: () => void;
  onFit: () => void;
};

export function ExploreSelectionToolbar({
  visual,
  selection,
  onSelect,
  onClose,
  onDelete,
  onFit,
}: Props) {
  const whole = wholeSolidSelection(visual, selection);
  const part =
    selection.edgeIndex !== undefined ||
    selection.vertexIndex !== undefined ||
    selection.faceIndex !== undefined;
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "Escape" &&
        !target?.closest("input,textarea,[contenteditable=true]")
      )
        onClose();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [onClose]);
  return (
    <div
      className="explore-selection-toolbar"
      role="toolbar"
      aria-label="Thao tác đối tượng 3D"
    >
      <div className="explore-selection-caption">
        <strong>{selection.label}</strong>
        <small>
          {part
            ? selection.faceIndex !== undefined
              ? "Mặt của khối"
              : selection.vertexIndex !== undefined
                ? "Đỉnh của khối"
                : "Cạnh của khối"
            : whole
              ? "Bấm tiếp vào cạnh hoặc mặt để chọn riêng. Kéo nền để xoay."
              : selection.kind}
        </small>
      </div>
      {selection.details?.length ? (
        <output aria-live="polite">{selection.details.slice(0, 2).join(" · ")}</output>
      ) : null}
      {whole && part && (
        <button onClick={() => onSelect(whole)}>
          <Box size={14} />
          Cả khối
        </button>
      )}
      <button onClick={onFit}>
        <Scan size={14} />
        Vừa khung
      </button>
      {!part && (
        <button className="danger" onClick={onDelete}>
          <Trash2 size={14} />
          Xóa đối tượng
        </button>
      )}
      <button aria-label="Bỏ chọn đối tượng" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
