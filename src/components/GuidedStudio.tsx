"use client";
import { MaterialShare } from "./MaterialShare";
import { LessonAssessmentShare } from "./LessonAssessmentShare";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2,
  Box, ClipboardList, Copy, Eye, FilePenLine,
  ImagePlus, Lightbulb, LoaderCircle, Play, Plus, Printer, Save,
  Search, Send, Sparkles, Trash2, X,
} from "lucide-react";
import { MaterialSchema, type Material, type VisualAction, type VisualSpec, type VisualStateSummary } from "@/lib/contracts";
import { readBrowserDraft, writeBrowserDraft } from "@/lib/browser-draft";
import { discardStudioDraft, listStudioDrafts, readStudioDraft, storeStudioDraft, studioDraftDiscarded, withStudioDraftLock, type StudioDraft, type StudioStage as Stage } from "@/lib/studio-drafts";
import { learnerSessionId } from "@/lib/learner";
import { createLessonDraft } from "@/lib/material-defaults";
import { materialPublishIssues, retainMaterialReview, type MaterialPublishIssue } from "@/lib/material-publish";
import { instantiateVisualPattern, visualPatterns } from "@/lib/visual-patterns";
import { request } from "@/lib/client";
import { MaterialReader } from "./MaterialReader";
import { FloatingAiHeader, FloatingAiTrigger } from "./FloatingAi";
import { FormattedAIAnswer } from "./FormattedMath";
import { Visual } from "./Visual";
import { MaterialImage } from "./MaterialImage";
import { StudioGenerator, type GeneratorDraft } from "./StudioGenerator";
import { MaterialSourceReview } from "./MaterialSourceReview";
import { ExploreWorkspace } from "./ExploreWorkspace";
import { LessonBoardView } from "./LessonBoardView";
import { LessonWorksheet } from "./LessonWorksheet";
import { LessonKnowledgeCheck } from "./LessonKnowledgeCheck";
import { StudioQuestionBank, type BankQuestion } from "./StudioQuestionBank";
import { copyBankQuestion } from "@/lib/studio-question-bank";
import { useAuth } from "./AuthProvider";
import { isSlideTheme, StudioSlidePreview, type SlideTheme } from "./StudioSlideDeck";
import { ExamComposer } from "./ExamComposer";
import { ExamPreview } from "./ExamPreview";
import { defaultExamSettings, editablePdfQuestion, examQuestions, examSourceFigures, pdfQuestionFigure } from "@/lib/exam-document";
import { uploadStudioSourceImage, type extractEditablePdfQuestion } from "@/lib/studio-source-client";
import { LessonBoardSchema, lessonBoardTransferKey, newLessonBoard, type LessonBoard } from "@/lib/lesson-board";
import { validateActions, validateMaterial, validateVisual } from "@/lib/validation";

type Step = Material["learningSteps"][number];
type Block = Material["blocks"][number];
type LessonOutput = "worksheet" | "presentation" | "knowledge-check";
type StudioPosition = { stage?: Stage; stepId?: string; output?: LessonOutput; review?: boolean };
type BoardTarget = {
  materialId: string;
  stepId: string;
  blockId?: string;
  visual: VisualSpec | null;
  board: LessonBoard;
  imported?: boolean;
  note?: string;
};
type SuggestionKind = "outline" | "content" | "question" | "activity" | "objective" | "example" | "review";
type Suggestion = {
  title: string;
  description: string;
  content: string;
  phase?: Step["phase"];
  minutes?: number;
  visualKey?: string;
};
type SaveState = "saved" | "dirty" | "saving" | "error";

const stages: { key: Exclude<Stage, "start">; label: string }[] = [
  { key: "info", label: "Thông tin" },
  { key: "outline", label: "Dàn bài" },
  { key: "edit", label: "Soạn hoạt động" },
  { key: "preview", label: "Dạy thử" },
  { key: "finish", label: "Hoàn tất" },
];
const phases: { key: Step["phase"]; label: string }[] = [
  { key: "warmup", label: "Khởi động" },
  { key: "objective", label: "Mục tiêu" },
  { key: "explore", label: "Khám phá" },
  { key: "concept", label: "Hình thành kiến thức" },
  { key: "practice", label: "Luyện tập" },
  { key: "assess", label: "Kiểm tra" },
  { key: "summary", label: "Tổng kết" },
];
const starterPhases: Step["phase"][] = ["warmup", "explore", "concept", "practice", "summary"];
const templateKeys = ["quadratic-roots", "triangle-thales", "vector-addition", "cube"];

function blankDraft() {
  const draft = createLessonDraft("Bài học mới");
  return { ...draft, blocks: [], visuals: [], learningSteps: [] };
}

function newStep(phase: Step["phase"] = "explore", title?: string): Step {
  return {
    id: `step_${crypto.randomUUID().replace(/-/g, "")}`,
    title: title || phases.find((item) => item.key === phase)?.label || "Hoạt động mới",
    description: "",
    objective: "",
    estimatedMinutes: 5,
    phase,
    blockIds: [],
    actionLabels: [],
    visualActions: [],
  };
}

