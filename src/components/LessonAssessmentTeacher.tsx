"use client";

import { useEffect, useRef, useState } from "react";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { examQuestions } from "@/lib/exam-document";
import { assessmentKinds, assessmentTotal, type AssessmentQuestion, type AssessmentSummary, type ReviewGrade, type StudentAssessment } from "@/lib/lesson-assessment";
import { formatAssessmentEmail } from "@/lib/lesson-assessment-email-format";
import { studentIdentityLine, type LessonCheckStudent } from "@/lib/lesson-check-roster";
import { FormattedAIAnswer } from "./FormattedMath";
import { LessonAssessmentLink, lessonAssessmentPath } from "./LessonAssessmentShare";

const route = "/api/lesson-assessments";
const labels = { multiple: "Trắc nghiệm", "true-false": "Đúng–sai", short: "Trả lời ngắn", written: "Tự luận" };
type Student = Omit<StudentAssessment, "grading" | "delivery"> & {
  grading: boolean; delivery?: { sentAt?: string; error?: string; uncertain?: boolean; testOnly?: boolean };
};
type Board = { assessment: AssessmentSummary & { questions: AssessmentQuestion[] }; students: Student[]; mailMode: "email" | "local" | "unavailable" };
type Batch = { material: Material; students: LessonCheckStudent[] };
const post = <T,>(url: string, input: unknown) => request<T>(url, { method: "POST", body: JSON.stringify(input) });

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function status(student: Student) {
  if (student.delivery?.sentAt && student.delivery.testOnly) return "Đã ghi thư thử";
  if (student.delivery?.sentAt) return "Đã gửi";
  if (student.delivery?.error) return "Lỗi gửi";
  if (student.delivery) return "Đang gửi hoặc chờ thử lại";
  if (student.review?.approved) return student.email ? "Đã duyệt" : "Đã duyệt · Thiếu email";
  if (!student.submittedAt) return "Chưa nộp";
  if (student.grading) return "Đang chấm";
  if (student.review) return "Đã lưu nhận xét";
  if (student.needsReview?.length) return "Cần kiểm tra";
  if (student.suggestion) return "Có điểm đề xuất";
  return "Chờ chấm";
}

