"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { Material } from "@/lib/contracts";
import { FormattedAIAnswer } from "./FormattedMath";
import { buildStudioSlides, isSlideTheme, StudioSlide, type SlideTheme, type SlideVisualCommand } from "./StudioSlideDeck";

export function StudioProjector() {
  const params = useSearchParams();
  const key = params.get("channel") || "";
  const start = params.get("slide") || "cover";
  const [material, setMaterial] = useState<Material | null>(null);
  const [theme, setTheme] = useState<SlideTheme>("jade");
  const [selected, setSelected] = useState(start);
  const [reveal, setReveal] = useState("");
  const [stage, setStage] = useState(0);
  const [visualCommand, setVisualCommand] = useState<SlideVisualCommand>();
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const slides = useMemo(() => material ? buildStudioSlides(material) : [], [material]);
  const index = Math.max(0, slides.findIndex(({ id }) => id === selected));
  const slide = slides[index];
  const currentSlides = useRef(slides);
  currentSlides.current = slides;
  const navigate = useCallback((slideId: string) => {
    const next = currentSlides.current.find(({ id }) => id === slideId);
    if (!next) return;
    setSelected(next.id);
    setStage(0);
    setReveal("");
    setVisualCommand(undefined);
    channel.current?.postMessage({ type: "slide", slideId: next.id });
    if (next.step) channel.current?.postMessage({ type: "navigate", stepId: next.step.id });
  }, []);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(key)) return;
    const bus = new BroadcastChannel(`studio-present:${key}`);
    channel.current = bus;
    let connected = false;
    const notify = () => { if (!connected) bus.postMessage({ type: "ready" }); };
    bus.onmessage = ({ data }) => {
      if (data?.type === "init" && data.material?.id) {
        setMaterial(data.material);
        if (isSlideTheme(data.theme)) setTheme(data.theme);
        if (!connected) {
          connected = true;
          const initial = buildStudioSlides(data.material).find(({ id }) => id === start);
          if (initial?.step) bus.postMessage({ type: "navigate", stepId: initial.step.id });
        }
      } else if (data?.type === "step") {
        const first = currentSlides.current.find(({ step }) => step?.id === data.stepId);
        if (first) { setSelected(first.id); setStage(0); setReveal(""); setVisualCommand(undefined); }
      } else if (data?.type === "theme" && isSlideTheme(data.theme)) setTheme(data.theme);
      else if (data?.type === "select-slide" && typeof data.slideId === "string") navigate(data.slideId);
      else if (data?.type === "set-slide-stage") setStage(data.stage === 1 ? 1 : 0);
      else if (data?.type === "slide-visual" && typeof data.command?.slideId === "string") setVisualCommand(data.command);
      else if (data?.type === "reveal") setReveal(typeof data.answer === "string" ? data.answer : "");
    };
    notify();
    const timer = window.setInterval(notify, 800);
    return () => { window.clearInterval(timer); channel.current = null; bus.close(); };
  }, [key, start, navigate]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
        || (event.target instanceof HTMLElement && (event.target.closest("input,select,textarea,summary,math-field,[contenteditable],.visual-shell,.studio-projector-reveal")
          || (event.key === " " && event.target.closest("button"))))) return;
      const next = event.key === "ArrowRight" || event.key === "PageDown" || event.key === " " ? index + 1
        : event.key === "ArrowLeft" || event.key === "PageUp" ? index - 1
        : event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      if (slides[next]) navigate(slides[next].id);
    }
    const onFullscreen = () => setFullscreen(document.fullscreenElement === root.current);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [slides, index, navigate]);

  return <main className="studio-projector" ref={root}>
    {material && slide ? <>
      <StudioSlide material={material} slide={slide} theme={theme} index={index} total={slides.length} revealStage={stage} visualCommand={visualCommand} />
      <nav className="studio-slide-controls" aria-label="Điều hướng trình chiếu">
        <button type="button" aria-label="Slide trước" disabled={!index} onClick={() => navigate(slides[index - 1].id)}><ChevronLeft size={20} /></button>
        <span aria-live="polite">{index + 1} / {slides.length}</span>
        <button type="button" aria-label="Slide tiếp" disabled={index === slides.length - 1} onClick={() => navigate(slides[index + 1].id)}><ChevronRight size={20} /></button>
        {(slide.example || (slide.layout === "question" && (slide.hint || slide.block?.assessment?.options?.length))) &&
          <button type="button" onClick={() => {
            const next = stage ? 0 : 1; setStage(next); channel.current?.postMessage({ type: "slide-stage", stage: next });
          }}>{stage ? "Ẩn phần hiện thêm" : slide.example ? "Hiện các bước giải" : "Hiện lựa chọn và gợi ý"}</button>}
        {root.current?.requestFullscreen && <button type="button" aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
          onClick={() => void (fullscreen ? document.exitFullscreen() : root.current!.requestFullscreen()).catch(() => {})}>
          {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
        </button>}
      </nav>
      {reveal && <aside className="studio-projector-reveal">
        <header><strong>Giải thích thêm</strong><button type="button" aria-label="Đóng giải thích" onClick={() => setReveal("")}><X size={18} /></button></header>
        <FormattedAIAnswer text={reveal} compactDisplaySpacing />
      </aside>}
    </> : <p role="status">{key ? "Đang kết nối với màn điều khiển của giáo viên…" : "Mở trình chiếu từ phần Dạy thử của bài giảng."}</p>}
  </main>;
}
