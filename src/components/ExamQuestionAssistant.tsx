"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { z } from "zod";
import { request } from "@/lib/client";
import { readStudioSource, studioSourceAccept } from "@/lib/studio-source-client";
import { examPartLabels, maxExamQuestions } from "@/lib/exam-document";
import {
  examAiKinds, ExamQuestionProposalSchema, ExamQuestionRequestSchema,
  maxExamAiSource, type ExamQuestionCounts,
} from "@/lib/exam-question-generation";

type Proposal = z.infer<typeof ExamQuestionProposalSchema>;
const defaultCounts = { multiple: 3, "true-false": 0, short: 1, written: 1 };

export function ExamQuestionAssistant({ subject, grade, existing, remaining, disabled, initialOpen = false, onInsert }: {
  subject: string;
  grade: string;
  existing: string[];
  remaining: number;
  disabled: boolean;
  initialOpen?: boolean;
  onInsert: (questions: Proposal["questions"]) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [source, setSource] = useState("");
  const [counts, setCounts] = useState<ExamQuestionCounts>(defaultCounts);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const pending = useRef<AbortController | null>(null);
  const limit = Math.max(0, Math.min(maxExamQuestions, remaining));
  const total = examAiKinds.reduce((sum, kind) => sum + counts[kind], 0);

  useEffect(() => () => pending.current?.abort(), []);

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setReading("");
    setOpen(false);
  }

  async function readFiles(files: File[]) {
    if (pending.current || !files.length) return;
    if (files.length > 5) {
      setError("Chọn tối đa 5 tệp nguồn mỗi lần.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setReading("Đang đọc tài liệu nguồn…");
    try {
      const { fullSource } = await readStudioSource(source, files, {
        signal: controller.signal, onStatus: setReading, includeImages: false,
      });
      if (fullSource.length > maxExamAiSource) throw Error(`Nội dung nguồn vượt ${maxExamAiSource.toLocaleString("vi-VN")} ký tự. Hãy chọn phần cần ra đề hoặc dùng tệp ngắn hơn.`);
      if (fullSource === source.trim()) throw Error("Chưa đọc được nội dung mới từ tệp đã chọn.");
      setSource(fullSource);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không đọc được tài liệu nguồn.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setReading("");
      }
    }
  }

  async function generate() {
    if (pending.current || disabled || total < 1 || total > limit) return;
    const input = ExamQuestionRequestSchema.safeParse({
      mode: "examQuestions", source, subject, grade, counts, existing,
    });
    if (!input.success) {
      setError("Kiểm tra nội dung nguồn và số câu còn có thể thêm vào đề.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const output = ExamQuestionProposalSchema.parse(await request<unknown>("/api/studio-generate", {
        method: "POST", body: JSON.stringify(input.data), signal: controller.signal,
      }));
      if (controller.signal.aborted || pending.current !== controller) return;
      if (!examAiKinds.every((kind) => output.questions.filter((question) => question.kind === kind).length === counts[kind])) {
        throw Error("AI trả về số câu khác yêu cầu. Hãy thử lại.");
      }
      onInsert(output.questions);
      setStatus(`Đã thêm ${output.questions.length} câu vào đề. Bạn có thể sửa câu hỏi, kiểm tra đáp án hoặc xóa câu.`);
      setOpen(false);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof z.ZodError
        ? "AI trả về câu hỏi chưa hợp lệ. Hãy thử lại."
        : reason instanceof Error ? reason.message : "Không tạo được câu hỏi. Hãy thử lại.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  return <div className="exam-ai-tools">
    <button type="button" className="exam-ai-toggle" aria-expanded={open}
      disabled={disabled || (!open && limit === 0)}
      onClick={() => { if (open) cancel(); else { setOpen(true); setStatus(""); } }}>
      <Sparkles size={15} /> AI soạn câu hỏi
    </button>
    {status && <p className="exam-ai-status" role="status">{status}</p>}
    {open && <form className="exam-ai-panel" aria-label="AI soạn câu hỏi" onSubmit={(event) => {
      event.preventDefault();
      void generate();
    }}>
      <label>Nội dung để AI soạn câu hỏi
        <textarea rows={4} value={source} maxLength={maxExamAiSource} disabled={busy || !!reading}
          placeholder="Ví dụ: Hàm số bậc hai lớp 10. Tập trung vào đỉnh, trục đối xứng và khoảng đồng biến."
          onChange={(event) => setSource(event.target.value)} />
      </label>
      <label className="exam-ai-source-file">Đọc nội dung từ tệp (PDF, DOCX, TXT hoặc ảnh)
        <input type="file" accept={studioSourceAccept} multiple disabled={busy || !!reading || disabled} onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          void readFiles(files);
        }} />
      </label>
      {reading && <p className="exam-ai-status" role="status">{reading}</p>}
      <div className="exam-ai-counts">
        {examAiKinds.map((kind) => <label key={kind}>Số câu {examPartLabels[kind].toLowerCase()}
          <input type="number" min={0} max={limit} step={1} disabled={busy} value={counts[kind]}
            onChange={(event) => setCounts((current) => ({
              ...current, [kind]: Math.max(0, Math.min(limit, Math.trunc(Number(event.target.value) || 0))),
            }))} />
        </label>)}
      </div>
      <p className="exam-ai-hint">Đã chọn {total} câu · Đề còn chỗ cho {limit} câu. {total > limit ? "Hãy giảm số câu đã chọn." : "Câu mới sẽ được thêm vào từng phần của đề."}</p>
      {error && <p role="alert" className="exam-ai-error">{error}</p>}
      <div className="exam-ai-actions">
        <button type="submit" className="exam-ai-generate" disabled={busy || !!reading || disabled || source.trim().length < 12 || total < 1 || total > limit}>
          {busy ? <LoaderCircle className="gs-spin" size={15} /> : <Sparkles size={15} />}
          {busy ? "AI đang soạn…" : "Tạo và thêm vào đề"}
        </button>
        <button type="button" onClick={cancel}>{busy || reading ? "Dừng" : "Đóng"}</button>
      </div>
    </form>}
  </div>;
}
