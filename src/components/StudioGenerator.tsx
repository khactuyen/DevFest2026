"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileImage, Sparkles, X } from "lucide-react";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { draftFiles, readBrowserDraft, writeBrowserDraft } from "@/lib/browser-draft";
import { learnerSessionId } from "@/lib/learner";
import { extractEditablePdfQuestion, readPdfExam, readStudioSource, studioSourceAccept, uploadStudioSourceImage } from "@/lib/studio-source-client";
import { createLessonDraft } from "@/lib/material-defaults";
import { createExamQuestion, defaultExamSettings, editablePdfQuestion, maxExamQuestions, pdfQuestionFigure } from "@/lib/exam-document";

type Mode = "lesson" | "exam";
type SourcePage = NonNullable<Material["sourcePages"]>[number];
export type GeneratorDraft = { source: string; grade: string; minutes: number; files?: File[] };


export function StudioGenerator({ mode, onBack, onComplete, initialDraft }: {
  mode: Mode; onBack: (draft: GeneratorDraft) => void; onComplete: (material: Material, review: string[]) => void;
  initialDraft?: GeneratorDraft;
}) {
  const storageKey = `math-vision:studio-source:${learnerSessionId()}:${mode}`;
  const [source, setSource] = useState(initialDraft?.source || "");
  const [grade, setGrade] = useState(initialDraft?.grade || "10");
  const [minutes, setMinutes] = useState(initialDraft?.minutes || 45);
  const [files, setFiles] = useState<File[]>(initialDraft?.files || []);
  const [restored, setRestored] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const saved = initialDraft || readBrowserDraft<GeneratorDraft>(storageKey);
    if (saved) { setSource(saved.source); setGrade(saved.grade); setMinutes(saved.minutes); }
    void (initialDraft?.files ? Promise.resolve(initialDraft.files) : draftFiles(storageKey))
      .then(value => { if (mounted.current) setFiles(value); })
      .catch(() => { if (mounted.current) setError("Không phục hồi được tệp trên thiết bị; hãy chọn lại tệp nguồn."); })
      .finally(() => { if (mounted.current) setRestored(true); });
    return () => { mounted.current = false; controller.current?.abort(); };
  // A mode change remounts this editor; restore exactly once before accepting input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored) return;
    if (!writeBrowserDraft(storageKey, { source, grade, minutes })) setError("Không lưu được nội dung nguồn trên thiết bị.");
  }, [source, grade, minutes, restored, storageKey]);
  useEffect(() => {
    if (!restored) return;
    void draftFiles(storageKey, files).catch(() => { if (mounted.current) setError("Không lưu được tệp trên thiết bị; hãy giữ trang mở hoặc chọn lại tệp khi quay về."); });
  }, [files, restored, storageKey]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pdfCodes, setPdfCodes] = useState<string[]>([]);
  const [pdfCode, setPdfCode] = useState("");
  const busy = useRef(false);
  const draft = (): GeneratorDraft => ({ source, grade, minutes, files });
  const leave = () => { controller.current?.abort(); onBack(draft()); };
  const updateFiles = (next: File[]) => {
    setFiles(next);
    setPdfCodes([]);
    setPdfCode("");
    setError("");
  };

  const generate = async () => {
    if (busy.current) return;
    if (source.trim().length < 20 && !files.length) { setError("Nhập nội dung bài hoặc chọn ảnh đề trước khi tạo."); return; }
    busy.current = true;
    const operation = new AbortController(); controller.current = operation;
    const assertActive = () => { if (!mounted.current || operation.signal.aborted) throw new DOMException("Cancelled", "AbortError"); };
    setError("");
    let savedDraft: Material | null = null;
    let savingPdfLayout = false;
    try {
      if (mode === "exam" && !source.trim() && files.length === 1 && /\.pdf$/i.test(files[0].name)) {
        const pdf = await readPdfExam(files[0], pdfCode, operation.signal, setStatus);
        assertActive();
        if (pdf?.codes) { setPdfCodes(pdf.codes); return; }
        if (pdf?.version) {
          savingPdfLayout = true;
          const { version, crops, embedded, sourcePages, answers } = pdf;
          if (version.questions.length > maxExamQuestions) throw Error(`Mã đề có quá ${maxExamQuestions} câu.`);
          const review = ["Đối chiếu nội dung, công thức, hình và đáp án đã trích xuất với PDF gốc trước khi dùng."];
          const rows = version.questions.map(({ kind, number }, index) => {
            const answer = answers[index];
            return createExamQuestion(kind, `Câu ${number} trong PDF gốc`, !answer ? {}
              : kind === "multiple" ? { correctIndex: "ABCD".indexOf(answer) }
                : { answer: kind === "true-false" ? [...answer].join(" ") : answer });
          });
          const extracts: Array<Awaited<ReturnType<typeof extractEditablePdfQuestion>> | undefined> = [];
          let cursor = 0, completed = 0, serviceError = "";
          const extractNext = async () => {
            while (cursor < rows.length && !serviceError && !operation.signal.aborted) {
              const index = cursor++;
              try {
                extracts[index] = await extractEditablePdfQuestion(crops[index], version.questions[index].kind, operation.signal, embedded[index]);
              } catch (reason) {
                if ([401, 403, 429, 503].includes((reason as { status?: number } | null)?.status ?? 0)) {
                  serviceError = reason instanceof Error ? reason.message : "Dịch vụ trích xuất chưa sẵn sàng.";
                }
              } finally {
                if (mounted.current && !operation.signal.aborted) setStatus(`Đã xử lý ${++completed}/${rows.length} câu…`);
              }
            }
          };
          setStatus(`Đang trích xuất nội dung và phương án của ${rows.length} câu…`);
          await Promise.all([extractNext(), extractNext()]);
          assertActive();
          const failed = rows.flatMap((_, index) => extracts[index] ? [] : [index + 1]);
          const draft = createLessonDraft(version.code ? `Đề kiểm tra · Mã ${version.code}` : "Đề kiểm tra");
          const material: Material = { ...draft, metadata: { ...draft.metadata, grade: version.grade || grade, topic: "Đề kiểm tra", type: "exercise" },
            exam: { ...defaultExamSettings, school: version.school.slice(0, 160), code: version.code.slice(0, 24), duration: Math.min(360, version.duration) },
            blocks: rows.map(({ question }) => question), learningSteps: rows.map(({ step }) => step),
            sourcePages: sourcePages.map(({ page }) => page), reviewNotes: review };
          setStatus("Đang tạo bản nháp từ PDF…");
          savedDraft = await request<Material>("/api/materials", { method: "POST", body: JSON.stringify(material) });
          assertActive();
          const pages: SourcePage[] = [];
          for (const { page, blob } of sourcePages) pages.push({ ...page, imageUrl: await uploadStudioSourceImage(savedDraft.id, blob, operation.signal) });
          const blocks: Material["blocks"] = [];
          let figureSlots = 100 - rows.length;
          for (const [index, { question, step }] of rows.entries()) {
            setStatus(`Đang lưu câu ${index + 1}/${rows.length}…`);
            const images: string[] = [];
            for (const blob of crops[index]) images.push(await uploadStudioSourceImage(savedDraft.id, blob, operation.signal));
            question.examQuestion = { ...question.examQuestion!, sourceImages: images };
            const extracted = extracts[index];
            if (extracted?.warnings.length) question.examQuestion.sourceWarnings = extracted.warnings.slice(0, 6);
            blocks.push(extracted ? editablePdfQuestion(question, extracted) : question);
            if (!extracted) continue;
            if (extracted.warnings.length) review.push(`Câu ${index + 1}: ${extracted.warnings.join(" ").slice(0, 450)}`);
            for (const blob of extracted.figures.slice(0, figureSlots)) {
              const figure = pdfQuestionFigure(await uploadStudioSourceImage(savedDraft.id, blob, operation.signal));
              blocks.push(figure);
              step.blockIds.push(figure.id);
            }
            if (extracted.figures.length > figureSlots) review.push(`Câu ${index + 1}: kiểm tra hình gốc vì đề đã đạt giới hạn khối nội dung.`);
            figureSlots = Math.max(0, figureSlots - extracted.figures.length);
          }
          assertActive();
          const saved = await request<Material>(`/api/materials/${savedDraft.id}`, { method: "PATCH", body: JSON.stringify({
            revision: savedDraft.revision, blocks, sourcePages: pages, learningSteps: material.learningSteps, reviewNotes: review.slice(0, 50),
          }) });
          assertActive();
          onComplete(saved, failed.length ? [...review, `${failed.length} câu chưa trích xuất đủ. ${serviceError}`.trim()] : review);
          return;
        }
      }
      const { fullSource, images, textPages } = await readStudioSource(source, files, { signal: operation.signal, onStatus: setStatus });
      if (fullSource.length < 20 || fullSource.length > 24_000) throw Error("Nội dung cần từ 20 đến 24.000 ký tự. Hãy chia đề dài thành nhiều phần.");
      setStatus(mode === "lesson" ? "AI đang biên soạn các hoạt động…" : "Đang nhập các câu hỏi và chọn hình phù hợp…");
      assertActive();
      const result = await request<{ material: Material; review: string[]; questionCount: number }>("/api/studio-generate", {
        method: "POST", body: JSON.stringify({ mode, source: fullSource, grade, minutes, ...(mode === "exam" ? { editableExam: true } : { richLesson: true }) }), signal: operation.signal,
      });
      assertActive();
      setStatus("Đang lưu bản nháp…");
      const pages: SourcePage[] = [...textPages];
      pages.push(...images.map((item) => item.page));
      let saved = await request<Material>("/api/materials", { method: "POST", body: JSON.stringify({ ...result.material, sourcePages: pages, reviewNotes: result.review }), signal: operation.signal });
      assertActive();
      savedDraft = saved;
      const review = [...result.review];
      const blocks = [...saved.blocks];
      const learningSteps = saved.learningSteps.map((item) => ({ ...item, blockIds: [...item.blockIds] }));
      for (const [index, image] of images.entries()) {
        assertActive();
        try {
          const imageUrl = await uploadStudioSourceImage(saved.id, image.blob, operation.signal);
          const page = pages.findIndex((item) => item === image.page);
          pages[page < 0 ? pages.length - images.length + index : page] = { ...image.page, imageUrl };
          if (mode === "lesson" && image.lessonIllustration && blocks.length < 100) {
            let target = learningSteps.find((item) => item.id === "studio_source_figures");
            if (!target && learningSteps.length < 50) {
              target = { id: "studio_source_figures", title: "Hình từ tài liệu nguồn", description: "", objective: "",
                phase: "explore", estimatedMinutes: 0, blockIds: [], actionLabels: [], visualActions: [] };
              learningSteps.push(target);
            }
            if (target) {
              const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
              blocks.push({ id, type: "paragraph", authorKind: "image", title: image.page.name.slice(0, 200), content: imageUrl });
              target.blockIds.push(id);
            }
          } else if (mode === "exam" && image.questionIndex !== undefined && blocks.length < 100) {
            const target = learningSteps.find((item) => item.title === `Câu ${image.questionIndex! + 1}`);
            if (target) {
              const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
              blocks.push({ id, type: "paragraph", authorKind: "image", title: `Hình gốc câu ${image.questionIndex + 1}`, content: imageUrl });
              target.blockIds.push(id);
              review.push(`Câu ${image.questionIndex + 1}: kiểm tra vị trí hình gốc lấy từ DOCX.`);
            }
          }
        } catch {
          review.push(`Chưa lưu được ảnh gốc “${image.page.name}”; phần chữ đã nhận diện vẫn có trong bản nháp.`);
        }
      }
      if (pages.length) saved = await request<Material>(`/api/materials/${saved.id}`, {
        method: "PATCH", body: JSON.stringify({ revision: saved.revision, sourcePages: pages, reviewNotes: review.slice(0, 50), blocks, learningSteps }), signal: operation.signal,
      });
      assertActive();
      onComplete(saved, review);
    } catch (reason) {
      if (savingPdfLayout && savedDraft) {
        await request(`/api/materials/${savedDraft.id}?draftRevision=${savedDraft.revision}`, { method: "DELETE" }).catch(() => {});
      }
      if (!mounted.current || operation.signal.aborted) return;
      if (savedDraft && !savingPdfLayout) onComplete(savedDraft, ["Bản nháp đã lưu nhưng chưa gắn được tài liệu nguồn. Hãy kiểm tra nguồn trước khi xuất bản."]);
      else setError(reason instanceof Error ? reason.message : "Không tạo được bản nháp.");
    } finally { busy.current = false; if (mounted.current) setStatus(""); }
  };

  if (!restored) return <section className="gs-generator"><p role="status">Đang phục hồi nội dung nguồn và tệp…</p></section>;
  return <section className="gs-generator">
    <button className="gs-text-link" type="button" onClick={leave}><ArrowLeft size={16} /> Quay lại cách bắt đầu</button>
    <header className="gs-section-head">
      <span>{mode === "lesson" ? "Bài giảng · Biên soạn cùng AI" : "Đề kiểm tra · Nhập tài liệu"}</span>
      <h1>{mode === "lesson" ? "Tạo trọn bài giảng từ nội dung" : "Nhập đề có sẵn"}</h1>
      <p>{mode === "lesson" ? "Dán nội dung bài, ghi mục tiêu và điều kiện giảng dạy. AI sẽ tạo bản nháp có hoạt động và mô hình để bạn rà soát." : "Dán đề hoặc chọn tệp theo đúng thứ tự. Câu hỏi được đưa vào trình soạn đề, kèm tài liệu nguồn để đối chiếu."}</p>
    </header>
    <div className="gs-form-card">
      <label>Nội dung nguồn<textarea rows={9} maxLength={24000} value={source} onChange={(event) => setSource(event.target.value)} placeholder={mode === "exam" ? "Dán nguyên văn đề kiểm tra, gồm số câu, lựa chọn và công thức…" : "Ví dụ: Bài hàm số bậc hai. Mục tiêu: nhận biết đồ thị parabol, xác định đỉnh và nghiệm…"} /></label>
      <label className="gs-upload-label"><FileImage size={17} /> Chọn ảnh, PDF, DOCX hoặc TXT (tối đa 5 tệp)
        <input type="file" multiple accept={studioSourceAccept} disabled={!!status} onChange={(event) => {
          const selected = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (selected.length > 5) setError("Chỉ chọn tối đa 5 tệp mỗi lần để không bỏ sót trang nguồn.");
          else if (selected.length) updateFiles(selected);
        }} />
      </label>
      {!!files.length && <ul className="gs-generator-files" aria-label="Tệp nguồn đã chọn">
        {files.map((file, index) => (
          <li key={`${file.name}-${file.lastModified}-${index}`}>
            <span>{file.name}</span>
            <button type="button" className="gs-secondary" disabled={!!status}
              aria-label={`Gỡ tệp ${file.name}`}
              onClick={() => updateFiles(files.filter((_, fileIndex) => fileIndex !== index))}>
              <X size={15} aria-hidden="true" /> Gỡ
            </button>
          </li>
        ))}
      </ul>}
      {pdfCodes.length > 0 && <label>Chọn mã đề trong PDF<select value={pdfCode} onChange={(event) => setPdfCode(event.target.value)}>
        <option value="">Chọn mã đề</option>
        {pdfCodes.map((code) => <option key={code} value={code}>{code}</option>)}
      </select></label>}
      <div className="gs-two-fields"><label>Khối lớp<input value={grade} maxLength={60} onChange={(event) => setGrade(event.target.value)} /></label>
        {mode !== "exam" && <label>Thời lượng (phút)<input type="number" min={10} max={180} value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 45)} /></label>}</div>
      {mode === "exam" && <p className="gs-generator-note">Kiểm tra các câu đã tách, đáp án và hình minh họa trước khi xuất đề.</p>}
      {error && <p className="gs-alert" role="alert">{error}</p>}
      {status && <p className="gs-generator-status" role="status">{status}</p>}
      <button className="gs-primary" type="button" disabled={!!status || !grade.trim() || (pdfCodes.length > 0 && !pdfCode)} onClick={() => void generate()}><Sparkles size={17} /> {mode === "lesson" ? "Tạo bài giảng" : "Nhập vào trình soạn đề"} <ArrowRight size={16} /></button>
    </div>
  </section>;
}