function fromTemplate(key: string): Material {
  const model = instantiateVisualPattern(key, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
  const title = visualPatterns.find((item) => item.key === key)?.title || "Bài học mới";
  const step = newStep("explore", `Khám phá ${title.toLowerCase()}`);
  const intro: Block = {
    id: `block_${crypto.randomUUID().replace(/-/g, "")}`,
    type: "paragraph", authorKind: "text", title: "Câu hỏi dẫn dắt",
    content: `Quan sát ${title.toLowerCase()}. Hãy nêu một điều em nhận thấy khi thao tác với mô hình.`,
  };
  const visual: Block = {
    id: `block_${crypto.randomUUID().replace(/-/g, "")}`,
    type: "visual", authorKind: model.dimension === "3d" ? "visual3d" : "visual2d",
    title, content: "Thao tác với mô hình để kiểm chứng dự đoán.", visualId: model.id,
  };
  step.blockIds = [intro.id, visual.id];
  step.visualId = model.id;
  return {
    ...blankDraft(), title,
    metadata: { grade: "10", topic: visualPatterns.find((item) => item.key === key)?.topic || "Toán học", type: "lesson", tags: [] },
    blocks: [intro, visual], visuals: [model], learningSteps: [step],
  };
}

function blockDefinition(kind: "text" | "formula" | "image" | "visual" | "question" | "hint", visual?: VisualSpec): Block {
  const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
  if (kind === "visual" && visual) return {
    id, type: "visual", authorKind: visual.dimension === "3d" ? "visual3d" : "visual2d",
    title: visual.accessibility?.description || "Mô hình tương tác", content: "", visualId: visual.id,
  };
  if (kind === "question") return {
    id, type: "exercise", authorKind: "question", title: "Câu hỏi", content: "",
    assessment: { type: "short", points: 1, answer: "" },
  };
  const definitions: Record<"text" | "formula" | "image" | "hint", Pick<Block, "type" | "authorKind" | "title" | "content">> = {
    text: { type: "paragraph", authorKind: "text", title: "Nội dung", content: "" },
    formula: { type: "math", authorKind: "formula", title: "Công thức", content: "" },
    image: { type: "paragraph", authorKind: "image", title: "Hình minh họa", content: "" },
    hint: { type: "callout", authorKind: "hint", title: "Gợi ý", content: "" },
  };
  return { id, ...definitions[kind === "visual" ? "text" : kind] };
}

function StudioModel({ spec, onUpdate, onSelect }: {
  spec: VisualSpec;
  onUpdate: (parameters: VisualStateSummary["parameters"]) => void;
  onSelect?: (id: string) => void;
}) {
  // Visual keeps its own live renderer while the surrounding lesson autosaves.
  // Changing a slider must not destroy and recreate the graph on every frame.
  const [initial] = useState(spec);
  return <Visual spec={initial} onState={(state) => onUpdate(state.parameters)} onSelect={(selection) => onSelect?.(selection.id)} />;
}

function FormulaEditor({ value, onChange }: { value: string; onChange: (latex: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<(HTMLElement & { value: string }) | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (fieldRef.current && fieldRef.current.value !== value) fieldRef.current.value = value;
  }, [value]);
  useEffect(() => {
    let disposed = false;
    let field: (HTMLElement & { value: string }) | undefined;
    import("mathlive").then(({ MathfieldElement }) => {
      if (disposed) return;
      MathfieldElement.fontsDirectory = "/mathlive/fonts";
      field = new MathfieldElement();
      field.value = value;
      fieldRef.current = field;
      field.setAttribute("aria-label", "Soạn công thức toán");
      field.addEventListener("input", () => callback.current(field!.value));
      host.current?.append(field);
    }).catch(() => {});
    return () => { disposed = true; if (fieldRef.current === field) fieldRef.current = null; field?.remove(); };
  // The editor owns its keystrokes; switching blocks creates a new instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="gs-formula-field" ref={host} />;
}

export function GuidedStudio() {
  const account = useAuth();
  const searchParams = useSearchParams();
  const materialParam = searchParams.get("material");
  const deviceDraftParam = searchParams.get("draft");
  const [doc, setDoc] = useState<Material | null>(null);
  const current = useRef<Material | null>(null);
  const [stage, setStage] = useState<Stage>("start");
  const [generatorMode, setGeneratorMode] = useState<"lesson" | "exam" | null>(null);
  const [openExamAi, setOpenExamAi] = useState(false);
  useEffect(() => {
    if (openExamAi && stage === "edit") setOpenExamAi(false);
  }, [openExamAi, stage]);
  const [generatorDraft, setGeneratorDraft] = useState<GeneratorDraft | undefined>();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [presentationChannel, setPresentationChannel] = useState("");
  const [lessonOutput, setLessonOutput] = useState<LessonOutput>("presentation");
  const [lessonCheckOpenedId, setLessonCheckOpenedId] = useState("");
  const [assessmentReviewLesson, setAssessmentReviewLesson] = useState("");
  const [slideTheme, setSlideTheme] = useState<SlideTheme>("jade");
  useEffect(() => {
    try {
      const value = localStorage.getItem("mathcos:slide-theme");
      if (isSlideTheme(value)) setSlideTheme(value);
    } catch { /* Browser storage is optional. */ }
  }, []);
  const [activeStepId, setActiveStepId] = useState("");
  const [activeBlockId, setActiveBlockId] = useState("");
  const [recent, setRecent] = useState<Material[]>([]);
  const [deviceDrafts, setDeviceDrafts] = useState<StudioDraft[]>([]);
  const [deleting, setDeleting] = useState("");
  const deletingId = useRef("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const publishInFlight = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const element = document.getElementById(pendingFocus.current);
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      element.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [stage, activeBlockId, activeStepId]);
  const [modelPicker, setModelPicker] = useState(false);
  const [boardTarget, setBoardTarget] = useState<BoardTarget | null>(null);
  const draggedBoard = useRef<{ visual: VisualSpec | null; board: LessonBoard } | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [hasBoardTransfer, setHasBoardTransfer] = useState(false);
  const boardApplying = useRef(false);
  const boardAssets = useRef(new Map<string, string>());
  const transferKey = `${lessonBoardTransferKey}:${learnerSessionId()}`;
  useEffect(() => {
    try { setHasBoardTransfer(Boolean(sessionStorage.getItem(transferKey))); }
    catch { setHasBoardTransfer(false); }
  }, [searchParams, transferKey]);
  useEffect(() => {
    if (!boardTarget) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [boardTarget]);
  const [modelSearch, setModelSearch] = useState("");
  const [uploadingBlockId, setUploadingBlockId] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiKind, setAiKind] = useState<SuggestionKind | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [actionType, setActionType] = useState<VisualAction["type"]>("highlight");
  const [actionValue, setActionValue] = useState(0);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const revision = useRef(1);
  const savedId = useRef<string | null>(null);
  const inFlight = useRef<Promise<Material> | null>(null);
  const aiGeneration = useRef(0);
  const aiRequest = useRef<AbortController | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<StudioDraft | null>(null);
  const draftKey = `math-vision:studio-draft:${learnerSessionId()}`;
  const documentEpoch = useRef(0);
  const refreshDeviceDrafts = () => setDeviceDrafts(listStudioDrafts(draftKey));
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!event.key || event.key === draftKey || event.key.startsWith(`${draftKey}:`))
        setDeviceDrafts(listStudioDrafts(draftKey));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [draftKey]);
  function recoverDraft(value: StudioDraft) {
    const parsed = MaterialSchema.safeParse(value.doc);
    if (!parsed.success || parsed.data.status === "published" || studioDraftDiscarded(draftKey, parsed.data.id)) return;
    documentEpoch.current += 1;
    current.current = parsed.data; setDoc(parsed.data);
    setLessonOutput("presentation");
    setAssessmentReviewLesson("");
    savedId.current = value.persisted ? parsed.data.id : null;
    revision.current = parsed.data.revision;
    version.current = value.dirty || !value.persisted ? 1 : 0; savedVersion.current = 0;
    setSaveState(version.current ? "dirty" : "saved");
    setActiveStepId(value.stepId); setActiveBlockId(value.blockId);
    setStage(stages.some(item => item.key === value.stage) ? value.stage : "edit");
    setRecoveryDraft(null); setMessage("Đã phục hồi bản nháp trên thiết bị.");
  }
  function recoverAsCopy(value: StudioDraft) {
    const now = new Date().toISOString();
    recoverDraft({ ...value, persisted: false, dirty: true,
      doc: { ...value.doc, id: crypto.randomUUID(), revision: 1, title: `${value.doc.title} — Bản phục hồi`,
        status: "draft", visibility: "private", slug: null, publishedAt: null, createdAt: now, updatedAt: now } });
    clearMaterialFromUrl();
  }

  function clearMaterialFromUrl() {
    const params = new URLSearchParams(window.location.search);
    for (const name of ["material", "draft", "stage", "output", "view"]) params.delete(name);
    window.history.replaceState(null, "", `/studio${params.size ? `?${params}` : ""}`);
  }

  function restoreStudioPosition(source: Material, fallback: StudioPosition = {}) {
    const params = new URLSearchParams(window.location.search);
    const requestedStage = params.get("stage") || fallback.stage;
    const review = !source.exam && (params.get("view") === "assessments" || (!params.has("stage") && fallback.review === true));
    const requestedOutput = review ? "knowledge-check" : params.get("output") || fallback.output;
    const output = !source.exam && (requestedOutput === "worksheet" || requestedOutput === "knowledge-check")
      ? requestedOutput : "presentation";
    const validStage = stages.some(({ key }) => key === requestedStage)
      && (source.status !== "published" || requestedStage === "preview" || requestedStage === "finish")
      && (!source.exam || requestedStage === "edit" || requestedStage === "preview" || requestedStage === "finish");
    setStage(params.get("view") === "assessments" && !params.has("stage") && !source.exam ? "preview" : validStage ? requestedStage as Stage
      : source.status === "published" ? "preview" : "edit");
    setLessonOutput(output);
    if (output === "knowledge-check") setLessonCheckOpenedId(source.id);
    setAssessmentReviewLesson(review ? source.id : "");
  }

  useEffect(() => {
    function restoreHistory() {
      if (window.location.pathname !== "/studio") return;
      const source = current.current;
      const params = new URLSearchParams(window.location.search);
      if (source && (params.get("material") || params.get("draft")) === source.id) {
        closeAssistant();
        restoreStudioPosition(source);
      }
    }
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = materialParam;
    if (id && current.current?.id === id && savedId.current === id) return;
    if (!id && deviceDraftParam && current.current?.id === deviceDraftParam) return;
    const load = async () => {
      if (id) {
        setRecoveryDraft(null);
        const loaded = await request<Material>(`/api/materials/${encodeURIComponent(id)}?edit=1`);
        if (cancelled) return;
        const backup = readStudioDraft(draftKey, id);
        if (backup?.dirty && backup.doc.revision === loaded.revision && loaded.status === "draft") {
          recoverDraft({ ...backup, persisted: true });
          restoreStudioPosition(backup.doc, { stage: backup.stage });
          return;
        }
        if (backup?.dirty) {
          writeBrowserDraft(`${draftKey}:conflict:${id}`, backup);
        }
        const conflicting = !studioDraftDiscarded(draftKey, id)
          ? backup?.dirty ? backup : readBrowserDraft<StudioDraft>(`${draftKey}:conflict:${id}`)
          : null;
        if (conflicting) {
          setRecoveryDraft(conflicting);
          setMessage("Bản trên tài khoản đã thay đổi. Bạn có thể phục hồi phần chỉnh sửa trên thiết bị thành bản sao riêng.");
        }
        const position = readBrowserDraft<StudioPosition>(`math-studio:position:${loaded.id}`) || {};
        current.current = loaded;
        documentEpoch.current += 1;
        version.current = 0; savedVersion.current = 0; setSaveState("saved");
        setDoc(loaded);
        savedId.current = loaded.id;
        revision.current = loaded.revision;
        setActiveStepId(loaded.learningSteps.some((item) => item.id === position.stepId)
          ? position.stepId! : loaded.learningSteps[0]?.id || "");
        setActiveBlockId(loaded.learningSteps.find((item) => item.id === position.stepId)?.blockIds[0]
          || loaded.learningSteps[0]?.blockIds[0] || "");
        restoreStudioPosition(loaded, position);
      } else {
        if (deviceDraftParam) {
          const backup = readStudioDraft(draftKey, deviceDraftParam);
          if (backup && !studioDraftDiscarded(draftKey, backup.doc.id)) {
            recoverDraft(backup);
            restoreStudioPosition(backup.doc, { stage: backup.stage });
            return;
          }
        }
        if (current.current && (savedId.current || deviceDraftParam)) {
          documentEpoch.current += 1;
          current.current = null;
          savedId.current = null;
          setDoc(null);
          setStage("start");
        }
        refreshDeviceDrafts();
        const materials = await request<Material[]>("/api/materials?scope=mine");
        if (!cancelled) setRecent(materials);
      }
    };
    void load().catch((error) => { if (!cancelled) {
      if (id) {
        setRecoveryDraft(readStudioDraft(draftKey, id));
        current.current = null;
        setDoc(null);
        setStage("edit");
      }
      setMessage(error instanceof Error ? error.message : "Không thể tải học liệu.");
    } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; aiGeneration.current += 1; aiRequest.current?.abort(); };
  }, [materialParam, deviceDraftParam]);

  useEffect(() => {
    if (doc && stage !== "start" && savedId.current === doc.id) {
      writeBrowserDraft(`math-studio:position:${doc.id}`, { stage, stepId: activeStepId, output: lessonOutput,
        review: assessmentReviewLesson === doc.id });
    }
  }, [doc, stage, activeStepId, lessonOutput, assessmentReviewLesson]);
  useEffect(() => {
    if (!doc || doc.status === "published" || studioDraftDiscarded(draftKey, doc.id)) return;
    const value: StudioDraft = { doc, stage, stepId: activeStepId, blockId: activeBlockId,
      persisted: savedId.current === doc.id, dirty: version.current !== savedVersion.current };
    if (!storeStudioDraft(draftKey, value)) setMessage("Không lưu được bản phục hồi trên thiết bị. Hãy dùng Lưu trước khi rời trang.");
  }, [doc, stage, activeStepId, activeBlockId, saveState, draftKey]);

  const change = useCallback((update: (source: Material) => Material) => {
    const source = current.current;
    if (!source || source.status === "published" || publishInFlight.current || deletingId.current === source.id) return;
    if (studioDraftDiscarded(draftKey, source.id)) {
      setMessage("Bản nháp đã được xóa ở tab khác. Bấm Thoát để về Studio.");
      return;
    }
    const next = update(source);
    if (next === source) return;
    const reviewed = retainMaterialReview(source, { ...next, updatedAt: new Date().toISOString() });
    current.current = reviewed;
    setDoc(reviewed);
    version.current += 1;
    if (!inFlight.current) setSaveState("dirty");
    setMessage("");
  }, [draftKey]);

  const save = useCallback(async (): Promise<Material> => {
    const epoch = documentEpoch.current;
    while (inFlight.current) {
      await inFlight.current;
      if (epoch !== documentEpoch.current) throw Error("Học liệu đang mở đã thay đổi.");
    }
    const source = current.current;
    if (!source) throw Error("Chưa có bài giảng để lưu.");
    if (deletingId.current === source.id || studioDraftDiscarded(draftKey, source.id)) {
      const message = "Bản nháp đã được xóa hoặc đang được xóa.";
      setMessage(message);
      throw Error(message);
    }
    if (source.status === "published") return source;
    if (version.current === savedVersion.current && savedId.current) return source;
    const capturedVersion = version.current;
    const accountId = savedId.current;
    const payload = { ...source, revision: revision.current };
    setSaveState("saving");
    const operation = withStudioDraftLock(draftKey, source.id, async () => {
        if (epoch !== documentEpoch.current || studioDraftDiscarded(draftKey, source.id))
          throw Error("Bản nháp đã được đóng hoặc xóa.");
        if (!accountId && readStudioDraft(draftKey, source.id)?.persisted)
          throw Error("Bản nháp đã được lưu ở tab khác. Hãy mở lại từ Studio.");
        const saved = await request<Material>(accountId ? `/api/materials/${accountId}` : "/api/materials", {
          method: accountId ? "PATCH" : "POST", body: JSON.stringify(payload),
        });
        if (epoch !== documentEpoch.current) return saved;
        savedId.current = saved.id;
        revision.current = saved.revision;
        savedVersion.current = capturedVersion;
        setRecent((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
        const latest = current.current;
        if (latest) {
          const merged = capturedVersion === version.current ? saved : { ...latest, id: saved.id, revision: saved.revision };
          current.current = merged;
          setDoc(merged);
          const backup = readStudioDraft(draftKey, saved.id);
          if (backup) storeStudioDraft(draftKey, { ...backup, doc: merged, persisted: true, dirty: capturedVersion !== version.current });
        }
        const params = new URLSearchParams(window.location.search);
        params.delete("draft");
        params.set("material", saved.id);
        window.history.replaceState(null, "", `/studio?${params.toString()}`);
        const curriculum = params.get("curriculum");
        const lesson = params.get("lesson");
        if (curriculum && lesson) {
          await request(`/api/curricula/${curriculum}/lessons/${lesson}`, { method: "POST", body: JSON.stringify({ materialId: saved.id }) })
            .catch(() => { if (epoch === documentEpoch.current) setMessage("Đã lưu học liệu vào tài khoản. Hãy thử gắn lại học liệu từ lộ trình."); });
        }
        if (epoch !== documentEpoch.current) return saved;
        setSaveState(capturedVersion === version.current ? "saved" : "dirty");
        return saved;
      })
      .catch((error) => {
        if (epoch !== documentEpoch.current) throw error;
        setSaveState("error");
        setMessage(error instanceof Error ? error.message : "Không thể lưu bản nháp.");
        throw error;
      })
      .finally(() => { inFlight.current = null; });
    inFlight.current = operation;
    return operation;
  }, [draftKey]);

  const begin = (template?: string, exam = false, startWithAi = false) => {
    documentEpoch.current += 1;
    setGeneratorMode(null);
    setOpenExamAi(startWithAi);
    const empty = blankDraft();
    const fresh: Material = exam ? {
      ...empty, title: "Đề kiểm tra", exam: { ...defaultExamSettings },
      metadata: { ...empty.metadata, topic: "Kiểm tra", grade: "10", type: "exercise" },
    } : template ? fromTemplate(template) : empty;
    current.current = fresh;
    setDoc(fresh);
    setLessonOutput("presentation");
    setAssessmentReviewLesson("");
    savedId.current = null;
    revision.current = 1;
    version.current = 0;
    savedVersion.current = 0;
    setSaveState("saved");
    setMessage("");
    setActiveStepId(fresh.learningSteps[0]?.id || "");
    setActiveBlockId(fresh.learningSteps[0]?.blockIds[0] || "");
    clearMaterialFromUrl();
    setStage(template || exam ? "edit" : "info");
  };

  const clonePublished = () => {
    if (!doc) return;
    documentEpoch.current += 1;
    const now = new Date().toISOString();
    const copy: Material = {
      ...structuredClone(doc), id: crypto.randomUUID(), title: `${doc.title} — Bản chỉnh sửa`,
      status: "draft", visibility: "private", slug: null, publishedAt: null,
      sourceReviewedAt: undefined,
      revision: 1, createdAt: now, updatedAt: now,
    };
    current.current = copy;
    setDoc(copy);
    setLessonOutput("presentation");
    setAssessmentReviewLesson("");
    savedId.current = null;
    revision.current = 1;
    version.current = 1;
    savedVersion.current = 0;
    clearMaterialFromUrl();
    setSaveState("dirty");
    setStage("edit");
    setMessage("Đã tạo bản chỉnh sửa riêng. Bài đã xuất bản vẫn giữ nguyên.");
  };

  const step = doc?.learningSteps.find((item) => item.id === activeStepId) || doc?.learningSteps[0];
  const blocks = step?.blockIds.flatMap((id) => {
    const block = doc?.blocks.find((item) => item.id === id);
    return block ? [block] : [];
  }) || [];
  const activeBlock = blocks.find((item) => item.id === activeBlockId) || blocks[0];
  const activeVisual = doc?.visuals.find((item) => item.id === (activeBlock?.type === "visual" ? activeBlock.visualId : step?.visualId));
  const totalMinutes = doc?.learningSteps.reduce((sum, item) => sum + item.estimatedMinutes, 0) || 0;
  const modelResults = useMemo(() => visualPatterns.filter((item) =>
    `${item.title} ${item.topic} ${item.tags.join(" ")}`.toLocaleLowerCase("vi").includes(modelSearch.toLocaleLowerCase("vi"))), [modelSearch]);

  const updateStep = (id: string, patch: Partial<Step>) => change((source) => ({
    ...source, learningSteps: source.learningSteps.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const addStep = (phase: Step["phase"] = "explore", title?: string) => {
    const created = newStep(phase, title);
    change((source) => ({ ...source, learningSteps: [...source.learningSteps, created] }));
    setActiveStepId(created.id);
    setActiveBlockId("");
  };

  const arrangeStep = (id: string, direction: -1 | 1) => change((source) => {
    const index = source.learningSteps.findIndex((item) => item.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= source.learningSteps.length) return source;
    const learningSteps = [...source.learningSteps];
    [learningSteps[index], learningSteps[destination]] = [learningSteps[destination], learningSteps[index]];
    return { ...source, learningSteps };
  });

  const removeStep = (id: string) => {
    const source = current.current;
    const removed = source?.learningSteps.find((item) => item.id === id);
    if (!removed) return;
    if (removed.blockIds.length && !window.confirm(`Xóa hoạt động “${removed.title}” và ${removed.blockIds.length} thành phần bên trong?`)) return;
    change((item) => {
      const blocks = item.blocks.filter((block) => !removed.blockIds.includes(block.id));
      const visualIds = new Set(blocks.map((block) => block.visualId).filter(Boolean));
      return {
        ...item, blocks, visuals: item.visuals.filter((visual) => visualIds.has(visual.id)),
        learningSteps: item.learningSteps.filter((step) => step.id !== id),
      };
    });
    setActiveStepId(source!.learningSteps.find((item) => item.id !== id)?.id || "");
    setActiveBlockId("");
  };

  const addBlock = (kind: "text" | "formula" | "image" | "question" | "hint", content = "") => {
    const target = step || current.current?.learningSteps[0];
    if (!target) { setMessage("Hãy thêm một hoạt động trước khi thêm nội dung."); return; }
    const block = { ...blockDefinition(kind), content };
    change((source) => ({
      ...source,
      blocks: [...source.blocks, block],
      learningSteps: source.learningSteps.map((item) => item.id === target.id
        ? { ...item, blockIds: [...item.blockIds, block.id] } : item),
    }));
    setActiveBlockId(block.id);
  };

  const updateBlock = (id: string, patch: Partial<Block>) => change((source) => ({
    ...source, blocks: source.blocks.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const openBoard = (block?: Block, visual: VisualSpec | null = null, board = block?.board || newLessonBoard, imported = false, stepId = step?.id, note?: string) => {
    if (!stepId || !doc || doc.status !== "draft") return;
    setBoardError("");
    draggedBoard.current = null;
    boardAssets.current.clear();
    setBoardTarget({
      materialId: doc.id, stepId, blockId: block?.id,
      visual: structuredClone(visual), board: structuredClone(board), imported, note,
    });
  };

  const importBoard = (stepId?: string) => {
    try {
      const transfer = JSON.parse(sessionStorage.getItem(transferKey) || "null");
      if (!transfer) throw Error("Hãy mở Khám phá và chọn Đưa vào bài soạn.");
      openBoard(undefined, transfer.visual ? validateVisual(transfer.visual) : null, LessonBoardSchema.parse(transfer.board), true, stepId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không đọc được bảng từ Khám phá.");
    }
  };

  const applyBoard = async (visual: VisualSpec | null, board: LessonBoard, dropStepId?: string) => {
    if (!boardTarget || boardApplying.current || publishInFlight.current) return;
    const target = dropStepId && dropStepId !== boardTarget.stepId ? { ...boardTarget, stepId: dropStepId, blockId: undefined } : boardTarget;
    boardApplying.current = true;
    setBoardBusy(true);
    setBoardError("");
    try {
      if (current.current?.exam && !visual && !board.ink?.strokes.length) throw Error("Vẽ hoặc thêm nội dung lên bảng trước khi chèn.");
      let scene = visual ? validateVisual(visual) : null;
      const needsUpload = (item: NonNullable<VisualSpec["boardItems"]>[number]) => {
        if (item.image) return item.image;
        if (item.assetUrl && !item.assetUrl.startsWith(`/api/material-assets/${target.materialId}/`))
          return item.assetUrl;
      };
      if (scene) {
        const source2d = scene.dimension === "3d" ? scene.derivedFrom2d?.source : undefined;
        if ([...(scene.boardItems || []), ...(source2d?.boardItems || [])].some(needsUpload)) {
          const saved = await save();
          if (saved.id !== target.materialId) throw Error("Bài đang mở đã thay đổi.");
          const uploadItems = async (items: VisualSpec["boardItems"]) => {
            if (!items) return undefined;
            const result = [];
            for (const item of items) {
              const input = needsUpload(item);
              if (!input) { result.push(item); continue; }
              let url = boardAssets.current.get(input);
              if (!url) {
                const file = await fetch(input);
                if (!file.ok) throw Error("Không đọc được ảnh trên bảng.");
                const blob = await file.blob();
                const response = await fetch("/api/material-assets", {
                  method: "POST",
                  headers: { "Content-Type": blob.type, "X-Material-Id": saved.id },
                  body: blob,
                });
                const asset = await response.json() as { url?: string; error?: string };
                if (!response.ok || !asset.url) throw Error(asset.error || "Không tải được ảnh trên bảng.");
                url = asset.url;
                boardAssets.current.set(input, url);
              }
              result.push({ ...item, image: undefined, assetUrl: url });
            }
            return result;
          };
          scene.boardItems = await uploadItems(scene.boardItems);
          if (scene.dimension === "3d" && scene.derivedFrom2d) {
            const source = scene.derivedFrom2d.source;
            source.boardItems = await uploadItems(source.boardItems);
          }
        }
      }
      const source = current.current;
      const activity = source?.learningSteps.find((item) => item.id === target.stepId);
      const previous = source?.blocks.find((item) => item.id === target.blockId);
      if (!source || source.id !== target.materialId || source.status !== "draft" || !activity ||
        (target.blockId && (!previous || !activity.blockIds.includes(previous.id)))) {
        throw Error("Hoạt động đích đã thay đổi. Hãy mở lại bảng.");
      }
      const oldVisualId = previous?.visualId;
      const shared = oldVisualId && (source.blocks.some((item) => item.id !== previous.id && item.visualId === oldVisualId) ||
        source.learningSteps.some((item) => item.id !== activity.id && item.visualId === oldVisualId));
      const visualId = scene ? (!shared && oldVisualId || `visual_${crypto.randomUUID().replace(/-/g, "")}`) : undefined;
      if (scene && visualId) scene.id = visualId;
      const block: Block = {
        id: previous?.id || `block_${crypto.randomUUID().replace(/-/g, "")}`,
        title: previous?.title || "Bảng vẽ",
        content: previous?.content || "",
        type: "visual",
        authorKind: scene?.dimension === "3d" ? "visual3d" : "visual2d",
        visualId,
        board,
        examFigure: previous?.examFigure,
      };
      const replaceActive = activity.visualId === oldVisualId || !activity.visualId;
      const fallback = activity.blockIds.map((id) => source.blocks.find((item) => item.id === id))
        .find((item) => item?.id !== block.id && item?.visualId)?.visualId;
      const actions = replaceActive ? activity.visualActions.flatMap((action, index) => {
        if (!scene || !oldVisualId || activity.visualId !== oldVisualId) return [];
        try { validateActions([action], scene); return [{ action, label: activity.actionLabels[index] }]; }
        catch { return []; }
      }) : [];
      const next = validateMaterial({
        ...source,
        blocks: previous ? source.blocks.map((item) => item.id === block.id ? block : item) : [...source.blocks, block],
        visuals: [...source.visuals.filter((item) => shared || item.id !== oldVisualId), ...(scene ? [scene] : [])],
        learningSteps: source.learningSteps.map((item) => item.id !== activity.id ? item : {
          ...item,
          blockIds: previous ? item.blockIds : [...item.blockIds, block.id],
          ...(replaceActive ? { visualId: visualId || fallback, visualActions: actions.map(({ action }) => action), actionLabels: actions.map(({ label }) => label || "") } : {}),
        }),
      });
      change(() => next);
      setActiveStepId(activity.id);
      setActiveBlockId(source.exam ? activity.blockIds[0] : block.id);
      setBoardTarget(null);
      if (target.imported) {
        try { sessionStorage.removeItem(transferKey); } catch { /* The board is already applied. */ }
        setHasBoardTransfer(false);
      }
      if (replaceActive && actions.length < activity.visualActions.length)
        setMessage("Đã áp dụng bảng. Các tương tác trỏ vào đối tượng không còn hợp lệ đã được bỏ.");
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : "Không áp dụng được bảng.");
    } finally {
      boardApplying.current = false;
      setBoardBusy(false);
    }
  };

  const addExamImage = async (stepId: string, file: File, replaceId?: string) => {
    const initial = current.current;
    if (!initial?.exam || (!replaceId && initial.blocks.length >= 100)) {
      setMessage("Đề đã đạt giới hạn số khối nội dung.");
      return false;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
      setMessage("Chọn ảnh PNG, JPEG hoặc WebP tối đa 2 MB.");
      return false;
    }
    setUploadingBlockId(stepId);
    try {
      const saved = await save();
      if (saved.id !== initial.id) throw Error("Đề đang mở đã thay đổi.");
      const response = await fetch("/api/material-assets", {
        method: "POST", headers: { "Content-Type": file.type, "X-Material-Id": saved.id }, body: file,
      });
      const asset = await response.json() as { url?: string; error?: string };
      if (!response.ok || !asset.url) throw Error(asset.error || "Không tải được ảnh.");
      const block: Block = {
        id: `image_${crypto.randomUUID().replace(/-/g, "")}`, type: "paragraph", authorKind: "image",
        content: asset.url, examFigure: { align: "center", width: 65 },
      };
      let applied = false;
      change((source) => {
        const step = source.learningSteps.find((item) => item.id === stepId);
        if (source.id !== saved.id || !step || source.status !== "draft") return source;
        if (replaceId) {
          if (!step.blockIds.includes(replaceId) || !source.blocks.some((item) => item.id === replaceId && item.authorKind === "image")) return source;
          applied = true;
          return { ...source, blocks: source.blocks.map((item) => item.id === replaceId ? { ...item, content: asset.url! } : item) };
        }
        if (source.blocks.length >= 100) return source;
        applied = true;
        return { ...source, blocks: [...source.blocks, block], learningSteps: source.learningSteps.map((item) =>
          item.id === stepId ? { ...item, blockIds: [...item.blockIds, block.id] } : item) };
      });
      return applied;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được ảnh.");
      return false;
    } finally {
      setUploadingBlockId("");
    }
  };

  const applyExtractedPdfQuestion = async (stepId: string, question: Block, result: Awaited<ReturnType<typeof extractEditablePdfQuestion>>, signal: AbortSignal) => {
    const initial = current.current;
    if (!initial?.exam || initial.status !== "draft") throw Error("Đề đang mở đã thay đổi.");
    if (initial.blocks.length + result.figures.length > 100) throw Error("Đề đã đạt giới hạn số khối nội dung. Hãy giảm số hình rồi thử lại.");
    setUploadingBlockId(stepId);
    try {
      const saved = result.figures.length ? await save() : initial;
      if (saved.id !== initial.id) throw Error("Đề đang mở đã thay đổi.");
      const figures: Block[] = [];
      for (const image of result.figures) figures.push(pdfQuestionFigure(await uploadStudioSourceImage(saved.id, image, signal)));
      signal.throwIfAborted();
      const latest = current.current;
      const block = latest?.blocks.find((item) => item.id === question.id);
      if (latest?.id !== saved.id || latest.status !== "draft" || !block || block.content !== question.content
        || (block.examQuestion?.useSourceLayout === false && !!block.content.trim()) || latest.blocks.length + figures.length > 100
        || !latest.learningSteps.some((item) => item.id === stepId && item.blockIds.includes(question.id))) {
        throw Error("Câu hỏi đã thay đổi trong lúc trích xuất. Hãy thử lại.");
      }
      const updated = editablePdfQuestion(block, result);
      if (updated.examQuestion && result.warnings.length) updated.examQuestion.sourceWarnings = result.warnings.slice(0, 6);
      change((source) => ({ ...source, blocks: [...source.blocks.map((item) => item.id === question.id ? updated : item), ...figures],
        learningSteps: source.learningSteps.map((item) => item.id === stepId ? { ...item, blockIds: [...item.blockIds, ...figures.map((figure) => figure.id)] } : item),
        reviewNotes: [...(source.reviewNotes || []), ...result.warnings.map((warning) => `Đối chiếu câu vừa trích xuất: ${warning}`)].slice(0, 50),
      }));
    } finally { setUploadingBlockId(""); }
  };

  async function insertFromBank(entry: BankQuestion) {
    const initial = current.current;
    if (!initial || initial.status !== "draft") throw Error("Mở bản nháp để chèn câu hỏi.");
    const stepId = initial.learningSteps.find(({ id }) => id === activeStepId)?.id ?? initial.learningSteps[0]?.id;
    const target = Object.keys(entry.files).length ? await save() : initial;
    if (target.id !== initial.id) throw Error("Học liệu đang mở đã thay đổi.");
    const copy = await copyBankQuestion(entry, target, stepId);
    const destination = copy.step?.id ?? stepId;
    const ids = [copy.question.id, ...copy.figures.map(({ id }) => id)];
    change((source) => {
      if (source.id !== target.id || source.status !== "draft" || (!copy.step && !source.learningSteps.some(({ id }) => id === destination)))
        throw Error("Hoạt động đang mở đã thay đổi.");
      if (source.blocks.length + ids.length > 100 || source.visuals.length + copy.visuals.length > 30
        || copy.step && source.learningSteps.length >= 50) throw Error("Học liệu đã hết chỗ cho câu hỏi.");
      return { ...source, blocks: [...source.blocks, copy.question, ...copy.figures], visuals: [...source.visuals, ...copy.visuals],
        learningSteps: copy.step ? [...source.learningSteps, { ...copy.step, blockIds: ids }]
          : source.learningSteps.map((item) => item.id === destination ? { ...item, blockIds: [...item.blockIds, ...ids] } : item) };
    });
    if (destination) setActiveStepId(destination);
    setActiveBlockId(copy.question.id);
  }

  const uploadImage = async (blockId: string, file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
      setMessage("Chọn ảnh PNG, JPEG hoặc WebP tối đa 2 MB.");
      return;
    }
    setUploadingBlockId(blockId);
    try {
      const saved = await save();
      const response = await fetch("/api/material-assets", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-Material-Id": saved.id,
        },
        body: file,
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw Error(result.error || "Không tải được ảnh lên.");
      if (current.current?.blocks.some((block) => block.id === blockId)) updateBlock(blockId, { content: result.url });
      setMessage("Ảnh đã được chèn. Bạn có thể đổi tên thành phần để tạo chú thích dễ hiểu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được ảnh lên.");
    } finally { setUploadingBlockId(""); }
  };

  const removeBlock = (id: string) => {
    const source = current.current;
    const block = source?.blocks.find((item) => item.id === id);
    if (!block) return;
    if (block.content.trim() && !window.confirm(`Xóa thành phần “${block.title || "Nội dung"}”?`)) return;
    change((item) => {
      const blocks = item.blocks.filter((part) => part.id !== id);
      const visualIds = new Set(blocks.map((part) => part.visualId).filter(Boolean));
      return {
        ...item, blocks, visuals: item.visuals.filter((visual) => visualIds.has(visual.id)),
        learningSteps: item.learningSteps.map((step) => {
          if (!step.blockIds.includes(id)) return step;
          const blockIds = step.blockIds.filter((partId) => partId !== id);
          const linked = blocks.find((part) => part.type === "visual" && blockIds.includes(part.id));
          return {
            ...step, blockIds,
            visualId: linked?.visualId,
            visualActions: linked?.visualId === step.visualId ? step.visualActions : [],
            actionLabels: linked?.visualId === step.visualId ? step.actionLabels : [],
          };
        }),
      };
    });
    setActiveBlockId("");
  };

  const arrangeBlock = (id: string, direction: -1 | 1) => {
    const target = step;
    if (!target) return;
    const index = target.blockIds.indexOf(id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= target.blockIds.length) return;
    const ids = [...target.blockIds];
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    updateStep(target.id, { blockIds: ids });
  };

  const duplicateBlock = (id: string) => {
    const source = current.current;
    const original = source?.blocks.find((item) => item.id === id);
    if (!source || !original || !step) return;
    const clone: Block = { ...structuredClone(original), id: `block_${crypto.randomUUID().replace(/-/g, "")}`, title: `${original.title || "Nội dung"} — Bản sao` };
    let visual: VisualSpec | undefined;
    if (original.type === "visual" && original.visualId) {
      const model = source.visuals.find((item) => item.id === original.visualId);
      if (model) {
        visual = { ...structuredClone(model), id: `visual_${crypto.randomUUID().replace(/-/g, "")}` };
        clone.visualId = visual.id;
      }
    }
    const targetId = step.id;
    change((item) => ({
      ...item, blocks: [...item.blocks, clone], visuals: visual ? [...item.visuals, visual] : item.visuals,
      learningSteps: item.learningSteps.map((part) => {
        if (part.id !== targetId) return part;
        const ids = [...part.blockIds];
        ids.splice(ids.indexOf(id) + 1, 0, clone.id);
        return { ...part, blockIds: ids };
      }),
    }));
    setActiveBlockId(clone.id);
  };

  const insertModel = (key: string) => {
    const target = step || current.current?.learningSteps[0];
    if (!target) { setMessage("Hãy thêm một hoạt động trước khi chèn mô hình."); return; }
    const visual = instantiateVisualPattern(key, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
    const block = blockDefinition("visual", visual);
    change((source) => ({
      ...source,
      visuals: [...source.visuals, visual], blocks: [...source.blocks, block],
      learningSteps: source.learningSteps.map((item) => item.id === target.id
        ? { ...item, blockIds: [...item.blockIds, block.id], visualId: item.visualId || visual.id }
        : item),
    }));
    setActiveBlockId(block.id);
    setModelPicker(false);
  };

  const updateModelParameters = (visualId: string, parameters: Record<string, number>) => {
    const source = current.current;
    const visual = source?.visuals.find((item) => item.id === visualId);
    if (!visual || !visual.parameters.some((item) => parameters[item.id] !== undefined && Math.abs(item.value - parameters[item.id]) > 1e-6)) return;
    change((item) => ({
      ...item, visuals: item.visuals.map((part) => part.id === visualId
        ? { ...part, parameters: part.parameters.map((parameter) => parameters[parameter.id] === undefined ? parameter : { ...parameter, value: parameters[parameter.id] }) }
        : part),
    }));
  };

  const addAction = () => {
    if (!step || !activeVisual) return;
    let action: VisualAction;
    if (actionType === "reset") action = { type: "reset" };
    else if (actionType === "setParameter" || actionType === "animateParameter") {
      const parameter = activeVisual.parameters.find((item) => item.id === selectedObjectId) || activeVisual.parameters[0];
      if (!parameter) { setMessage("Mô hình này không có tham số."); return; }
      const value = Math.min(parameter.max, Math.max(parameter.min, actionValue));
      action = actionType === "setParameter"
        ? { type: "setParameter", parameter: parameter.id, value }
        : { type: "animateParameter", parameter: parameter.id, from: parameter.value, to: value, durationMs: 1000 };
    } else {
      const object = activeVisual.objects.find((item) => item.id === selectedObjectId) || activeVisual.objects[0];
      if (!object) { setMessage("Hãy chọn một đối tượng trên mô hình."); return; }
      action = { type: actionType, targets: [object.id] };
    }
    updateStep(step.id, {
      visualId: activeVisual.id,
      visualActions: [...(step.visualId === activeVisual.id ? step.visualActions : []), action],
      actionLabels: [...(step.visualId === activeVisual.id ? step.actionLabels : []), action.type],
    });
  };

  function closeAssistant() {
    aiGeneration.current += 1;
    aiRequest.current?.abort();
    setAiLoading(false);
    setAssistantOpen(false);
  }

  const askAI = async (kind: SuggestionKind | null) => {
    const source = current.current;
    if (!source) return;
    const question = aiQuestion.trim();
    if (!kind && question.length < 2) return;
    const generation = ++aiGeneration.current;
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAssistantOpen(true);
    setAiKind(kind);
    setAiSuggestions([]);
    setAiAnswer("");
    setAiError("");
    setAiLoading(true);
    const visual = source.visuals.find((item) => item.id === step?.visualId);
    try {
      if (!kind) {
        const relevant = stage === "edit" && blocks.length ? blocks : source.blocks;
        const content = relevant.filter((block) => block.authorKind !== "image" && block.type !== "visual");
        const result = await request<{ answer: string }>("/api/studio-ask", {
          method: "POST", signal: controller.signal, body: JSON.stringify({
            lessonTitle: source.title, stepTitle: step?.title || (source.exam ? "Đề kiểm tra" : "Bài giảng"),
            selected: "", surrounding: content.map((block) => block.content).join("\n").slice(0, 3000),
            visual: (visual?.accessibility?.description || visual?.source?.key || "").slice(0, 500),
            question, mode: "free",
          }),
        });
        if (generation === aiGeneration.current) setAiAnswer(result.answer);
        return;
      }
      const result = await request<{ suggestions: Suggestion[] }>("/api/studio-assistant", {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({
          kind, title: source.title, grade: source.metadata.grade,
          topic: source.metadata.topic, goal: source.summary,
          step: step ? {
            title: step.title, objective: step.objective, phase: step.phase,
            content: blocks.map((block) => block.content).join("\n").slice(0, 3000),
            visualKey: visual?.source?.key,
          } : undefined,
          outline: source.learningSteps.map((item) => ({ title: item.title, objective: item.objective, phase: item.phase })),
        }),
      });
      if (generation === aiGeneration.current) setAiSuggestions(result.suggestions);
    } catch (error) {
      if (generation === aiGeneration.current) setAiError(error instanceof Error ? error.message : "Không nhận được gợi ý AI.");
    } finally {
      if (generation === aiGeneration.current) setAiLoading(false);
    }
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (aiKind === "outline") {
      addStep(suggestion.phase || "explore", suggestion.title);
      const created = current.current?.learningSteps.at(-1);
      if (created) updateStep(created.id, {
        objective: suggestion.description || suggestion.content,
        estimatedMinutes: suggestion.minutes || 5,
      });
    } else if (aiKind === "objective" && step && stage === "edit") {
      updateStep(step.id, { objective: suggestion.content || suggestion.description || suggestion.title });
    } else if (aiKind === "objective") {
      change((source) => ({ ...source, summary: suggestion.content || suggestion.description || suggestion.title }));
    } else if (aiKind === "review") {
      setStage("edit");
    } else {
      const content = suggestion.content || suggestion.description || suggestion.title;
      addBlock(aiKind === "question" ? "question" : "text", content);
    }
    setAiSuggestions((items) => items.filter((item) => item !== suggestion));
    setMessage("Đã chèn gợi ý. Bạn có thể chỉnh sửa trước khi lưu hoặc xuất bản.");
  };

  const publish = async () => {
    if (publishInFlight.current || !current.current || current.current.status === "published") return;
    openStage("finish");
    if (materialPublishIssues(current.current).length) {
      setMessage("Chưa thể xuất bản. Chọn từng mục cần sửa bên dưới; nếu đã đối chiếu nguồn, bấm xác nhận.");
      return;
    }
    publishInFlight.current = true;
    setPublishing(true);
    const epoch = documentEpoch.current;
    try {
      const saved = await save();
      if (epoch !== documentEpoch.current) return;
      if (savedVersion.current !== version.current || materialPublishIssues(saved).length) {
        setMessage("Bản nháp vừa thay đổi. Hãy kiểm tra lại rồi xuất bản.");
        return;
      }
      const published = await request<Material>(`/api/materials/${saved.id}/publish`, {
        method: "POST", body: JSON.stringify({ published: true }),
      });
      if (epoch !== documentEpoch.current) return;
      current.current = published;
      setDoc(published);
      revision.current = published.revision;
      savedVersion.current = version.current;
      setSaveState("saved");
      setMessage(saved.exam ? "Đề kiểm tra đã được xuất bản." : "Bài giảng đã được xuất bản.");
      setStage("finish");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất bản. Hãy kiểm tra bài giảng.");
    } finally {
      publishInFlight.current = false;
      setPublishing(false);
    }
  };

  function navigateStudio(next: Stage, output = lessonOutput, review = assessmentReviewLesson === current.current?.id) {
    const source = current.current;
    if (source && next !== "start" && stage !== "start") {
      const isExam = Boolean(source.exam);
      const url = new URL(window.location.href);
      const params = url.searchParams;
      if (savedId.current === source.id) {
        params.set("material", source.id);
        params.delete("draft");
      } else {
        params.set("draft", source.id);
        params.delete("material");
      }
      function locationFor(step: Stage, tab: LessonOutput, assessmentReview: boolean) {
        params.set("stage", step);
        if (isExam) params.delete("output"); else params.set("output", tab);
        if (!isExam && assessmentReview) params.set("view", "assessments"); else params.delete("view");
        return url.pathname + url.search + url.hash;
      }
      const previous = locationFor(stage, lessonOutput, assessmentReviewLesson === source.id);
      const destination = locationFor(next, output, review);
      if (previous !== destination) {
        window.history.replaceState(null, "", previous);
        window.history.pushState(null, "", destination);
      }
    }
    if (source && output === "knowledge-check") setLessonCheckOpenedId(source.id);
    setAssessmentReviewLesson(review && source ? source.id : "");
    setLessonOutput(output);
    setStage(next);
  }

  const openStage = (next: Stage) => {
    if (publishInFlight.current) return;
    if (current.current?.status === "published" && ["info", "outline", "edit"].includes(next)) {
      setMessage("Hãy tạo bản chỉnh sửa để thay đổi bài đã xuất bản.");
      return;
    }
    closeAssistant();
    if (next !== stage && !pendingFocus.current) window.scrollTo(0, 0);
    navigateStudio(next);
  };

  function openAssessmentReview() {
    closeAssistant();
    window.scrollTo(0, 0);
    navigateStudio("preview", "knowledge-check", true);
  }

  const returnToStudio = () => {
    documentEpoch.current += 1;
    current.current = null;
    setDoc(null);
    setRecoveryDraft(null);
    setMessage("");
    clearMaterialFromUrl();
    refreshDeviceDrafts();
    openStage("start");
    window.scrollTo(0, 0);
  };

  const exitEditor = () => {
    const source = current.current;
    if (!source || boardTarget || inFlight.current || publishInFlight.current || uploadingBlockId || deletingId.current) return;
    if (source.status === "draft" && !studioDraftDiscarded(draftKey, source.id)) {
      const draft: StudioDraft = {
        doc: source, persisted: savedId.current === source.id, dirty: version.current !== savedVersion.current,
        stage, stepId: activeStepId, blockId: activeBlockId,
      };
      if (!storeStudioDraft(draftKey, draft) && (!draft.persisted || draft.dirty)) {
        setMessage("Chưa giữ được bản nháp trên thiết bị. Hãy bấm Lưu trước khi thoát.");
        return;
      }
    }
    returnToStudio();
  };

  const deleteDraft = async (target: Material, accountRevision?: number) => {
    if (target.status !== "draft" || deletingId.current || inFlight.current || publishInFlight.current || boardTarget || uploadingBlockId) return;
    const location = accountRevision === undefined ? "trên thiết bị này" : "khỏi tài khoản và thiết bị này";
    if (!window.confirm(`Xóa bản nháp “${target.title}” ${location}? Thao tác này không thể hoàn tác.`)) return;
    deletingId.current = target.id;
    setDeleting(target.id);
    setMessage("");
    try {
      const removedFromDevice = await withStudioDraftLock(draftKey, target.id, async () => {
        if (accountRevision === undefined && readStudioDraft(draftKey, target.id)?.persisted)
          throw Error("Bản nháp vừa được lưu vào tài khoản. Tải lại Studio để chọn đúng bản cần xóa.");
        if (accountRevision !== undefined) {
          try {
            await request(`/api/materials/${encodeURIComponent(target.id)}?draftRevision=${accountRevision}`, { method: "DELETE" });
          } catch (error) {
            if (!(error instanceof Error && "status" in error && error.status === 404)) throw error;
          }
        }
        const removed = discardStudioDraft(draftKey, target.id);
        if (!removed && accountRevision === undefined) throw Error("Không xóa được bản nháp trên thiết bị. Hãy thử lại.");
        return removed;
      });
      if (current.current?.id === target.id) returnToStudio();
      setRecent((items) => items.filter((item) => item.id !== target.id));
      refreshDeviceDrafts();
      if (!removedFromDevice) setMessage("Đã xóa trên tài khoản. Trình duyệt chưa dọn được bản lưu trên thiết bị.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xóa được bản nháp.");
      if (error instanceof Error && "status" in error && error.status === 409) {
        void request<Material[]>("/api/materials?scope=mine").then(setRecent).catch(() => {});
      }
    } finally {
      deletingId.current = "";
      setDeleting("");
    }
  };

  const goToIssue = (issue: MaterialPublishIssue) => {
    if (issue.stepId) setActiveStepId(issue.stepId);
    if (issue.blockId) setActiveBlockId(issue.blockId);
    pendingFocus.current = issue.blockId ? `gs-block-${issue.blockId}` : issue.stage === "finish" ? "gs-source-confirmation" : null;
    openStage(current.current?.exam && issue.stage === "info" ? "edit" : issue.stage);
    // Also focus when already on the requested stage/block.
    if (pendingFocus.current) {
      const element = document.getElementById(pendingFocus.current);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.focus({ preventScroll: true });
    }
  };

  const beginGenerated = (saved: Material, review: string[]) => {
    documentEpoch.current += 1;
    current.current = saved;
    setDoc(saved);
    savedId.current = saved.id;
    revision.current = saved.revision;
    version.current = 0;
    savedVersion.current = 0;
    setSaveState("saved");
    setGeneratorMode(null);
    setActiveStepId(saved.learningSteps[0]?.id || "");
    setActiveBlockId(saved.learningSteps[0]?.blockIds[0] || "");
    window.history.replaceState(null, "", `/studio?material=${saved.id}`);
    setStage("edit");
    setMessage(review.length ? `Đã tạo bản nháp. Có ${review.length} mục cần đối chiếu trước khi dùng.` : "Đã tạo bản nháp. Hãy dạy thử và kiểm tra trước khi xuất bản.");
  };
  const openPresentation = (slideId: string) => {
    const key = presentationChannel || crypto.randomUUID();
    setPresentationChannel(key);
    window.open(`/present?${new URLSearchParams({ channel: key, slide: slideId })}`, "math-studio-projector", "noopener");
  };
  const chooseSlideTheme = (theme: SlideTheme) => {
    setSlideTheme(theme);
    try { localStorage.setItem("mathcos:slide-theme", theme); } catch { /* Browser storage is optional. */ }
  };

  const deviceById = new Map(deviceDrafts.map((draft) => [draft.doc.id, draft]));
  const accountById = new Map(stage === "start"
    ? recent.filter((item) => !studioDraftDiscarded(draftKey, item.id)).map((item) => [item.id, item] as const)
    : []);
  const studioItems = [...new Set([...accountById.keys(), ...deviceById.keys()])].map((id) => {
    const account = accountById.get(id);
    const device = deviceById.get(id);
    const item = account?.status === "published" || !device?.dirty ? account ?? device!.doc : device.doc;
    return { account, device, item };
  }).sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt));
  const resumeId = studioItems.find(({ item }) => item.status === "draft")?.item.id;

  if (loading) return <div className="gs-loading"><LoaderCircle className="gs-spin" /> Đang mở Studio…</div>;

  if (stage === "start") return (
    <div className="gs-page gs-start">
      <main className="gs-start-main">
        {hasBoardTransfer && <p className="gs-message" role="status">Bảng từ Khám phá đã sẵn sàng. Tạo hoặc mở một bản nháp, rồi chọn Nhập bảng từ Khám phá trong hoạt động cần chèn.</p>}
        {generatorMode ? <StudioGenerator key={generatorMode} mode={generatorMode} initialDraft={generatorDraft}
          onBack={(draft) => { setGeneratorDraft(draft); setGeneratorMode(null); }}
          onComplete={beginGenerated} /> : <>
        <div className="gs-start-home">
        <section className="gs-start-hero" aria-labelledby="gs-start-title">
          <div className="gs-start-hero-copy">
            <span className="gs-eyebrow"><BookOpen size={15} /> MATHCOS STUDIO</span>
            <h1 id="gs-start-title"><span>Soạn học liệu</span> <span>toán học</span></h1>
            <p>Chuẩn bị bài giảng tương tác và đề kiểm tra với công thức, đồ thị và hình học 2D/3D.</p>
          </div>
          <div className="gs-start-hero-art" aria-hidden="true">
            <svg viewBox="0 0 360 210" focusable="false">
              <path className="gs-art-axis" d="M24 145H330m-7-5 7 5-7 5M177 184V19m-5 7 5-7 5 7" />
              <path className="gs-art-area" d="M139 145Q177 183 215 145Z" />
              <path className="gs-art-curve" d="M80 37Q177 291 274 37" />
              <circle cx="177" cy="164" r="5" /><circle cx="118" cy="117" r="5" /><circle cx="236" cy="117" r="5" />
              <text x="337" y="149">x</text><text x="186" y="28">y</text>
            </svg>
            <span>y = ax² + bx + c</span>
          </div>
        </section>
        {message && <div className="gs-alert" role="alert">{message}</div>}
        <section className="gs-start-workflows" aria-labelledby="gs-workflow-title">
          <h2 id="gs-workflow-title">Bạn muốn soạn gì?</h2>
          <div className="gs-start-options">
          <section className="gs-start-card" aria-labelledby="gs-start-lesson">
            <div className="gs-start-card-title"><span className="gs-start-card-icon"><BookOpen size={22} /></span><h3 id="gs-start-lesson">Soạn bài giảng</h3></div>
            <p>Soạn hoạt động học tập, sau đó dùng dưới dạng phiếu A4 hoặc trình chiếu 16:9.</p>
            <div className="gs-start-card-actions">
              <button className="gs-primary" type="button" onClick={() => begin()}><Plus size={16} /> Bài giảng trống</button>
              <button className="gs-secondary" type="button" onClick={() => { setGeneratorDraft(undefined); setGeneratorMode("lesson"); }}><Sparkles size={16} /> Tạo bài giảng bằng AI</button>
            </div>
          </section>
          <section className="gs-start-card gs-start-card-exam" aria-labelledby="gs-start-exam">
            <div className="gs-start-card-title"><span className="gs-start-card-icon"><ClipboardList size={22} /></span><h3 id="gs-start-exam">Soạn đề kiểm tra</h3></div>
            <p>Tạo câu hỏi, chèn công thức và hình minh họa, rồi xuất đề Word hoặc PDF.</p>
            <div className="gs-start-card-actions">
              <button className="gs-primary" type="button" onClick={() => begin(undefined, true)}><Plus size={16} /> Đề trống</button>
              <button className="gs-secondary" type="button" onClick={() => begin(undefined, true, true)}><Sparkles size={16} /> Tạo đề bằng AI</button>
              <button className="gs-secondary" type="button" onClick={() => { setGeneratorDraft(undefined); setGeneratorMode("exam"); }}><FilePenLine size={16} /> Nhập đề có sẵn</button>
            </div>
          </section>
          </div>
        </section>
        {studioItems.length > 0 && <section className="gs-recent" aria-labelledby="gs-drafts-title">
          <h2 id="gs-drafts-title">Bản nháp và học liệu của tôi <span>{studioItems.length}</span></h2>
          <div className="gs-recent-list">{studioItems.map(({ account, device, item }) => {
            const onAccount = Boolean(account || device?.persisted);
            const label = item.id === resumeId ? "Tiếp tục bản đang làm" : `Mở ${item.title}`;
            const openClass = item.id === resumeId ? "gs-primary" : "gs-secondary";
            return <div className="gs-recent-row" key={item.id}>
              <span><strong>{item.title || "Học liệu chưa đặt tên"}</strong><small>{item.status === "published" ? "Đã xuất bản" :
                !onAccount ? "Bản nháp trên thiết bị" : device?.dirty ? "Có thay đổi trên thiết bị chưa lưu vào tài khoản" : "Bản nháp đã lưu vào tài khoản"}</small></span>
              <div className="gs-recent-actions">
                {onAccount ? <Link className={openClass} href={`/studio?material=${item.id}`} aria-label={label} aria-disabled={!!deleting}
                  onClick={(event) => { if (deletingId.current) event.preventDefault(); }}>{item.id === resumeId ? label : "Mở"}</Link>
                  : <button type="button" className={openClass} aria-label={label} disabled={!!deleting}
                    onClick={() => { if (device) recoverDraft(device); }}>{item.id === resumeId ? label : "Mở"}</button>}
                {item.status === "draft" && <button type="button" className="gs-secondary gs-delete-draft"
                  aria-label={`Xóa bản nháp ${item.title}`} disabled={!!deleting}
                  onClick={() => void deleteDraft(item, account?.revision ?? (device?.persisted ? device.doc.revision : undefined))}>
                  <Trash2 size={14} aria-hidden="true" /> {deleting === item.id ? "Đang xóa…" : "Xóa"}
                </button>}
              </div>
            </div>;
          })}</div>
        </section>}
        <section className="gs-template-card" aria-label="Bài giảng mẫu">
          <span className="gs-card-icon"><BookOpen size={23} /></span>
          <div className="gs-template-copy"><h2>Dùng bài giảng mẫu</h2><p>Bắt đầu với một mô hình có sẵn rồi chỉnh theo bài dạy của bạn.</p></div>
          <div className="gs-template-actions"><select aria-label="Chọn bài giảng mẫu" value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
            <option value="">Chọn một mẫu bài</option>
            {templateKeys.map((key) => <option key={key} value={key}>{visualPatterns.find((item) => item.key === key)?.title}</option>)}
          </select><button type="button" disabled={!selectedTemplate} onClick={() => begin(selectedTemplate)}>Áp dụng mẫu <ArrowRight size={16} /></button></div>
        </section>
        <footer className="gs-start-footer"><span>MathCos Studio</span><Link href="/library">Thư viện học liệu <ArrowRight size={15} /></Link></footer>
        </div>
        </>}
      </main>
    </div>
  );

  if (!doc) return <div className="gs-loading" role="alert">{message || "Không thể mở học liệu."} {recoveryDraft && <button onClick={() => recoverAsCopy(recoveryDraft)}>Phục hồi bản thiết bị thành bản sao</button>} <button onClick={returnToStudio}>Về Studio</button></div>;

  const visibleStages = doc.exam ? stages.filter((item) => ["edit", "preview", "finish"].includes(item.key)) : stages;
  const activeIndex = visibleStages.findIndex((item) => item.key === stage);
  const lessonIssues = materialPublishIssues(doc);
  const examRows = doc.exam && stage === "finish" ? examQuestions(doc) : [];
  const hasKnowledgeCheck = lessonCheckOpenedId === doc.id;
  const visibleLessonOutput = lessonOutput === "knowledge-check" && !hasKnowledgeCheck ? "presentation" : lessonOutput;
  const readerHasAssistant = stage === "preview" && !doc.exam && visibleLessonOutput === "presentation";
  const quickSuggestions: Array<[SuggestionKind, string]> = doc.exam ? [["review", "Rà soát đề"]]
    : stage === "info" ? [["objective", "Gợi ý mục tiêu"]]
    : stage === "outline" ? [["outline", "Gợi ý dàn bài"]]
    : stage === "edit" ? [["content", "Gợi ý nội dung"], ["question", "Gợi ý câu hỏi"], ["activity", "Gợi ý hoạt động"]]
    : [["review", "Rà soát bài giảng"]];
  const sourceReview = (finish = false) => <MaterialSourceReview material={doc} finish={finish} busy={publishing}
    onFinish={() => goToIssue({ message: "", stage: "finish" })}
    onConfirm={() => change(source => ({ ...source, sourceReviewedAt: new Date().toISOString() }))}
    onQuestion={blockId => goToIssue({ message: "", stage: "edit", blockId, stepId: doc.learningSteps.find(item => item.blockIds.includes(blockId))?.id })} />;
  const boardEditor = boardTarget && <>
    {boardError && <p role="alert" className="gs-alert">{boardError}</p>}
    {boardTarget.note && <p role="status" className="exam-figure-review">{boardTarget.note}</p>}
    <ExploreWorkspace editor={{
      initial: boardTarget,
      context: doc.exam
        ? `${doc.title} · Câu ${examQuestions(doc).find((row) => row.step.id === boardTarget.stepId)?.number || ""}`
        : `${doc.title} · ${step?.title || ""}`,
      onApply: (visual, board) => void applyBoard(visual, board), busy: boardBusy,
      onDrag: doc.exam ? (visual, board) => { draggedBoard.current = { visual, board }; } : undefined,
      onCancel: () => {
        if (window.confirm("Bỏ các thay đổi đang thực hiện trên bảng?")) {
          draggedBoard.current = null;
          setBoardTarget(null);
        }
      },
    }} />
  </>;

  return (
    <div className="gs-page gs-workflow">
      {recoveryDraft && <div className="gs-alert">Có bản nháp thiết bị khác với bản đang mở. <button onClick={() => recoverAsCopy(recoveryDraft)}>Phục hồi thành bản sao riêng</button></div>}
      <header className="gs-topbar" inert={Boolean(boardTarget)}>
        <button type="button" className="gs-secondary gs-exit-editor" aria-label="Thoát về Studio"
          disabled={saveState === "saving" || publishing || !!uploadingBlockId || !!deleting} onClick={exitEditor}>
          <ArrowLeft size={16} aria-hidden="true" /> Thoát
        </button>
        <div className="gs-top-title"><strong>{doc.title}</strong><small role="status" data-save-state={saveState}>{deleting ? "Đang xóa bản nháp…" : doc.status === "published" ? "Đã xuất bản" : saveState === "saving" ? "Đang lưu vào tài khoản…" : saveState === "error" ? "Lưu tài khoản thất bại" : !savedId.current ? "Bản nháp trên thiết bị" : saveState === "dirty" ? "Có thay đổi chưa lưu vào tài khoản" : "Đã lưu bản nháp"}</small></div>
        <div className="gs-header-actions">
          {doc.status === "draft" && <button type="button" className="gs-secondary gs-delete-draft" aria-label="Xóa bản nháp"
            disabled={saveState === "saving" || publishing || !!uploadingBlockId || !!deleting}
            onClick={() => void deleteDraft(doc, savedId.current ? revision.current : undefined)}><Trash2 size={16} aria-hidden="true" /> Xóa</button>}
          <button type="button" className="gs-secondary" aria-label="Lưu" title="Lưu vào tài khoản" disabled={saveState === "saving" || doc.status === "published" || !!deleting} onClick={() => void save().catch(() => {})}><Save size={16} /> Lưu</button>
          {doc.status === "published" ? <button type="button" className="gs-primary" onClick={clonePublished}><Copy size={16} /> Tạo bản chỉnh sửa</button>
            : <button type="button" className="gs-primary" onClick={() => openStage(stage === "preview" ? "edit" : "preview")}><Eye size={16} /> {stage === "preview" ? "Quay lại soạn" : doc.exam ? "Xem và xuất đề" : "Dạy thử"}</button>}
        </div>
      </header>

      <nav className="gs-progress" data-track={doc.exam ? "exam" : "lesson"} aria-label="Các chặng soạn bài" inert={Boolean(boardTarget)}>
        {visibleStages.map((item, index) => <button key={item.key} type="button" aria-current={stage === item.key ? "step" : undefined}
          className={stage === item.key ? "active" : index < activeIndex ? "done" : ""}
          disabled={doc.status === "published" && ["info", "outline", "edit"].includes(item.key)}
          onClick={() => openStage(item.key)}>
          <span className="gs-progress-number" aria-hidden="true">{index < activeIndex ? <Check size={14} /> : index + 1}</span>
          <span className="gs-progress-label">{doc.exam ? { edit: "Soạn đề", preview: "Xem và xuất đề", finish: "Xuất bản" }[item.key as "edit" | "preview" | "finish"] : item.label}</span>
        </button>)}
      </nav>
      {message && <div className="gs-message" role="alert"><span>{message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setMessage("")}><X size={15} /></button></div>}

      <div inert={Boolean(boardTarget && !doc.exam)} className={`gs-layout ${stage === "edit" && !doc.exam ? "gs-edit-layout" : ""}`}>
        {stage === "edit" && !doc.exam && <aside className="gs-steps-sidebar" aria-label="Danh sách hoạt động">
          <div className="gs-sidebar-heading"><strong>Hoạt động học tập</strong><small>{doc.learningSteps.length} hoạt động · {totalMinutes} phút</small></div>
          <div className="gs-step-nav">{doc.learningSteps.map((item, index) => <button key={item.id} type="button" className={step?.id === item.id ? "active" : ""}
            onClick={() => { setActiveStepId(item.id); setActiveBlockId(item.blockIds[0] || ""); }}>
            <span>{index + 1}</span><span><strong>{item.title}</strong><small>{item.blockIds.length ? `${item.blockIds.length} nội dung` : "Chưa có nội dung"}</small></span>
          </button>)}</div>
          <button type="button" className="gs-sidebar-add" onClick={() => addStep()}><Plus size={15} /> Thêm hoạt động</button>
        </aside>}

        <main className="gs-main">
          {stage === "info" && <section className="gs-content gs-narrow">
            <div className="gs-section-head"><span>Bước 1 / 5 · Thông tin</span><h1>Bài giảng này dành cho ai?</h1><p>Đặt tên và xác định điều bạn muốn học sinh làm được sau bài học.</p></div>
            <div className="gs-form-card">
              <label>Tên bài giảng<input autoFocus maxLength={200} value={doc.title === "Bài học mới" ? "" : doc.title} placeholder="Ví dụ: Khám phá hàm số bậc hai"
                onChange={(event) => change((source) => ({ ...source, title: event.target.value || "Bài học mới" }))} /></label>
              <div className="gs-two-fields">
                <label>Khối lớp<input maxLength={60} value={doc.metadata.grade} placeholder="Ví dụ: 10" onChange={(event) => change((source) => ({ ...source, metadata: { ...source.metadata, grade: event.target.value } }))} /></label>
                <label>Chủ đề<input maxLength={100} value={doc.metadata.topic} placeholder="Ví dụ: Hàm số" onChange={(event) => change((source) => ({ ...source, metadata: { ...source.metadata, topic: event.target.value } }))} /></label>
              </div>
              <label>Mục tiêu chung<textarea maxLength={2000} rows={4} value={doc.summary} placeholder="Sau bài học, học sinh có thể…"
                onChange={(event) => change((source) => ({ ...source, summary: event.target.value }))} /></label>
              <div className="gs-inline-hint"><Sparkles size={16} /><span>Chưa biết viết mục tiêu? AI có thể đưa gợi ý để bạn chọn và sửa.</span><button type="button" onClick={() => void askAI("objective")}>Gợi ý mục tiêu</button></div>
            </div>
            <div className="gs-bottom-actions"><button className="gs-secondary" type="button" onClick={() => openStage("start")}><ArrowLeft size={16} /> Bắt đầu lại</button><button className="gs-primary" type="button" onClick={() => openStage("outline")}>Tiếp tục: Lập dàn bài <ArrowRight size={16} /></button></div>
          </section>}

          {stage === "outline" && <section className="gs-content gs-narrow">
            <div className="gs-section-head"><span>Bước 2 / 5 · Dàn bài</span><h1>Lập dàn bài</h1><p>Mỗi thẻ là một hoạt động học sinh sẽ thực hiện. Bạn có thể đổi thứ tự và sửa nội dung sau.</p></div>
            {doc.learningSteps.length === 0 && <div className="gs-empty">
              <BookOpen size={28} /><strong>Bài học chưa có hoạt động</strong>
              <p>Dùng cấu trúc gợi ý để bắt đầu nhanh, hoặc thêm hoạt động theo cách của bạn.</p>
              <div><button className="gs-primary" type="button" onClick={() => {
                const created = starterPhases.map((phase) => newStep(phase));
                change((source) => ({ ...source, learningSteps: created }));
                setActiveStepId(created[0].id);
              }}>Dùng dàn bài 5 hoạt động</button><button className="gs-secondary" type="button" onClick={() => addStep()}>Tự thêm hoạt động</button></div>
            </div>}
            {doc.learningSteps.length > 0 && <div className="gs-outline-list">{doc.learningSteps.map((item, index) => <article className="gs-outline-card" key={item.id}>
              <span className="gs-outline-number">{index + 1}</span>
              <div className="gs-outline-fields">
                <div className="gs-two-fields"><label>Tên hoạt động<input maxLength={200} value={item.title} onChange={(event) => updateStep(item.id, { title: event.target.value || "Hoạt động" })} /></label>
                  <label>Loại hoạt động<select value={item.phase} onChange={(event) => updateStep(item.id, { phase: event.target.value as Step["phase"] })}>{phases.map((phase) => <option key={phase.key} value={phase.key}>{phase.label}</option>)}</select></label></div>
                <label>Mục tiêu của hoạt động<input maxLength={1000} value={item.objective} placeholder="Học sinh sẽ làm được gì?" onChange={(event) => updateStep(item.id, { objective: event.target.value })} /></label>
                <div className="gs-outline-footer"><label>Thời lượng <input type="number" min={0} max={600} value={item.estimatedMinutes} onChange={(event) => updateStep(item.id, { estimatedMinutes: Math.max(0, Math.min(600, Number(event.target.value) || 0)) })} /> phút</label>
                  <div><button title="Đưa lên" type="button" onClick={() => arrangeStep(item.id, -1)} disabled={index === 0}><ArrowUp size={15} /></button><button title="Đưa xuống" type="button" onClick={() => arrangeStep(item.id, 1)} disabled={index === doc.learningSteps.length - 1}><ArrowDown size={15} /></button><button title="Xóa hoạt động" type="button" onClick={() => removeStep(item.id)}><Trash2 size={15} /></button></div></div>
              </div>
            </article>)}</div>}
            <div className="gs-outline-tools"><button className="gs-secondary" type="button" onClick={() => addStep()}><Plus size={16} /> Thêm hoạt động</button><button className="gs-ai-button" type="button" onClick={() => void askAI("outline")}><Sparkles size={16} /> AI gợi ý dàn bài</button><span>Tổng thời lượng: <strong>{totalMinutes} phút</strong></span></div>
            <div className="gs-bottom-actions"><button className="gs-secondary" type="button" onClick={() => openStage("info")}><ArrowLeft size={16} /> Thông tin bài</button><button className="gs-primary" type="button" disabled={!doc.learningSteps.length} onClick={() => { setActiveStepId(doc.learningSteps[0].id); openStage("edit"); }}>Soạn hoạt động <ArrowRight size={16} /></button></div>
          </section>}

          {stage === "edit" && doc.exam && <>
            {!boardTarget && <div className="gs-section-head gs-exam-stage-head"><span>Bước 1 / 3 · Soạn đề</span><h1>Soạn đề kiểm tra</h1><p>Thêm câu hỏi trực tiếp, chèn công thức và hình hoặc nhờ AI soạn câu hỏi.</p></div>}
            <ExamComposer key={doc.id} material={doc} onChange={change} activeBlockId={activeBlockId}
            onCodeSaved={(saved) => setRecent((items) => [saved, ...items.filter((item) => item.id !== saved.id)])}
            initialAiOpen={openExamAi} sourceReview={doc.sourcePages?.length || doc.reviewNotes?.length ? sourceReview() : undefined}
            questionBank={account && <StudioQuestionBank key={doc.id} material={doc} scope={account.id} disabled={!!boardTarget} onInsert={insertFromBank} />}
            onSelect={(stepId, blockId) => { setActiveStepId(stepId); setActiveBlockId(blockId); }}
            onBoard={(stepId, block, useTransfer) => {
              if (useTransfer) importBoard(stepId);
              else openBoard(block, doc.visuals.find((item) => item.id === block?.visualId) || null, block?.board, false, stepId);
            }}
            onDrawBoard={(stepId, question, visual, note) => {
              const source = current.current;
              const latest = source?.blocks.find((item) => item.id === question.id);
              if (source?.id !== doc.id || source.status !== "draft" || publishInFlight.current
                || !source.learningSteps.some((item) => item.id === stepId && item.blockIds.includes(question.id))
                || !latest || latest.content.trim() !== question.content.trim()
                || JSON.stringify(examSourceFigures(latest).map((image) => image.content)) !== JSON.stringify(examSourceFigures(question).map((image) => image.content))) return false;
              openBoard(undefined, validateVisual(visual), {
                ...newLessonBoard, options: { ...newLessonBoard.options, axes: visual.kind === "cartesian" },
              }, false, stepId, note);
              return true;
            }}
            onDropBoard={(stepId) => {
              const item = draggedBoard.current;
              draggedBoard.current = null;
              if (item) void applyBoard(item.visual, item.board, stepId);
            }}
            boardPanel={boardTarget ? boardEditor : undefined}
            pendingTransfer={hasBoardTransfer}
            onImage={addExamImage} onPdfExtracted={applyExtractedPdfQuestion} />
          </>}
          {stage === "edit" && !doc.exam && <section className="gs-content gs-editor">
            {sourceReview()}
            {account && <StudioQuestionBank key={doc.id} material={doc} scope={account.id} stepId={step?.id} disabled={doc.status !== "draft" || !!boardTarget} onInsert={insertFromBank} />}
            {!step ? <div className="gs-empty"><BookOpen size={28} /><strong>Chưa có hoạt động để soạn</strong><p>Hãy tạo hoạt động đầu tiên rồi thêm nội dung cho học sinh.</p><button className="gs-primary" type="button" onClick={() => addStep()}>Thêm hoạt động</button></div>
              : <>
                <div className="gs-editor-head"><div><span className="gs-eyebrow">Bước 3 / 5 · Hoạt động {doc.learningSteps.indexOf(step) + 1}</span>
                  <input aria-label="Tên hoạt động" className="gs-activity-title" value={step.title} maxLength={200} onChange={(event) => updateStep(step.id, { title: event.target.value || "Hoạt động" })} />
                  <p>{phases.find((item) => item.key === step.phase)?.label} · {step.estimatedMinutes} phút</p></div>
                  <button type="button" className="gs-secondary" onClick={() => openStage("outline")}>Sửa dàn bài</button>
                </div>
                <div className="gs-activity-meta"><label>Mục tiêu hoạt động<input value={step.objective} maxLength={1000} placeholder="Ví dụ: Nhận biết chiều mở của parabol khi a đổi dấu"
                  onChange={(event) => updateStep(step.id, { objective: event.target.value })} /></label>
                  <button type="button" className="gs-ai-link" onClick={() => void askAI("objective")}><Sparkles size={15} /> Gợi ý</button></div>

                {blocks.length === 0 && <div className="gs-empty gs-activity-empty"><BookOpen size={27} /><strong>Học sinh sẽ làm gì trong hoạt động này?</strong><p>Thêm một nội dung để bắt đầu. Bạn có thể sắp xếp lại sau.</p></div>}
                <div className="gs-block-list">{blocks.map((block, index) => {
                  const visual = block.visualId ? doc.visuals.find((item) => item.id === block.visualId) : undefined;
                  return <article id={`gs-block-${block.id}`} tabIndex={-1} className={`gs-block ${activeBlock?.id === block.id ? "selected" : ""}`} key={block.id} onFocus={() => setActiveBlockId(block.id)}>
                    <header className="gs-block-head"><div><span className="gs-block-number">{index + 1}</span><input aria-label="Tên thành phần" maxLength={200} value={block.title || ""} placeholder="Tên thành phần" onChange={(event) => updateBlock(block.id, { title: event.target.value })} /></div>
                      <div><button title="Đưa lên" type="button" disabled={index === 0} onClick={() => arrangeBlock(block.id, -1)}><ArrowUp size={15} /></button><button title="Đưa xuống" type="button" disabled={index === blocks.length - 1} onClick={() => arrangeBlock(block.id, 1)}><ArrowDown size={15} /></button><button title="Nhân bản" type="button" onClick={() => duplicateBlock(block.id)}><Copy size={15} /></button><button title="Xóa" type="button" onClick={() => removeBlock(block.id)}><Trash2 size={15} /></button></div></header>
                    <div className="gs-block-body">
                      {block.authorKind === "image" ? <div className="gs-image-edit">
                        <label className="gs-upload-label"><ImagePlus size={18} /> {uploadingBlockId === block.id ? "Đang tải ảnh lên…" : "Chọn ảnh từ máy (PNG, JPEG, WebP · tối đa 2 MB)"}
                          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingBlockId === block.id} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(block.id, file); event.target.value = ""; }} />
                        </label>
                        <label>Hoặc dán đường dẫn ảnh<input type="url" value={block.content} placeholder="https://…/hinh-minh-hoa.png" onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>
                        {block.content && <MaterialImage src={block.content} alt={block.title || "Hình minh họa"} />}</div>
                        : block.type === "visual" ? <>
                          {block.board ? <LessonBoardView board={block.board} spec={visual || null} onSelect={(selection) => { setSelectedObjectId(selection.id); setActiveBlockId(block.id); }} />
                            : visual ? <StudioModel key={visual.id} spec={visual} onUpdate={(values) => updateModelParameters(visual.id, values)} onSelect={(id) => { setSelectedObjectId(id); setActiveBlockId(block.id); }} /> : <p className="gs-alert">Mô hình đã bị thiếu. Hãy chọn mô hình khác.</p>}
                          <button className="gs-secondary" type="button" onClick={() => openBoard(block, visual || null)}>Mở bảng vẽ</button>
                          <label>Hướng dẫn học sinh<textarea rows={2} maxLength={20000} value={block.content} placeholder="Ví dụ: Thay đổi hệ số a và quan sát chiều mở của đồ thị."
                            onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>
                        </> : block.type === "math" ? <>
                          <FormulaEditor key={block.id} value={block.content} onChange={(latex) => updateBlock(block.id, { content: latex })} />
                          <label>Mã LaTeX<input value={block.content} maxLength={20000} placeholder="y=ax^2+bx+c" onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>
                        </> : block.type === "exercise" ? <div className="gs-question-edit">
                          <label>Câu hỏi dành cho học sinh<textarea rows={3} maxLength={20000} value={block.content} placeholder="Ví dụ: Khi a đổi dấu, chiều mở của parabol thay đổi thế nào?" onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>
                          <div className="gs-two-fields"><label>Cách tự kiểm tra<select value={block.assessment?.type === "multiple" ? "multiple" : "short"} onChange={(event) => updateBlock(block.id, { assessment: event.target.value === "multiple"
                            ? { type: "multiple", points: block.assessment?.points || 1, options: ["", ""], correctIndex: 0 }
                            : { type: "short", points: block.assessment?.points || 1, answer: "" } })}>
                            <option value="short">Trả lời ngắn</option><option value="multiple">Trắc nghiệm</option>
                          </select></label><label>Điểm tham khảo<input type="number" min={0} max={100} value={block.assessment?.points ?? 1} onChange={(event) => updateBlock(block.id, { assessment: { ...block.assessment, type: block.assessment?.type || "short", points: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } })} /></label></div>
                          {block.assessment?.type === "multiple" ? <div className="gs-options"><strong>Các lựa chọn · đánh dấu đáp án đúng</strong>{(block.assessment.options || ["", ""]).map((option, optionIndex) => <div key={optionIndex}>
                            <input type="radio" name={`answer-${block.id}`} aria-label={`Đáp án đúng là lựa chọn ${optionIndex + 1}`} checked={block.assessment?.correctIndex === optionIndex} onChange={() => updateBlock(block.id, { assessment: { ...block.assessment!, correctIndex: optionIndex } })} />
                            <input value={option} maxLength={400} placeholder={`Lựa chọn ${optionIndex + 1}`} onChange={(event) => updateBlock(block.id, { assessment: { ...block.assessment!, options: (block.assessment?.options || []).map((item, index) => index === optionIndex ? event.target.value : item) } })} />
                            <button type="button" title="Xóa lựa chọn" disabled={(block.assessment?.options?.length || 0) <= 2} onClick={() => updateBlock(block.id, { assessment: { ...block.assessment!, options: block.assessment!.options!.filter((_, index) => index !== optionIndex), correctIndex: Math.min(block.assessment!.correctIndex || 0, block.assessment!.options!.length - 2) } })}><X size={14} /></button>
                          </div>)}<button type="button" className="gs-secondary" disabled={(block.assessment.options?.length || 0) >= 6} onClick={() => updateBlock(block.id, { assessment: { ...block.assessment!, options: [...(block.assessment?.options || []), ""] } })}><Plus size={14} /> Thêm lựa chọn</button></div>
                            : <label>Đáp án tham khảo<input maxLength={400} value={block.assessment?.answer || ""} placeholder="Nhập câu trả lời để học sinh tự kiểm tra" onChange={(event) => updateBlock(block.id, { assessment: { type: "short", points: block.assessment?.points || 1, answer: event.target.value, explanation: block.assessment?.explanation } })} /></label>}
                          <label>Giải thích sau khi trả lời<textarea rows={2} maxLength={1200} value={block.assessment?.explanation || ""} onChange={(event) => updateBlock(block.id, { assessment: { ...block.assessment!, explanation: event.target.value } })} /></label>
                        </div>
                        : <label>{block.authorKind === "hint" ? "Nội dung gợi ý" : "Nội dung"}<textarea rows={block.type === "paragraph" ? 5 : 3} maxLength={20000} value={block.content}
                          placeholder="Nhập nội dung ở đây…"
                          onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>}
                    </div>
                  </article>;
                })}</div>

                <div className="gs-add-content"><strong><Plus size={16} /> Thêm nội dung vào hoạt động</strong><div>
                  <button type="button" onClick={() => addBlock("text")}><BookOpen size={16} /> Văn bản</button>
                  <button type="button" onClick={() => addBlock("formula")}><span className="gs-fx">ƒx</span> Công thức</button>
                  <button type="button" onClick={() => addBlock("image")}><ImagePlus size={16} /> Hình ảnh</button>
                  <button type="button" onClick={() => setModelPicker(true)}><span className="gs-fx">◇</span> Mô hình 2D/3D</button>
                  <button type="button" onClick={() => openBoard()}><FilePenLine size={16} /> Bảng vẽ trắng</button>
                  {hasBoardTransfer && <button type="button" onClick={() => importBoard()}><Box size={16} /> Nhập bảng từ Khám phá</button>}
                  <button type="button" onClick={() => addBlock("question")}><span className="gs-fx">?</span> Câu hỏi</button>
                  <button type="button" onClick={() => addBlock("hint")}><Lightbulb size={16} /> Gợi ý</button>
                </div></div>
                <div className="gs-bottom-actions"><button className="gs-secondary" type="button" onClick={() => openStage("outline")}><ArrowLeft size={16} /> Dàn bài</button>
                  <div>{doc.learningSteps.indexOf(step) > 0 && <button className="gs-secondary" type="button" onClick={() => { const previous = doc.learningSteps[doc.learningSteps.indexOf(step) - 1]; setActiveStepId(previous.id); setActiveBlockId(previous.blockIds[0] || ""); }}>Hoạt động trước</button>}
                    {doc.learningSteps.indexOf(step) < doc.learningSteps.length - 1 ? <button className="gs-primary" type="button" onClick={() => { const next = doc.learningSteps[doc.learningSteps.indexOf(step) + 1]; setActiveStepId(next.id); setActiveBlockId(next.blockIds[0] || ""); }}>Hoạt động tiếp <ArrowRight size={16} /></button>
                      : <button className="gs-primary" type="button" onClick={() => openStage("preview")}>Dạy thử <ArrowRight size={16} /></button>}</div>
                </div>
              </>}
          </section>}

          {stage === "preview" && doc.exam && <>
            <div className="gs-section-head gs-exam-stage-head"><span>Bước 2 / 3 · Xem và xuất đề</span><h1>Xem trước đề kiểm tra</h1><p>Chọn bản học sinh hoặc giáo viên, kiểm tra bố cục rồi tải Word hoặc lưu PDF.</p></div>
            <ExamPreview material={doc} canShowAnswers />
            <div className="gs-bottom-actions gs-exam-stage-actions">
              <button className="gs-secondary" type="button" onClick={doc.status === "published" ? clonePublished : () => openStage("edit")}><ArrowLeft size={16} /> {doc.status === "published" ? "Tạo bản chỉnh sửa" : "Về trình soạn đề"}</button>
              <button className="gs-primary" type="button" onClick={() => openStage("finish")}>Kiểm tra trước khi xuất bản <ArrowRight size={16} /></button>
            </div>
          </>}
          {!doc.exam && (stage === "preview" || hasKnowledgeCheck) && <section className="gs-content gs-preview" hidden={stage !== "preview"}>
            {stage === "preview" && <>
            <div className="gs-section-head"><span>Bước 4 / 5 · Dạy thử</span><h1>Dạy thử bài giảng</h1><p>Chọn định dạng phù hợp để phát phiếu hoặc dạy trên màn hình.</p></div>
            <div className="gs-lesson-output" role="group" aria-label="Định dạng đầu ra">
              <button type="button" className="gs-secondary" aria-pressed={visibleLessonOutput === "worksheet"} onClick={() => navigateStudio("preview", "worksheet", false)}>
                <Printer size={19} /><span><strong>Phiếu học tập A4</strong><small>Bản học sinh có chỗ làm bài và hình minh họa.</small></span>
              </button>
              <button type="button" className="gs-secondary" aria-pressed={visibleLessonOutput === "presentation"} onClick={() => navigateStudio("preview", "presentation", false)}>
                <Play size={19} /><span><strong>Trình chiếu 16:9</strong><small>Chọn theme và xem trước từng slide.</small></span>
              </button>
              <button type="button" className="gs-secondary" aria-pressed={visibleLessonOutput === "knowledge-check"}
                onClick={() => navigateStudio("preview", "knowledge-check", assessmentReviewLesson === doc.id)}>
                <ClipboardList size={19} /><span><strong>Phiếu kiểm tra kiến thức</strong><small>Tạo và xuất phiếu riêng cho từng học sinh.</small></span>
              </button>
            </div>
            </>}
            {hasKnowledgeCheck && <div hidden={visibleLessonOutput !== "knowledge-check"}><LessonKnowledgeCheck key={doc.id} material={doc}
              openAssessmentReview={assessmentReviewLesson === doc.id} /></div>}
            {stage === "preview" && <>
            {visibleLessonOutput === "worksheet" && <LessonWorksheet key={doc.id} material={doc} />}
            {visibleLessonOutput === "presentation" && <>
              <StudioSlidePreview key={doc.id} material={doc} theme={slideTheme} onTheme={chooseSlideTheme} channel={presentationChannel} onOpen={openPresentation}
                onPlan={doc.status === "draft" ? (slidePlan) => change((source) => ({ ...source, slidePlan })) : undefined} />
              <details className="studio-teacher-notes"><summary>Ghi chú và hỏi AI khi dạy</summary>
                <div className="gs-preview-frame"><MaterialReader key={`${doc.id}:${doc.revision}`} material={doc} teacherMode documentMode presentationChannel={presentationChannel} presentationTheme={slideTheme} /></div>
              </details>
            </>}
            <div className="gs-bottom-actions"><button className="gs-secondary" type="button" onClick={doc.status === "published" ? clonePublished : () => openStage("edit")}><ArrowLeft size={16} /> {doc.status === "published" ? "Tạo bản chỉnh sửa" : "Quay lại soạn"}</button><button className="gs-primary" type="button" onClick={() => openStage("finish")}>Kiểm tra và hoàn tất <ArrowRight size={16} /></button></div>
            </>}
          </section>}

          {stage === "finish" && <section className="gs-content gs-narrow"><div className="gs-section-head"><span>{doc.exam ? "Bước 3 / 3 · Xuất bản" : "Bước 5 / 5 · Hoàn tất"}</span><h1>{doc.exam ? "Hoàn tất đề kiểm tra" : "Kiểm tra và hoàn tất"}</h1><p>{doc.exam ? "Xem lại câu hỏi và đáp án trước khi gửi đề cho học sinh." : "Xem lại cấu trúc bài giảng trước khi gửi cho học sinh."}</p></div>
            {sourceReview(true)}
            <div className="gs-finish-summary"><h2>{doc.title}</h2><p>{doc.exam ? `${doc.exam.subject} · ${examRows.length} câu hỏi` : doc.metadata.topic || "Chưa có chủ đề"} · {doc.metadata.grade ? `Lớp ${doc.metadata.grade}` : "Chưa chọn lớp"} · {doc.exam?.duration ?? totalMinutes} phút</p>
              <ol>{doc.exam ? examRows.map(({ question, number }) => <li key={question.id}><span>Câu {number}{question.content ? ` · ${question.content.slice(0, 120)}${question.content.length > 120 ? "…" : ""}` : " · Chưa có nội dung"}</span><small>{question.assessment?.points ?? 0} điểm</small></li>)
                : doc.learningSteps.map((item) => <li key={item.id}><span>{item.title}</span><small>{item.blockIds.length} nội dung · {item.estimatedMinutes} phút</small></li>)}</ol></div>
            {lessonIssues.length > 0 ? <div className="gs-checklist"><h3>{lessonIssues.length} mục đang chặn xuất bản</h3>{lessonIssues.map((issue, index) => <div className="gs-checklist-item" key={`${index}:${issue.message}`}><p><span>!</span> {issue.message}</p><button type="button" className="gs-secondary" disabled={publishing} onClick={() => goToIssue(issue)}>{issue.stage === "finish" ? "Đi tới xác nhận" : "Đi tới phần cần sửa"}</button></div>)}</div>
              : <div className="gs-ready"><CheckCircle2 size={20} /> {doc.status === "published" ? "Đã xuất bản." : "Đã đáp ứng các mục kiểm tra để xuất bản."}</div>}
            {!doc.exam && <LessonAssessmentShare key={doc.id} lessonId={doc.id} onPrepare={openAssessmentReview} />}
            {doc.status === "published" && <MaterialShare material={doc} onUpdate={next => { current.current = next; setDoc(next); revision.current = next.revision; }} />}
            <div className="gs-finish-actions">{doc.status !== "published" && <button className="gs-secondary" type="button" onClick={() => void save().then(() => setMessage("Đã lưu bản nháp.")).catch(() => {})}><Save size={16} /> Lưu bản nháp</button>}
              {!doc.exam && <button className="gs-secondary" type="button" onClick={openAssessmentReview}><ClipboardList size={16} /> Xem kết quả kiểm tra</button>}
              {doc.status === "published" ? <button className="gs-primary" type="button" onClick={clonePublished}><Copy size={16} /> Tạo bản chỉnh sửa</button>
                : <button className="gs-primary" type="button" disabled={publishing} onClick={() => void publish()}>{publishing ? "Đang xuất bản…" : doc.exam ? "Xuất bản đề kiểm tra" : "Xuất bản bài giảng"} <ArrowRight size={16} /></button>}
              {doc.status === "published" && <><Link className="gs-secondary" href={`/material/${doc.slug || doc.id}`}>{doc.exam ? "Mở đề đã xuất bản" : "Mở bài đã xuất bản"} <ArrowRight size={16} /></Link><button className="gs-secondary" type="button" onClick={() => void request<Material>(`/api/materials/${doc.id}/publish`, { method: "POST", body: JSON.stringify({ published: false }) }).then(next => { current.current = next; setDoc(next); revision.current = next.revision; openStage("edit"); }).catch(e => setMessage(e.message))}>Gỡ xuất bản</button></>}
            </div>
            <div className="gs-bottom-actions"><button className="gs-secondary" type="button" onClick={() => openStage("preview")}><ArrowLeft size={16} /> {doc.exam ? "Xem lại đề" : "Dạy thử lại"}</button><button className="gs-ai-button" type="button" onClick={() => void askAI("review")}><Sparkles size={16} /> {doc.exam ? "AI rà soát đề" : "AI rà soát bài giảng"}</button></div>
          </section>}
        </main>

        {stage === "edit" && !doc.exam && <aside className="gs-context-rail"><div className="gs-context-head"><Sparkles size={17} /><strong>Trợ lý AI</strong></div><p>Gợi ý theo hoạt động đang soạn. Xem lại rồi chọn nội dung phù hợp để chèn vào bài.</p>
          <button type="button" onClick={() => void askAI("content")}>Gợi ý nội dung cho hoạt động</button>
          <button type="button" onClick={() => void askAI("question")}>Gợi ý câu hỏi cho mô hình</button>
          <button type="button" onClick={() => void askAI("activity")}>Đề xuất cách tổ chức hoạt động</button>
          {activeVisual && <div className="gs-model-settings"><h3>Tương tác khi mở hoạt động</h3><p>Mô hình chính: {activeVisual.accessibility?.description || activeVisual.source?.key}</p>
            <label>Hành động<select value={actionType} onChange={(event) => setActionType(event.target.value as VisualAction["type"])}>
              <option value="highlight">Làm nổi bật</option><option value="focus">Đưa vào trọng tâm</option><option value="show">Hiện đối tượng</option><option value="hide">Ẩn đối tượng</option><option value="setParameter">Đặt tham số</option><option value="animateParameter">Chạy tham số</option><option value="reset">Đặt lại mô hình</option>
            </select></label>
            {!["reset"].includes(actionType) && <label>{["setParameter", "animateParameter"].includes(actionType) ? "Tham số" : "Đối tượng"}<select value={selectedObjectId} onChange={(event) => setSelectedObjectId(event.target.value)}>
              <option value="">Chọn trên mô hình hoặc ở đây…</option>
              {(["setParameter", "animateParameter"].includes(actionType) ? activeVisual.parameters : activeVisual.objects).map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
            </select></label>}
            {["setParameter", "animateParameter"].includes(actionType) && <label>Giá trị đích<input type="number" value={actionValue} onChange={(event) => setActionValue(Number(event.target.value) || 0)} /></label>}
            <button className="gs-secondary" type="button" onClick={addAction}><Plus size={14} /> Gắn hành động</button>
            {step?.visualId !== activeVisual.id && !!step?.visualActions.length && <p>Hoạt động đang có hành động của mô hình khác. Gắn hành động mới sẽ thay thế các hành động đó.</p>}
            {step?.visualId === activeVisual.id && step.visualActions.map((action, index) => <div className="gs-action-row" key={index}><span>{action.type}{"targets" in action ? ` · ${action.targets.join(", ")}` : "parameter" in action ? ` · ${action.parameter}` : ""}</span><button type="button" aria-label="Bỏ hành động" onClick={() => updateStep(step.id, { visualActions: step.visualActions.filter((_, item) => item !== index), actionLabels: step.actionLabels.filter((_, item) => item !== index) })}><X size={13} /></button></div>)}
          </div>}
        </aside>}
      </div>

      {!readerHasAssistant && !assistantOpen && !modelPicker && !boardTarget && <FloatingAiTrigger onOpen={() => setAssistantOpen(true)} />}
      {!readerHasAssistant && assistantOpen && !modelPicker && !boardTarget && <aside className="gs-assistant-panel floating-ai-panel studio-floating-ai" role="dialog" aria-label="Trợ lý soạn bài"
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeAssistant(); } }}>
        <FloatingAiHeader title="Trợ giảng Toán AI" closeLabel="Đóng trợ lý" onClose={closeAssistant} />
        <div className="studio-floating-ai-body">
        <div className="explore-v2-ai-context"><b><Sparkles size={13} /> Ngữ cảnh soạn bài</b><p>{stage === "edit" && !doc.exam ? step?.title || doc.title : doc.title}</p></div>
        <div className="explore-v2-ai-suggestions studio-floating-ai-suggestions">
          {quickSuggestions.map(([kind, label]) => <button type="button" key={kind} disabled={aiLoading} onClick={() => void askAI(kind)}>{label}</button>)}
        </div>
        {aiLoading && <div className="gs-ai-loading" role="status"><LoaderCircle className="gs-spin" /> {aiKind ? "Đang tạo gợi ý…" : "Đang trả lời…"}</div>}
        {aiError && <div className="gs-alert" role="alert">{aiError}<button type="button" onClick={() => void askAI(aiKind)}>Thử lại</button></div>}
        {aiAnswer && <div className="teacher-answer" role="status"><FormattedAIAnswer text={aiAnswer} compactDisplaySpacing /></div>}
        <div className="gs-suggestion-list">{aiSuggestions.map((item, index) => <article key={`${item.title}-${index}`}><span>GỢI Ý {index + 1}</span><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.content && <blockquote>{item.content}</blockquote>}{item.visualKey && <small>Mô hình có sẵn: {visualPatterns.find((model) => model.key === item.visualKey)?.title}</small>}
          {aiKind !== "review" && <button type="button" className="gs-primary" onClick={() => applySuggestion(item)}>Dùng gợi ý này <ArrowRight size={14} /></button>}</article>)}</div>
        </div>
        <form className="studio-floating-ai-compose" onSubmit={(event) => { event.preventDefault(); if (!aiLoading) void askAI(null); }}>
          <label htmlFor="studio-ai-question">Câu hỏi của bạn</label>
          <textarea id="studio-ai-question" rows={2} maxLength={1000} value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Hỏi AI về nội dung đang soạn…" />
          <button className="gs-primary" type="submit" disabled={aiLoading || aiQuestion.trim().length < 2}>Gửi <Send size={14} /></button>
        </form>
      </aside>}

      {modelPicker && <div className="gs-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModelPicker(false); }}><section className="gs-model-modal" role="dialog" aria-modal="true" aria-label="Thư viện mô hình">
        <header><div><span className="gs-eyebrow">THƯ VIỆN MÔ HÌNH</span><h2>Chọn mô hình cho hoạt động</h2></div><button type="button" aria-label="Đóng thư viện" onClick={() => setModelPicker(false)}><X size={18} /></button></header>
        <label className="gs-model-search"><Search size={17} /><input autoFocus value={modelSearch} placeholder="Tìm theo tên, chủ đề hoặc lớp…" onChange={(event) => setModelSearch(event.target.value)} /></label>
        <div className="gs-model-grid">{modelResults.map((model) => <button key={model.key} type="button" onClick={() => insertModel(model.key)}><span>{model.dimension.toUpperCase()}</span><strong>{model.title}</strong><small>{model.topic}</small><span className="gs-model-add">Chèn mô hình <Plus size={14} /></span></button>)}</div>
        {modelResults.length === 0 && <p>Không tìm thấy mô hình phù hợp. Hãy thử từ khóa khác.</p>}
      </section></div>}
      {boardTarget && !doc.exam && <div className="gs-modal-backdrop studio-board-backdrop">
        <section className="studio-board-dialog" role="dialog" aria-modal="true" aria-label="Bảng vẽ của hoạt động">
          {boardEditor}
        </section>
      </div>}
    </div>
  );
}
