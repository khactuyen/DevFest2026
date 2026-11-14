"use client";

import { ShieldCheck } from "lucide-react";
import type { SolveSolution } from "@/lib/solve-engine";
import { FormattedAIAnswer } from "../FormattedMath";

export function SolveVerificationPanel({
  solution,
}: {
  solution: SolveSolution;
}) {
  const report = solution.verificationReport;
  const inequality = solution.problem.relation !== "=";
  return (
    <section
      className="solve-check-panel"
      aria-labelledby="solve-check-heading"
    >
      <header>
        <ShieldCheck size={20} />
        <div>
          <h3 id="solve-check-heading">Đã xác minh bằng tính toán chính xác</h3>
          <p>
            {inequality
              ? "Đã xét dấu và kiểm tra việc nhận hoặc loại các đầu mút."
              : report.checks.length
                ? "Thay từng nghiệm vào cả hai vế của đề ban đầu."
                : "Đã kiểm tra bậc, dấu hệ số và số nghiệm thực."}
          </p>
        </div>
      </header>
      <div className="solve-answer-summary">
        <span>Kết quả</span>
        <FormattedAIAnswer text={`\\[${solution.answer}\\]`} />
      </div>
      <details className="solve-check-details">
        <summary>
          Xem phép kiểm tra
          {report.checks.length
            ? ` · ${report.checks.length} ${inequality ? "mốc xét dấu" : "nghiệm"}`
            : ""}
        </summary>
        <p>Hai vế được giữ riêng và thu gọn trước khi thay giá trị:</p>
        <FormattedAIAnswer text={`\\[${report.originalEquationLatex}\\]`} />
        {report.checks.map((check, i) => (
          <div className="solve-root-check" key={i}>
            <FormattedAIAnswer text={`\\(x=${check.root}\\)`} />
            <FormattedAIAnswer text={`\\[${check.substitutionLatex}\\]`} />
            <span>
              {inequality
                ? check.included
                  ? "Hai vế bằng nhau · nhận đầu mút này."
                  : "Hai vế bằng nhau · loại đầu mút vì dấu bất đẳng thức nghiêm ngặt."
                : "Vế trái = Vế phải · nghiệm thỏa mãn đề ban đầu."}
            </span>
          </div>
        ))}
        <p>{solution.verification}</p>
        {inequality && (
          <p>
            Kiểm tra các mốc bằng phép thế được kết hợp với bảng xét dấu trong
            lời giải để xác định toàn bộ tập nghiệm.
          </p>
        )}
      </details>
    </section>
  );
}
