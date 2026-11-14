"use client";

import type { Material } from "@/lib/contracts";
import { MaterialImage } from "./MaterialImage";

export function MaterialSourceReview({ material, finish = false, busy = false, onFinish, onConfirm, onQuestion }: {
  material: Material;
  finish?: boolean;
  busy?: boolean;
  onFinish: () => void;
  onConfirm: () => void;
  onQuestion: (blockId: string) => void;
}) {
  const hasSource = !!material.sourcePages?.length;
  if (!hasSource && !material.reviewNotes?.length) return null;
  const reviewed = !!material.sourceReviewedAt;
  const published = material.status === "published";
  const questions = material.blocks.filter(block => block.type === "exercise" || block.authorKind === "question");
  return <section className="gs-source-review" id="gs-source-confirmation" tabIndex={-1} aria-label="Đối chiếu trước khi xuất bản">
    <strong>{reviewed ? "Đã xác nhận đối chiếu" : "Đối chiếu trước khi xuất bản"}</strong>
    <p>{hasSource ? "Mở tài liệu nguồn, kiểm tra câu chữ, công thức, hình và đáp án. Sau đó xác nhận để xuất bản." : "Các gợi ý sau giúp bạn rà soát nội dung; không phải lỗi chặn xuất bản."}</p>
    {reviewed && <p role="status">Xác nhận đã được ghi nhận. Sửa nội dung, đáp án hoặc hình sẽ yêu cầu đối chiếu lại.</p>}
    {!!material.reviewNotes?.length && <details open={!reviewed}>
      <summary>{material.reviewNotes.length} gợi ý rà soát{reviewed ? " · đã xác nhận" : ""}</summary>
      <p>Đây là lời nhắc kiểm tra, không phải {material.reviewNotes.length} lỗi riêng cần bỏ qua.</p>
      <ul>{material.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </details>}
    {!!questions.length && !published && <details open={finish && !reviewed}>
      <summary>Mở câu hỏi và đáp án để kiểm tra ({questions.length})</summary>
      <div className="gs-review-question-list">{questions.map(block => <button type="button" className="gs-secondary" key={block.id} disabled={busy} onClick={() => onQuestion(block.id)}>Kiểm tra: {block.title || "Câu hỏi"}</button>)}</div>
    </details>}
    {hasSource && <details>
      <summary>Xem nội dung nguồn ({material.sourcePages!.length} trang)</summary>
      {material.sourcePages!.map((page, index) => <article key={index}><strong>{page.name}</strong>{page.imageUrl && <MaterialImage src={page.imageUrl} alt={`Trang nguồn ${index + 1}`} />}<p>{page.transcription}</p></article>)}
    </details>}
    {hasSource && !published && (finish
      ? <button type="button" className="gs-primary" disabled={reviewed || busy} onClick={onConfirm}>{reviewed ? "Đã đối chiếu và xác nhận" : "Tôi đã đối chiếu nguồn, câu hỏi và đáp án"}</button>
      : <button type="button" className="gs-secondary" disabled={busy} onClick={onFinish}>{reviewed ? "Xem kiểm tra xuất bản" : "Đi tới bước xác nhận xuất bản"}</button>)}
  </section>;
}
