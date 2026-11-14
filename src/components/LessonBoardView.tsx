"use client";

import { useState, type ComponentProps, type ComponentRef } from "react";
import type { LessonBoard } from "@/lib/lesson-board";
import { functionTable } from "@/lib/function-analysis";
import { Visual } from "./Visual";
import { BoardChart } from "./BoardChart";
import { FormattedAIAnswer } from "./FormattedMath";

export function LessonBoardView({ board, spec, onReady, onSelect }: {
  board: LessonBoard;
  spec: ComponentProps<typeof Visual>["spec"];
  onReady?: (runtime: NonNullable<ComponentRef<typeof Visual>>) => void;
  onSelect?: ComponentProps<typeof Visual>["onSelect"];
}) {
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const size = board.size || { width: 1200, height: 650 };
  return (
    <div className="lesson-board-view">
      <Visual
        spec={spec}
        blankView={board.blankView}
        onSelect={onSelect}
        onState={(state) => setParameters(state.parameters)}
        onRuntimeReady={(runtime) => {
          if ("setAxesVisible" in runtime) runtime.setAxesVisible(board.options.axes);
          if ("setGridVisible" in runtime) runtime.setGridVisible(board.options.grid);
          if ("setLabelsVisible" in runtime) runtime.setLabelsVisible(board.options.labels);
          if ("setSnapToGrid" in runtime) runtime.setSnapToGrid(board.options.snap);
          onReady?.(runtime);
        }}
        overlay={<div className="board-content-layer lesson-board-items">
          {board.ink && <svg className="lesson-board-ink" aria-hidden="true" viewBox={`0 0 ${board.ink.width} ${board.ink.height}`} preserveAspectRatio="none">
            {board.ink.strokes.map((stroke, index) => {
              const points = stroke.points.map((point) => `${point.x},${point.y}`).join(" ");
              return stroke.points.length === 1
                ? <circle key={index} cx={stroke.points[0].x} cy={stroke.points[0].y} r={1.4} fill={stroke.color} />
                : <polyline key={index} points={points} fill="none" stroke={stroke.color} strokeWidth={2.8}
                  strokeLinecap="round" strokeLinejoin="round" strokeDasharray={stroke.lineStyle === "dashed" ? "8 5" : undefined} />;
            })}
          </svg>}
          {spec?.boardItems?.filter((item) => item.visible).map((item) => {
            let cells = item.cells;
            const link = item.graphLink;
            if (link && !link.manual && spec.dimension === "2d") {
              const expression = spec.objects.find((object) => object.id === link.sourceId)?.expression;
              if (expression) {
                try {
                  cells = functionTable(expression, link.min, link.max, parameters, link.mode);
                } catch {
                  cells = [["Chưa xác định"]];
                }
              }
            }
            return <section key={item.id} className="board-content-item" data-kind={item.kind} style={{
              left: `${100 * Math.max(0, Math.min(item.x, size.width - item.width)) / size.width}%`,
              top: `${100 * Math.max(0, Math.min(item.y, size.height - item.height)) / size.height}%`,
              width: `${Math.min(100, 100 * item.width / size.width)}%`,
              height: `${Math.min(100, 100 * item.height / size.height)}%`,
              fontSize: item.fontSize,
            }}>
              <div className="board-content-body">
                {(item.kind === "text" || item.kind === "formula") && <FormattedAIAnswer text={item.text} />}
                {item.kind === "image" && (item.assetUrl || item.image) && <img src={item.assetUrl || item.image} alt={item.text || "Ảnh trên bảng vẽ"} />}
                {item.kind === "table" && <table><tbody>{cells?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>}
                {!["text", "formula", "image", "table"].includes(item.kind) && <BoardChart item={item} />}
              </div>
            </section>;
          })}
        </div>}
      />
    </div>
  );
}
