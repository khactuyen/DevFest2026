"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Visual } from "./Visual";
import { LessonBoardView } from "./LessonBoardView";
import { ExamPreview } from "./ExamPreview";
import { request } from "@/lib/client";
import type { Material } from "@/lib/contracts";
import type { AssessmentSummary } from "@/lib/lesson-assessment";
import type { VisualRuntime } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";
import { Printer, Pencil, ArrowLeft, ArrowRight, Send, Sparkles } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { ownsMaterial } from "@/lib/auth/types";
import { publicMaterial } from "@/lib/public-material";
import { MaterialImage } from "./MaterialImage";
import { FormattedAIAnswer, splitFormattedMath } from "./FormattedMath";
import { FloatingAiHeader, FloatingAiTrigger } from "./FloatingAi";
import type { SlideTheme } from "./StudioSlideDeck";
export { FormattedAIAnswer } from "./FormattedMath";

function gradeLabel(grade: string) {
  const value = grade.trim();
  if (!value) return "";
  return /^lớp\s/i.test(value) ? value : `Lớp ${value}`;
}

type AskMode = "detail" | "hint" | "example" | "teaching" | "free";
type AskContext = { text: string; blockId?: string; top?: number; left?: number };
export function MaterialReader({ material, teacherMode = false, documentMode = false, presentationChannel, presentationTheme, assessments = [], assessmentLoadError = false }: {
  material: Material; teacherMode?: boolean; documentMode?: boolean;
  presentationChannel?: string; presentationTheme?: SlideTheme; assessments?: AssessmentSummary[]; assessmentLoadError?: boolean;
}) {
  const runtimes = useRef<Record<string, VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime | null | undefined>>({});
  const root = useRef<HTMLElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const currentTheme = useRef(presentationTheme);
  currentTheme.current = presentationTheme;
  const askVersion = useRef(0);
  const askAbort = useRef<AbortController | null>(null);
  const [activeStep, setActiveStep] = useState(material.learningSteps[0]?.id || "");
  const [askContext, setAskContext] = useState<AskContext | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askMode, setAskMode] = useState<AskMode>("free");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState("");
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [shared, setShared] = useState(false);
  const [assistantHost, setAssistantHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (teacherMode) setAssistantHost(document.body);
    return () => { askVersion.current += 1; askAbort.current?.abort(); };
  }, [teacherMode]);
  function closeAssistant() {
    askVersion.current += 1;
    askAbort.current?.abort();
    setAskBusy(false);
    setAskOpen(false);
  }
  const runStep = (next: Material["learningSteps"][number]) => {
    setActiveStep(next.id);
    channel.current?.postMessage({ type: "step", stepId: next.id });
  };
  useEffect(() => {
    if (!teacherMode || !presentationChannel) return;
    const bus = new BroadcastChannel(`studio-present:${presentationChannel}`);
    channel.current = bus;
    const audience = publicMaterial(material);
    const sendLesson = () => bus.postMessage({ type: "init", material: audience, theme: currentTheme.current });
    bus.onmessage = (event) => {
      if (event.data?.type === "ready") sendLesson();
      if (event.data?.type === "navigate" && typeof event.data.stepId === "string"
        && material.learningSteps.some((item) => item.id === event.data.stepId)) {
        setActiveStep(event.data.stepId);
      }
    };
    sendLesson();
    return () => { if (channel.current === bus) channel.current = null; bus.close(); };
  }, [teacherMode, presentationChannel, material]);
  useEffect(() => {
    channel.current?.postMessage({ type: "theme", theme: presentationTheme });
  }, [presentationTheme]);
  useEffect(() => {
    askVersion.current += 1;
    askAbort.current?.abort();
    setAskBusy(false); setAnswer(""); setHistory([]); setAskContext(null); setShared(false);
    channel.current?.postMessage({ type: "reveal", answer: "" });
  }, [activeStep]);
  const step = material.learningSteps.find((item) => item.id === activeStep);
  useEffect(() => {
    if (!step?.visualId || !step.visualActions.length) return;
    const frame = requestAnimationFrame(() => runtimes.current[step.visualId!]?.actions(step.visualActions));
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const visibleBlocks = step
    ? step.blockIds.flatMap((id) => {
        const block = material.blocks.find((item) => item.id === id);
        return block ? [block] : [];
      })
    : material.blocks;
  const stepIndex = step ? material.learningSteps.findIndex((item) => item.id === step.id) : -1;
  const phaseNames: Record<Material["learningSteps"][number]["phase"], string> = {
    warmup: "Khởi động", objective: "Mục tiêu", explore: "Khám phá", concept: "Hình thành kiến thức",
    practice: "Luyện tập", assess: "Đánh giá", summary: "Tổng kết",
  };
  const selectText = (event: React.SyntheticEvent<HTMLElement>) => {
    if (!teacherMode || !root.current?.contains(event.target as Node)) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim().slice(0, 1800) || "";
    if (!text || !selection?.anchorNode || !root.current.contains(selection.anchorNode)) return;
    const parent = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode.parentElement;
    const blockId = parent?.closest("[data-block-id]")?.getAttribute("data-block-id") || undefined;
    const selectedStepId = parent?.closest("[data-step-id]")?.getAttribute("data-step-id");
    const selectedStep = selectedStepId && material.learningSteps.find((item) => item.id === selectedStepId);
    if (selectedStep && selectedStep.id !== activeStep) runStep(selectedStep);
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setAskContext({ text, blockId, top: Math.min(window.innerHeight - 60, rect.bottom + 8), left: Math.max(12, Math.min(window.innerWidth - 420, rect.left)) });
    setAnswer(""); setShared(false);
  };
  const ask = async (mode: AskMode = askMode, requested = question) => {
    const text = requested.trim() || (mode === "detail" ? "Giải thích kỹ phần đã chọn, từng bước." : mode === "example" ? "Cho một ví dụ dễ hiểu cho phần đã chọn." : mode === "hint" ? "Cho gợi ý mà chưa nêu đáp án." : "Gợi ý cách giảng phần này cho học sinh.");
    if (!text || askBusy) return;
    const generation = ++askVersion.current;
    askAbort.current?.abort();
    const controller = new AbortController();
    askAbort.current = controller;
    setAskOpen(true); setAskMode(mode); setAskBusy(true); setAskError(""); setAnswer(""); setShared(false);
    const selectedBlock = material.blocks.find((item) => item.id === askContext?.blockId);
    const visual = material.visuals.find((item) => item.id === selectedBlock?.visualId || item.id === step?.visualId);
    try {
      const result = await request<{ answer: string }>("/api/studio-ask", { method: "POST", signal: controller.signal, body: JSON.stringify({
        lessonTitle: material.title, stepTitle: step?.title || "Bài giảng", selected: askContext?.text || "",
        surrounding: visibleBlocks.map((item) => `${item.title || item.type}: ${item.content}`).join("\n").slice(0, 5000),
        visual: visual ? `${visual.accessibility?.description || visual.source?.key || "Mô hình"}; chiều ${visual.dimension}; đối tượng: ${visual.objects.slice(0, 15).map((item) => item.label || item.id).join(", ")}; tham số: ${visual.parameters.map((item) => `${item.label || item.id}=${item.value}`).join(", ")}`.slice(0, 1500) : "",
        question: text, mode, history: history.slice(-4),
      }) });
      if (generation !== askVersion.current) return;
      setAnswer(result.answer); setHistory((items) => [...items.slice(-3), { question: text, answer: result.answer }]);
    } catch (error) {
      if (generation !== askVersion.current || controller.signal.aborted) return;
      setAskError(error instanceof Error ? error.message : "Không hỏi được AI.");
    } finally { if (generation === askVersion.current) setAskBusy(false); }
  };
  const renderBlock = (b: Material["blocks"][number], ownerStepId?: string) => {
    const activateOwner = () => {
      const owner = ownerStepId && material.learningSteps.find((item) => item.id === ownerStepId);
      if (owner && owner.id !== activeStep) runStep(owner);
    };
    if (b.type === "heading") return <h2 key={b.id} data-block-id={b.id}><FormattedAIAnswer as="span" text={b.content} /></h2>;
    if (b.authorKind === "image") return <figure className="reader-image" key={b.id} data-block-id={b.id}>
      {b.content && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(b.content)
        ? <MaterialImage src={b.content} alt={b.title || "Hình minh họa trong bài giảng"} />
        : <p>Chưa có hình minh họa.</p>}
      {b.title && <figcaption>{b.title}</figcaption>}
    </figure>;
    if (b.type === "visual") {
      const spec = material.visuals.find((v) => v.id === b.visualId);
      const onSelect = teacherMode && spec ? (selection: { id: string }) => {
        const selected = spec.objects.find((item) => item.id === selection.id);
        activateOwner();
        setAskContext({ text: `Đối tượng ${selected?.label || selection.id} (${selected?.type || "mô hình"})`, blockId: b.id });
        setAskOpen(true); setAnswer(""); setShared(false);
      } : undefined;
      return (
        <figure key={b.id} data-block-id={b.id}>
          {b.board ? <LessonBoardView board={b.board} spec={spec || null} onSelect={onSelect}
            onReady={(runtime) => { if (spec) runtimes.current[spec.id] = runtime; }} />
            : spec ? <Visual spec={spec} ref={(runtime) => { runtimes.current[spec.id] = runtime; }} onSelect={onSelect} />
            : <p className="error">Mô hình bị thiếu</p>}
          <figcaption><FormattedAIAnswer as="span" text={b.content} /></figcaption>
          {teacherMode && spec && <button type="button" className="teacher-inline-ask" onClick={() => { activateOwner(); setAskContext({ text: spec.accessibility?.description || b.title || "Mô hình", blockId: b.id }); setAskOpen(true); }}>Hỏi AI về hình này</button>}
        </figure>
      );
    }
    if (b.type === "math") return <section className="reader-content-block" key={b.id} data-block-id={b.id}>{b.title && <h3>{b.title}</h3>}<ReadonlyFormula latex={b.content} />{teacherMode && <button type="button" className="teacher-inline-ask" onClick={() => { activateOwner(); setAskContext({ text: b.content, blockId: b.id }); setAskOpen(true); }}>Hỏi AI về công thức</button>}</section>;
    if (b.type === "exercise") {
      return <QuestionBlock key={b.id} block={b} materialId={material.id} teacherMode={teacherMode} />;
    }
    if (b.authorKind === "hint") return <details className="reader-hint" key={b.id} data-block-id={b.id}><summary>{b.title || "Xem gợi ý"}</summary><FormattedAIAnswer as="p" text={b.content} /></details>;
    if (b.type === "callout") return <aside className="callout" key={b.id} data-block-id={b.id}><strong>{b.title || "Ghi nhớ"}</strong><FormattedAIAnswer as="p" text={b.content} /></aside>;
    return <section className="reader-content-block" key={b.id} data-block-id={b.id}>{b.title && <h3><FormattedAIAnswer as="span" text={b.title} /></h3>}<FormattedAIAnswer as="p" className="reader-text" text={b.content} /></section>;
  };
  return (
    <article className={`reader ${teacherMode ? "teacher-reader" : ""} ${documentMode ? "document-reader" : ""}`} ref={root} onMouseUpCapture={selectText} onKeyUpCapture={selectText}>
      {teacherMode && askContext?.top !== undefined && !askOpen && <div className="teacher-selection-menu" style={{ top: askContext.top, left: askContext.left }}>
        <button type="button" onClick={() => setAskOpen(true)}>Hỏi AI</button>
        <button type="button" onClick={() => void ask("detail")}>Giải thích kỹ</button>
        <button type="button" onClick={() => void ask("example")}>Cho ví dụ</button>
      </div>}
      <div className={documentMode ? "document-page" : undefined}>
        <div className="eyebrow">
          {[material.metadata.topic, gradeLabel(material.metadata.grade)].filter(Boolean).join(" · ")}
        </div>
        <h1><FormattedAIAnswer as="span" text={material.title} /></h1><FormattedAIAnswer as="p" className="reader-summary" text={material.summary} />
        {!!assessments.length && <section className="reader-assessments" aria-label="Phiếu kiểm tra kiến thức">
          <h2>Phiếu kiểm tra kiến thức</h2>
          <p>Chọn phiếu giáo viên đã giao. Chuẩn bị mã học sinh và mã làm bài riêng.</p>
          <ul>{assessments.map((assessment) => <li key={assessment.id}>
            <Link href={`/phieu-kiem-tra/${assessment.id}`}>
              <FormattedAIAnswer as="span" text={assessment.title.replace(/^Phiếu kiểm tra kiến thức\s*[–—-]\s*/, "")} />
              {assessments.length > 1 && <small>{new Date(assessment.createdAt).toLocaleString("vi-VN")}</small>}
              <span>Làm phiếu <ArrowRight size={15} /></span>
            </Link>
          </li>)}</ul>
        </section>}
        {assessmentLoadError && <p role="status">Chưa tải được phiếu kiểm tra. Tải lại trang để thử lại.</p>}
        {!documentMode && <div className="reader-tags">
          {[...new Set(material.metadata.tags.filter(Boolean))].map((t) => <span className="tag" key={t}>{t}</span>)}
        </div>}
        {!documentMode && material.learningSteps.length > 0 && (
        <section className="reader-learning-flow" aria-label="Lộ trình học tập">
          <div>
            <span>LỘ TRÌNH KHÁM PHÁ</span>
            <strong>Thực hiện theo từng bước</strong>
          </div>
          <div className="reader-step-list">
            {material.learningSteps.map((step, index) => (
              <button
                key={step.id}
                className={activeStep === step.id ? "active" : ""}
                aria-current={activeStep === step.id ? "step" : undefined}
                onClick={() => runStep(step)}
              >
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>
                  <strong><FormattedAIAnswer as="span" text={step.title} /></strong>
                  {step.description && <small><FormattedAIAnswer as="span" text={step.description} /></small>}
                </span>
              </button>
            ))}
          </div>
        </section>
        )}
        {documentMode && material.learningSteps.length > 0 ? material.learningSteps.map((documentStep, index) => {
          const documentBlocks = documentStep.blockIds.flatMap((id) => {
            const block = material.blocks.find((item) => item.id === id);
            return block ? [block] : [];
          });
          return <section className="reader-step-content document-step" data-step-id={documentStep.id} key={documentStep.id}>
            <div className="reader-step-heading">
              <span>{String(index + 1).padStart(2, "0")} · {phaseNames[documentStep.phase]}</span>
              <h2><FormattedAIAnswer as="span" text={documentStep.title} /></h2>
              {documentStep.description && <FormattedAIAnswer as="p" text={documentStep.description} />}
              {documentStep.objective && <p><strong>Mục tiêu:</strong> <FormattedAIAnswer as="span" text={documentStep.objective} /></p>}
            </div>
            {documentBlocks.map((block) => renderBlock(block, documentStep.id))}
          </section>;
        }) : step ? (
        <section className="reader-step-content" data-step-id={step.id} aria-live="polite">
          <div className="reader-step-heading">
            <span>{String(stepIndex + 1).padStart(2, "0")} · {phaseNames[step.phase]}</span>
            <h2><FormattedAIAnswer as="span" text={step.title} /></h2>
            {step.description && <FormattedAIAnswer as="p" text={step.description} />}
            {step.objective && <p><strong>Mục tiêu:</strong> <FormattedAIAnswer as="span" text={step.objective} /></p>}
          </div>
          {visibleBlocks.map((block) => renderBlock(block, step.id))}
          {!documentMode && <footer className="reader-step-navigation">
            <button type="button" disabled={stepIndex <= 0} onClick={() => runStep(material.learningSteps[stepIndex - 1])}>
              <ArrowLeft size={15} /> Bước trước
            </button>
            <span>{stepIndex + 1} / {material.learningSteps.length}</span>
            <button type="button" disabled={stepIndex >= material.learningSteps.length - 1} onClick={() => runStep(material.learningSteps[stepIndex + 1])}>
              Bước tiếp <ArrowRight size={15} />
            </button>
          </footer>}
        </section>
        ) : visibleBlocks.map((block) => renderBlock(block))}
      </div>
      {teacherMode && assistantHost && createPortal(askOpen ?
        <aside className="teacher-ai-panel floating-ai-panel studio-floating-ai" role="dialog" aria-label="Hỏi AI khi dạy"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeAssistant(); } }}>
        <FloatingAiHeader title="Trợ giảng Toán AI" closeLabel="Đóng Hỏi AI" onClose={closeAssistant} />
        <div className="studio-floating-ai-body">
        <div className="explore-v2-ai-context"><b><Sparkles size={13} /> Đang hỏi về</b><p>{askContext?.text || step?.title || material.title}</p></div>
        <div className="teacher-ask-modes">
          <button type="button" onClick={() => void ask("detail")}>Giải thích kỹ</button>
          <button type="button" onClick={() => void ask("hint")}>Chỉ gợi ý</button>
          <button type="button" onClick={() => void ask("example")}>Cho ví dụ</button>
          <button type="button" onClick={() => void ask("teaching")}>Cách giảng</button>
        </div>
        {askError && <p className="gs-alert" role="alert">{askError}</p>}
        {answer && <div className="teacher-answer" role="status"><strong>Gợi ý giải thích</strong><FormattedAIAnswer text={answer} compactDisplaySpacing /><small>Giáo viên cần kiểm tra kết quả toán trước khi trình bày.</small>
          {presentationChannel && <button type="button" onClick={() => { channel.current?.postMessage({ type: "reveal", answer: shared ? "" : answer }); setShared(!shared); }}>{shared ? "Ẩn khỏi màn chiếu" : "Đưa lên màn chiếu"}</button>}
        </div>}
        </div>
        <form className="studio-floating-ai-compose" onSubmit={(event) => { event.preventDefault(); if (question.trim().length >= 2) void ask("free"); }}>
          <label htmlFor="studio-teacher-ai-question">Câu hỏi của giáo viên</label>
          <textarea id="studio-teacher-ai-question" rows={2} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Bạn muốn giải thích điều gì?" />
          <button className="gs-primary" type="submit" disabled={askBusy || question.trim().length < 2}>{askBusy ? "Đang trả lời…" : "Gửi câu hỏi"} <Send size={14} /></button>
        </form>
      </aside> : <FloatingAiTrigger onOpen={() => setAskOpen(true)} />, assistantHost)}
    </article>
  );
}

