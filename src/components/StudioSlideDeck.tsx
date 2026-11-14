"use client";

import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { Material } from "@/lib/contracts";
import { publicMaterial } from "@/lib/public-material";
import { FormattedAIAnswer, splitFormattedMath } from "./FormattedMath";
import { ReadonlyFormula } from "./MaterialReader";
import { MaterialImage } from "./MaterialImage";
import { LessonBoardView } from "./LessonBoardView";
import { Visual } from "./Visual";

export const slideThemes = [
  { id: "jade", name: "Ngọc lục bảo" },
  { id: "ink", name: "Xanh đêm" },
  { id: "paper", name: "Giấy kem" },
] as const;
export type SlideTheme = typeof slideThemes[number]["id"];
export function isSlideTheme(value: unknown): value is SlideTheme {
  return slideThemes.some(({ id }) => id === value);
}

type Step = Material["learningSteps"][number];
type Block = Material["blocks"][number];
type SlidePlan = NonNullable<Material["slidePlan"]>;
export type SlideVisualCommand = { slideId: string; parameter?: string; value?: number };
type Slide = { id: string; title: string; layout: "cover" | "text" | "formula" | "media" | "question";
  step?: Step; block?: Block; media?: Block; formula?: Block; text?: string; objective?: string; continuation?: boolean;
  example?: boolean; arrangement?: SlidePlan[number]["layout"]; sources?: string[]; hint?: string; };

const phases: Record<Step["phase"], string> = {
  warmup: "Khởi động", objective: "Mục tiêu", explore: "Khám phá", concept: "Kiến thức",
  practice: "Luyện tập", assess: "Đánh giá", summary: "Tổng kết",
};

