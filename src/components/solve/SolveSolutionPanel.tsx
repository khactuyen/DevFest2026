"use client";

import type { VisualRuntime } from "@/lib/runtime";
import { isGuidedSolution } from "@/lib/solve-guided-contracts";
import { solveModeLabel } from "@/lib/solve-mode";
import { readableProofContent } from "@/lib/solve-quality";
import {
  SOLVE_CYLINDER_3D_NOTE,
  SOLVE_PLANAR_3D_NOTE,
} from "@/lib/solve-visual-3d";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import { TUNNEL_NOTE } from "@/lib/tunnel-visual";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Expand,
  FileImage,
  Lightbulb,
  Minus,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { FloatingAiHeader, FloatingAiTrigger } from "../FloatingAi";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FormattedAIAnswer } from "../FormattedMath";
import { tabDestination } from "./shared";
import { SolveResultStatus } from "./SolveResultStatus";
import { solveDecisionLabel } from "@/lib/solve-recommendation";
import { SolvePrint } from "./SolvePrint";
import { SolveVerificationPanel } from "./SolveVerificationPanel";
import type { SolveSolutionProps as Props } from "./view-contracts";
const Visual = dynamic(() => import("../Visual").then((m) => m.Visual), {
  ssr: false,
  loading: () => <p role="status">Đang khởi tạo đồ thị…</p>,
});
export function SolveSolutionPanel(model: Props) {
  const {
    activeStep,
    ask,
    askBusy,
    askError,
    askOpen,
    busy,
    canFill,
    cancelAI,
    captureSelection,
    chatLauncher,
    chooseMethod,
    contentsMenu,
    currentMessages,
    displayVisual,
    displaying3d,
    edit,
    goBack,
    hint,
    hydrated,
    jumpToStep,
    loadFailed,
    mobileTab,
    move,
    phase,
    prompt,
    question,
    zoomVisual,
    onVisualReady,
    selected,
    onAssistantOpenChange,
    onHintChange,
    onMobileTabChange,
    onQuestionChange,
    useExample,
    setView,
    chooseVisualDimension,
    onVisualOpenChange,
    onSurfaceFillChange,
    showAll,
    solution,
    spatialView,
    step,
    visualOpen,
    visualSurfaceFill,
  } = model;
  const detailed = solution?.solveMode === "detailed";
  const guided = solution && isGuidedSolution(solution) ? solution : null;
  const verificationLabel = guided?.geminiVerified
    ? "Đáp án, điều kiện và các bước giải đã được Gemini Decision 1 rà soát."
    : detailed && guided?.resultReview?.status === "answer_verified"
      ? "Đáp án đã được bộ giải xác định kiểm tra."
      : null;
  return (
    <>
      {!loadFailed && hydrated && phase === "solution" && solution && (
        <>
          {visualOpen && (
            <div
              className="solve-mobile-tabs"
              role="tablist"
              aria-label="Nội dung bài giải"
            >
              {[
                ["steps", "Lời giải"],
                [
                  "visual",
                  isGuidedSolution(solution) ? "Hình minh họa" : "Đồ thị",
                ],
              ].map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={mobileTab === id}
                  id={`solve-content-tab-${id}`}
                  tabIndex={mobileTab === id ? 0 : -1}
                  onKeyDown={(e) => {
                    const next = tabDestination(e.key, ["steps", "visual"], id);
                    if (next) {
                      e.preventDefault();
                      onMobileTabChange(next);
                      document
                        .getElementById(`solve-content-tab-${next}`)
                        ?.focus();
                    }
                  }}
                  onClick={() => onMobileTabChange(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div
            className={`solve-columns show-${mobileTab}${visualOpen ? "" : " solve-without-visual"}`}
          >
            <div className="solve-reading-column">
              <section
                className="solve-solution-bar solve-problem-sheet"
                aria-labelledby="solve-problem-heading"
              >
                <header className="solve-sheet-heading">
                  <h2 id="solve-problem-heading">
                    <FileImage size={18} /> Đề bài
                  </h2>
                  <span className="solve-reviewed">
                    {isGuidedSolution(solution) &&
                    solution.origin !== "solver" ? (
                      <Sparkles size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                    {isGuidedSolution(solution)
                      ? solution.origin === "solver"
                        ? "Tính trực tiếp"
                        : solution.origin === "gemini-decision" || solution.origin === "jev"
                          ? `Kết quả nhanh từ ${solveDecisionLabel(solution.origin)}`
                          : "AI đã phân tích · cần đối chiếu"
                      : "Đề đã kiểm tra"}
                  </span>
                  <button
                    className="solve-icon-button"
                    aria-label="Sửa đề bài"
                    title="Sửa đề bài"
                    onClick={() => edit(prompt)}
                  >
                    <Pencil size={15} />
                  </button>
                </header>
                <div className="solve-original-source">
                  <FormattedAIAnswer text={prompt} />
                </div>
                {!isGuidedSolution(solution) && (
                  <div className="solve-source-equation">
                    <FormattedAIAnswer
                      text={`\\[${solution.problem.equationLatex}\\]`}
                    />
                  </div>
                )}
                <div className="solve-source-meta">
                  <span className="solve-mode-badge">
                    {solveModeLabel(solution.solveMode)}
                  </span>
                  <span>
                    {isGuidedSolution(solution)
                      ? solution.origin === "solver"
                        ? "Đáp án từ bộ giải xác định"
                        : solution.origin === "gemini-decision" || solution.origin === "jev"
                          ? `Đáp án ứng viên từ ${solveDecisionLabel(solution.origin)}`
                          : "Lời giải AI"
                      : `Tập xác định: ${solution.problem.domain}`}
                  </span>
                  <label htmlFor="solve-method">Phương pháp:</label>
                  {isGuidedSolution(solution) ? (
                    <>
                      <span id="solve-method">
                        {
                          solution.problem.methods.find(
                            (method) => method.id === solution.method,
                          )?.label
                        }
                      </span>
                      <button onClick={goBack}>
                        Chọn cách giải thích khác
                      </button>
                    </>
                  ) : (
                    <select
                      id="solve-method"
                      value={solution.method}
                      disabled={!!busy}
                      onChange={(e) => void chooseMethod(e.target.value)}
                    >
                      {solution.problem.methods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="solve-locked">
                    Dữ kiện gốc được giữ nguyên
                  </span>
                </div>
              </section>
              {!isGuidedSolution(solution) && (
                <SolveVerificationPanel solution={solution} />
              )}
              {verificationLabel && (
                <div className="solve-verified-badge" title={verificationLabel}>
                  <Check size={15} aria-hidden="true" /> Đã kiểm chứng
                </div>
              )}
              {!detailed && isGuidedSolution(solution) && solution.resultReview && (
                <SolveResultStatus review={solution.resultReview} />
              )}
              {isGuidedSolution(solution) &&
                solution.origin !== "llm" &&
                solution.problem.recommendation && (
                  <div className="solve-deep-action">
                    <p>Cần lời giải hoặc kiểm tra sâu hơn?</p>
                    <button
                      className="solve-primary"
                      disabled={!!busy}
                      onClick={() => void chooseMethod(solution.method, "deep")}
                    >
                      Giải sâu & đối chiếu kết quả
                    </button>
                  </div>
                )}
              <section className="solve-steps-column">
                {isGuidedSolution(solution) &&
                  solution.resultKind !== "complete" && (
                    <aside className="solve-ai-warnings" role="status">
                      <strong>
                        {solution.resultKind === "conditional"
                          ? "Lời giải có điều kiện — chưa phải đáp án xác định của đề gốc"
                          : "Lời giải một phần — chưa hoàn tất mọi yêu cầu"}
                      </strong>
                      {solution.assumptions?.map((text, i) => (
                        <div key={i}>
                          Giả định: <FormattedAIAnswer text={text} />
                        </div>
                      ))}
                      {solution.unresolvedGoals?.map((id) => (
                        <div key={id}>
                          Chưa kết luận:{" "}
                          <FormattedAIAnswer
                            text={solution.problem.goals[id]}
                          />
                        </div>
                      ))}
                      {solution.reviewIssues
                        ?.filter((issue) => issue.kind !== "advisory")
                        .map((issue, i) => (
                          <div key={i}>
                            <FormattedAIAnswer
                              text={`${issue.detail} ${issue.neededFor} ${issue.impact}`}
                            />
                          </div>
                        ))}
                    </aside>
                  )}
                <div className="solve-steps-head">
                  <h2>
                    <BookOpen size={18} /> Lời giải
                  </h2>
                  <div className="solve-reading-controls">
                    <div
                      className="solve-view-toggle"
                      role="group"
                      aria-label="Chế độ xem lời giải"
                    >
                      <button
                        aria-pressed={!showAll}
                        onClick={() => setView(false)}
                      >
                        Từng bước
                      </button>
                      <button
                        aria-pressed={showAll}
                        onClick={() => setView(true)}
                      >
                        Toàn bộ
                      </button>
                    </div>
                    <details className="solve-contents" ref={contentsMenu}>
                      <summary>
                        Mục lục <ChevronDown size={13} />
                      </summary>
                      <nav
                        className="solve-step-nav"
                        aria-label="Các bước giải"
                      >
                        {solution.steps.map((s, i) => (
                          <button
                            key={s.id}
                            aria-current={i === activeStep ? "step" : undefined}
                            onClick={() => {
                              jumpToStep(i);
                              if (contentsMenu.current)
                                contentsMenu.current.open = false;
                            }}
                          >
                            <span>{i + 1}.</span> {s.title}
                          </button>
                        ))}
                      </nav>
                    </details>
                  </div>
                </div>
                <nav
                  className="solve-step-controls"
                  aria-label="Điều hướng bước giải"
                >
                  <button
                    disabled={!activeStep}
                    onClick={() => jumpToStep(activeStep - 1)}
                  >
                    <ArrowLeft size={15} /> Bước trước
                  </button>
                  <span aria-live="polite">
                    Bước {activeStep + 1}/{solution.steps.length}
                  </span>
                  <button
                    disabled={activeStep === solution.steps.length - 1}
                    onClick={() => jumpToStep(activeStep + 1)}
                  >
                    Bước tiếp <ArrowRight size={15} />
                  </button>
                </nav>
                <p className="solve-step-instruction">
                  Chọn tên một bước để làm nổi bật đối tượng trên đồ thị. Bấm
                  “Giải thích bằng AI” khi cần trợ giúp thêm.
                </p>
                <div
                  id="solve-current-step"
                  onMouseUp={captureSelection}
                  onKeyUp={captureSelection}
                >
                  {(showAll ? solution.steps : step ? [step] : []).map((s) => (
                    <article
                      className={`solve-step-card${solution.steps.indexOf(s) === activeStep ? " is-active" : ""}`}
                      id={`solve-step-${solution.steps.indexOf(s)}`}
                      data-solve-step={solution.steps.indexOf(s)}
                      key={s.id}
                    >
                      <header className="solve-step-heading">
                        <h3>
                          <button
                            className="solve-step-select"
                            aria-current={
                              solution.steps.indexOf(s) === activeStep
                                ? "step"
                                : undefined
                            }
                            onClick={() => move(solution.steps.indexOf(s))}
                          >
                            <span className="solve-step-index">
                              {solution.steps.indexOf(s) + 1}
                            </span>
                            <span className="solve-step-title">{s.title}</span>
                          </button>
                        </h3>
                        <button
                          className="solve-step-explain"
                          disabled={askBusy}
                          aria-label={`Giải thích bằng AI bước ${solution.steps.indexOf(s) + 1}`}
                          onClick={() => {
                            const index = solution.steps.indexOf(s);
                            move(index);
                            void ask("detail", index);
                          }}
                        >
                          <Sparkles size={14} /> Giải thích bằng AI
                        </button>
                      </header>
                      <FormattedAIAnswer
                        text={
                          isGuidedSolution(solution)
                            ? readableProofContent(s, solution.quality?.version)
                            : s.content
                        }
                        compactDisplaySpacing
                      />
                      {solution.steps.indexOf(s) === activeStep && (
                        <>
                          <div className="solve-support-actions">
                            {selected && (
                              <button
                                className="solve-primary solve-selection-ask"
                                onClick={() => onAssistantOpenChange(true)}
                              >
                                <Sparkles size={14} /> Hỏi AI về đoạn chọn
                              </button>
                            )}
                            <button
                              aria-pressed={hint === "hint"}
                              onClick={() =>
                                onHintChange(hint === "hint" ? null : "hint")
                              }
                            >
                              <Lightbulb size={14} />
                              Gợi ý
                            </button>
                            <button
                              aria-pressed={hint === "explanation"}
                              onClick={() =>
                                onHintChange(
                                  hint === "explanation" ? null : "explanation",
                                )
                              }
                            >
                              Vì sao bước này đúng?
                            </button>
                          </div>
                          {hint && (
                            <aside className="solve-hint">
                              <strong>
                                {hint === "hint"
                                  ? "Gợi ý, chưa thêm đáp án"
                                  : "Cơ sở của phép biến đổi"}
                              </strong>
                              <FormattedAIAnswer text={s[hint]} />
                            </aside>
                          )}
                        </>
                      )}
                    </article>
                  ))}
                </div>
                {isGuidedSolution(solution) &&
                  (showAll || activeStep === solution.steps.length - 1) && (
                    <article className="solve-step-card solve-conclusion">
                      <h3>
                        {solution.resultKind === "conditional"
                          ? "Kết quả có điều kiện — chưa phải đáp án xác định của đề gốc"
                          : solution.resultKind === "partial"
                            ? "Kết quả một phần"
                            : "Kết luận"}
                      </h3>
                      {solution.assumptions?.length > 0 && (
                        <div>
                          <strong>Giả định dùng riêng cho lời giải này:</strong>
                          <ul>
                            {solution.assumptions.map((text, i) => (
                              <li key={i}>
                                <FormattedAIAnswer text={text} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {solution.unresolvedGoals?.length > 0 && (
                        <div>
                          <strong>Chưa kết luận được:</strong>
                          <ul>
                            {solution.unresolvedGoals.map((id) => (
                              <li key={id}>
                                <FormattedAIAnswer
                                  text={solution.problem.goals[id]}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <FormattedAIAnswer text={solution.answer} />
                    </article>
                  )}
                {isGuidedSolution(solution) && solution.warning && (
                  <aside className="solve-ai-warnings" role="alert">
                    <strong>Lưu ý về lời giải AI</strong>
                    <FormattedAIAnswer text={solution.warning} />
                  </aside>
                )}
                <details className="solve-variant">
                  <summary>Thử thay đổi dữ kiện / cách giải</summary>
                  <p>
                    Dữ kiện hiện tại được khóa để hình và lời giải không mâu
                    thuẫn. Sửa đề sẽ tạo phiên mới và bỏ lời giải cũ; bản đã lưu
                    vẫn còn.
                  </p>
                  <button
                    onClick={() => {
                      useExample(prompt);
                    }}
                  >
                    Tạo biến thể từ đề này
                  </button>
                  <button onClick={goBack}>Chọn phương pháp khác</button>
                </details>
                {!detailed && isGuidedSolution(solution) && (
                  <details className="solve-verification">
                    <summary>
                      <Check size={14} />{" "}
                      {isGuidedSolution(solution)
                        ? "Trạng thái kiểm chứng"
                        : "Kiểm tra bằng bộ giải xác định"}
                    </summary>
                    <p>{solution.verification}</p>
                  </details>
                )}
              </section>
            </div>
            {visualOpen && (
              <aside className="solve-visual-column" id="solve-graph-panel">
                <div className="solve-visual-step" role="status">
                  <span>
                    Bước {activeStep + 1} / {solution.steps.length}
                  </span>
                  <strong>{step?.title}</strong>
                </div>
                <div className="solve-visual-title">
                  <h2>
                    {isGuidedSolution(solution) ? "Hình minh họa" : "Đồ thị"}
                  </h2>
                  <div className="solve-zoom">
                    <button
                      className="solve-icon-button"
                      aria-label={
                        isGuidedSolution(solution) ? "Ẩn hình" : "Ẩn đồ thị"
                      }
                      title="Ẩn hình để đọc toàn màn hình"
                      onClick={() => {
                        onVisualOpenChange(false);
                        onMobileTabChange("steps");
                      }}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      className="solve-icon-button"
                      aria-label="Thu nhỏ đồ thị"
                      onClick={() => zoomVisual("out")}
                    >
                      <Minus size={15} />
                    </button>
                    <button
                      className="solve-icon-button"
                      aria-label="Phóng to đồ thị"
                      onClick={() => zoomVisual("in")}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      className="solve-icon-button"
                      aria-label="Vừa khung đồ thị"
                      title="Vừa khung"
                      onClick={() => zoomVisual("fit")}
                    >
                      <Expand size={14} />
                    </button>
                  </div>
                </div>
                {solution.visual ? (
                  <>
                    <div className="solve-view-controls">
                      <div role="group" aria-label="Chế độ hình minh họa">
                        <button
                          aria-pressed={!displaying3d}
                          onClick={() => {
                            if (!displaying3d) return;
                            chooseVisualDimension("2d");
                          }}
                        >
                          2D
                        </button>
                        <button
                          aria-pressed={displaying3d}
                          disabled={!spatialView.spec}
                          title={
                            spatialView.error ||
                            "Xoay và quan sát trong không gian 3D"
                          }
                          onClick={() => {
                            if (displaying3d) return;
                            chooseVisualDimension("3d");
                          }}
                        >
                          3D
                        </button>
                      </div>
                      <button
                        aria-pressed={visualSurfaceFill}
                        disabled={!canFill}
                        title={
                          canFill
                            ? "Bật/tắt phần mặt; vẫn giữ cạnh và nhãn"
                            : "Hình này không có mặt hoặc vùng kín để tô"
                        }
                        onClick={() => onSurfaceFillChange(!visualSurfaceFill)}
                      >
                        {visualSurfaceFill ? "Tắt tô mặt" : "Tô mặt"}
                      </button>
                    </div>
                    {spatialView.error && (
                      <p className="solve-visual-note" role="status">
                        Chưa hỗ trợ góc nhìn 3D cho hình này:{" "}
                        {spatialView.error}
                      </p>
                    )}
                    <Visual
                      key={`${mobileTab}-${displaying3d ? "3d" : "2d"}`}
                      spec={displayVisual || null}
                      fitContent={isGuidedSolution(solution)}
                      keepAspectRatio={isGuidedSolution(solution)}
                      interactionHint={
                        displaying3d
                          ? "Kéo để xoay · Cuộn để zoom · Dữ kiện gốc được giữ nguyên"
                          : "Cuộn để phóng to · Dữ kiện gốc được giữ nguyên"
                      }
                      onRuntimeReady={(r) => {
                        if ("snapshot" in r)
                          onVisualReady(
                            r as VisualRuntime | ThreeVisualRuntime,
                          );
                      }}
                    />
                    <p className="solve-visual-note">
                      {displaying3d ? (
                        isGuidedSolution(solution) &&
                        solution.visual3d?.accessibility?.description ? (
                          solution.visual3d.accessibility.description
                        ) : solution.visual.source?.key ===
                          "tunnel-parabolic" ? (
                          TUNNEL_NOTE
                        ) : solution.visual.source?.key ===
                          "solve-cylinder-revolution" ? (
                          SOLVE_CYLINDER_3D_NOTE
                        ) : (
                          SOLVE_PLANAR_3D_NOTE
                        )
                      ) : isGuidedSolution(solution) ? (
                        solution.visualWarning
                      ) : (
                        <>
                          Đồ thị biểu diễn đa thức sau chuyển vế.{" "}
                          {solution.problem.relation === "="
                            ? "Nghiệm phương trình là hoành độ giao điểm với trục Ox."
                            : `Giao điểm với Ox là mốc xét dấu, không phải toàn bộ tập nghiệm. Chọn các khoảng có f(x) ${solution.problem.relation.replace("<=", "≤").replace(">=", "≥")} 0 theo đề.`}{" "}
                          Hình minh họa không thay thế phép tính chính xác.
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <div className="solve-visual-note">
                    <p>{solution.visualWarning}</p>
                    {isGuidedSolution(solution) && <Link href="/explore">Tự dựng hình trong Khám phá</Link>}
                  </div>
                )}
              </aside>
            )}
          </div>
          {!askOpen && <FloatingAiTrigger className="solve-chat-launcher" buttonRef={chatLauncher}
            controls="solve-assistant" label="Hỏi AI" onOpen={() => onAssistantOpenChange(true)} />}
          {askOpen && step && (
            <aside
              id="solve-assistant"
              role="dialog"
              className="solve-assistant floating-ai-panel"
              aria-label="Trợ giảng cho bước đang chọn"
            >
              <FloatingAiHeader title="Trợ giảng Toán AI" closeLabel="Đóng trợ giảng" onClose={() => {
                cancelAI();
                onAssistantOpenChange(false);
                requestAnimationFrame(() => chatLauncher.current?.focus());
              }} />
              <div className="solve-ask-context">
                <small>ĐỀ · PHƯƠNG PHÁP · BƯỚC {activeStep + 1}</small>
                <strong>{step.title}</strong>
                {selected && (
                  <>
                    <blockquote>{selected}</blockquote>
                    <button
                      onClick={() => {
                        cancelAI();
                      }}
                    >
                      Bỏ đoạn chọn
                    </button>
                  </>
                )}
                <p>
                  AI chỉ được gọi khi bạn yêu cầu giải thích. Câu trả lời đã có
                  được dùng lại cho phương pháp và bước này. Nhận xét AI cần đối
                  chiếu với lời giải.
                </p>
              </div>
              <div className="solve-ask-messages" aria-live="polite">
                {currentMessages.map((m, i) => (
                  <div key={i}>
                    <b>{m.question}</b>
                    <FormattedAIAnswer text={m.answer} />
                    <small>Giải thích AI · chưa được bộ giải kiểm chứng</small>
                  </div>
                ))}
                {askError && <p role="alert">{askError}</p>}
                {askBusy && <p role="status">AI đang xem bước đã chọn…</p>}
              </div>
              <div className="solve-ask-shortcuts">
                <button disabled={askBusy} onClick={() => void ask("hint")}>
                  Gợi ý AI
                </button>
                <button disabled={askBusy} onClick={() => void ask("detail")}>
                  Giải thích kỹ hơn
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask();
                }}
              >
                <label htmlFor="solve-question">
                  Câu hỏi về bước / đoạn đang chọn
                </label>
                <textarea
                  id="solve-question"
                  maxLength={1000}
                  value={question}
                  onChange={(e) => onQuestionChange(e.target.value)}
                  placeholder="Vì sao cần lấy cả hai dấu ±?"
                  rows={2}
                />
                <button
                  className="solve-primary"
                  disabled={askBusy || question.trim().length < 2}
                >
                  Gửi câu hỏi
                  <ArrowRight size={15} />
                </button>
              </form>
            </aside>
          )}
          <SolvePrint prompt={prompt} solution={solution} />
        </>
      )}
    </>
  );
}
