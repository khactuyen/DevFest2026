"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/client";
import { assessmentTotal, type AssessmentQuestion, type ReviewGrade } from "@/lib/lesson-assessment";
import { studentIdentityLine, type StudentIdentity } from "@/lib/lesson-check-roster";
import { FormattedAIAnswer } from "./FormattedMath";

type Paper = {
  assessment: { title: string; questions: Pick<AssessmentQuestion, "kind" | "prompt" | "options" | "points">[] };
  identity: StudentIdentity;
  submittedAt?: string;
  answers?: string[];
  grade?: ReviewGrade;
};

export function LessonAssessmentStudent({ id }: { id: string }) {
  const [studentId, setStudentId] = useState("");
  const [code, setCode] = useState("");
  const [paper, setPaper] = useState<Paper>();
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultMode, setResultMode] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const pending = useRef(false);
  const receipt = useRef<HTMLHeadingElement>(null);
  const url = `/api/lesson-assessments/${encodeURIComponent(id)}/student`;

  useEffect(() => {
    let active: AbortController | undefined;
    function openResult() {
      active?.abort();
      const fragment = window.location.hash.slice(1);
      setResultMode(!!fragment);
      setPaper(undefined);
      setError("");
      setConfirmSubmit(false);
      setBusy(!!fragment);
      if (!fragment) return;
      const [student, token] = fragment.split(".");
      const controller = new AbortController();
      active = controller;
      void request<Paper>(url, { method: "POST", signal: controller.signal, body: JSON.stringify({ action: "result", student, token }) })
        .then((loaded) => { if (!controller.signal.aborted) setPaper(loaded); })
        .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }
    openResult();
    window.addEventListener("hashchange", openResult);
    return () => { active?.abort(); window.removeEventListener("hashchange", openResult); };
  }, [url]);

  useEffect(() => {
    if (paper?.submittedAt) receipt.current?.focus();
  }, [paper?.submittedAt]);

  async function send(action: "open" | "submit") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      if (action === "open") {
        const loaded = await request<Paper>(url, { method: "POST", body: JSON.stringify({ action, code, studentId }) });
        setPaper(loaded);
        setAnswers(loaded.assessment.questions.map(() => ""));
      } else {
        const result = await request<{ submittedAt: string }>(url, {
          method: "POST", body: JSON.stringify({ action, code, studentId, answers }),
        });
        setPaper((current) => current && { ...current, ...result });
        setAnswers([]);
        setConfirmSubmit(false);
      }
    } catch (reason) {
      setError(reason instanceof TypeError || reason instanceof SyntaxError
        ? "Chưa kết nối được với máy chủ. Hãy thử lại."
        : reason instanceof Error ? reason.message : "Chưa xử lý được yêu cầu.");
    } finally { pending.current = false; setBusy(false); }
  }

  function setAnswer(index: number, answer: string) {
    setAnswers((current) => current.map((entry, at) => index === at ? answer : entry));
  }

  const total = paper?.assessment.questions.reduce((sum, question) => sum + question.points, 0);
  const incomplete = paper?.assessment.questions.filter((question, index) => {
    const answer = answers[index]?.trim();
    return !answer || question.kind === "true-false" && answer.split(" ").includes("-");
  }).length ?? 0;
  const editing = !!paper && !paper.submittedAt && !paper.grade;
  return <main className="lesson-check lesson-assessment-student">
    <header className="lesson-check-header"><div><h1>{paper?.assessment.title ?? (resultMode ? "Kết quả phiếu kiểm tra" : "Làm phiếu kiểm tra")}</h1>
      {paper && <p>{studentIdentityLine(paper.identity)}</p>}</div></header>
    {!paper && !resultMode && <form className="lesson-check-panel" onSubmit={(event) => { event.preventDefault(); void send("open"); }}>
      <label className="lesson-check-field">Mã học sinh<input required autoComplete="off" spellCheck={false} maxLength={60}
        value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Ví dụ HS001" aria-describedby="worksheet-student-id-help" /></label>
      <small id="worksheet-student-id-help">Bắt buộc. Nhập mã học sinh do giáo viên cung cấp.</small>
      <label className="lesson-check-field">Mã làm bài<input required autoComplete="off" spellCheck={false} maxLength={30} value={code}
        onChange={(event) => setCode(event.target.value)} placeholder="Mã riêng giáo viên đã phát" /></label>
      <button className="gs-primary" type="submit" disabled={busy || !studentId.trim() || !code.trim()}>Mở phiếu</button>
    </form>}
    {paper?.grade && <section className="lesson-check-panel">
      <h2>Kết quả đã duyệt · {assessmentTotal(paper.grade)}/{total} điểm</h2>
      {paper.grade.feedback && <FormattedAIAnswer as="p" text={paper.grade.feedback} />}
      {paper.assessment.questions.map((question, index) => <article className="lesson-assessment-item" key={index}>
        <h3>Câu {index + 1} · {paper.grade!.items[index].score}/{question.points} điểm</h3>
        <FormattedAIAnswer text={question.prompt} />
        <p><strong>Bài làm </strong><FormattedAIAnswer as="span" text={paper.answers?.[index] || "Bỏ trống"} /></p>
        {paper.grade!.items[index].feedback && <FormattedAIAnswer as="p" text={paper.grade!.items[index].feedback} />}
      </article>)}
    </section>}
    {paper?.submittedAt && !paper.grade && <section className="lesson-check-panel">
      <h2 ref={receipt} tabIndex={-1}>Đã nộp bài</h2><p>Kết quả sẽ được gửi sau khi giáo viên duyệt nếu bạn có email trong danh sách lớp.</p>
    </section>}
    {paper && editing && <form className="lesson-check-panel" onSubmit={(event) => {
      event.preventDefault();
      if (!busy) { setError(""); setConfirmSubmit(true); }
    }}>
      {paper.assessment.questions.map((question, index) => <fieldset key={index} className="lesson-check-panel" disabled={busy}>
        <legend>Câu {index + 1} · {question.points} điểm</legend>
        <FormattedAIAnswer text={question.prompt} />
        {question.kind === "multiple" ? question.options.map((option, at) => <div key={at} className="lesson-check-confirm">
          <input type="radio" name={`question-${index}`} value={"ABCD"[at]} checked={answers[index] === "ABCD"[at]}
            id={`question-${index}-${at}`} aria-labelledby={`letter-${index}-${at} option-${index}-${at}`}
            onChange={(event) => setAnswer(index, event.target.value)} />
          <label id={`letter-${index}-${at}`} htmlFor={`question-${index}-${at}`}>{"ABCD"[at]}.</label>
          <div id={`option-${index}-${at}`}><FormattedAIAnswer text={option} /></div>
        </div>) : question.kind === "true-false" ? question.options.map((option, at) => <div key={at}>
          <FormattedAIAnswer text={option} />
          <label className="lesson-check-field">Ý {"abcd"[at]}<select value={answers[index]?.split(" ")[at] || "-"} onChange={(event) => {
            const entries = (answers[index] || "- - - -").split(" ");
            entries[at] = event.target.value;
            setAnswer(index, entries.join(" "));
          }}><option value="-">Chọn đúng hoặc sai</option><option value="Đ">Đúng</option><option value="S">Sai</option></select></label>
        </div>) : <label className="lesson-check-field">Trả lời câu {index + 1}
          <textarea rows={question.kind === "written" ? 6 : 2} maxLength={2000} value={answers[index] ?? ""}
            onChange={(event) => setAnswer(index, event.target.value)} />
        </label>}
      </fieldset>)}
      {confirmSubmit ? <section className="lesson-assessment-item" aria-labelledby="worksheet-submit-title">
        <h3 id="worksheet-submit-title">Xác nhận nộp phiếu</h3>
        {incomplete > 0 && <p>{incomplete} câu chưa trả lời đầy đủ. Bạn vẫn có thể nộp.</p>}
        <p>Bài làm được khóa sau khi nộp.</p>
        {error && <p role="alert" className="gs-alert">{error} Bài làm vẫn còn trên trang.</p>}
        <div className="lesson-check-actions">
          <button className="gs-secondary" type="button" disabled={busy} onClick={() => { setConfirmSubmit(false); setError(""); }}>Quay lại làm bài</button>
          <button className="gs-primary" type="button" disabled={busy} onClick={() => void send("submit")}>
            {busy ? "Đang nộp…" : error ? "Thử nộp lại" : "Xác nhận nộp bài"}
          </button>
        </div>
      </section> : <button className="gs-primary" type="submit" disabled={busy}>Nộp bài</button>}
    </form>}
    {busy && !editing && <p role="status">Đang xử lý…</p>}
    {error && !editing && <p role="alert" className="gs-alert">{error}</p>}
  </main>;
}