function StudentReview({ student, questions, busy, act, mailMode, onSend }: {
  student: Student; questions: AssessmentQuestion[]; busy: boolean; act: (input: Record<string, unknown>) => void;
  mailMode: Board["mailMode"]; onSend: () => void;
}) {
  const prior = student.review?.grade ?? student.suggestion;
  const [scores, setScores] = useState(() => questions.map((_, index) =>
    prior && (student.review || !student.needsReview?.includes(index)) ? String(prior.items[index]?.score ?? "") : ""));
  const [remarks, setRemarks] = useState(() => questions.map((_, index) => prior?.items[index]?.feedback || ""));
  const [overall, setOverall] = useState(prior?.feedback || "");
  const [email, setEmail] = useState(student.email);
  const locked = !!student.delivery && !student.delivery.testOnly && (!student.delivery.error || !!student.delivery.uncertain);
  const draftEdited = useRef(false);
  useEffect(() => {
    if (draftEdited.current || student.review || !student.suggestion) return;
    const suggestion = student.suggestion;
    setScores(suggestion.items.map((item, index) => student.needsReview?.includes(index) ? "" : String(item.score)));
    setRemarks(suggestion.items.map((item) => item.feedback));
    setOverall(suggestion.feedback);
  }, [student]);
  const valid = scores.every((score, index) => score.trim() && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= questions[index].points);
  function save(approved: boolean) {
    if (!valid) return;
    const grade: ReviewGrade = { items: scores.map((score, index) => ({ score: Number(score), feedback: remarks[index] })), feedback: overall };
    act({ action: "review", student: student.key, grade, approved, version: student.review?.version ?? null });
  }
  return <section className="lesson-assessment-review" aria-label={`Bài làm của ${studentIdentityLine(student)}`}>
    <div className="lesson-check-actions">
      <label className="lesson-check-field">Email học sinh<input type="email" value={email} maxLength={254} disabled={locked}
        onChange={(event) => setEmail(event.target.value)} /></label>
      <button type="button" className="gs-secondary" disabled={busy || locked || email.trim() === student.email}
        onClick={() => act({ action: "email", student: student.key, email: email.trim() })}>Lưu email</button>
    </div>
    {!student.submittedAt ? <p>Học sinh chưa nộp bài.</p> : <>
      {!student.review && !student.grading &&
        <button className="gs-secondary" type="button" disabled={busy} onClick={() => act({ action: "grade", student: student.key })}>Chấm lại</button>}
      {questions.map((question, index) => <article className="lesson-assessment-item" key={index}>
        <strong>Câu {index + 1} · {question.points} điểm</strong>
        <FormattedAIAnswer text={question.prompt} />
        <div className="lesson-assessment-answer"><strong>Bài làm</strong>
          <FormattedAIAnswer text={student.answers?.[index] || "Bỏ trống"} /></div>
        <div><strong>Đáp án tham chiếu</strong> <FormattedAIAnswer text={question.answer} /></div>
        {question.rubric && <div><strong>Tiêu chí chấm</strong> <FormattedAIAnswer text={question.rubric} /></div>}
        {student.suggestion && <p><strong>Đề xuất chấm</strong> {student.suggestion.items[index].score}/{question.points} · {student.suggestion.items[index].feedback}</p>}
        {student.needsReview?.includes(index) && <small>Cần giáo viên kiểm tra câu này.</small>}
        <label className="lesson-check-field">Điểm câu {index + 1}<input type="number" min={0} max={question.points} step="any"
          value={scores[index]} disabled={locked} onChange={(event) => {
            draftEdited.current = true;
            setScores(scores.map((score, at) => at === index ? event.target.value : score));
          }} /></label>
        <label className="lesson-check-field">Nhận xét câu {index + 1}<textarea rows={2} maxLength={1200} value={remarks[index]} disabled={locked}
          onChange={(event) => {
            draftEdited.current = true;
            setRemarks(remarks.map((remark, at) => at === index ? event.target.value : remark));
          }} /></label>
      </article>)}
      <label className="lesson-check-field">Nhận xét chung<textarea rows={3} maxLength={1800} value={overall} disabled={locked}
        onChange={(event) => { draftEdited.current = true; setOverall(event.target.value); }} /></label>
      {student.delivery?.error && <p role="alert">{student.delivery.error}</p>}
      <div className="lesson-check-actions">
        {!locked && <>
          <button className="gs-secondary" type="button" disabled={busy || !valid} onClick={() => save(false)}>Lưu bản chấm</button>
          <button className="gs-primary" type="button" disabled={busy || !valid} onClick={() => save(true)}>Duyệt kết quả</button>
        </>}
        <button className="gs-secondary" type="button"
          disabled={busy || !canSendResult(student, mailMode)} onClick={onSend}>
          Gởi email kết quả
        </button>
      </div>
    </>}
  </section>;
}

function canSendResult(student: Student, mode: Board["mailMode"]) {
  if (!student.review?.approved) return false;
  if (mode !== "email") return !student.delivery?.sentAt || student.delivery.testOnly === true;
  return !!student.email && (!student.delivery?.sentAt || student.delivery.testOnly === true);
}

