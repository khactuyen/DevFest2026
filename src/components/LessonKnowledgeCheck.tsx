"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Download, FileText, Printer, Sparkles } from "lucide-react";
import { zip } from "fflate";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { createExamQuestion, defaultExamSettings, examPartLabels } from "@/lib/exam-document";
import { ExamQuestionProposalSchema, examAiKinds, examQuestionFromProposal, maxExamAiSource, type ExamQuestionCounts } from "@/lib/exam-question-generation";
import {
  lessonCheckFileName, maxLessonCheckStudents, numberedStudents, readLessonCheckRoster, rosterTemplate,
  studentIdentityLine, validateStudents, type LessonCheckStudent,
} from "@/lib/lesson-check-roster";
import { ExamSheet } from "./ExamSheet";
import { LessonCheckDrive } from "./LessonCheckDrive";
import { LessonAssessmentTeacher } from "./LessonAssessmentTeacher";

const maxCheckQuestions = 20;
type Question = ReturnType<typeof createExamQuestion>;
type Batch = { material: Material; students: LessonCheckStudent[] };

function download(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function LessonKnowledgeCheck({ material, openAssessmentReview }: { material: Material; openAssessmentReview?: boolean }) {
  const [count, setCount] = useState("1");
  const [students, setStudents] = useState(() => numberedStudents(1));
  const [questionCounts, setQuestionCounts] = useState<ExamQuestionCounts>({ multiple: 0, "true-false": 0, short: 5, written: 0 });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [batch, setBatch] = useState<Batch>();
  const [prepareOnline, setPrepareOnline] = useState(false);
  const [selected, setSelected] = useState(0);
  const [printing, setPrinting] = useState<LessonCheckStudent[]>([]);
  const [busy, setBusy] = useState("");
  const [driveState, setDriveState] = useState({ busy: false, hasFolder: false });
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const selectedStudent = batch?.students[selected];
  const usable = material.blocks.filter((block) => block.type === "exercise" && block.content.trim() &&
    !block.visualId && !block.board && block.assessment?.type !== "drag" &&
    (block.assessment?.type !== "multiple" ||
      (block.assessment.options?.length === 4 && block.assessment.options.every((option) => option.trim()))));

  useEffect(() => {
    function finishPrint() { setPrinting([]); }
    window.addEventListener("afterprint", finishPrint);
    return () => {
      pending.current?.abort();
      window.removeEventListener("afterprint", finishPrint);
    };
  }, []);

  function report(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Chưa thể hoàn tất thao tác.");
  }

  function updateCount() {
    setError("");
    try {
      const numbered = numberedStudents(Number(count));
      const used = new Set(students.map((student) => student.id.trim().toUpperCase()));
      let next = 1;
      setStudents(numbered.map((student, index) => {
        if (students[index]) return students[index];
        let id = student.id;
        while (used.has(id)) id = `HS${String(next++).padStart(3, "0")}`;
        used.add(id);
        return { ...student, id };
      }));
    } catch (reason) { report(reason); }
  }

  async function importRoster(file: File) {
    setBusy("Đang đọc danh sách…");
    setError("");
    try {
      const roster = await readLessonCheckRoster(file);
      setStudents(roster);
      setCount(String(roster.length));
    } catch (reason) { report(reason); }
    finally { setBusy(""); }
  }

  function useLessonQuestions() {
    setError("");
    setQuestions(usable.slice(0, maxCheckQuestions).map((block) => {
      const assessment = block.assessment;
      return createExamQuestion(assessment?.type === "multiple" ? "multiple" : "short", block.content,
        assessment ? { options: assessment.type === "multiple" ? assessment.options : undefined,
          correctIndex: assessment.correctIndex, answer: assessment.answer, explanation: assessment.explanation,
          points: assessment.points || 1 } : {});
    }));
  }

  async function generateQuestions() {
    if (pending.current) return;
    setError("");
    const amount = examAiKinds.reduce((sum, kind) => sum + questionCounts[kind], 0);
    if (amount < 1 || amount > maxCheckQuestions || examAiKinds.some((kind) => !Number.isInteger(questionCounts[kind]) || questionCounts[kind] < 0)) {
      report(Error(`Chọn từ 1 đến ${maxCheckQuestions} câu hỏi.`));
      return;
    }
    const source = [material.title, material.metadata.topic, material.summary,
      ...material.learningSteps.flatMap((step) => [step.title, step.objective]),
      ...material.blocks.filter((block) => block.authorKind !== "image" && block.type !== "visual")
        .map((block) => block.content),
    ].filter(Boolean).join("\n").slice(0, maxExamAiSource);
    if (source.trim().length < 12) {
      report(Error("Thêm nội dung vào bài giảng trước khi nhờ AI soạn câu hỏi."));
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy("AI đang soạn câu hỏi…");
    try {
      const response = ExamQuestionProposalSchema.parse(await request<unknown>("/api/studio-generate", {
        method: "POST", signal: controller.signal, body: JSON.stringify({
          mode: "examQuestions", source, subject: "Toán", grade: material.metadata.grade,
          counts: questionCounts, existing: [],
        }),
      }));
      if (response.questions.length !== amount || examAiKinds.some((kind) => response.questions.filter((item) => item.kind === kind).length !== questionCounts[kind])) {
        throw Error("AI chưa trả về đúng số lượng từng dạng câu. Hãy thử lại.");
      }
      setQuestions(response.questions.map(examQuestionFromProposal));
    } catch (reason) {
      if (!controller.signal.aborted) report(reason);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy("");
    }
  }

  function prepareBatch(online = false) {
    setError("");
    try {
      const roster = validateStudents(students);
      if (Number(count) !== roster.length) throw Error("Bấm Cập nhật danh sách để áp dụng số lượng vừa nhập.");
      if (!questions.length || questions.some(({ question }) => !question.content.trim() ||
        question.assessment?.options?.some((option) => !option.trim()))) {
        throw Error("Thêm câu hỏi và điền đủ nội dung trước khi tạo phiếu.");
      }
      setSelected(0);
      setPrepareOnline(online);
      setDriveState({ busy: false, hasFolder: false });
      setBatch({
        students: roster,
        material: {
          ...material,
          title: `Phiếu kiểm tra kiến thức – ${material.title}`,
          exam: { ...defaultExamSettings, duration: 15 },
          blocks: questions.map(({ question }) => question),
          learningSteps: questions.map(({ step }) => step),
          visuals: [],
        },
      });
    } catch (reason) { report(reason); }
  }

  async function exportWord(all: boolean) {
    if (!batch || !selectedStudent) return;
    setBusy("Đang xuất Word…");
    setError("");
    try {
      const { examWordFile, examWordMime } = await import("@/lib/exam-word");
      if (!all || batch.students.length === 1) {
        const bytes = await examWordFile(batch.material, false, [], selectedStudent);
        download(new Blob([bytes.slice().buffer], { type: examWordMime }), `${lessonCheckFileName(selectedStudent, selected)}.docx`);
        return;
      }
      const files: Record<string, Uint8Array> = {};
      for (const [index, student] of batch.students.entries()) {
        files[`${lessonCheckFileName(student, index)}.docx`] = await examWordFile(batch.material, false, [], student);
        if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const bytes = await new Promise<Uint8Array>((resolve, reject) =>
        zip(files, { level: 0 }, (failure, data) => failure ? reject(failure) : resolve(data)));
      download(new Blob([bytes.slice().buffer], { type: "application/zip" }), "MathCos-phieu-kiem-tra.zip");
    } catch (reason) { report(reason); }
    finally { setBusy(""); }
  }

  async function printPdf(roster: LessonCheckStudent[]) {
    setError("");
    setBusy("Đang chuẩn bị bản in…");
    try {
      flushSync(() => setPrinting(roster));
      await document.fonts.ready;
      window.print();
    } catch (reason) {
      setPrinting([]);
      report(reason);
    } finally { setBusy(""); }
  }

  return <section className="lesson-check" aria-label="Phiếu kiểm tra kiến thức">
    <div className="lesson-check-header">
      <FileText size={24} /><div><h2>Phiếu kiểm tra kiến thức</h2><p>Tạo một phiếu có mã hoặc tên riêng cho mỗi học sinh. Cả lớp làm cùng bộ câu hỏi.</p></div>
    </div>
    <LessonAssessmentTeacher lessonId={material.id} batch={batch} initiallyOpen={openAssessmentReview || prepareOnline}
      prepareOnline={prepareOnline} />
    {!batch ? <>
      <fieldset disabled={!!busy} className="lesson-check-panel">
        <legend>1. Danh sách học sinh</legend>
        <div className="lesson-check-actions">
          <label className="lesson-check-field">Số học sinh<input type="number" min="1" max={maxLessonCheckStudents} value={count} onChange={(event) => setCount(event.target.value)} /></label>
          <button className="gs-secondary" type="button" onClick={updateCount}>Cập nhật danh sách</button>
          <label className="lesson-check-field">Nhập Excel hoặc CSV<input type="file" accept=".xlsx,.csv" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importRoster(file);
          }} /></label>
          <button className="gs-secondary" type="button" onClick={() => download(new Blob([rosterTemplate], { type: "text/csv;charset=utf-8" }), "MathCos-danh-sach-mau.csv")}><Download size={15} /> CSV mẫu</button>
        </div>
        <p>Dùng hàng đầu <code>ma_hoc_sinh, ho_ten, email</code>. Mỗi dòng cần mã hoặc họ tên. Nhập email nếu muốn cấp quyền Drive riêng. Với Excel, đặt cột mã ở dạng Văn bản nếu mã có số 0 ở đầu.</p>
        <div className="lesson-check-roster" role="region" aria-label="Danh sách lớp" tabIndex={0}>
          <table><thead><tr><th>#</th><th>Mã học sinh</th><th>Họ và tên</th><th>Email học sinh</th></tr></thead>
            <tbody>{students.map((student, index) => <tr key={index}><td>{index + 1}</td>
              {(["id", "name", "email"] as const).map((field, column) => <td key={field}><input value={student[field]} maxLength={[60, 120, 254][column]}
                type={field === "email" ? "email" : "text"} aria-label={`${["Mã", "Tên", "Email"][column]} học sinh ${index + 1}`}
                onChange={(event) => setStudents((current) => current.map((entry, row) => row === index ? { ...entry, [field]: event.target.value } : entry))} /></td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </fieldset>
      <fieldset disabled={!!busy} className="lesson-check-panel">
        <legend>2. Câu hỏi kiểm tra</legend>
        <div className="lesson-check-actions">
          <button type="button" className="gs-secondary" disabled={!usable.length} onClick={useLessonQuestions}>Dùng câu trong bài ({Math.min(usable.length, maxCheckQuestions)})</button>
          {examAiKinds.map((kind) => <label key={kind} className="lesson-check-field">Số câu {examPartLabels[kind].toLowerCase()}
            <input type="number" min="0" max={maxCheckQuestions} step="1" value={questionCounts[kind]}
              onChange={(event) => setQuestionCounts((current) => ({ ...current, [kind]: Number(event.target.value) }))} />
          </label>)}
          <button type="button" className="gs-secondary" onClick={() => void generateQuestions()}><Sparkles size={16} /> AI soạn câu hỏi</button>
          <button type="button" className="gs-secondary" disabled={questions.length >= maxCheckQuestions} onClick={() => setQuestions((current) => [...current, createExamQuestion("short", "")])}>Thêm câu</button>
        </div>
        <p>Đã chọn {examAiKinds.reduce((sum, kind) => sum + questionCounts[kind], 0)}/{maxCheckQuestions} câu cho AI soạn. Bộ câu hỏi mới sẽ thay thế các câu đang soạn.</p>
        {!!questions.length && <ol className="lesson-check-questions">
          {questions.map(({ question }, index) => <li key={question.id}>
            <strong>{examPartLabels[question.examQuestion!.kind]}</strong>
            <label className="lesson-check-field">Câu {index + 1}<textarea rows={2} maxLength={2500} value={question.content} onChange={(event) => {
              const content = event.target.value;
              setQuestions((current) => current.map((item, row) => row === index ? { ...item, question: { ...item.question, content } } : item));
            }} /></label>
            {question.assessment?.options?.map((option, choice) => <label key={choice} className="lesson-check-option">
              {(question.examQuestion?.kind === "true-false" ? "abcd" : "ABCD")[choice]}<input value={option} maxLength={400} onChange={(event) => {
                const value = event.target.value;
                setQuestions((current) => current.map((item, row) => {
                  const assessment = item.question.assessment;
                  if (row !== index || !assessment?.options) return item;
                  return { ...item, question: { ...item.question, assessment: {
                    ...assessment, options: assessment.options.map((entry, at) => at === choice ? value : entry),
                  } } };
                }));
              }} />
            </label>)}
            <label className="lesson-check-field">Đáp án tham khảo của giáo viên
              <input value={question.examQuestion?.kind === "multiple" ? "ABCD"[question.assessment?.correctIndex ?? -1] || "" : question.assessment?.answer || ""}
                placeholder={question.examQuestion?.kind === "multiple" ? "A, B, C hoặc D" : question.examQuestion?.kind === "true-false" ? "Đ S Đ S" : "Nhập đáp án"}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuestions((current) => current.map((item, row) => {
                    if (row !== index || !item.question.assessment) return item;
                    const assessment = item.question.assessment;
                    return { ...item, question: { ...item.question, assessment: item.question.examQuestion?.kind === "multiple"
                      ? { ...assessment, correctIndex: /^[ABCD]$/.test(value.toUpperCase()) ? "ABCD".indexOf(value.toUpperCase()) : undefined }
                      : { ...assessment, answer: value } } };
                  }));
                }} />
            </label>
            <button className="gs-secondary" type="button" onClick={() => setQuestions((current) => current.filter((_, row) => row !== index))}>Xóa câu {index + 1}</button>
          </li>)}
        </ol>}
        <div className="lesson-check-actions">
          <button type="button" className="gs-primary" disabled={!questions.length} onClick={() => prepareBatch(true)}>Chuẩn bị phát phiếu online</button>
          <button type="button" className="gs-secondary" disabled={!questions.length} onClick={() => prepareBatch()}>Tạo phiếu và xem trước</button>
        </div>
      </fieldset>
    </> : <>
      <section className="lesson-check-panel" aria-label="Xem và xuất phiếu">
        <h3>3. Xem và xuất {batch.students.length} phiếu</h3>
        <div className="lesson-check-actions">
          <label className="lesson-check-field">Xem phiếu của học sinh<select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {batch.students.map((student, index) => <option value={index} key={index}>{studentIdentityLine(student)}</option>)}
          </select></label>
          <button type="button" className="gs-secondary" disabled={!!busy || driveState.busy} onClick={() => {
            if (driveState.hasFolder && !window.confirm("Các phiếu đã xuất vẫn nằm trong Drive. Bạn muốn quay lại soạn một bộ phiếu mới?")) return;
            setBatch(undefined);
            setPrepareOnline(false);
            setError("");
          }}>Sửa danh sách và câu hỏi</button>
        </div>
        <div className="lesson-check-actions">
          <button type="button" className="gs-secondary" disabled={!!busy} onClick={() => void exportWord(false)}><Download size={16} /> Tải Word phiếu này</button>
          {batch.students.length > 1 && <button type="button" className="gs-secondary" disabled={!!busy} onClick={() => void exportWord(true)}><Download size={16} /> Tải Word cả lớp (.zip)</button>}
          <button type="button" className="gs-secondary" disabled={!!busy} onClick={() => void printPdf([selectedStudent!])}><Printer size={16} /> In / Lưu PDF phiếu này</button>
          {batch.students.length > 1 && <button type="button" className="gs-secondary" disabled={!!busy} onClick={() => void printPdf(batch.students)}><Printer size={16} /> In / Lưu PDF cả lớp</button>}
        </div>
        <LessonCheckDrive material={batch.material} students={batch.students} onState={setDriveState} />
      </section>
      {!!printing.length && createPortal(<div className="lesson-check-print exam-print-surface">
        {printing.map((student, index) => <ExamSheet key={index} material={batch.material} student={student} />)}
      </div>, document.body)}
    </>}
    {batch && <div className="lesson-check-preview"><ExamSheet material={batch.material} student={selectedStudent} /></div>}
    {busy && <p role="status">{busy}</p>}
    {error && <p className="gs-alert" role="alert">{error}</p>}
  </section>;
}
