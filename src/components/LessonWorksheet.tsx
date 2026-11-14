"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Printer } from "lucide-react";
import type { Material } from "@/lib/contracts";
import type { ExploreRuntime } from "./explore/shared";
import { FormattedAIAnswer } from "./FormattedMath";
import { LessonBoardView } from "./LessonBoardView";
import { MaterialImage } from "./MaterialImage";
import { ReadonlyFormula } from "./MaterialReader";
import { Visual } from "./Visual";

export function LessonWorksheet({ material }: { material: Material }) {
  const paper = useRef<HTMLElement>(null);
  const runtimes = useRef(new Map<string, ExploreRuntime>());
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const byId = new Map(material.blocks.map((block) => [block.id, block]));
  const assigned = new Set(material.learningSteps.flatMap((step) => step.blockIds));
  const remaining = material.blocks.filter((block) => !assigned.has(block.id));
  const steps = material.learningSteps.map((step) => ({
    ...step, blocks: step.blockIds.flatMap((id) => byId.get(id) || []),
  }));

  async function printWorksheet() {
    const root = paper.current;
    if (busy || !root) return;
    setBusy(true);
    setError("");
    try {
      const { exportBoardCanvas } = await import("@/lib/board-export");
      const figures = [...root.querySelectorAll<HTMLElement>("[data-worksheet-figure]")];
      const started = performance.now();
      while (root.querySelector(".worksheet-source-image:not(:has(img)), .reader-formula:not(:has(math-field)), .formatted-ai-math:not(:has(math-field))") ||
        figures.some((figure) => !runtimes.current.has(figure.dataset.worksheetFigure!))) {
        if (performance.now() - started > 4500) throw Error("Một số hình hoặc công thức chưa sẵn sàng. Hãy kiểm tra nội dung rồi thử lại.");
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      await Promise.all([...root.querySelectorAll<HTMLImageElement>(".worksheet-source-image img")].map((image) => image.decode()));
      await document.fonts.ready;
      const prepared: Record<string, string> = {};
      for (const figure of figures) {
        const id = figure.dataset.worksheetFigure!;
        const stage = figure.querySelector<HTMLElement>(".math-board-stage");
        const runtime = runtimes.current.get(id);
        if (!stage || !runtime) throw Error("Chưa đọc được hình minh họa trong phiếu.");
        prepared[id] = (await exportBoardCanvas(stage, runtime)).toDataURL("image/png");
      }
      if (paper.current !== root) return;
      flushSync(() => setSnapshots(prepared));
      await Promise.all([...root.querySelectorAll<HTMLImageElement>(".worksheet-print-image")].map((image) => image.decode()));
      if (paper.current === root) window.print();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tạo được bản in.");
    } finally {
      setBusy(false);
    }
  }

  function renderBlock(block: Material["blocks"][number]) {
    const title = block.title && block.title !== block.content ? <h3>{block.title}</h3> : null;
    if (block.type === "visual") {
      const spec = material.visuals.find((item) => item.id === block.visualId);
      if (!spec && !block.board) return <p key={block.id}>Hình minh họa chưa được gắn vào hoạt động.</p>;
      const onReady = (runtime: ExploreRuntime) => runtimes.current.set(block.id, runtime);
      const alt = block.title || spec?.accessibility?.description || "Hình minh họa";
      return <figure key={block.id} data-worksheet-figure={block.id} className={snapshots[block.id] ? "has-print-image" : undefined}>
        <div className="worksheet-live-visual">
          {block.board ? <LessonBoardView board={block.board} spec={spec || null} onReady={onReady} />
            : <Visual spec={spec!} onRuntimeReady={onReady} />}
        </div>
        {snapshots[block.id] && <img className="worksheet-print-image" src={snapshots[block.id]} alt={alt} />}
        {(block.content || block.title) && <figcaption>{block.content || block.title}</figcaption>}
      </figure>;
    }
    if (block.authorKind === "image") return block.content && <figure key={block.id} className="worksheet-source-image">
      <MaterialImage src={block.content} alt={block.title || "Hình minh họa"} />
      {block.title && <figcaption>{block.title}</figcaption>}
    </figure>;
    if (block.type === "heading") return <h3 key={block.id}>{block.content}</h3>;
    if (block.type === "math") return <div key={block.id}>{title}<ReadonlyFormula latex={block.content} /></div>;
    return <div key={block.id} className={block.type === "exercise" ? "worksheet-exercise" : undefined}>
      {title}
      <FormattedAIAnswer text={block.content} />
      {block.type === "exercise" && (block.assessment?.options?.length
        ? <ol type="A">{block.assessment.options.map((option, index) => <li key={index}><FormattedAIAnswer text={option} /></li>)}</ol>
        : <div className="worksheet-writing-lines" aria-label="Chỗ ghi lời giải"><span /><span /></div>)}
    </div>;
  }

  return <section className="lesson-worksheet">
    <div className="worksheet-tools">
      <p>Bản học sinh · Khổ A4</p>
      <button className="gs-primary" type="button" disabled={busy} onClick={() => void printWorksheet()}>
        <Printer size={16} /> {busy ? "Đang chuẩn bị…" : "In / Lưu PDF"}
      </button>
    </div>
    {error && <p className="gs-alert worksheet-error" role="alert">{error}</p>}
    <article className="lesson-worksheet-paper" ref={paper}>
      <header>
        <p className="worksheet-kicker">PHIẾU HỌC TẬP{material.metadata.grade.trim() && ` · ${/^lớp\s/i.test(material.metadata.grade) ? material.metadata.grade : `Lớp ${material.metadata.grade}`}`}</p>
        <h1>{material.title}</h1>
        {material.summary && <p>{material.summary}</p>}
        <p className="worksheet-student">Họ và tên ........................................................... Lớp ....................</p>
      </header>
      {steps.map((step, index) => <section className="worksheet-activity" key={step.id}>
        <h2><span>{String(index + 1).padStart(2, "0")}</span>{step.title}</h2>
        {step.objective && <p className="worksheet-objective"><strong>Mục tiêu</strong> · {step.objective}</p>}
        {step.description && <FormattedAIAnswer text={step.description} />}
        {step.blocks.map(renderBlock)}
      </section>)}
      {remaining.length > 0 && <section className="worksheet-activity">{remaining.map(renderBlock)}</section>}
    </article>
  </section>;
}