function PublishForm({ batch, busy, onPublish }: { batch: Batch; busy: boolean; onPublish: (questions: AssessmentQuestion[]) => void }) {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(() => examQuestions(batch.material).map(({ question, kind }) => ({
    kind, prompt: question.content,
    options: question.assessment?.options || [],
    answer: kind === "multiple" ? "ABCD"[question.assessment?.correctIndex ?? -1] || "" : question.assessment?.answer || "",
    rubric: question.assessment?.explanation || "",
    points: question.assessment?.points || 1,
  })));
  function change(index: number, next: Partial<AssessmentQuestion>) {
    setQuestions((current) => current.map((question, at) => at === index ? { ...question, ...next } : question));
  }
  return <form className="lesson-assessment-review" onSubmit={(event) => { event.preventDefault(); onPublish(questions); }}>
    <p>Rà soát đáp án và thang điểm trước khi phát cho {batch.students.length} học sinh. Mỗi ý đúng–sai có cùng số điểm.</p>
    {batch.students.some((student) => !student.id) && <p>MathCos sẽ cấp mã học sinh cho các em còn thiếu mã. Xem mã trong danh sách sau khi phát.</p>}
    {questions.map((question, index) => <fieldset className="lesson-check-panel" key={index} disabled={busy}>
      <legend>Câu {index + 1}</legend>
      <FormattedAIAnswer text={question.prompt} />
      <div className="lesson-check-actions">
        <label className="lesson-check-field">Dạng câu {index + 1}<select value={question.kind} onChange={(event) => {
          const kind = event.target.value as AssessmentQuestion["kind"];
          change(index, { kind, answer: "", options: kind === "multiple" || kind === "true-false" ? ["", "", "", ""] : [] });
        }}>{assessmentKinds.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></label>
        <label className="lesson-check-field">Thang điểm câu {index + 1}<input type="number" min={1} max={100} required
          value={question.points || ""} onChange={(event) => change(index, { points: Number(event.target.value) })} /></label>
      </div>
      {question.options.map((option, at) => <label className="lesson-check-option" key={at}>{(question.kind === "multiple" ? "ABCD" : "abcd")[at]}
        <input required aria-label={`Phương án ${at + 1} câu ${index + 1}`} maxLength={400} value={option}
          onChange={(event) => change(index, { options: question.options.map((value, optionIndex) => optionIndex === at ? event.target.value : value) })} />
      </label>)}
      <label className="lesson-check-field">Đáp án câu {index + 1}<textarea required rows={2} maxLength={1200} value={question.answer}
        placeholder={question.kind === "multiple" ? "A, B, C hoặc D" : question.kind === "true-false" ? "Ví dụ Đ S S Đ" : undefined}
        onChange={(event) => change(index, { answer: event.target.value })} /></label>
      {(question.kind === "short" || question.kind === "written") && <label className="lesson-check-field">Tiêu chí chấm câu {index + 1}
        <textarea required={question.kind === "written"} rows={2} maxLength={1600} value={question.rubric}
          onChange={(event) => change(index, { rubric: event.target.value })} /></label>}
    </fieldset>)}
    <button type="submit" className="gs-primary" disabled={busy}>Phát phiếu online</button>
  </form>;
}

export function LessonAssessmentTeacher({ lessonId, batch, initiallyOpen, prepareOnline }: {
  lessonId: string; batch?: Batch; initiallyOpen?: boolean; prepareOnline?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [board, setBoard] = useState<Board>();
  const [selected, setSelected] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ assessmentId: string; studentKey?: string }>();
  const emailPreviewPanel = useRef<HTMLElement>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const publishId = useRef("");
  const currentId = useRef("");
  const operation = useRef(false);
  const positionKey = `mathcos:assessment-position:${lessonId}`;
  const url = board ? new URL(lessonAssessmentPath(board.assessment.id), window.location.origin).href : "";
  const student = board?.students.find((row) => row.key === selected);
  const maxScore = board?.assessment.questions.reduce((sum, question) => sum + question.points, 0);
  const eligible = board?.students.filter((row) => canSendResult(row, board.mailMode)) || [];
  const missingEmail = board?.students.filter((row) => row.review?.approved && !row.email).length ?? 0;
  const sentEmails = board?.students.filter((row) => row.delivery?.sentAt && !row.delivery.testOnly).length ?? 0;
  const testEmails = board?.students.filter((row) => row.delivery?.sentAt && row.delivery.testOnly).length ?? 0;
  const previewOpen = !!board && emailPreview?.assessmentId === board.assessment.id;
  useEffect(() => {
    if (previewOpen) emailPreviewPanel.current?.scrollIntoView({ block: "nearest" });
  }, [previewOpen, emailPreview?.studentKey]);
  const previewStudent = board?.students.find((row) => row.key === emailPreview?.studentKey && row.review?.approved);
  const previewEmail = board && formatAssessmentEmail(
    board.assessment,
    previewStudent ?? { id: "", name: "Nguyễn Minh Anh" },
    previewStudent?.review?.grade ?? {
      items: board.assessment.questions.map((question) => ({ score: question.points, feedback: "" })),
      feedback: "Em trình bày rõ cách làm. Hãy ghi thêm điều kiện của mẫu số khi rút gọn phân số.",
    },
    "[Liên kết xem kết quả cá nhân]",
  );

  function report(reason: unknown) { setError(reason instanceof Error ? reason.message : "Chưa thể hoàn tất thao tác."); }
  function readPosition(): { open?: boolean; id?: string } {
    try { return JSON.parse(sessionStorage.getItem(positionKey) || "{}") || {}; }
    catch { return {}; }
  }
  function savePosition(position: { open?: boolean; id?: string }) {
    try { sessionStorage.setItem(positionKey, JSON.stringify({ ...readPosition(), ...position })); }
    catch { /* The panel still works when browser storage is unavailable. */ }
  }
  useEffect(() => { setRestoreOpen(readPosition().open === true); }, [positionKey]);

  useEffect(() => {
    if (!batch) setComposing(false);
    else if (prepareOnline) {
      publishId.current = "";
      setComposing(true);
    }
  }, [prepareOnline, batch]);

  async function loadHistory(selectLatest = true) {
    const records = await request<AssessmentSummary[]>(`${route}?lesson=${lessonId}`);
    setHistory(records);
    if (selectLatest && !currentId.current && records[0]) {
      const previous = readPosition().id;
      await select(records.find((record) => record.id === previous)?.id ?? records[0].id);
    }
  }
  async function refresh(id = board?.assessment.id) {
    if (!id) return;
    const updated = await request<Board>(`${route}/${id}`);
    if (currentId.current === id) setBoard(updated);
  }

  const boardId = board?.assessment.id;
  useEffect(() => {
    if (!opened || !boardId || busy || composing) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(boardId).catch(report);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [boardId, opened, busy, composing]);

  async function run(label: string, work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(label); setError(""); setMessage("");
    try { await work(); } catch (reason) { report(reason); }
    finally { operation.current = false; setBusy(""); }
  }

  async function select(id: string) {
    currentId.current = id;
    setSelected(""); setQr(""); setComposing(false);
    await refresh(id);
    savePosition({ id });
  }

  function publish(questions: AssessmentQuestion[]) {
    if (!batch) return;
    void run("Đang phát phiếu…", async () => {
      publishId.current ||= crypto.randomUUID();
      const { id } = await post<{ id: string }>(route, {
        lessonId, requestId: publishId.current, title: batch.material.title, students: batch.students,
        questions: questions.map((question) => ({ ...question, answer: question.kind === "multiple" || question.kind === "true-false"
          ? question.answer.trim().toUpperCase().replace(/\s+/g, " ") : question.answer })),
      });
      await select(id);
      publishId.current = "";
      await loadHistory();
      setMessage("Đã phát phiếu online.");
    });
  }

  function act(input: Record<string, unknown>) {
    if (!board) return;
    const id = board.assessment.id;
    void run("Đang cập nhật…", async () => {
      const result = await post<{ approved?: number }>(`${route}/${id}`, input);
      await refresh(id);
      if (input.action === "approve-ready") setMessage(`Đã duyệt ${result.approved ?? 0} bài có đề xuất đủ điểm.`);
      else if (input.action === "grade") setMessage("Đã yêu cầu chấm lại. Kết quả sẽ cập nhật trong danh sách.");
      else setMessage("Đã cập nhật.");
    });
  }

  function sendResults(recipients: Student[]) {
    if (!board || !recipients.length) return;
    setEmailPreview({ assessmentId: board.assessment.id, studentKey: recipients[0].key });
    if (board.mailMode === "unavailable") return;
    const testing = board.mailMode === "local";
    const sendable = testing ? recipients.filter((row) => row.email && !row.delivery?.sentAt) : recipients;
    if (!sendable.length) return;
    if (!testing && !window.confirm(sendable.length === 1 ? `Gửi kết quả đã duyệt đến ${sendable[0].email}?`
      : `Gửi email kết quả đã duyệt cho ${sendable.length} học sinh?`)) return;
    const id = board.assessment.id;
    void run("Đang gửi kết quả…", async () => {
      let sent = 0, failed = 0;
      for (const [index, row] of sendable.entries()) {
        setBusy(`${testing ? "Đang ghi thư thử" : "Đang gửi email"} ${index + 1}/${sendable.length}…`);
        try {
          const result = await post<Student>(`${route}/${id}`, { action: "send", student: row.key });
          if (result.delivery?.sentAt) sent++; else failed++;
        } catch (reason) {
          failed++;
          if ((reason as { code?: string }).code === "assessment_mail_unavailable") throw reason;
        }
        if (index < sendable.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      await refresh(id);
      setMessage(`${testing ? "Đã ghi thử" : "Đã gửi"} ${sent} thư${failed ? `, ${failed} thư chưa xử lý được` : ""}.`);
    });
  }

  return <details className="lesson-check-drive" open={initiallyOpen || restoreOpen || undefined} onToggle={(event) => {
    const isOpen = event.currentTarget.open;
    setRestoreOpen(isOpen);
    savePosition({ open: isOpen });
    if (isOpen && !opened) { setOpened(true); void run("Đang tải đợt kiểm tra…", () => loadHistory(!prepareOnline)); }
    else if (!isOpen) setOpened(false);
  }}>
    <summary>Phát và chấm phiếu online</summary>
    {opened && <div className="lesson-assessment-review">
      <div className="lesson-check-actions">
        {batch && <button type="button" className="gs-secondary" disabled={!!busy || composing} onClick={() => {
          publishId.current = ""; setComposing(true);
        }}>Soạn đáp án để phát phiếu</button>}
        {!!history.length && <label className="lesson-check-field">Đợt kiểm tra<select value={board?.assessment.id || ""} disabled={!!busy}
          onChange={(event) => { const id = event.target.value; if (id) void run("Đang mở đợt kiểm tra…", () => select(id)); }}>
          <option value="">Chọn đợt đã phát</option>
          {history.map((item) => <option key={item.id} value={item.id}>{item.title} · {new Date(item.createdAt).toLocaleString("vi-VN")}</option>)}
        </select></label>}
      </div>
      {!batch && !history.length && !board && <p>Tạo và xem trước một bộ phiếu để soạn đáp án và phát online.</p>}
      {batch && composing && <PublishForm batch={batch} busy={!!busy} onPublish={publish} />}
      {board && !composing && <>
        <h3>{board.assessment.title}</h3>
        <p>{board.students.filter((row) => row.submittedAt).length}/{board.students.length} đã nộp · {board.students.filter((row) => row.review?.approved).length} đã duyệt · {sentEmails} đã gửi email{testEmails > 0 && ` · ${testEmails} thư thử`}</p>
        <section className="lesson-assessment-item" aria-label="Gửi email kết quả">
          <h4>Gửi email kết quả cho học sinh</h4>
          {board.mailMode !== "email" && <p>Chưa bật gửi email thật. Bạn có thể xem trước nội dung thư.</p>}
          {eligible.length > 0 && <p>{eligible.length} bài đã duyệt{board.mailMode === "email" ? " có email, sẵn sàng gửi." : " có thể xem trước email."}</p>}
          {eligible.length === 0 && missingEmail === 0 && sentEmails === 0 && testEmails === 0 &&
            <p>Duyệt bài và lưu email học sinh trong mục Xem phiếu để gửi kết quả.</p>}
          {missingEmail > 0 && <p>{missingEmail} bài đã duyệt còn thiếu email. Mở từng phiếu để bổ sung.</p>}
          <div className="lesson-check-actions">
            <button className="gs-primary" type="button" disabled={!!busy || !eligible.length}
              onClick={() => sendResults(eligible)}>Gởi email kết quả</button>
            <button className="gs-secondary" type="button" aria-expanded={previewOpen} onClick={() => setEmailPreview(previewOpen
              ? undefined : { assessmentId: board.assessment.id, studentKey: student?.review?.approved ? student.key : eligible[0]?.key })}>
              {previewOpen ? "Ẩn mẫu email" : "Xem mẫu email"}
            </button>
          </div>
          {previewOpen && previewEmail && <section ref={emailPreviewPanel} className="lesson-assessment-item" aria-label="Mẫu email học sinh">
            <p><strong>Đến</strong> {previewStudent ? previewStudent.email || "Chưa nhập email" : "minhanh@example.test"}</p>
            <p><strong>Tiêu đề</strong> {previewEmail.subject}</p>
            <p className="lesson-assessment-email-body">{previewEmail.text}</p>
          </section>}
        </section>
        <LessonAssessmentLink key={board.assessment.id} assessmentId={board.assessment.id} />
        <div className="lesson-check-actions">
          <button className="gs-secondary" type="button" onClick={() => {
            if (qr) { setQr(""); return; }
            void import("qrcode").then(({ toDataURL }) => toDataURL(url, { width: 216, margin: 3 })).then(setQr).catch(report);
          }}>QR chung</button>
          <button className="gs-secondary" type="button" onClick={() => downloadCsv("ma-lam-bai.csv", [["ma_hoc_sinh", "ho_ten", "ma_lam_bai"], ...board.students.map((row) => [row.id, row.name, row.code])])}>Tải mã làm bài</button>
          <button className="gs-secondary" type="button" disabled={!!busy} onClick={() => void run("Đang tải…", () => refresh())}>Làm mới bài nộp</button>
        </div>
        {qr && <a className="lesson-check-qr" href={qr} download="MathCos-qr-phieu.png">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={216} height={216} alt="Mã QR chung để mở đợt kiểm tra" />Tải mã QR
        </a>}
        <p>Phát QR chung và gửi riêng mã làm bài cho từng em. Học sinh nhập mã học sinh theo danh sách lớp trước khi mở phiếu.</p>
        <div className="lesson-check-actions">
          <button className="gs-secondary" type="button" disabled={!!busy || !board.students.some((row) => row.suggestion && !row.review && !row.needsReview?.length && !row.grading)}
            onClick={() => { if (window.confirm("Duyệt điểm đề xuất cho các bài đủ điểm và chưa được duyệt?")) act({ action: "approve-ready" }); }}>Duyệt các đề xuất đủ điểm</button>
          <button className="gs-secondary" type="button" onClick={() => downloadCsv("ket-qua-phieu.csv", [["ma_hoc_sinh", "ho_ten", "diem_da_duyet", "nhan_xet", "trang_thai"], ...board.students.map((row) => [
            row.id, row.name, row.review?.approved ? String(assessmentTotal(row.review.grade)) : "", row.review?.approved ? row.review.grade.feedback : "", status(row),
          ])])}>Tải kết quả CSV</button>
        </div>
        <div className="lesson-check-roster" role="region" aria-label="Bài nộp của lớp" tabIndex={0}>
          <table><thead><tr><th>Học sinh</th><th>Mã làm bài</th><th>Trạng thái</th><th>Điểm</th><th></th></tr></thead>
            <tbody>{board.students.map((row) => <tr key={row.key}><td>{studentIdentityLine(row)}</td><td><code>{row.code}</code></td><td>{status(row)}</td>
              <td>{row.review ? `${assessmentTotal(row.review.grade)}/${maxScore}`
                : row.suggestion ? `${assessmentTotal(row.suggestion)}/${maxScore} · Đề xuất` : "—"}</td>
              <td><button type="button" className="gs-secondary" onClick={() => setSelected(row.key)}>Xem phiếu</button></td></tr>)}</tbody></table>
        </div>
        {student && <StudentReview key={`${student.key}:${student.review?.version ?? "none"}`}
          student={student} questions={board.assessment.questions} busy={!!busy} act={act} mailMode={board.mailMode}
          onSend={() => sendResults([student])} />}
      </>}
      {busy && <p role="status">{busy}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </details>;
}
