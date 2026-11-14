"use client";

import { useEffect, useRef, useState } from "react";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { examKinds, examLevels, examPartLabels, examQuestions, type ExamSettings } from "@/lib/exam-document";
import { ExamQuestionProposalSchema, type ExamQuestionCounts, type ProposedExamQuestion } from "@/lib/exam-question-generation";

type Matrix = NonNullable<ExamSettings["matrix"]>;
export type MatrixProposal = { question: ProposedExamQuestion; matrixId: string };

export function ExamMatrix({ material, remaining, disabled, onChange, onInsert }: {
  material: Material; remaining: number; disabled: boolean; onChange: (matrix: Matrix) => void;
  onInsert: (items: MatrixProposal[], replaceId?: string) => void;
}) {
  const matrix = material.exam?.matrix || [];
  const questions = examQuestions(material);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const assigned = (id: string) => questions.filter(({ question }) => question.examQuestion?.matrixId === id);
  const planned = matrix.reduce((sum, row) => sum + row.count, 0);
  const missing = matrix.flatMap((row) => {
    const count = row.count - assigned(row.id).length;
    return count > 0 ? [{ row, count }] : [];
  });
  function update(id: string, patch: Partial<Matrix[number]>) {
    onChange(matrix.map((row) => row.id === id ? { ...row, ...patch } : row));
  }
  async function generate(targets: typeof missing, replaceId?: string) {
    if (pending.current || disabled) return;
    const total = targets.reduce((sum, item) => sum + item.count, 0);
    if (!total || targets.some(({ row }) => !row.topic.trim()) || total > remaining + (replaceId ? 1 : 0)) {
      setMessage("Kiểm tra chủ đề của từng ô và số câu còn có thể thêm."); return;
    }
    const controller = new AbortController();
    pending.current = controller; setBusy(replaceId || targets.map(({ row }) => row.id).join(",")); setMessage("");
    try {
      const existing = questions.map(({ question }) => question.content.slice(0, 600));
      const proposed: MatrixProposal[] = [];
      for (const { row, count } of targets) {
        const counts: ExamQuestionCounts = { multiple: 0, "true-false": 0, short: 0, written: 0, [row.kind]: count };
        const instruction = `Chủ đề kiểm tra: ${row.topic}. Mức độ: ${row.level}. Mỗi câu thuộc đúng chủ đề và mức độ đã chọn.`;
        const { questions: generated } = ExamQuestionProposalSchema.parse(await request("/api/studio-generate", {
          method: "POST", signal: controller.signal, body: JSON.stringify({
            mode: "examQuestions", source: `${instruction}\n${source}`.slice(0, 24000), counts,
            subject: material.exam?.subject || "Toán", grade: material.metadata.grade, matrixTarget: { topic: row.topic.trim(), level: row.level },
            existing: existing.slice(0, 50 - count),
          }),
        }));
        if (generated.length !== count || generated.some(({ kind }) => kind !== row.kind)) throw Error("Số câu trả về chưa khớp ma trận.");
        for (const question of generated) {
          proposed.push({ question: { ...question, points: row.points }, matrixId: row.id });
          existing.push(question.prompt.slice(0, 600));
        }
      }
      controller.signal.throwIfAborted();
      onInsert(proposed, replaceId);
      setMessage(replaceId ? "Đã tạo lại câu đã chọn." : `Đã thêm ${total} câu theo ma trận.`);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Chưa tạo được câu theo ma trận.");
    } finally { pending.current = null; setBusy(""); }
  }
  return <details className="exam-matrix">
    <summary>Ma trận đề</summary>
    <p>{questions.length}/{planned} câu · {questions.reduce((sum, { question }) => sum + (question.assessment?.points || 0), 0)}/{matrix.reduce((sum, row) => sum + row.count * row.points, 0)} điểm · {questions.filter(({ question }) => !matrix.some(({ id }) => id === question.examQuestion?.matrixId)).length} câu chưa gán ô</p>
    <label>Nội dung tham khảo<textarea rows={2} maxLength={23000} value={source} onChange={(event) => setSource(event.target.value)} /></label>
    {matrix.map((row, index) => {
      const linked = assigned(row.id);
      return <fieldset key={row.id} disabled={disabled || !!busy}>
        <legend>Ô {index + 1} · {linked.length}/{row.count} câu · {linked.reduce((sum, { question }) => sum + (question.assessment?.points || 0), 0)}/{row.count * row.points} điểm</legend>
        <div className="exam-matrix-fields">
          <label>Chủ đề<input maxLength={120} value={row.topic} onChange={(event) => update(row.id, { topic: event.target.value })} /></label>
          <label>Mức độ<select value={row.level} onChange={(event) => update(row.id, { level: event.target.value as Matrix[number]["level"] })}>{examLevels.map((level) => <option key={level}>{level}</option>)}</select></label>
          <label>Dạng câu<select value={row.kind} disabled={!!linked.length} onChange={(event) => update(row.id, { kind: event.target.value as Matrix[number]["kind"] })}>{examKinds.map((kind) => <option key={kind} value={kind}>{examPartLabels[kind]}</option>)}</select></label>
          <label>Số câu<input type="number" min={1} max={50} value={row.count} onChange={(event) => update(row.id, { count: Math.max(1, Math.min(50, Math.trunc(+event.target.value) || 1)) })} /></label>
          <label>Điểm/câu<input type="number" min={1} max={100} value={row.points} onChange={(event) => update(row.id, { points: Math.max(1, Math.min(100, Math.trunc(+event.target.value) || 1)) })} /></label>
        </div>
        <div className="exam-inline-tools">
          <button type="button" disabled={!row.topic.trim() || row.count <= linked.length} onClick={() => void generate([{ row, count: row.count - linked.length }])}>Tạo câu còn thiếu</button>
          <button type="button" onClick={() => onChange(matrix.filter(({ id }) => id !== row.id))}>Xóa ô</button>
          {linked.map(({ question, number, figures }) => <button type="button" key={question.id} disabled={!!question.examQuestion?.sourceImages?.length}
            onClick={() => void generate([{ row, count: 1 }], question.id)}>Tạo lại câu {number}{figures.length ? " và bỏ hình cũ" : ""}</button>)}
        </div>
      </fieldset>;
    })}
    <div className="exam-inline-tools">
      <button type="button" disabled={disabled || !!busy || matrix.length >= 20} onClick={() => onChange([...matrix, {
        id: crypto.randomUUID(), topic: "", level: "Nhận biết", kind: "multiple", count: 1, points: 1,
      }])}>Thêm ô ma trận</button>
      {!!missing.length && <button type="button" disabled={disabled || !!busy} onClick={() => void generate(missing)}>Tạo tất cả câu còn thiếu</button>}
      {busy && <button type="button" onClick={() => pending.current?.abort()}>Hủy tạo</button>}
    </div>
    {(busy || message) && <p role="status">{busy ? "Đang soạn câu theo ma trận…" : message}</p>}
  </details>;
}
