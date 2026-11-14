"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { phases } from "./solve/shared";
import { SolveHeader } from "./solve/SolveHeader";
import { SolveInputPanel } from "./solve/SolveInputPanel";
import { useSolveWorkspace } from "./solve/useSolveWorkspace";
import { TunnelSourceCorrection } from "./TunnelSourceCorrection";

const SolveReviewPanel = dynamic(
  () => import("./solve/SolveReviewPanel").then((module) => module.SolveReviewPanel),
  { loading: () => <p role="status">Đang mở phần kiểm tra đề…</p> },
);
const SolveSolutionPanel = dynamic(
  () => import("./solve/SolveSolutionPanel").then((module) => module.SolveSolutionPanel),
  { loading: () => <p role="status">Đang mở lời giải…</p> },
);

export function SolveWorkspace() {
  const model = useSolveWorkspace();
  const {
    busy,
    error,
    hydrated,
    loadFailed,
    newProblem,
    notice,
    phase,
    prompt,
    session,
    dismissError,
    correctSourceFromError,
  } = model;
  return (
    <main className={`solve-workspace solve-phase-${phase}`}>
      <SolveHeader {...model.header} />
      {phase !== "solution" && (
        <ol className="solve-progress" aria-label="Tiến trình giải bài">
          {phases.map((label, i) => (
            <li
              key={label}
              aria-current={
                (phase === "input"
                  ? 0
                  : phase === "review"
                    ? 1
                    : session?.revision
                      ? 3
                      : 2) === i
                  ? "step"
                  : undefined
              }
            >
              <span>{i + 1}</span>
              <div>
                <strong>{label}</strong>
                <small>
                  {
                    [
                      "Chữ, công thức hoặc ảnh",
                      "Đáp án nhanh & phương pháp",
                      "Biến đổi & giải thích",
                      "Lưu lại để học tiếp",
                    ][i]
                  }
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!hydrated && <p role="status">Đang mở không gian giải…</p>}
      {error && (
        <div className="solve-error" role="alert">
          {error}
          <button aria-label="Ẩn lỗi" onClick={dismissError}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <p className="solve-notice" role="status">
          {notice}
        </p>
      )}
      {error && phase !== "input" && (
        <TunnelSourceCorrection
          source={prompt}
          disabled={!!busy}
          onConfirm={correctSourceFromError}
        />
      )}
      {loadFailed && (
        <section className="solve-input-card">
          <h2>Không mở được phiên đã chọn</h2>
          <p>
            Bản nháp trước không bị thay thế. Chọn một phiên đã lưu hoặc bắt đầu
            bài mới.
          </p>
          <button onClick={newProblem}>Bắt đầu bài mới</button>
        </section>
      )}
      <SolveInputPanel {...model.input} />
      {hydrated && !loadFailed && phase === "review" && <SolveReviewPanel {...model.review} />}
      {hydrated && !loadFailed && phase === "solution" && <SolveSolutionPanel {...model.result} />}
      <footer className="solve-page-foot">
        <span>
          Bản nháp được giữ trên thiết bị này. Dùng Lưu bài giải để đưa vào Lịch
          sử.
        </span>
        <Link href="/explore">
          Cần dựng / khám phá hình? Mở Khám phá
          <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
