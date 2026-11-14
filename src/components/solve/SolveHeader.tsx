"use client";

import { isGuidedSolution } from "@/lib/solve-guided-contracts";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Ellipsis,
  PanelRight,
  Pencil,
  Plus,
  Printer,
  Save,
} from "lucide-react";
import Link from "next/link";

import type { SolveHeaderProps as Props } from "./view-contracts";
export function SolveHeader(model: Props) {
  const {
    busy,
    closeMoreMenu,
    diagramBusy,
    goBack,
    moreMenu,
    newProblem,
    phase,
    openSavedSession,
    save,
    saved,
    printSolution,
    solution,
    toStudio,
    toggleDiagram,
    visualOpen,
  } = model;
  return (
    <header className="solve-heading">
      <div className="solve-heading-leading">
        {phase !== "input" && (
          <button
            className="solve-flow-back"
            onClick={goBack}
            title={
              phase === "solution"
                ? "Quay lại chọn phương pháp giải"
                : "Quay lại nhập và sửa đề"
            }
          >
            <ArrowLeft size={15} /> Quay lại
          </button>
        )}
        <div className="solve-title-block">
          <span className="solve-eyebrow">MathCos · Góc học tập</span>
          <h1>Không gian giải</h1>
          <p>
            {phase === "input"
              ? "Bắt đầu từ đề bài. Đi đến cách hiểu."
              : phase === "review"
                ? "Kiểm tra đề, xem đáp án nhanh hoặc chọn cách giải."
                : "Theo dõi lời giải và hiểu rõ từng bước."}
          </p>
        </div>
      </div>
      <div className="solve-heading-actions">
        {phase === "solution" && solution && (
          <button
            className="solve-graph-toggle"
            aria-controls="solve-graph-panel"
            aria-expanded={visualOpen}
            disabled={!!busy || diagramBusy}
            onClick={() => void toggleDiagram()}
          >
            {isGuidedSolution(solution) ? (
              <Pencil size={15} />
            ) : (
              <PanelRight size={15} />
            )}
            {diagramBusy
              ? "Đang vẽ hình…"
              : isGuidedSolution(solution)
                ? !solution.visual
                  ? "Vẽ hình"
                  : visualOpen
                    ? "Ẩn hình"
                    : "Hiện hình"
                : visualOpen
                  ? "Ẩn đồ thị"
                  : "Hiện đồ thị"}
          </button>
        )}
        <button
          className={phase === "solution" ? "" : "solve-primary"}
          aria-label="Đề mới"
          onClick={newProblem}
        >
          <Plus size={15} /> Bài mới
        </button>
        {phase === "solution" && solution && (
          <>
            <button
              className="solve-primary"
              aria-label="Lưu bài giải"
              disabled={!!busy || diagramBusy}
              onClick={() => void save()}
            >
              <Save size={15} />{" "}
              {busy === "save" ? "Đang lưu…" : "Lưu bài giải"}
            </button>
            <button aria-label="In / PDF" onClick={() => printSolution()}>
              <Printer size={15} /> In
            </button>
          </>
        )}
        <Link className="solve-history-link" href="/history">
          Lịch sử
        </Link>
        <details className="solve-more" ref={moreMenu}>
          <summary aria-label="Thao tác khác" title="Thao tác khác">
            <Ellipsis size={18} />
          </summary>
          <div className="solve-more-content">
            <Link href="/history" onClick={closeMoreMenu}>
              Lịch sử
            </Link>
            {phase === "solution" && solution && (
              <>
                <button
                  disabled={!!busy || diagramBusy}
                  onClick={() => {
                    closeMoreMenu();
                    void save(true);
                  }}
                >
                  Lưu bản sao
                </button>
                {!isGuidedSolution(solution) && (
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      closeMoreMenu();
                      void toStudio();
                    }}
                  >
                    <BookOpen size={15} /> Soạn thành bài giảng
                  </button>
                )}
              </>
            )}
            {saved.length > 0 && (
              <details className="solve-recent">
                <summary>
                  Bài giải đã lưu <ChevronDown size={14} />
                </summary>
                <div>
                  {saved.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        closeMoreMenu();
                        openSavedSession(s);
                      }}
                    >
                      <span>{s.title}</span>
                      <small>
                        {new Date(s.updatedAt).toLocaleString("vi-VN")}
                      </small>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}
