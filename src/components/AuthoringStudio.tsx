"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  FileImage,
  FileText,
  Globe2,
  ImagePlus,
  Layers3,
  Link2,
  MoreHorizontal,
  Move,
  PanelRight,
  PenLine,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { pattern } from "@/lib/patterns";
import { request } from "@/lib/client";
import type { Material, VisualSpec } from "@/lib/contracts";
import { Visual } from "./Visual";

type BlockKind =
  | "heading"
  | "text"
  | "formula"
  | "visual2d"
  | "visual3d"
  | "image"
  | "question"
  | "hint";

type AuthorBlock = {
  id: string;
  kind: BlockKind;
  title: string;
  content: string;
  visualKey?: "quadratic-roots" | "triangle-thales";
  questionType?: "multiple" | "short" | "drag";
  points?: number;
};

type LearningStep = {
  id: string;
  title: string;
  description: string;
  actions: string[];
};

const BLOCK_TOOLS: Array<{
  kind: BlockKind;
  label: string;
  icon: ReactNode;
}> = [
  { kind: "text", label: "Văn bản", icon: <FileText size={16} /> },
  { kind: "formula", label: "Công thức", icon: <span className="authoring-formula-icon">ƒx</span> },
  { kind: "image", label: "Hình ảnh", icon: <ImagePlus size={16} /> },
  { kind: "visual2d", label: "Mô hình 2D", icon: <Layers3 size={16} /> },
  { kind: "visual3d", label: "Mô hình 3D", icon: <Box size={16} /> },
  { kind: "question", label: "Câu hỏi", icon: <CircleHelp size={16} /> },
  { kind: "hint", label: "Gợi ý", icon: <WandSparkles size={16} /> },
];

const INITIAL_BLOCKS: AuthorBlock[] = [
  {
    id: "block-intro",
    kind: "heading",
    title: "Khởi động: Quan sát đồ thị",
    content: "Hãy quan sát cách các hệ số làm thay đổi hình dạng parabol.",
  },
  {
    id: "block-context",
    kind: "text",
    title: "Mục tiêu bài học",
    content:
      "Sau bài học, người học có thể nhận biết đỉnh, trục đối xứng và giải thích ảnh hưởng của tham số a, b, c.",
  },
  {
    id: "block-formula",
    kind: "formula",
    title: "Công thức trọng tâm",
    content: "f(x) = ax² + bx + c    •    Δ = b² − 4ac",
  },
  {
    id: "block-visual",
    kind: "visual2d",
    title: "Mô hình tương tác: Hàm số bậc hai",
    content: "Kéo các thanh tham số để xem đồ thị cập nhật theo thời gian thực.",
    visualKey: "quadratic-roots",
  },
  {
    id: "block-question",
    kind: "question",
    title: "Kiểm tra nhanh",
    content: "Khi a < 0, parabol quay lên hay quay xuống? Hãy chọn và giải thích.",
    questionType: "multiple",
    points: 1,
  },
];

const INITIAL_STEPS: LearningStep[] = [
  {
    id: "step-1",
    title: "Quan sát mô hình",
    description: "Nhận diện đỉnh và chiều mở của parabol.",
    actions: ["Làm nổi bật đối tượng"],
  },
  {
    id: "step-2",
    title: "Thay đổi tham số",
    description: "Kéo thanh a và ghi lại điều gì thay đổi.",
    actions: ["Thay đổi tham số", "Hiện / ẩn đối tượng"],
  },
];

function studioVisual(key: "quadratic-roots" | "triangle-thales") {
  const visual = pattern(key);
  return {
    ...visual,
    id: key === "quadratic-roots" ? "visual_quadratic" : "visual_thales",
  };
}

function kindFromBlock(block: Material["blocks"][number]): BlockKind {
  if (block.authorKind) return block.authorKind;
  if (block.type === "heading") return "heading";
  if (block.type === "math") return "formula";
  if (block.type === "visual") return "visual2d";
  if (block.type === "exercise") return "question";
  return "text";
}

const ACTIONS = [
  "Làm nổi bật đối tượng",
  "Thay đổi tham số",
  "Hiện / ẩn đối tượng",
  "Tự động phát mô phỏng",
];

const labelForKind: Record<BlockKind, string> = {
  heading: "Tiêu đề phần",
  text: "Văn bản",
  formula: "Công thức toán học",
  visual2d: "Mô hình trực quan 2D",
  visual3d: "Mô hình trực quan 3D",
  image: "Hình ảnh minh họa",
  question: "Câu hỏi / bài tập",
  hint: "Gợi ý học tập",
};

