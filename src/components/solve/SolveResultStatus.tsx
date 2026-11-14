"use client";
import type { SolveResultReview } from "@/lib/solve-result-review";
const labels = {
  answer_verified: "Đáp án đã kiểm tra",
  scope_checked: "Đã kiểm tra trong phạm vi hỗ trợ",
  unverified: "Chưa xác minh đầy đủ",
  partial: "Kết quả một phần · còn nội dung chưa xác minh",
};
export function SolveResultStatus({ review }: { review: SolveResultReview }) {
  return (
    <section
      className={`solve-result-status solve-result-${review.status}`}
      aria-labelledby="solve-result-status-heading"
    >
      <h3 id="solve-result-status-heading">{labels[review.status]}</h3>
      <p>{review.summary}</p>
      <details>
        <summary>Phạm vi kiểm tra và xử lý bất đồng</summary>
        <ul>
          {review.checks.map((check) => (
            <li key={check.itemId}>
              <strong>
                {check.itemId === "answer" ? "Đáp án" : `Ý ${check.itemId}`} ·{" "}
                {check.status === "verified"
                  ? "Đã kiểm tra"
                  : check.status === "conflict"
                    ? "Còn bất đồng"
                    : "Chưa xác minh"}
              </strong>
              <p>{check.detail}</p>
            </li>
          ))}
        </ul>
        {!!review.disputes.length && (
          <div>
            <h4>Phần đã kiểm tra lại</h4>
            {review.disputes.map((item) => (
              <article key={item.itemId}>
                <strong>
                  {item.itemId} · Đề xuất: {item.proposed} / Giải sâu:{" "}
                  {item.reasoned}
                </strong>
                <p>
                  {item.resolution === "deterministic"
                    ? "Đã phân xử bằng bộ giải xác định."
                    : item.resolution === "reasoning_recheck"
                      ? "Lượt suy luận riêng đồng thuận; chưa phải kiểm chứng toán học tự động."
                      : "Chưa phân xử được; không kết luận theo đa số model."}
                </p>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        )}
        {!!review.unresolvedItems.length && (
          <p>Cần kiểm tra thêm: {review.unresolvedItems.join(", ")}.</p>
        )}
      </details>
    </section>
  );
}
