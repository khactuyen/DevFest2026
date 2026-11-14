"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { createLessonDraft } from "@/lib/material-defaults";
import { examKinds, examLevels, examPartLabels, examQuestions, maxExamQuestions } from "@/lib/exam-document";
import {
  examNumericForm, examQuestionFromProposal, examVersionQuestionKey, ExamQuestionProposalSchema, matchNumericReplacements, maxExamAiSource,
  type ExamQuestionCounts, type ProposedExamQuestion,
} from "@/lib/exam-question-generation";
import { buildExamVariant, examVariantFingerprint } from "@/lib/exam-variants";

const maxCodesPerRun = 50;
const defaultCounts: ExamQuestionCounts = { multiple: 4, "true-false": 1, short: 1, written: 1 };
const differenceModes = {
  questions: { label: "Đảo thứ tự câu", hint: "Dùng chung nội dung và phương án, đổi thứ tự câu trong từng phần." },
  options: { label: "Đảo thứ tự phương án", hint: "Giữ thứ tự câu, đảo các phương án trắc nghiệm có thể xáo và cập nhật đáp án." },
  both: { label: "Đảo cả câu và phương án", hint: "Đổi thứ tự câu trong từng phần và thứ tự các phương án có thể xáo." },
  numbers: { label: "Đổi số liệu", hint: "Giữ dạng bài, đổi dữ kiện số và tính lại đáp án. Câu không có dữ kiện số được giữ lại." },
  equivalent: { label: "Thay bằng câu tương đương", hint: "Soạn câu mới theo cùng chủ đề, kỹ năng và mức độ chung." },
} as const;
type DifferenceMode = keyof typeof differenceModes;

