"use client";

import { useEffect, useState } from "react";
import type { Material } from "@/lib/contracts";
import { examQuestions } from "@/lib/exam-document";
import { deleteBankQuestion, listBankQuestions, saveBankQuestion } from "@/lib/studio-question-bank";

export type BankQuestion = Awaited<ReturnType<typeof listBankQuestions>>[number];

export function StudioQuestionBank({ material, scope, stepId, disabled, onInsert }: {
  material: Material; scope: string; stepId?: string; disabled: boolean;
  onInsert: (entry: BankQuestion) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<BankQuestion[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choices = material.exam ? examQuestions(material).map(({ question, figures, number }) => ({ question, figures, label: `Câu ${number}` }))
    : material.learningSteps.filter(({ id }) => id === stepId).flatMap((step) => {
      const blocks = step.blockIds.flatMap((id) => material.blocks.find((block) => block.id === id) ?? []);
      const figures = blocks.filter((block) => block.type === "visual" || block.authorKind === "image");
      return blocks.filter((block) => block.type === "exercise").map((question) => ({ question, figures, label: question.title || step.title }));
    });
  const candidate = choices.find(({ question }) => question.id === selected);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void listBankQuestions(scope).then((items) => { if (active) setEntries(items); })
      .catch(() => { if (active) setMessage("Không mở được ngân hàng câu hỏi trên trình duyệt này."); });
    return () => { active = false; };
  }, [open, scope]);
  async function action(work: () => Promise<unknown>, success: string) {
    if (busy || disabled) return;
    setBusy(true); setMessage("");
    try { await work(); setEntries(await listBankQuestions(scope)); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không xử lý được câu hỏi."); }
    finally { setBusy(false); }
  }
  const filtered = entries.filter(({ question }) => `${question.title || ""} ${question.content}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi").trim()));
  return <details className="studio-question-bank" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Ngân hàng câu hỏi</summary>
    <p>Dùng chung giữa bài giảng và đề kiểm tra trên trình duyệt này.</p>
    <div className="exam-inline-tools">
      <label>Câu đang soạn<select value={candidate ? selected : ""} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Chọn câu để lưu</option>
        {choices.map(({ question, label }) => <option key={question.id} value={question.id}>{label} · {question.content.slice(0, 75)}</option>)}
      </select></label>
      <button type="button" disabled={!candidate || busy || disabled || !!candidate.question.examQuestion?.reviewFlags?.length}
        onClick={() => candidate && void action(() => saveBankQuestion(scope, material, candidate.question, candidate.figures), "Đã lưu câu và hình vào ngân hàng.")}>Lưu vào ngân hàng</button>
    </div>
    <label>Tìm câu hỏi<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="studio-bank-list">
      {filtered.map((entry) => <article key={entry.id}><p>{entry.question.content.slice(0, 230)}</p>
        <div className="exam-inline-tools">
          <button type="button" disabled={busy || disabled || !material.exam && !stepId} onClick={() => void action(() => onInsert(entry), "Đã chèn bản sao câu hỏi.")}>Chèn bản sao</button>
          <button type="button" disabled={busy || disabled} onClick={() => void action(() => deleteBankQuestion(scope, entry.id), "Đã xóa khỏi ngân hàng.")}>Xóa khỏi ngân hàng</button>
        </div>
      </article>)}
      {!filtered.length && <p>{query ? "Không tìm thấy câu phù hợp." : "Chưa có câu hỏi đã lưu."}</p>}
    </div>
    {(busy || message) && <p role="status">{busy ? "Đang xử lý câu hỏi…" : message}</p>}
  </details>;
}
