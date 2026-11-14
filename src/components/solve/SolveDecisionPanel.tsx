"use client";
import type { GuidedProblem } from "@/lib/solve-guided-contracts";
import { solveDecisionLabel } from "@/lib/solve-recommendation";
import { FormattedAIAnswer } from "../FormattedMath";

export function SolveDecisionPanel({
  problem,
  busy,
  onQuick,
}: {
  problem: GuidedProblem;
  busy: boolean;
  onQuick(): void;
}) {
  const a = problem.assessment,
    rec = problem.recommendation;
  if (
    !a ||
    !rec ||
    (!rec.choiceDistribution && !rec.statementDecisions?.length)
  )
    return null;
  return (
    <section
      className="solve-decision-panel"
      aria-labelledby="solve-decisions-heading"
    >
      <header>
        <h3 id="solve-decisions-heading">Đáp án ứng viên từ {solveDecisionLabel(rec.provider)}</h3>
        <span>Chưa xác minh bằng lập luận</span>
      </header>
      <p>
        Xác suất thể hiện mức đánh giá của model, không phải chứng minh. Bạn có
        thể xem kết quả nhanh hoặc yêu cầu giải sâu bên dưới.
      </p>
      {a.type === "multiple_choice" && rec.choiceDistribution && (
        <div className="solve-probabilities">
          {[
            ...a.items.map((item) => ({ id: item.id, content: item.content })),
            { id: "unknown", content: "Chưa xác định" },
          ].map((item) => (
            <div
              className="solve-probability-row"
              key={item.id}
              data-selected={rec.choiceSelection === item.id}
            >
              <strong>{item.id === "unknown" ? "?" : item.id}</strong>
              <div>
                <FormattedAIAnswer text={item.content} />
                <meter
                  min={0}
                  max={1}
                  value={rec.choiceDistribution![item.id] || 0}
                  aria-label={`Xác suất phương án ${item.id}`}
                />
              </div>
              <span>
                {Math.round((rec.choiceDistribution![item.id] || 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
      {a.type === "true_false" && rec.statementDecisions && (
        <ol className="solve-statement-decisions">
          {a.items.map((item) => {
            const decision = rec.statementDecisions?.find(
              (value) => value.itemId === item.id,
            );
            return (
              <li key={item.id}>
                <strong>
                  Ý {item.id} ·{" "}
                  {decision?.verdict === "true"
                    ? "Ứng viên: Đúng"
                    : decision?.verdict === "false"
                      ? "Ứng viên: Sai"
                      : "Chưa đủ chắc chắn"}
                </strong>
                <FormattedAIAnswer text={item.content} />
                {decision && (
                  <div className="solve-statement-probabilities">
                    <span>
                      Đúng {Math.round(decision.probabilities.true * 100)}%
                    </span>
                    <meter
                      min={0}
                      max={1}
                      value={decision.probabilities.true}
                      aria-label={`Xác suất đúng của ý ${item.id}`}
                    />
                    <span>
                      Sai {Math.round(decision.probabilities.false * 100)}%
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <button
        className="solve-primary"
        disabled={busy || !problem.methods.length}
        onClick={onQuick}
      >
        Xem kết quả nhanh & kiểm tra
      </button>
      <small>
        Mỗi ý được đánh giá từ phần dẫn chung; các mệnh đề khác không được dùng
        làm giả thiết.
      </small>
    </section>
  );
}