export function ExamCodeGenerator({ material, disabled, onSaved }: {
  material: Material; disabled: boolean; onSaved: (draft: Material) => void;
}) {
  const original = material.exam!;
  const rows = examQuestions(material);
  const [source, setSource] = useState(material.metadata.topic !== "Đề kiểm tra" ? material.metadata.topic : "");
  const [counts, setCounts] = useState<ExamQuestionCounts>(() => rows.length
    ? Object.fromEntries(examKinds.map((kind) => [kind, rows.filter((row) => row.kind === kind).length])) as ExamQuestionCounts
    : defaultCounts);
  const [codes, setCodes] = useState<string[]>(() => initialCodes(2));
  const [difficulty, setDifficulty] = useState<typeof examLevels[number]>("Thông hiểu");
  const [mode, setMode] = useState<DifferenceMode>("both");
  const [saved, setSaved] = useState<Material[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const scoringBySection = useRef<number[][] | null>(null);
  const baseQuestions = useRef<ProposedExamQuestion[]>([]);
  const mounted = useRef(false);
  const totalQuestions = examKinds.reduce((sum, kind) => sum + counts[kind], 0);
  const shuffleOnly = mode === "questions" || mode === "options" || mode === "both";
  const complete = saved.length === codes.length;
  const busy = !!progress;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);

  function initialCodes(count: number) {
    const result: string[] = [];
    for (let next = 1; result.length < count; next++) {
      const code = `M${String(next).padStart(2, "0")}`;
      if (code === original.code.trim().toUpperCase()) continue;
      result.push(code);
    }
    return result;
  }

  async function generate() {
    if (pending.current || complete || disabled) return;
    setError("");
    const normalized = codes.map((code) => code.trim());
    const names = normalized.map((code) => code.toUpperCase());
    if (normalized.some((code) => !code) || new Set(names).size !== names.length || names.includes(original.code.trim().toUpperCase())) {
      setError("Nhập mã khác nhau cho từng đề. Mã mới cần khác mã của đề đang soạn.");
      return;
    }
    const reference = rows.filter(({ question }) => !question.examQuestion?.sourceImages?.length || question.examQuestion.useSourceLayout === false)
      .map(({ question }) => question.content.trim()).filter(Boolean);
    const context = [source.trim(), reference.length ? `Các câu trong đề đang soạn để tham khảo phạm vi kiến thức:\n${reference.join("\n")}` : ""]
      .filter(Boolean).join("\n\n").slice(0, maxExamAiSource);
    if (context.length < 12 || totalQuestions < 1 || totalQuestions > maxExamQuestions) {
      setError(`Nhập chủ đề hoặc nội dung tham khảo và chọn từ 1 đến ${maxExamQuestions} câu cho mỗi mã.`);
      return;
    }
    if (shuffleOnly && codes.length > 1) {
      const canReorderQuestions = mode !== "options" && examKinds.some((kind) => counts[kind] > 1);
      const canReorderOptions = mode !== "questions" && counts.multiple > 0;
      if (!canReorderQuestions && !canReorderOptions) {
        setError(mode === "questions" ? "Cần ít nhất hai câu cùng dạng để đảo thứ tự câu."
          : "Cần câu trắc nghiệm có phương án để xáo, hoặc ít nhất hai câu cùng dạng để đảo thứ tự.");
        return;
      }
    }

    const controller = new AbortController();
    pending.current = controller;
    const earlier = [...reference, ...saved.flatMap((draft) => examQuestions(draft).map(({ question }) => question.content))];
    const contentKey = mode === "numbers" ? (prompt: string) => JSON.stringify(examNumericForm(prompt)) : examVersionQuestionKey;
    const known = new Set(earlier.map(contentKey));
    const usedOrders = new Set(saved.map(examVariantFingerprint));
    let baseDraft = saved[0];
    // Apply the same scoring by position within each section across all codes.
    if (!saved.length || !scoringBySection.current) {
      scoringBySection.current = examKinds.map((kind) => rows.filter((row) => row.kind === kind).map(({ question }) => question.assessment?.points ?? 1));
    }
    const scoring = scoringBySection.current;
    try {
      for (const [index, code] of normalized.entries()) {
        if (index < saved.length) continue;
        controller.signal.throwIfAborted();
        setProgress(`Đang soạn mã ${code} (${index + 1}/${normalized.length})…`);
        const suffix = ` · Mã ${code}`;
        const draftInfo = createLessonDraft(material.title.slice(0, 200 - suffix.length) + suffix);
        if (index > 0 && shuffleOnly) {
          const order = { questions: mode !== "options", options: mode !== "questions" };
          let variant: Material | undefined;
          for (let attempt = 0; attempt < 60; attempt++) {
            const candidate = buildExamVariant(baseDraft, code, attempt, order);
            const fingerprint = examVariantFingerprint(candidate);
            if (!usedOrders.has(fingerprint)) { variant = candidate; usedOrders.add(fingerprint); break; }
          }
          if (!variant) throw Error(`Không tìm thêm được cách xáo cho mã ${code}. Hãy dùng ít mã hơn hoặc chọn cách tạo khác.`);
          const result = await request<Material>("/api/materials", {
            method: "POST", body: JSON.stringify({
              ...draftInfo, metadata: variant.metadata, exam: variant.exam, blocks: variant.blocks, learningSteps: variant.learningSteps,
            }),
          });
          onSaved(result);
          if (mounted.current) setSaved((current) => [...current, result]);
          continue;
        }

        const targets = index === 0 ? [] : baseQuestions.current.filter(({ prompt }) => mode !== "numbers" || examNumericForm(prompt).values.length > 0);
        const requested = index === 0 ? counts : Object.fromEntries(examKinds.map((kind) => [
          kind, targets.filter((question) => question.kind === kind).length,
        ])) as ExamQuestionCounts;
        if (index > 0 && !targets.length) throw Error("Bộ câu gốc chưa có dữ kiện số để đổi. Hãy bắt đầu lượt mới với nội dung có số liệu hoặc chọn câu tương đương.");
        let fresh: ProposedExamQuestion[] | undefined;
        let exclude = [...targets.map(({ prompt }) => prompt), ...earlier.slice(-maxExamQuestions)].slice(0, maxExamQuestions).map((prompt) => prompt.slice(0, 600));
        for (let attempt = 0; fresh === undefined && attempt < 2; attempt++) {
          const response = await request("/api/studio-generate", {
            method: "POST", signal: controller.signal, body: JSON.stringify({
              mode: "examQuestions", source: context, grade: material.metadata.grade, subject: original.subject,
              counts: requested, existing: [], exclude: [...new Set(exclude)], difficulty,
              ...(!shuffleOnly ? { replacementMode: mode } : {}),
              ...(targets.length ? { replacementReferences: targets.map(({ kind, prompt }) => ({ kind, prompt: prompt.slice(0, 600) })) } : {}),
            }),
          });
          const proposal = ExamQuestionProposalSchema.parse(response).questions;
          if (examKinds.some((kind) => proposal.filter((question) => question.kind === kind).length !== requested[kind])) {
            throw Error(`Mã ${code} chưa có đúng số câu đã yêu cầu.`);
          }
          const keys = new Set<string>();
          const duplicates = proposal.filter(({ prompt }) => {
            const key = contentKey(prompt);
            if (known.has(key) || keys.has(key)) return true;
            keys.add(key);
            return false;
          });
          if (!duplicates.length) {
            if (index > 0 && mode === "numbers") {
              fresh = matchNumericReplacements(targets, proposal);
            } else if (index === 0 || mode !== "equivalent" || proposal.every((question) => !targets.some((target) =>
              target.kind === question.kind && examNumericForm(target.prompt).shape === examNumericForm(question.prompt).shape))) {
              fresh = proposal;
            }
          }
          exclude = [...duplicates.map(({ prompt }) => prompt.slice(0, 600)), ...exclude].slice(0, maxExamQuestions);
        }
        if (!fresh) throw Error(`Mã ${code} chưa đạt cách tạo đã chọn. Hãy tiếp tục để thử lại mã này.`);
        controller.signal.throwIfAborted();
        const byKind = new Map(examKinds.map((kind) => [kind, fresh.filter((question) => question.kind === kind)]));
        const questions = index === 0 ? examKinds.flatMap((kind) => byKind.get(kind)!) : baseQuestions.current.map((question) =>
          mode === "numbers" && !examNumericForm(question.prompt).values.length ? question : byKind.get(question.kind)!.shift()!);
        const items = examKinds.flatMap((kind, section) => questions.filter((question) => question.kind === kind)
          .map((question, position) => examQuestionFromProposal({ ...question, points: scoring[section][position] ?? 1 })));
        const draft: Material = {
          ...draftInfo,
          metadata: { ...material.metadata, type: "exercise" },
          exam: { ...original, matrix: undefined, code, difficulty },
          blocks: items.map(({ question }) => question), learningSteps: items.map(({ step }) => step),
        };
        // Finish a save already sent even if the user stops the remaining generation.
        const result = await request<Material>("/api/materials", { method: "POST", body: JSON.stringify(draft) });
        if (index === 0) {
          baseQuestions.current = questions;
          baseDraft = result;
          usedOrders.add(examVariantFingerprint(result));
        }
        onSaved(result);
        if (mounted.current) setSaved((current) => [...current, result]);
        for (const { prompt } of fresh) { earlier.push(prompt); known.add(contentKey(prompt)); }
      }
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Chưa soạn xong các mã đề.");
    } finally {
      pending.current = null;
      if (mounted.current) setProgress("");
    }
  }

  return <details className="exam-matrix">
    <summary>Tạo nhiều mã đề</summary>
    <p>AI soạn bộ câu gốc từ nội dung tham khảo. Các mã dùng cùng mức độ, số câu từng dạng và thang điểm.</p>
    <fieldset disabled={disabled || busy || saved.length > 0}>
      <label>Chủ đề hoặc nội dung tham khảo
        <textarea rows={3} maxLength={maxExamAiSource} value={source} placeholder="Ví dụ: Hàm số bậc hai lớp 10, tập trung vào đỉnh và trục đối xứng."
          onChange={(event) => setSource(event.target.value)} />
      </label>
      <div className="exam-matrix-fields exam-code-settings">
        <label>Số mã đề<input type="number" min={1} max={maxCodesPerRun} value={codes.length} onChange={(event) => {
          const count = Math.max(1, Math.min(maxCodesPerRun, Math.trunc(Number(event.target.value)) || 1));
          const defaults = initialCodes(count);
          setCodes((current) => defaults.map((entry, index) => current[index] || entry));
        }} /></label>
        <label>Mức độ chung<select aria-label="Mức độ chung" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}>
          {examLevels.map((level) => <option key={level}>{level}</option>)}
        </select></label>
        <label>Cách tạo khác biệt<select aria-label="Cách tạo khác biệt" value={mode} disabled={codes.length < 2}
          onChange={(event) => setMode(event.target.value as DifferenceMode)}>
          {Object.entries(differenceModes).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </div>
      <div className="exam-matrix-fields exam-code-settings">
        {examKinds.map((kind) => <label key={kind}>Số câu {examPartLabels[kind].toLowerCase()} mỗi mã
          <input type="number" min={0} max={maxExamQuestions} value={counts[kind]} onChange={(event) => setCounts((current) => ({
            ...current, [kind]: Math.max(0, Math.min(maxExamQuestions, Math.trunc(Number(event.target.value)) || 0)),
          }))} />
        </label>)}
      </div>
    </fieldset>
    {codes.length > 1 && <p>{differenceModes[mode].hint} Mỗi mã được lưu thành một bản nháp riêng.</p>}
    <ol className="exam-code-list">
      {codes.map((code, index) => <li key={index}>
        <label>Mã đề {index + 1}<input maxLength={24} disabled={disabled || busy || index < saved.length} value={code}
          onChange={(event) => setCodes((current) => current.map((entry, position) => position === index ? event.target.value : entry))} /></label>
        {saved[index] && <Link href={`/studio?material=${saved[index].id}`} target="_blank" rel="noopener">Mở mã {saved[index].exam?.code}</Link>}
      </li>)}
    </ol>
    <div className="exam-inline-tools">
      {!complete && <button type="button" disabled={disabled || busy || totalQuestions < 1 || totalQuestions > maxExamQuestions}
        onClick={() => void generate()}>{saved.length ? "Tiếp tục tạo các mã còn lại" : "Tạo các mã đề"}</button>}
      {busy && <button type="button" onClick={() => pending.current?.abort()}>Dừng tạo</button>}
      {!busy && saved.length > 0 && <button type="button" disabled={disabled} onClick={() => { setSaved([]); setError(""); }}>Bắt đầu lượt mới</button>}
    </div>
    {(progress || saved.length > 0) && <p role="status">{progress || `Đã lưu ${saved.length}/${codes.length} mã đề.`}</p>}
    {error && <p className="exam-ai-error" role="alert">{error}</p>}
  </details>;
}
