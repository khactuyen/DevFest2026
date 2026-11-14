import type { Material } from "./contracts";

export type MaterialPublishIssue = {
  message: string;
  stage: "info" | "outline" | "edit" | "finish";
  stepId?: string;
  blockId?: string;
};

/** Shared by the Studio checklist and server release gate. Notes are advisory. */
export function materialPublishIssues(m: Material): MaterialPublishIssue[] {
  const issues: MaterialPublishIssue[] = [];
  if (!m.title.trim()) issues.push({ message: "Thêm tiêu đề học liệu.", stage: "info" });
  if (!m.metadata.grade.trim()) issues.push({ message: "Chọn cấp học.", stage: "info" });
  if (!m.metadata.topic.trim()) issues.push({ message: "Nhập chủ đề.", stage: "info" });
  if (m.sourcePages?.length && !m.sourceReviewedAt) issues.push({ message: "Đối chiếu nội dung với tài liệu nguồn và xác nhận trước khi xuất bản.", stage: "finish" });
  if (!m.blocks.length) issues.push({ message: "Thêm ít nhất một nội dung vào học liệu.", stage: "edit" });
  const assigned = new Set(m.learningSteps.flatMap(step => step.blockIds));
  for (const step of m.learningSteps) {
    if (!step.blockIds.length) issues.push({ message: `Thêm nội dung cho “${step.title}”.`, stage: "edit", stepId: step.id });
    if (step.visualActions.length && !m.blocks.some(block => block.type === "visual" && block.visualId === step.visualId && step.blockIds.includes(block.id)))
      issues.push({ message: `Bước “${step.title}” cần có block mô hình tương ứng với các hành động trực quan.`, stage: "edit", stepId: step.id });
  }
  if (!m.blocks.some(block => block.type === "visual" || block.content.trim())) issues.push({ message: "Bổ sung nội dung trước khi xuất bản.", stage: "edit" });
  for (const block of m.blocks) {
    const sourceLayout = block.examQuestion?.useSourceLayout !== false && !!block.examQuestion?.sourceImages?.length;
    const target = { stage: "edit" as const, stepId: m.learningSteps.find(step => step.blockIds.includes(block.id))?.id, blockId: block.id };
    if (!assigned.has(block.id)) issues.push({ message: `Gắn “${block.title || block.id}” vào một hoạt động.`, ...target });
    if (sourceLayout) issues.push({ message: "Trích xuất nội dung hoặc nhập câu hỏi từ ảnh PDF trước khi xuất bản.", ...target });
    if (block.examQuestion?.reviewFlags?.length) issues.push({ message: `Đối chiếu câu PDF: ${block.examQuestion.reviewFlags.join(", ")}.`, ...target });
    if ((block.type === "exercise" || block.authorKind === "question") && !sourceLayout && !block.content.trim()) issues.push({ message: `Nhập nội dung cho câu hỏi “${block.title || "Câu hỏi"}”.`, ...target });
    if (block.authorKind === "image" && !block.content.trim()) issues.push({ message: `Thêm ảnh cho thành phần “${block.title || "Hình minh họa"}”.`, ...target });
    if (block.board) {
      const visual = m.visuals.find((item) => item.id === block.visualId);
      if (visual?.boardItems?.some((item) => item.kind === "image" && !item.assetUrl?.startsWith(`/api/material-assets/${m.id}/`))) {
        issues.push({ message: `Mở “${block.title || "Bảng vẽ"}” và bấm Áp dụng vào bài để lưu ảnh vào học liệu này.`, ...target });
      }
    }
    if (block.type === "exercise" && block.assessment?.type === "multiple" && (
      (!sourceLayout && (!block.assessment.options || block.assessment.options.length < 2 || block.assessment.options.some(option => !option.trim()))) ||
      block.assessment.correctIndex === undefined || block.assessment.correctIndex >= (block.assessment.options?.length ?? 0)
    )) issues.push({ message: `Hoàn thiện lựa chọn và đáp án đúng cho “${block.title || "Câu hỏi"}”.`, ...target });
    if (block.type === "exercise" && block.assessment?.type === "short" && block.examQuestion?.kind !== "written" && !block.assessment.answer?.trim()) issues.push({ message: `Nhập đáp án tham khảo cho “${block.title || "Câu hỏi"}”.`, ...target });
    if (block.examQuestion?.kind === "true-false" && (
      (!sourceLayout && (block.assessment?.options?.length !== 4 || block.assessment.options.some((value) => !value.trim()))) ||
      !/^[ĐS]( [ĐS]){3}$/.test(block.assessment?.answer || "")
    )) issues.push({ message: "Hoàn thiện cả bốn mệnh đề và chọn Đúng hoặc Sai cho từng ý.", ...target });
  }
  return issues;
}

/** Navigation, visibility and save/revision metadata do not alter reviewed content. */
export function retainMaterialReview(previous: Material, next: Material): Material {
  const keys = ["title", "summary", "metadata", "sourcePages", "reviewNotes", "blocks", "visuals", "learningSteps", "exam"] as const;
  const changed = keys.some(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return previous.sourceReviewedAt && next.sourceReviewedAt === previous.sourceReviewedAt && changed
    ? { ...next, sourceReviewedAt: undefined } : next;
}
