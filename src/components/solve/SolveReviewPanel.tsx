"use client";

import { isGuidedProblem } from "@/lib/solve-guided-contracts";
import { solveModeLabel } from "@/lib/solve-mode";
import { sourceOutline } from "@/lib/solve-source";
import { SolveVerificationPanel } from "./SolveVerificationPanel";
import { SolveDecisionPanel } from "./SolveDecisionPanel";
import { QUESTION_TYPES, detectQuestionType } from "@/lib/solve-question";
import { canAttemptSolve } from "@/lib/solve-review";
import { solveDecisionLabel } from "@/lib/solve-recommendation";
import { ArrowLeft, Zap } from "lucide-react";
import { FormattedAIAnswer } from "../FormattedMath";

import type { SolveReviewProps as Props } from "./view-contracts";
export function SolveReviewPanel(model: Props) {
  const {
    busy,
    quickAnswer,
    revealQuickAnswer,
    chooseMethod,
    goBack,
    hydrated,
    loadFailed,
    phase,
    problem,
    prompt,
    recognition,
    solveMode,
    questionType,
  } = model;
  const outline = sourceOutline(prompt);
  const resolvedType = isGuidedProblem(problem)
    ? problem.assessment?.type || "essay"
    : questionType === "auto"
      ? detectQuestionType(prompt) || "essay"
      : questionType;
  const guided = isGuidedProblem(problem);
  const direct = !guided || !!problem?.directSolver;
  const decisionLabel = solveDecisionLabel(problem?.recommendation?.provider);
  return (
    <>
      {!loadFailed && hydrated && phase === "review" && problem && (
        <section className="solve-review-card">
          <div className="solve-card-heading">
            <span className="solve-step-number">2</span>
            <div>
              <h2>Chọn cách xem kết quả</h2>
              <p>
                {solveModeLabel(solveMode)} · Đối chiếu đề và chọn cách giải.
                Kết quả được đối chiếu trước khi trả trạng thái kiểm chứng.
              </p>
            </div>
          </div>

          <div className="solve-review-main">
            <section
              className="solve-source-outline"
              aria-label="Đề đã chuẩn hóa"
            >
              <p className="solve-question-type">
                Loại câu hỏi:{" "}
                <strong>
                  {
                    QUESTION_TYPES.find((item) => item.id === resolvedType)
                      ?.label
                  }
                </strong>
              </p>
              <strong>
                {outline.items.length
                  ? "Phần dẫn / giả thiết chung"
                  : "Đề đã chuẩn hóa"}
              </strong>
              <FormattedAIAnswer
                text={outline.common || "Chưa có phần dẫn chung."}
              />
              {!!outline.items.length && (
                <div>
                  <strong>
                    {isGuidedProblem(problem) &&
                    problem.assessment?.type === "true_false"
                      ? "Các mệnh đề cần đánh giá, không phải giả thiết"
                      : "Các phương án / yêu cầu riêng"}
                  </strong>
                  <ol>
                    {outline.items.map((item) => (
                      <li key={item.id}>
                        <b>{item.id}) </b>
                        <FormattedAIAnswer text={item.content} />
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
            {isGuidedProblem(problem) && problem.recommendation ? (
              <div className="solve-jev-intro">
                <span className="solve-ai-badge">
                  {decisionLabel} gợi ý phương pháp
                </span>
                {!canAttemptSolve(problem) && (
                  <p role="alert">{problem.warnings.join(" ")}</p>
                )}
                {problem.figureContext && (
                  <details>
                    <summary>Mô tả hình nguồn · cần đối chiếu</summary>
                    <FormattedAIAnswer
                      text={
                        problem.figureContext.description ||
                        "Chưa có mô tả hình chắc chắn."
                      }
                    />
                    <p>
                      Ảnh sẽ được gửi kèm khi bạn yêu cầu LLM giải thích. Mô
                      tả và hình phác chưa được coi là dữ kiện đã xác minh.
                    </p>
                  </details>
                )}
              </div>
            ) : isGuidedProblem(problem) ? (
              <details className="solve-ai-review solve-analysis-details">
                <summary>Dữ kiện và yêu cầu đã đọc</summary>

                {problem.assessment && (
                  <p className="solve-question-type">
                    Loại câu hỏi:{" "}
                    <strong>
                      {
                        QUESTION_TYPES.find(
                          (item) => item.id === problem.assessment?.type,
                        )?.label
                      }
                    </strong>
                  </p>
                )}
                <h3>{problem.topic}</h3>
                <FormattedAIAnswer text={problem.summary} />
                {problem.figureContext && (
                  <details className="solve-figure-context">
                    <summary>Hình nguồn và thông tin đã đọc</summary>
                    {recognition?.containsDiagram && (
                      <img
                        src={recognition.imageDataUrl}
                        alt="Hình nguồn của đề toán"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 240,
                          objectFit: "contain",
                        }}
                      />
                    )}
                    <p>
                      {problem.figureContext.imageProvided
                        ? "Ảnh đã được gửi cùng bước phân tích; thông tin nhận diện vẫn cần đối chiếu."
                        : "Chỉ có mô tả hình, chưa gửi ảnh nguồn để phân tích."}
                    </p>
                    <FormattedAIAnswer
                      text={
                        problem.figureContext.description ||
                        "Chưa có mô tả hình chắc chắn."
                      }
                    />
                    {problem.figureContext.ambiguities.length > 0 && (
                      <ul>
                        {problem.figureContext.ambiguities.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </details>
                )}
                {!problem.recommendation && (
                  <div className="solve-ai-facts">
                    <div>
                      <strong>Dữ kiện đã đọc</strong>
                      <ul>
                        {problem.givens.map((item, i) => (
                          <li key={i}>
                            <FormattedAIAnswer text={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Yêu cầu của đề</strong>
                      <ul>
                        {problem.goals.map((item, i) => (
                          <li key={i}>
                            <FormattedAIAnswer text={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {problem.assessment &&
                  problem.assessment.items.length > 0 && (
                    <details className="solve-assessment-items" open>
                      <summary>
                        {problem.assessment.type === "true_false"
                          ? "Các mệnh đề cần xét — không phải giả thiết"
                          : "Các lựa chọn của đề"}
                      </summary>
                      <ul>
                        {problem.assessment.items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.id}) </strong>
                            <FormattedAIAnswer text={item.content} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                {problem.warnings.length > 0 && (
                  <div className="solve-ai-warnings" role="alert">
                    <strong>
                      {problem.status === "contradictory"
                        ? "Đề có kết luận không suy ra từ dữ kiện"
                        : problem.status === "caution"
                          ? "Lưu ý — vẫn có thể thử giải"
                          : "Cần xác nhận dữ kiện"}
                    </strong>
                    <ul>
                      {problem.warnings.map((item, i) => (
                        <li key={i}>
                          <FormattedAIAnswer text={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {problem.status === "caution" && (
                  <p>
                    Khi bấm “Giải thích theo cách này”, LLM mới xử lý dữ kiện
                    gốc và trình bày chi tiết. Lời giải AI sẽ ghi rõ nếu có
                    giả định hoặc chỉ giải được một phần; kết quả chưa được bộ
                    giải xác minh.
                  </p>
                )}
                {!!problem.reviewIssues?.length && (
                  <details>
                    <summary>Cơ sở của cảnh báo</summary>
                    {problem.reviewIssues.map((issue, i) => (
                      <div key={i}>
                        <strong>{issue.detail}</strong>
                        {issue.evidence && (
                          <div>
                            Dữ kiện / bằng chứng:{" "}
                            <FormattedAIAnswer text={issue.evidence} />
                          </div>
                        )}
                        {issue.neededFor && (
                          <div>
                            Cần cho:{" "}
                            <FormattedAIAnswer text={issue.neededFor} />
                          </div>
                        )}
                        {issue.impact && (
                          <div>
                            Ảnh hưởng:{" "}
                            <FormattedAIAnswer text={issue.impact} />
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                {!canAttemptSolve(problem) && (
                  <p>
                    Hãy quay lại sửa hoặc xác nhận câu cần giải trước khi dựng
                    lời giải.
                  </p>
                )}
              </details>
            ) : (
              <>
                <details className="solve-math-details">
                  <summary>Xem dữ kiện đã thu gọn</summary>
                  <div className="solve-normalized">
                    <FormattedAIAnswer
                      text={`\\[${problem.equationLatex}\\]`}
                    />
                  </div>
                  <dl className="solve-problem-data">
                    <div>
                      <dt>Dạng bài</dt>
                      <dd>
                        {problem.relation === "="
                          ? "Phương trình"
                          : "Bất phương trình"}
                        , bậc {problem.degree}
                      </dd>
                    </div>
                    <div>
                      <dt>Dữ kiện sau thu gọn</dt>
                      <dd>
                        a = {problem.coefficients.a}; b ={" "}
                        {problem.coefficients.b}; c = {problem.coefficients.c}
                      </dd>
                    </div>
                    <div>
                      <dt>Miền xét</dt>
                      <dd>{problem.domain}</dd>
                    </div>
                    <div>
                      <dt>Cần tìm</dt>
                      <dd>{problem.goal}</dd>
                    </div>
                  </dl>
                </details>
              </>
            )}
            <div className="solve-local-status" role="status">
              {isGuidedProblem(problem) && problem.directSolver ? (
                "Bộ giải trực tiếp · Không gọi AI để tính đáp án"
              ) : problem.recommendation ? (
                <>
                  <strong>
                    {problem.recommendation.accepted
                      ? `${decisionLabel} đã chọn phương pháp ưu tiên`
                      : `${decisionLabel} chưa đủ chắc chắn để ưu tiên một phương pháp`}
                  </strong>
                  <span>
                    {" "}
                    · Mức tin cậy lựa chọn:{" "}
                    {Math.round(problem.recommendation.confidence * 100)}%
                  </span>
                  <p>
                    Gợi ý này chưa xác minh đáp án. Bạn chọn cách giải và lúc
                    cần LLM giải thích.
                  </p>
                </>
              ) : isGuidedProblem(problem) ? (
                problem.assessment?.type === "short_answer" ? (
                  "Trả lời ngắn · Tạo kết quả trước, xem giải thích khi cần"
                ) : (
                  "Đối chiếu dữ kiện rồi chọn cách tiếp cận bên dưới"
                )
              ) : (
                "Bộ giải trực tiếp · Bạn chọn cách giải phù hợp"
              )}
            </div>
            {isGuidedProblem(problem) && (
              <SolveDecisionPanel
                problem={problem}
                busy={!!busy}
                onQuick={() =>
                  void chooseMethod(problem.methods[0]?.id, "quick")
                }
              />
            )}
            <div className="solve-method-heading">
              <h3>
                {isGuidedProblem(problem)
                  ? problem.directSolver
                    ? "Xem các bước tính"
                    : problem.assessment?.type === "short_answer"
                      ? "Tạo đáp án ngắn"
                      : canAttemptSolve(problem)
                        ? `${problem.recommendation ? decisionLabel : "AI"} gợi ý ${problem.methods.length} cách tiếp cận`
                        : `${problem.recommendation ? decisionLabel : "AI"} đã xét ${problem.methods.length} cách tiếp cận · cần sửa đề`
                  : "Chọn phương pháp"}
              </h3>
              {direct && (
                <button
                  type="button"
                  disabled={!!busy || (guided && !canAttemptSolve(problem))}
                  onClick={() => {
                    if (guided) void chooseMethod(problem.methods[0]?.id, "quick");
                    else revealQuickAnswer();
                  }}
                  aria-expanded={guided ? undefined : !!quickAnswer}
                  aria-controls={!guided && quickAnswer ? "solve-direct-quick-answer" : undefined}
                >
                  <Zap size={16} aria-hidden="true" />
                  {busy ? "Đang tính kết quả…" : "Xem đáp án nhanh"}
                </button>
              )}
            </div>
            {!guided && quickAnswer && (
              <div id="solve-direct-quick-answer">
                <SolveVerificationPanel solution={quickAnswer} />
              </div>
            )}
            <div className="solve-methods">
              {problem.methods.map((m, i) => (
                <button
                  key={m.id}
                  disabled={
                    !!busy ||
                    (isGuidedProblem(problem) && !canAttemptSolve(problem))
                  }
                  onClick={() => void chooseMethod(m.id)}
                >
                  <div className="solve-method-card-top">
                    <span className="solve-method-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {(problem.recommendation?.preferredMethod === m.id ||
                      (!problem.recommendation &&
                        !isGuidedProblem(problem) &&
                        i === 0)) && (
                      <em className="solve-method-recommended">
                        {problem.recommendation ? `${decisionLabel} đề xuất` : "Đề xuất"}
                      </em>
                    )}
                  </div>
                  <strong>{m.label}</strong>
                  <div className="solve-method-description">
                    <FormattedAIAnswer text={m.description} />
                  </div>
                  {"plan" in m && m.plan && (
                    <ol className="solve-method-plan">
                      {m.plan.map((part, index) => (
                        <li key={index}>
                          <FormattedAIAnswer text={part} />
                        </li>
                      ))}
                    </ol>
                  )}
                  <small>
                    {isGuidedProblem(problem) && !canAttemptSolve(problem)
                      ? "Cần sửa đề trước khi giải"
                      : busy === m.id
                        ? "Đang xây dựng lời giải…"
                        : isGuidedProblem(problem)
                          ? problem.directSolver
                            ? "Xem các bước tính trực tiếp →"
                            : problem.assessment?.type === "short_answer"
                              ? "Tính đáp án & kiểm tra →"
                              : "Giải sâu / kiểm tra theo cách này →"
                          : "Tính đáp án và xem các bước →"}
                  </small>
                </button>
              ))}
            </div>
            <button className="solve-back" onClick={goBack}>
              <ArrowLeft size={15} /> Sửa đề / dữ kiện
            </button>
          </div>
        </section>
      )}
    </>
  );
}