function paginate(text: string, limit = 540) {
  const pages: string[] = [];
  let current = "";
  const tokens = splitFormattedMath(text).flatMap((part) => part.type === "math"
    ? [part.display ? `$$${part.value}$$` : `$${part.value}$`]
    : part.value.match(/\S+|\s+/g) ?? []);
  for (const token of tokens) {
    if (current.trim() && token.trim() && current.length + token.length > limit) {
      pages.push(current.trim());
      current = "";
    }
    current += token;
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}

function automaticSlides(material: Material): Slide[] {
  const [coverText, ...summaryPages] = paginate(material.summary, 300);
  const slides: Slide[] = [{ id: "cover", layout: "cover", title: material.title, text: coverText }];
  summaryPages.forEach((page, index) => {
    slides.push({ id: `summary:${index}`, title: "Giới thiệu bài học", layout: "text", text: page, continuation: true });
  });
  const blocks = new Map(material.blocks.map((block) => [block.id, block]));
  const assigned = new Set(material.learningSteps.flatMap((step) => step.blockIds));
  const rich = material.blocks.some(({ teachingRole }) => teachingRole === "example");
  function addBlock(block: Block, step?: Step, media?: Block, formula?: Block) {
    const id = `${step?.id ?? "loose"}:${block.id}`;
    const heading = block.type === "heading";
    const title = (heading ? block.content : block.title) || step?.title || material.title;
    const layout = block.type === "visual" || block.authorKind === "image" ? "media" : block.type === "math" ? "formula"
      : block.type === "exercise" ? "question" : "text";
    const text = heading || block.content === title ? "" : block.content;
    if (layout !== "text") {
      const hint = layout === "question" ? step?.blockIds.map((item) => blocks.get(item)).find((item) => item?.authorKind === "hint")?.content : undefined;
      slides.push({ id, title, layout, step, block, text, hint, media: layout === "question" ? media : undefined });
      return;
    }
    const pages = paginate(text);
    (pages.length ? pages : [""]).forEach((page, index) => {
      slides.push({ id: `${id}:${index}`, title, layout, step, text: page, continuation: index > 0,
        example: block.teachingRole === "example", media: index === 0 ? media : undefined, formula: index === 0 ? formula : undefined });
    });
  }
  for (const step of material.learningSteps) {
    const children = [...new Set(step.blockIds)].flatMap((id) => blocks.get(id) ?? []);
    const concept = rich && children.find((block) => block.type === "paragraph" && !block.teachingRole && block.authorKind !== "image");
    const canEmbedObjective = concept && step.objective.length <= 150 && !step.description;
    if (!canEmbedObjective && (step.objective || step.description || !children.length)) {
      const objectives = paginate(step.objective, 420);
      const description = paginate(step.description, objectives.length ? 360 : 540);
      const [first, ...rest] = objectives.length === 1 && objectives[0].length <= 160 ? description : [];
      const pages = [
        ...objectives.map((objective, index) => ({ objective, text: index === 0 ? first : undefined })),
        ...(first ? rest : description).map((text) => ({ text })),
      ];
      (pages.length ? pages : [{}]).forEach((page, index) => {
        slides.push({ id: `${step.id}:intro:${index}`, title: step.title, layout: "text", step, ...page, continuation: index > 0 });
      });
    }
    const illustration = concept && children.find((block) => block.type === "visual" || block.authorKind === "image");
    const formula = concept && children.find((block) => block.type === "math");
    let precedingMedia: Block | undefined;
    for (const block of children) {
      if (block.type === "visual" || block.authorKind === "image") precedingMedia = block;
      if (block === illustration || block === formula) continue;
      const position = slides.length;
      addBlock(block, step, block === concept ? illustration || undefined : block.type === "exercise" ? precedingMedia : undefined,
        block === concept ? formula || undefined : undefined);
      if (canEmbedObjective && block === concept && slides[position]) slides[position].objective = step.objective;
    }
  }
  material.blocks.filter((block) => !assigned.has(block.id)).forEach((block) => addBlock(block));
  return slides;
}

export function buildStudioSlides(material: Material): Slide[] {
  const base = automaticSlides(material);
  if (!material.slidePlan?.length) return base;
  const byId = new Map(base.map((slide) => [slide.id, slide]));
  const used = new Set<string>();
  const custom = material.slidePlan.flatMap((item): Slide[] => {
    const sources = item.sources.filter((id) => byId.has(id) && !used.has(id));
    const first = sources.length ? byId.get(sources[0]) : undefined;
    if (!first && !(item.sources.length === 0 && item.text?.trim())) return [];
    sources.forEach((id) => used.add(id));
    return [{ ...(first || { layout: "text" }), id: item.id, title: item.title || first?.title || material.title,
      text: item.text ?? first?.text, arrangement: item.layout, sources }];
  });
  return [...custom, ...base.filter(({ id }) => !used.has(id))];
}

export function StudioSlide({ material, slide, theme, index, total, revealStage = 2, visualCommand }: {
  material: Material; slide: Slide; theme: SlideTheme; index: number; total: number; revealStage?: number;
  visualCommand?: SlideVisualCommand;
}) {
  const block = slide.block;
  const media = slide.layout === "media" ? block : slide.media;
  const visual = media?.visualId ? material.visuals.find(({ id }) => id === media.visualId) : undefined;
  const live = useRef<{ id: string; runtime: NonNullable<ComponentRef<typeof Visual>> } | null>(null);
  function applyCommand(runtime: NonNullable<ComponentRef<typeof Visual>>, command?: SlideVisualCommand) {
    if (command?.slideId !== slide.id) return;
    if (!command.parameter) { runtime.actions([{ type: "reset" }]); return; }
    const parameter = visual?.parameters.find(({ id }) => id === command.parameter);
    const value = command.value;
    if (parameter && typeof value === "number" && Number.isFinite(value) && value >= parameter.min && value <= parameter.max
      && "setParameter" in runtime) runtime.setParameter(parameter.id, value);
  }
  useEffect(() => {
    if (live.current?.id === slide.id) applyCommand(live.current.runtime, visualCommand);
  }, [visualCommand]);
  const ready = (runtime: NonNullable<ComponentRef<typeof Visual>>) => {
    live.current = { id: slide.id, runtime };
    if (visual && slide.step?.visualId === visual.id && slide.step.visualActions.length) runtime.actions(slide.step.visualActions);
    applyCommand(runtime, visualCommand);
  };
  const { grade, topic } = material.metadata;
  const context = [topic, grade.trim() && (/^lớp\s/iu.test(grade) ? grade : `Lớp ${grade}`)].filter(Boolean).join(" · ");
  const subtitle = [slide.step && phases[slide.step.phase], slide.continuation && "Tiếp theo"].filter(Boolean).join(" · ");
  const figure = media && <figure className="studio-slide-figure">
    {media.authorKind === "image" ? (media.content && <MaterialImage src={media.content} alt={media.title || "Hình minh họa"} />)
      : media.board ? <LessonBoardView board={media.board} spec={visual || null} onReady={ready} />
      : visual ? <Visual spec={visual} onRuntimeReady={ready} /> : <p>Mô hình chưa có trong bài.</p>}
    {media.authorKind !== "image" && media.content && media.content !== slide.title && <figcaption><FormattedAIAnswer text={media.content} /></figcaption>}
  </figure>;
  const [opening, ...details] = (slide.text || "").split(/\n\s*\n|\n(?=(?:Bước|Lời giải|Kết luận)\b)/iu);
  return <section className="studio-slide" data-slide-theme={theme} data-layout={slide.layout} data-example={slide.example || undefined} aria-label="Màn trình chiếu 16:9">
    <div className="studio-slide-page" key={slide.id}>
      <header className="studio-slide-heading">
        {slide.layout === "cover" && context && <p>{context}</p>}
        {slide.layout !== "cover" && subtitle && <p>{subtitle}</p>}
        <h2>{slide.title}</h2>
      </header>
      <div className="studio-slide-body" data-split={slide.media && slide.arrangement !== "stack" ? "true" : undefined}
        data-stacked={slide.media && slide.arrangement === "stack" ? "true" : undefined} tabIndex={0}>
        {slide.layout === "cover" && slide.text && <FormattedAIAnswer text={slide.text} compactDisplaySpacing />}
        {slide.layout === "text" && <div className="studio-slide-text">
          {slide.objective && <div className="studio-slide-objective"><strong>Mục tiêu</strong><FormattedAIAnswer text={slide.objective} /></div>}
          {slide.text && (slide.example && details.length ? <>
            <div className="studio-example-prompt"><strong>Đề bài</strong><FormattedAIAnswer text={opening} compactDisplaySpacing /></div>
            {revealStage > 0 && <ol className="studio-example-steps">{details.map((part, index) => <li key={index}>
              <FormattedAIAnswer text={part} compactDisplaySpacing />
            </li>)}</ol>}
          </> : <FormattedAIAnswer text={slide.text} compactDisplaySpacing />)}
          {slide.formula && <div className="studio-slide-formula-card"><ReadonlyFormula latex={slide.formula.content} /></div>}
        </div>}
        {slide.layout === "formula" && block && <ReadonlyFormula latex={block.content} />}
        {slide.layout === "media" && figure}
        {slide.layout === "question" && block && <div className="studio-slide-question">
          <FormattedAIAnswer text={block.content} compactDisplaySpacing />
          {revealStage >= 1 && !!block.assessment?.options?.length && <ol className="studio-slide-options" type="A">
            {block.assessment.options.map((option, number) => <li key={number}><FormattedAIAnswer text={option} /></li>)}
          </ol>}
          {revealStage >= 1 && slide.hint && <div className="studio-slide-objective"><strong>Gợi ý</strong><FormattedAIAnswer text={slide.hint} /></div>}
        </div>}
        {slide.media && figure}
      </div>
      <footer className="studio-slide-footer"><span>{slide.layout !== "cover" && material.title}</span><span>{index + 1} / {total}</span></footer>
    </div>
  </section>;
}

export function StudioSlidePreview({ material, theme, onTheme, channel, onOpen, onPlan }: {
  material: Material; theme: SlideTheme; onTheme: (theme: SlideTheme) => void; channel: string; onOpen: (slideId: string) => void;
  onPlan?: (plan: Material["slidePlan"]) => void;
}) {
  const audience = useMemo(() => publicMaterial(material), [material]);
  const slides = useMemo(() => buildStudioSlides(audience), [audience]);
  const [selected, setSelected] = useState("cover");
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState(0);
  const [dragging, setDragging] = useState("");
  const [visualCommand, setVisualCommand] = useState<SlideVisualCommand>();
  const [parameterValues, setParameterValues] = useState<Record<string, number>>({});
  const connection = useRef<BroadcastChannel | null>(null);
  const index = Math.max(0, slides.findIndex(({ id }) => id === selected));
  const slide = slides[index];
  const selectedPlan = material.slidePlan?.find(({ id }) => id === slide.id);
  const privateBlock = material.blocks.find(({ id }) => id === slide.block?.id);
  const solution = privateBlock?.assessment?.explanation || privateBlock?.assessment?.answer;
  const currentVisualId = (slide.media || slide.block)?.visualId;
  const currentVisual = audience.visuals.find(({ id }) => id === currentVisualId);
  useEffect(() => {
    if (!channel) return;
    const bus = new BroadcastChannel(`studio-present:${channel}`);
    connection.current = bus;
    bus.onmessage = ({ data }) => {
      if (data?.type === "slide" && slides.some(({ id }) => id === data.slideId)) { setSelected(data.slideId); setStage(0); setParameterValues({}); setVisualCommand(undefined); }
      if (data?.type === "slide-stage") setStage(data.stage === 1 ? 1 : 0);
      if (data?.type === "step") {
        const first = slides.find(({ step }) => step?.id === data.stepId);
        if (first) { setSelected(first.id); setStage(0); setParameterValues({}); setVisualCommand(undefined); }
      }
    };
    return () => { connection.current = null; bus.close(); };
  }, [channel, slides]);
  function select(position: number) {
    const next = slides[position];
    if (!next) return;
    setSelected(next.id);
    setStage(0);
    setParameterValues({});
    setVisualCommand(undefined);
    connection.current?.postMessage({ type: "select-slide", slideId: next.id });
  }
  function controlVisual(parameter?: string, value?: number) {
    const command = { slideId: slide.id, parameter, value };
    setVisualCommand(command);
    setParameterValues((current) => parameter && value !== undefined ? { ...current, [parameter]: value } : {});
    connection.current?.postMessage({ type: "slide-visual", command });
  }
  function plan() {
    return slides.map((item) => material.slidePlan?.find(({ id }) => id === item.id) ?? { id: item.id, sources: item.sources ?? [item.id] });
  }
  function patchSlide(values: Partial<SlidePlan[number]>) {
    onPlan?.(plan().map((item) => item.id === slide.id ? { ...item, ...values } : item));
  }
  function move(from: number, to: number) {
    if (from < 0 || to < 0 || to >= slides.length || from === to) return;
    const next = plan();
    next.splice(to, 0, next.splice(from, 1)[0]);
    onPlan?.(next);
  }
  function splitSlide() {
    const text = slide.text?.trim();
    if (!text || text.length < 30) return;
    const pages = paginate(text, Math.ceil(text.length / 2));
    if (pages.length < 2) return;
    const next = plan();
    next[index] = { ...next[index], text: pages[0] };
    next.splice(index + 1, 0, { id: `custom:${crypto.randomUUID()}`, sources: [], title: slide.title, text: pages.slice(1).join("\n\n") });
    onPlan?.(next);
  }
  const following = slides[index + 1];
  const mergeText = slide.layout === "text" && following?.layout === "text" && !following.objective && !following.formula && !following.media
    && !following.example && !material.slidePlan?.find(({ id }) => id === following.id)?.notes
    ? [slide.text, following.text].filter(Boolean).join("\n\n") : "";
  function mergeSlide() {
    if (!mergeText || mergeText.length > 6000) return;
    const next = plan();
    const sources = [...next[index].sources, ...next[index + 1].sources];
    if (sources.length > 20) return;
    next.splice(index, 2, { ...next[index], sources, text: mergeText });
    onPlan?.(next);
  }
  return <div className="studio-deck-preview">
    <div className="studio-deck-toolbar">
      <div className="studio-theme-picker" role="group" aria-label="Theme slide">
        {slideThemes.map(({ id, name }) => <button key={id} type="button" data-slide-theme={id} aria-pressed={theme === id} onClick={() => onTheme(id)}>
          <span aria-hidden="true" className="studio-theme-swatch" />{name}
        </button>)}
      </div>
      <button type="button" className="gs-primary" onClick={() => onOpen(slide.id)}><Play size={16} /> Mở màn trình chiếu</button>
    </div>
    <div className="studio-deck-workspace">
      <nav className="studio-slide-strip" aria-label="Danh sách slide">
        {slides.map((item, position) => <button key={item.id} type="button" aria-current={index === position ? "page" : undefined}
          draggable={!!onPlan && editing} onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); setDragging(item.id); }} onDragEnd={() => setDragging("")}
          onDragOver={(event) => { if (dragging) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); move(slides.findIndex(({ id }) => id === dragging), position); setDragging(""); }}
          data-slide-theme={theme} onClick={() => select(position)}>
          <span className="studio-slide-thumb" data-layout={item.layout} aria-hidden="true"><i /><i /><i /></span>
          <span><small>{position + 1}</small> {item.title}{item.continuation ? " · Tiếp theo" : ""}</span>
        </button>)}
      </nav>
      <div className="studio-deck-stage">
        <StudioSlide material={audience} slide={slide} theme={theme} index={index} total={slides.length} revealStage={channel ? stage : 2} visualCommand={visualCommand} />
        <nav className="studio-slide-controls" aria-label="Điều hướng xem trước">
          <button type="button" aria-label="Slide trước" disabled={!index} onClick={() => select(index - 1)}><ChevronLeft size={18} /></button>
          <span>{index + 1} / {slides.length}</span>
          <button type="button" aria-label="Slide tiếp" disabled={index === slides.length - 1} onClick={() => select(index + 1)}><ChevronRight size={18} /></button>
        </nav>
      </div>
    </div>
    {onPlan && <div className="studio-slide-edit-tools">
      <button type="button" className="gs-secondary" aria-expanded={editing} onClick={() => setEditing(!editing)}>Chỉnh slide</button>
      {editing && <>
        <button type="button" className="gs-secondary" disabled={!index} onClick={() => move(index, index - 1)}>Đưa lên</button>
        <button type="button" className="gs-secondary" disabled={!following} onClick={() => move(index, index + 1)}>Đưa xuống</button>
        <button type="button" className="gs-secondary" disabled={slide.layout !== "text" || (slide.text?.length ?? 0) < 30 || slides.length >= 500} onClick={splitSlide}>Tách chữ</button>
        <button type="button" className="gs-secondary" disabled={!mergeText || mergeText.length > 6000} onClick={mergeSlide}>Gộp với slide kế</button>
        <div className="studio-slide-editor">
          <label>Tiêu đề slide<input maxLength={200} value={selectedPlan?.title ?? slide.title} onChange={(event) => patchSlide({ title: event.target.value })} /></label>
          {slide.media && <label>Bố cục<select aria-label="Bố cục" value={slide.arrangement || "auto"} onChange={(event) => patchSlide({ layout: event.target.value as SlidePlan[number]["layout"] })}>
            <option value="auto">Tự động</option><option value="split">Chữ cạnh hình</option><option value="stack">Hình rộng dưới nội dung</option>
          </select></label>}
          {(slide.layout === "text" || slide.layout === "cover") && <label>Nội dung trên slide<textarea rows={4} maxLength={6000} value={slide.text || ""}
            onChange={(event) => patchSlide({ text: event.target.value })} /></label>}
          <label>Ghi chú riêng của giáo viên<textarea rows={3} maxLength={2000} value={selectedPlan?.notes || ""}
            onChange={(event) => patchSlide({ notes: event.target.value })} /></label>
        </div>
      </>}
    </div>}
    {channel && <section className="studio-presenter-console" aria-label="Điều khiển của giáo viên">
      <div><strong>Slide tiếp theo</strong><p>{following?.title || "Đã đến cuối bài"}</p></div>
      <div><strong>Ghi chú riêng</strong><p>{selectedPlan?.notes || "Chưa có ghi chú cho slide này."}</p></div>
      {currentVisual && <div className="studio-presenter-visual"><strong>Điều khiển mô hình</strong>
        {currentVisual.parameters.map((parameter) => <label key={parameter.id}>
          <span>{parameter.label} · {parameterValues[parameter.id] ?? parameter.value}</span>
          <input aria-label={`Điều khiển ${parameter.label}`} type="range" min={parameter.min} max={parameter.max} step={parameter.step}
            value={parameterValues[parameter.id] ?? parameter.value} onChange={(event) => controlVisual(parameter.id, +event.target.value)} />
        </label>)}
        <button type="button" className="gs-secondary" onClick={() => controlVisual()}>Đặt lại mô hình trên màn chiếu</button>
      </div>}
      <div className="studio-slide-edit-tools">
        {(slide.layout === "question" || slide.example) && <button type="button" className="gs-secondary" onClick={() => {
          const next = stage ? 0 : 1; setStage(next); connection.current?.postMessage({ type: "set-slide-stage", stage: next });
        }}>{stage ? "Ẩn phần hiện thêm" : slide.example ? "Hiện các bước giải" : "Hiện lựa chọn và gợi ý"}</button>}
        {solution && <button type="button" className="gs-secondary" onClick={() => connection.current?.postMessage({ type: "reveal", answer: solution })}>Chiếu lời giải</button>}
        {solution && <button type="button" className="gs-secondary" onClick={() => connection.current?.postMessage({ type: "reveal", answer: "" })}>Ẩn lời giải</button>}
      </div>
    </section>}
  </div>;
}