function blockIcon(kind: BlockKind) {
  if (kind === "formula") return <span className="authoring-formula-icon">ƒx</span>;
  if (kind === "visual2d") return <Layers3 size={16} />;
  if (kind === "visual3d") return <Box size={16} />;
  if (kind === "image") return <FileImage size={16} />;
  if (kind === "question") return <CircleHelp size={16} />;
  if (kind === "hint") return <WandSparkles size={16} />;
  return <FileText size={16} />;
}

export function AuthoringStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Khám phá hàm số bậc hai");
  const [summary, setSummary] = useState(
    "Một học liệu tương tác giúp học sinh hiểu mối liên hệ giữa công thức và đồ thị.",
  );
  const [topic, setTopic] = useState("Hàm số");
  const [grade, setGrade] = useState("Lớp 10");
  const [materialType, setMaterialType] = useState<Material["metadata"]["type"]>("lesson");
  const [tags, setTags] = useState("parabol, tham số, trực quan");
  const [blocks, setBlocks] = useState<AuthorBlock[]>(INITIAL_BLOCKS);
  const [steps, setSteps] = useState<LearningStep[]>(INITIAL_STEPS);
  const [activeBlockId, setActiveBlockId] = useState(INITIAL_BLOCKS[0].id);
  const [activeStepId, setActiveStepId] = useState(INITIAL_STEPS[0].id);
  const [activePanel, setActivePanel] = useState<"outline" | "models" | "assets">("outline");
  const [visualKey, setVisualKey] = useState<"quadratic-roots" | "triangle-thales">("quadratic-roots");
  const [visuals, setVisuals] = useState<VisualSpec[]>(() => [
    studioVisual("quadratic-roots"),
    studioVisual("triangle-thales"),
  ]);
  const [imagePreview, setImagePreview] = useState("");
  const [imageName, setImageName] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [visibility, setVisibility] = useState<Material["visibility"]>("private");
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [revision, setRevision] = useState(1);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const latestSignature = useRef("");

  const activeBlock = blocks.find((block) => block.id === activeBlockId) || blocks[0];
  const activeStep = steps.find((step) => step.id === activeStepId) || steps[0];
  const currentVisual = useMemo(
    () => visuals.find((visual) => visual.accessibility?.description === (visualKey === "quadratic-roots" ? "Hàm số bậc hai" : "Định lý Thales")) || visuals[0],
    [visualKey, visuals],
  );

  const documentSignature = useMemo(
    () =>
      JSON.stringify({
        title,
        summary,
        topic,
        grade,
        materialType,
        tags,
        blocks,
        steps,
        visualKey,
        visibility,
      }),
    [title, summary, topic, grade, materialType, tags, blocks, steps, visualKey, visibility],
  );
  latestSignature.current = documentSignature;

  function markDirty() {
    setDirty(true);
    setAutosaveState("saving");
  }

  function updateBlock(id: string, patch: Partial<AuthorBlock>) {
    setBlocks((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    markDirty();
  }

  function addBlock(kind: BlockKind) {
    const id = `block-${crypto.randomUUID().slice(0, 8)}`;
    const defaults: Record<BlockKind, Omit<AuthorBlock, "id" | "kind">> = {
      heading: { title: "Phần nội dung mới", content: "Đặt tên cho phần học tập này." },
      text: { title: "Đoạn văn mới", content: "Nhập nội dung bài học tại đây…" },
      formula: { title: "Công thức mới", content: "x² + y² = r²" },
      visual2d: { title: "Mô hình 2D mới", content: "Mô hình đồ thị tương tác.", visualKey: "quadratic-roots" },
      visual3d: { title: "Mô hình 3D mới", content: "Mô hình hình học không gian tương tác.", visualKey: "triangle-thales" },
      image: { title: "Hình ảnh minh họa", content: "Thêm chú thích cho hình ảnh." },
      question: { title: "Câu hỏi mới", content: "Viết câu hỏi, đáp án và tiêu chí đánh giá…", questionType: "multiple", points: 1 },
      hint: { title: "Gợi ý mới", content: "Nhập gợi ý để người học tự tìm ra hướng giải." },
    };
    setBlocks((items) => [...items, { id, kind, ...defaults[kind] }]);
    setActiveBlockId(id);
    setActivePanel("outline");
    setMessage(`${labelForKind[kind]} đã được thêm vào bài học.`);
    markDirty();
  }

  function removeBlock(id: string) {
    if (blocks.length <= 1) return;
    const next = blocks.filter((block) => block.id !== id);
    setBlocks(next);
    if (activeBlockId === id) setActiveBlockId(next[0].id);
    markDirty();
  }

  function duplicateBlock() {
    if (!activeBlock) return;
    const copy = { ...activeBlock, id: `block-${crypto.randomUUID().slice(0, 8)}`, title: `${activeBlock.title} — Bản sao` };
    setBlocks((items) => {
      const index = items.findIndex((item) => item.id === activeBlock.id);
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
    });
    setActiveBlockId(copy.id);
    setMessage("Đã nhân bản thành phần nội dung.");
    markDirty();
  }

  function addStep() {
    const step = {
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      title: `Bước học tập ${steps.length + 1}`,
      description: "Mô tả mục tiêu và thao tác người học cần thực hiện.",
      actions: [],
    };
    setSteps((items) => [...items, step]);
    setActiveStepId(step.id);
    markDirty();
  }

  function updateStep(patch: Partial<LearningStep>) {
    if (!activeStep) return;
    setSteps((items) => items.map((step) => (step.id === activeStep.id ? { ...step, ...patch } : step)));
    markDirty();
  }

  function toggleAction(action: string) {
    if (!activeStep) return;
    const actions = activeStep.actions.includes(action)
      ? activeStep.actions.filter((item) => item !== action)
      : [...activeStep.actions, action];
    updateStep({ actions });
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(String(reader.result || ""));
      addBlock("image");
    };
    reader.readAsDataURL(file);
  }

  function materialPayload(id: string): Material {
    const now = new Date().toISOString();
    return {
      id,
      title: title.trim() || "Học liệu mới",
      summary,
      blocks: blocks.map((block, index) => ({
        id: block.id || `block_${index}`,
        type:
          block.kind === "heading"
            ? "heading"
            : block.kind === "formula"
              ? "math"
              : block.kind === "question"
                ? "exercise"
                : block.kind === "hint" || block.kind === "image"
                  ? "callout"
                  : block.kind === "visual2d" || block.kind === "visual3d"
                    ? "visual"
                    : "paragraph",
        authorKind: block.kind,
        title: block.title,
        content: block.content,
        ...(block.kind === "question"
          ? {
              assessment: {
                type: block.questionType || "multiple",
                points: Number.isFinite(block.points) ? Math.max(0, Math.min(100, Math.trunc(block.points!))) : 1,
              },
            }
          : {}),
        ...(block.kind === "visual2d" || block.kind === "visual3d"
          ? { visualId: visuals.find((visual) => visual.accessibility?.description === (block.visualKey === "quadratic-roots" ? "Hàm số bậc hai" : "Định lý Thales"))?.id || visuals[0]?.id }
          : {}),
      })),
      metadata: {
        grade,
        topic,
        type: materialType,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      },
      visuals,
      status,
      visibility,
      learningSteps: steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        phase: index === 0 ? "warmup" as const : "explore" as const,
        objective: "",
        estimatedMinutes: 5,
        blockIds: index === 0 ? blocks.map((block) => block.id) : [],
        actionLabels: step.actions,
        visualActions: [],
      })),
      revision,
      slug: status === "published" && savedId ? savedId : null,
      publishedAt,
      createdAt,
      updatedAt: now,
    };
  }

  function validateForPublish() {
    const problems: string[] = [];
    if (!title.trim()) problems.push("Thiếu tiêu đề học liệu");
    if (!summary.trim()) problems.push("Thiếu mô tả học liệu");
    if (!blocks.length) problems.push("Học liệu cần ít nhất một thành phần");
    if (blocks.some((block) => !block.title.trim() || !block.content.trim()))
      problems.push("Có thành phần chưa đủ tiêu đề hoặc nội dung");
    if (!steps.length) problems.push("Học liệu cần ít nhất một bước học tập");
    return problems;
  }

  async function saveDraft(silent = false) {
    if (status === "published") {
      setError("Học liệu đã xuất bản đang được khóa. Hãy nhân bản để tạo bản chỉnh sửa mới.");
      return;
    }
    setBusy(true);
    setError("");
    if (silent) setAutosaveState("saving");
    const signatureAtSave = latestSignature.current;
    try {
      const id = savedId || crypto.randomUUID();
      const saved = await request<Material>(savedId ? `/api/materials/${id}` : "/api/materials", {
        method: savedId ? "PATCH" : "POST",
        body: JSON.stringify({ ...materialPayload(id), status: "draft", slug: null, publishedAt: null }),
      });
      setSavedId(saved.id);
      setStatus(saved.status);
      setCreatedAt(saved.createdAt);
      setRevision(saved.revision);
      setPublishedAt(saved.publishedAt);
      setDirty(latestSignature.current !== signatureAtSave);
      setAutosaveState("saved");
      if (!silent)
        setMessage("Đã lưu bản nháp. Bạn có thể tiếp tục chỉnh sửa bất cứ lúc nào.");
      window.history.replaceState(null, "", `/studio?material=${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setAutosaveState("error");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError("");
    const problems = validateForPublish();
    if (problems.length) {
      setError(problems.join(". ") + ".");
      setBusy(false);
      return;
    }
    try {
      let id = savedId;
      if (!id) {
        const saved = await request<Material>("/api/materials", {
          method: "POST",
          body: JSON.stringify({ ...materialPayload(crypto.randomUUID()), status: "draft", slug: null, publishedAt: null }),
        });
        id = saved.id;
        setSavedId(id);
      } else {
        await request<Material>(`/api/materials/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...materialPayload(id), status: "draft", slug: null, publishedAt: null }),
        });
      }
      const published = await request<Material>(`/api/materials/${id}/publish`, {
        method: "POST",
        body: JSON.stringify({ published: true }),
      });
      setStatus("published");
      setPublishedAt(published.publishedAt);
      setRevision(published.revision);
      setDirty(false);
      setMessage("Đã xuất bản học liệu. Bạn có thể chia sẻ liên kết cho người học.");
      window.history.replaceState(null, "", `/studio?material=${published.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!savedId || status !== "published") {
      setMessage("Hãy lưu và xuất bản học liệu trước khi chia sẻ.");
      return;
    }
    const url = `${window.location.origin}/material/${savedId}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép liên kết học liệu.");
    } catch {
      setMessage(url);
    }
  }

  function duplicateMaterial() {
    setSavedId(null);
    setStatus("draft");
    setPublishedAt(null);
    setCreatedAt(new Date().toISOString());
    setRevision(1);
    setTitle((value) => `${value} — Bản sao`);
    setMessage("Đã tạo bản sao riêng. Lưu lại để tạo học liệu mới.");
    markDirty();
    window.history.replaceState(null, "", "/studio");
  }

  useEffect(() => {
    const materialId = new URLSearchParams(window.location.search).get("material");
    if (!materialId) return;
    request<Material>(`/api/materials/${materialId}`)
      .then((material) => {
        const nextBlocks: AuthorBlock[] = material.blocks.map((block, index) => {
          const kind = kindFromBlock(block);
          const linkedVisual = material.visuals.find((visual) => visual.id === block.visualId);
          return {
            id: block.id,
            kind,
            title: block.title || `${labelForKind[kind]} ${index + 1}`,
            content: block.content,
            questionType: block.assessment?.type,
            points: block.assessment?.points,
            visualKey:
              linkedVisual?.accessibility?.description === "Định lý Thales"
                ? "triangle-thales"
                : kind === "visual2d" || kind === "visual3d"
                  ? "quadratic-roots"
                  : undefined,
          };
        });
        const nextSteps: LearningStep[] = material.learningSteps.length
          ? material.learningSteps.map((step) => ({
              id: step.id,
              title: step.title,
              description: step.description,
              actions: step.actionLabels,
            }))
          : INITIAL_STEPS;
        setTitle(material.title);
        setSummary(material.summary);
        setTopic(material.metadata.topic);
        setGrade(material.metadata.grade);
        setMaterialType(material.metadata.type);
        setTags(material.metadata.tags.join(", "));
        setBlocks(nextBlocks.length ? nextBlocks : INITIAL_BLOCKS);
        setSteps(nextSteps);
        setActiveBlockId((nextBlocks[0] || INITIAL_BLOCKS[0]).id);
        setActiveStepId(nextSteps[0].id);
        setVisuals(material.visuals.length ? material.visuals : [studioVisual("quadratic-roots"), studioVisual("triangle-thales")]);
        setVisualKey(
          nextBlocks.find((block) => block.visualKey)?.visualKey ||
            "quadratic-roots",
        );
        setSavedId(material.id);
        setStatus(material.status);
        setVisibility(material.visibility);
        setCreatedAt(material.createdAt);
        setRevision(material.revision);
        setPublishedAt(material.publishedAt);
        setDirty(false);
        setAutosaveState("saved");
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!dirty || busy || status === "published") return;
    const timer = window.setTimeout(() => void saveDraft(true), 1500);
    return () => window.clearTimeout(timer);
  }, [documentSignature, dirty, busy, status]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (preview) {
    return (
      <div className="authoring-preview-page">
        <header className="authoring-topbar">
          <div className="authoring-breadcrumb"><span>Học liệu</span><b>/</b><strong>Xem trước</strong></div>
          <div className="authoring-top-actions">
            <span className="authoring-status"><span className="authoring-status-dot" /> Chế độ xem trước</span>
            <button className="authoring-button secondary" onClick={() => setPreview(false)}><PenLine size={15} /> Chỉnh sửa</button>
            <button className="authoring-button primary" onClick={() => void saveDraft()} disabled={busy}><Save size={15} /> Lưu bản nháp</button>
          </div>
        </header>
        <main className="authoring-preview-content">
          <div className="authoring-preview-kicker">{grade} · {topic}</div>
          <h1>{title}</h1>
          <p className="authoring-preview-summary">{summary}</p>
          {blocks.map((block, index) => (
            <article className="authoring-preview-block" key={block.id}>
              <div className="authoring-preview-block-number">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <span className="authoring-block-label">{labelForKind[block.kind]}</span>
                <h2>{block.title}</h2>
                <p>{block.content}</p>
                {(block.kind === "visual2d" || block.kind === "visual3d") && currentVisual && <Visual spec={currentVisual} compact />}
                {block.kind === "image" && imagePreview && <img src={imagePreview} alt={imageName || "Hình minh họa"} className="authoring-image-preview" />}
              </div>
            </article>
          ))}
          <div className="authoring-preview-steps">
            <div className="authoring-block-label">LỘ TRÌNH HỌC TẬP</div>
            {steps.map((step, index) => <div className="authoring-preview-step" key={step.id}><b>{index + 1}</b><span><strong>{step.title}</strong><small>{step.description}</small></span></div>)}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="authoring-page">
      <header className="authoring-topbar">
        <div className="authoring-topbar-left">
          <div className="authoring-brand">
            <span className="authoring-brand-mark" aria-hidden="true">m<span>·</span></span>
            <span>Math Studio</span><em>AI</em>
          </div>
          <div className="authoring-breadcrumb"><strong>Soạn bài học liệu</strong><b>/</b><span>{autosaveState === "saving" ? "Đang tự động lưu…" : autosaveState === "error" ? "Lưu thất bại" : dirty ? "Có thay đổi chưa lưu" : status === "published" ? "Đã xuất bản" : "Đã đồng bộ"}</span></div>
        </div>
        <div className="authoring-top-actions">
          <button className="authoring-button secondary" onClick={() => void saveDraft()} disabled={busy}><Save size={15} /> Lưu bản nháp</button>
          <button className="authoring-button secondary" onClick={() => setPreview(true)}><Eye size={15} /> Xem trước</button>
          <button className="authoring-button primary" onClick={publish} disabled={busy}><Globe2 size={15} /> Xuất bản</button>
          <span className="authoring-action-divider" aria-hidden="true" />
          <button className="authoring-button ghost" onClick={duplicateMaterial}><Copy size={15} /> Nhân bản</button>
          <button className="authoring-button secondary" onClick={share}><Link2 size={15} /> Chia sẻ</button>
        </div>
      </header>

      <main className="authoring-main">
        <div className="authoring-heading-row">
          <div>
            <div className="authoring-eyebrow"><Sparkles size={14} /> KHÔNG GIAN BIÊN SOẠN TƯƠNG TÁC</div>
            <h1>Soạn bài học liệu</h1>
            <p>Kết hợp văn bản, công thức, mô hình và hoạt động học tập trong một trải nghiệm liền mạch.</p>
          </div>
          <div className="authoring-autosave"><span className="authoring-status-dot" /> {autosaveState === "saving" ? "Đang tự động lưu…" : autosaveState === "error" ? "Lưu thất bại" : dirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"} <ChevronDown size={14} /></div>
        </div>

        {(message || error) && <div className={`authoring-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || message}<button onClick={() => { setError(""); setMessage(""); }} aria-label="Đóng thông báo"><X size={14} /></button></div>}

        <div className="authoring-workspace">
          <aside className="authoring-left-panel">
            <div className="authoring-panel-heading"><div><span className="authoring-overline">CẤU TRÚC</span><h2>Nội dung bài học</h2></div><button className="authoring-icon-button" title="Tùy chọn cấu trúc" aria-label="Tùy chọn cấu trúc"><MoreHorizontal size={17} /></button></div>
            <div className="authoring-progress"><div className="authoring-progress-top"><span>Tiến độ biên soạn</span><b>{Math.min(100, 35 + blocks.length * 7)}%</b></div><div className="authoring-progress-track"><span style={{ width: `${Math.min(100, 35 + blocks.length * 7)}%` }} /></div></div>
            <div className="authoring-outline">
              {blocks.map((block, index) => <button className={`authoring-outline-item ${activeBlockId === block.id ? "active" : ""}`} key={block.id} onClick={() => setActiveBlockId(block.id)}><span className="authoring-outline-grip"><Move size={13} /></span><span className="authoring-outline-icon">{blockIcon(block.kind)}</span><span className="authoring-outline-copy"><strong>{String(index + 1).padStart(2, "0")} {block.title}</strong><small>{labelForKind[block.kind]}</small></span><ChevronRight size={14} /></button>)}
            </div>
            <button className="authoring-add-step" onClick={addStep}><Plus size={15} /> Thêm bước học tập</button>
            <div className="authoring-left-footer"><div className="authoring-mini-stat"><b>{blocks.length}</b><span>thành phần</span></div><div className="authoring-mini-stat"><b>{steps.length}</b><span>bước học tập</span></div></div>
          </aside>

          <section className="authoring-canvas">
            <div className="authoring-document-header">
              <input className="authoring-title-input" aria-label="Tiêu đề học liệu" value={title} onChange={(event) => { setTitle(event.target.value); markDirty(); }} />
              <textarea className="authoring-summary-input" aria-label="Mô tả học liệu" value={summary} onChange={(event) => { setSummary(event.target.value); markDirty(); }} rows={2} />
              <div className="authoring-meta-chips"><span>{grade}</span><span>{topic}</span><span>{materialType === "lesson" ? "Bài học tương tác" : materialType}</span><button onClick={() => setActivePanel("assets")}><Settings2 size={13} /> Chỉnh thông tin</button></div>
            </div>

            <div className="authoring-toolbar-wrap"><div className="authoring-toolbar-label"><PenLine size={14} /> THÊM THÀNH PHẦN</div><div className="authoring-toolbar">{BLOCK_TOOLS.map((tool) => <button key={tool.kind} onClick={() => tool.kind === "image" ? fileInput.current?.click() : addBlock(tool.kind)}>{tool.icon}<span>{tool.label}</span></button>)}</div><input ref={fileInput} type="file" accept="image/*" hidden onChange={handleImage} /></div>

             {activeBlock && <article className="authoring-active-block"><div className="authoring-active-block-top"><div className="authoring-active-block-label"><span className="authoring-block-icon">{blockIcon(activeBlock.kind)}</span><span>{labelForKind[activeBlock.kind]}</span><span className="authoring-block-pill">Đang chỉnh sửa</span></div><div className="authoring-block-actions"><button onClick={duplicateBlock} title="Nhân bản"><Copy size={15} /></button><button onClick={() => removeBlock(activeBlock.id)} title="Xóa"><Trash2 size={15} /></button></div></div><input className="authoring-block-title-input" value={activeBlock.title} onChange={(event) => updateBlock(activeBlock.id, { title: event.target.value })} /><textarea className="authoring-block-editor" value={activeBlock.content} onChange={(event) => updateBlock(activeBlock.id, { content: event.target.value })} rows={activeBlock.kind === "text" ? 5 : 3} placeholder="Nhập nội dung thành phần…" />
               {activeBlock.kind === "heading" && currentVisual && <div className="authoring-visual-card authoring-hero-visual"><div className="authoring-visual-card-head"><div><span className="authoring-block-label">MÔ HÌNH MINH HỌA</span><strong>Hàm số bậc hai · Canvas 2D</strong></div><button onClick={() => setActivePanel("models")}>Tùy chỉnh <ChevronRight size={14} /></button></div><Visual spec={currentVisual} compact /></div>}
              {activeBlock.kind === "image" && <div className="authoring-image-drop" onClick={() => fileInput.current?.click()}>{imagePreview ? <img src={imagePreview} alt={imageName || "Hình ảnh đã chọn"} /> : <><Upload size={22} /><strong>Chọn hình ảnh minh họa</strong><span>PNG, JPG hoặc SVG · kéo thả vào đây</span></>}</div>}
              {(activeBlock.kind === "visual2d" || activeBlock.kind === "visual3d") && <div className="authoring-visual-card"><div className="authoring-visual-card-head"><div><span className="authoring-block-label">MÔ HÌNH ĐANG GẮN</span><strong>{activeBlock.kind === "visual2d" ? "Hàm số bậc hai · Canvas 2D" : "Hình học không gian · Canvas 3D"}</strong></div><button onClick={() => setActivePanel("models")}>Đổi mô hình <ChevronRight size={14} /></button></div>{activeBlock.kind === "visual2d" && currentVisual ? <Visual spec={currentVisual} compact /> : <div className="authoring-3d-placeholder"><Box size={28} /><strong>Khối hình học 3D</strong><span>Mô hình không gian sẽ được gắn vào bước này.</span></div>}</div>}
              {activeBlock.kind === "question" && <div className="authoring-question-options"><label>Loại câu hỏi<select value={activeBlock.questionType || "multiple"} onChange={(event) => updateBlock(activeBlock.id, { questionType: event.target.value as AuthorBlock["questionType"] })}><option value="multiple">Trắc nghiệm nhiều lựa chọn</option><option value="short">Trả lời ngắn</option><option value="drag">Kéo thả vào mô hình</option></select></label><label>Điểm số<input type="number" value={activeBlock.points ?? 1} min={0} max={100} onChange={(event) => { const points = Number(event.target.value); updateBlock(activeBlock.id, { points: Number.isFinite(points) ? points : 0 }); }} /></label></div>}
              {activeBlock.kind === "hint" && <div className="authoring-hint-box"><WandSparkles size={16} /><span>Gợi ý chỉ hiển thị khi người học yêu cầu trợ giúp.</span></div>}
            </article>}

            <section className="authoring-steps-editor"><div className="authoring-section-heading"><div><span className="authoring-overline">04 · LEARNING FLOW</span><h2>Thiết lập bước học tập</h2></div><button className="authoring-button ghost small" onClick={addStep}><Plus size={14} /> Thêm bước</button></div><div className="authoring-step-tabs">{steps.map((step, index) => <button className={activeStepId === step.id ? "active" : ""} key={step.id} onClick={() => setActiveStepId(step.id)}><b>{String(index + 1).padStart(2, "0")}</b>{step.title}</button>)}</div>{activeStep && <div className="authoring-step-form"><div className="authoring-step-fields"><input value={activeStep.title} onChange={(event) => updateStep({ title: event.target.value })} aria-label="Tên bước học tập" /><textarea value={activeStep.description} onChange={(event) => updateStep({ description: event.target.value })} rows={2} aria-label="Mô tả bước học tập" /></div><div className="authoring-action-picker"><span>Hành động trực quan gắn vào bước</span><div>{ACTIONS.map((action) => <button key={action} className={activeStep.actions.includes(action) ? "selected" : ""} onClick={() => toggleAction(action)}>{activeStep.actions.includes(action) ? <Check size={13} /> : <Plus size={13} />}{action}</button>)}</div></div></div>}</section>
          </section>

          <aside className="authoring-right-panel">
            <div className="authoring-right-tabs"><button className={activePanel === "outline" ? "active" : ""} onClick={() => setActivePanel("outline")}><PanelRight size={15} /> Trợ lý</button><button className={activePanel === "models" ? "active" : ""} onClick={() => setActivePanel("models")}><Layers3 size={15} /> Mô hình</button><button className={activePanel === "assets" ? "active" : ""} onClick={() => setActivePanel("assets")}><Settings2 size={15} /> Thiết lập</button></div>
            {activePanel === "outline" && <div className="authoring-right-content"><div className="authoring-assistant-card"><div className="authoring-assistant-icon"><Sparkles size={17} /></div><div><strong>Trợ lý thiết kế học liệu</strong><p>Gợi ý bước tiếp theo dựa trên cấu trúc bài học hiện tại.</p></div><button title="Đóng gợi ý"><X size={14} /></button></div><div className="authoring-suggestion"><span>GỢI Ý</span><p>Thêm một câu hỏi sau mô hình để kiểm tra người học có nhận ra chiều mở của parabol không.</p><button onClick={() => addBlock("question")}>Thêm câu hỏi <ChevronRight size={14} /></button></div><div className="authoring-right-section"><div className="authoring-right-section-title"><span>Hành động nhanh</span><MoreHorizontal size={15} /></div><button className="authoring-quick-action" onClick={() => addBlock("formula")}><span className="authoring-quick-icon purple">ƒx</span><span><strong>Chèn công thức</strong><small>MathLive · công thức đẹp</small></span><Plus size={15} /></button><button className="authoring-quick-action" onClick={() => setActivePanel("models")}><span className="authoring-quick-icon green"><Layers3 size={16} /></span><span><strong>Gắn mô hình</strong><small>2D hoặc 3D tương tác</small></span><Plus size={15} /></button><button className="authoring-quick-action" onClick={() => fileInput.current?.click()}><span className="authoring-quick-icon amber"><ImagePlus size={16} /></span><span><strong>Thêm hình ảnh</strong><small>{imageName || "Minh họa cho bài học"}</small></span><Plus size={15} /></button></div></div>}
            {activePanel === "models" && <div className="authoring-right-content"><div className="authoring-right-section-title"><span>Thư viện mô hình</span><span className="authoring-count">{visuals.length} mẫu</span></div><button className={`authoring-model-card ${visualKey === "quadratic-roots" ? "active" : ""}`} onClick={() => { setVisualKey("quadratic-roots"); addBlock("visual2d"); }}><div className="authoring-model-thumb model-2d"><span>y = ax²</span><i /></div><div><strong>Hàm số bậc hai</strong><small>Đồ thị 2D · 3 tham số</small></div><ChevronRight size={15} /></button><button className={`authoring-model-card ${visualKey === "triangle-thales" ? "active" : ""}`} onClick={() => { setVisualKey("triangle-thales"); addBlock("visual3d"); }}><div className="authoring-model-thumb model-3d"><Box size={24} /></div><div><strong>Hình học không gian</strong><small>Mô hình 3D · tương tác</small></div><ChevronRight size={15} /></button><button className="authoring-add-model" onClick={() => setMessage("Bạn có thể thêm mô hình mới từ Không gian giải hoặc Khám phá.")}><Plus size={15} /> Thêm mô hình từ thư viện</button></div>}
            {activePanel === "assets" && <div className="authoring-right-content"><div className="authoring-right-section-title"><span>Thông tin học liệu</span><Settings2 size={15} /></div><label className="authoring-field">Chủ đề<input value={topic} onChange={(event) => { setTopic(event.target.value); markDirty(); }} /></label><label className="authoring-field">Cấp độ<select value={grade} onChange={(event) => { setGrade(event.target.value); markDirty(); }}><option>Lớp 10</option><option>Lớp 11</option><option>Lớp 12</option><option>Toán cao cấp</option></select></label><label className="authoring-field">Loại học liệu<select value={materialType} onChange={(event) => { setMaterialType(event.target.value as Material["metadata"]["type"]); markDirty(); }}><option value="lesson">Bài học tương tác</option><option value="exploration">Khám phá</option><option value="problem">Bài giải</option><option value="exercise">Bài tập</option></select></label><label className="authoring-field">Thẻ phân loại<input value={tags} onChange={(event) => { setTags(event.target.value); markDirty(); }} /></label><label className="authoring-field">Quyền chia sẻ<select value={visibility} onChange={(event) => { setVisibility(event.target.value as Material["visibility"]); markDirty(); }}><option value="private">Chỉ mình tôi</option><option value="link">Người có liên kết</option><option value="school">Trong trường</option><option value="public">Công khai</option></select></label><div className="authoring-feature-list"><span><Check size={14} /> Xem trước trước khi xuất bản</span><span><Check size={14} /> Lưu bản nháp tự động</span><span><Check size={14} /> Cho phép tiếp tục phiên học</span></div></div>}
            <div className="authoring-right-footer"><div className="authoring-storage-dot" /><span>{status === "published" ? "Học liệu đã xuất bản" : autosaveState === "saving" ? "Đang lưu bản nháp" : dirty ? "Có thay đổi chưa lưu" : "Bản nháp đã được lưu"}</span></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