export function ReadonlyFormula({ latex }: { latex: string }) {
  const host = useRef<HTMLDivElement>(null);
  const parts = splitFormattedMath(latex.trim());
  const value = parts.length === 1 && parts[0].type === "math" ? parts[0].value : latex;
  useEffect(() => {
    let disposed = false;
    let field: (HTMLElement & { value: string; readOnly: boolean }) | undefined;
    import("mathlive").then(({ MathfieldElement }) => {
      if (disposed) return;
      MathfieldElement.fontsDirectory = "/mathlive/fonts";
      field = new MathfieldElement();
      field.value = value;
      field.readOnly = true;
      field.setAttribute("aria-label", `Công thức ${value}`);
      host.current?.replaceChildren(field);
    }).catch(() => {});
    return () => { disposed = true; field?.remove(); };
  }, [value]);
  return <div className="reader-formula" ref={host}><code>{value}</code></div>;
}

function QuestionBlock({ block, materialId, teacherMode }: { block: Material["blocks"][number]; materialId: string; teacherMode: boolean }) {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [publicResult, setPublicResult] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [checkError, setCheckError] = useState("");
  const assessment = block.assessment;
  const multiple = assessment?.type === "multiple" && (assessment.options?.length || 0) >= 2;
  const hasKey = multiple
    ? assessment?.correctIndex !== undefined
    : Boolean(assessment?.answer?.trim());
  const canCheck = teacherMode ? hasKey : multiple || assessment?.type === "short";
  const correct = multiple
    ? Number(answer) === assessment?.correctIndex
    : answer.trim().toLocaleLowerCase("vi") === assessment?.answer?.trim().toLocaleLowerCase("vi");
  const checkAnswer = async () => {
    if (!answer.trim() || checking) return;
    if (teacherMode && hasKey) { setChecked(true); return; }
    setChecking(true);
    setCheckError("");
    try {
      const result = await request<{ correct: boolean; explanation: string }>(`/api/materials/${materialId}/check`, {
        method: "POST", body: JSON.stringify({ blockId: block.id, answer }),
      });
      setPublicResult(result);
    } catch (error) { setPublicResult(null); setCheckError(error instanceof Error ? error.message : "Không kiểm tra được câu trả lời."); }
    finally { setChecking(false); }
  };
  return <section className="reader-question" data-block-id={block.id}>
    <strong><FormattedAIAnswer as="span" text={block.title || "Câu hỏi"} /></strong><FormattedAIAnswer as="p" text={block.content} />
    {multiple ? <div className="reader-choices">{assessment!.options!.map((option, index) => <label key={index}><input type="radio" name={`question-${block.id}`} value={index} checked={answer === String(index)} onChange={(event) => { setAnswer(event.target.value); setChecked(false); setPublicResult(null); setCheckError(""); }} /><FormattedAIAnswer as="span" text={option} /></label>)}</div>
      : <label className="reader-short-answer">Câu trả lời của em<input value={answer} onChange={(event) => { setAnswer(event.target.value); setChecked(false); setPublicResult(null); setCheckError(""); }} placeholder="Nhập câu trả lời…" /></label>}
    {canCheck && <button type="button" disabled={!answer.trim() || checking} onClick={() => void checkAnswer()}>{checking ? "Đang kiểm tra…" : "Tự kiểm tra"}</button>}
    {checkError && <p role="alert">{checkError}</p>}
    {(checked || publicResult) && <div className={(publicResult?.correct ?? correct) ? "reader-correct" : "reader-incorrect"} role="status"><strong>{(publicResult?.correct ?? correct) ? "Chính xác" : "Hãy xem lại câu trả lời"}</strong>{(publicResult?.explanation || assessment?.explanation) && <FormattedAIAnswer as="p" text={publicResult?.explanation || assessment?.explanation || ""} />}</div>}
  </section>;
}
export function MaterialPage({ slug }: { slug: string }) {
  const user = useAuth();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [assessmentLoadError, setAssessmentLoadError] = useState(false);
  const [m, setM] = useState<Material | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const path = `/api/materials/${encodeURIComponent(slug)}`;
    setM(null); setError(""); setAssessments([]); setAssessmentLoadError(false);
    void request<Material>(path, { signal: controller.signal }).then((material) => {
      if (controller.signal.aborted) return;
      setM(material);
      if (material.status === "published" && !material.exam) {
        void request<AssessmentSummary[]>(`${path}/assessments`, { signal: controller.signal })
          .then((checks) => { if (!controller.signal.aborted) setAssessments(checks); })
          .catch(() => { if (!controller.signal.aborted) setAssessmentLoadError(true); });
      }
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [slug]);
  return (
    <>
      <header className="topbar">
        <Link href="/">← Thư viện học liệu</Link>
        {m && (
          <div className="actions">
            {ownsMaterial(user, m.ownerId) && <Link className="outline" href={`/material/${m.id}/edit`}>
              <Pencil size={15} /> Chỉnh sửa
            </Link>}
            {!m.exam && ownsMaterial(user, m.ownerId) && <Link className="outline" href={`/studio?material=${m.id}&view=assessments`}>Xem kết quả kiểm tra</Link>}
            <Link className="outline" href={`/material/${slug}/print`}>
              <Printer size={15} /> Bản in / PDF
            </Link>
          </div>
        )}
      </header>
      {error ? (
        <p className="error">{error}</p>
      ) : m ? (
        m.exam ? <ExamPreview material={m} canShowAnswers={ownsMaterial(user, m.ownerId)} />
          : <MaterialReader material={m} assessments={assessments} assessmentLoadError={assessmentLoadError} />
      ) : (
        <p className="empty">Đang tải học liệu…</p>
      )}
    </>
  );
}
