"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/client";
import { createRuntime } from "@/lib/runtime";
import { createThreeRuntime } from "@/lib/three-runtime";
import { isThreeVisual, type Material } from "@/lib/contracts";
import { MaterialImage } from "./MaterialImage";
import { ReadonlyFormula } from "./MaterialReader";
import { ExamPreview } from "./ExamPreview";
import { useAuth } from "./AuthProvider";
import { ownsMaterial } from "@/lib/auth/types";
export function PrintPage({ id }: { id: string }) {
  const user = useAuth();
  const [material, setMaterial] = useState<Material | null>(null),
    [images, setImages] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [imageReady, setImageReady] = useState<Record<string, boolean>>({}),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    request<Material>(`/api/materials/${id}`)
      .then(async (m) => {
        if (cancelled) return;
        setMaterial(m);
        if (m.exam) return;
        const { default: JXG } = await import("jsxgraph");
        if (cancelled) return;
        const output: Record<string, string> = {};
        for (const spec of m.visuals) {
          const div = document.createElement("div");
          div.id = "print_" + spec.id;
          div.style.cssText = "width:760px;height:420px";
          host.current!.appendChild(div);
          if (isThreeVisual(spec)) {
            const runtime = createThreeRuntime(div, spec);
            try {
              output[spec.id] = runtime.snapshot();
            } finally {
              runtime.destroy();
              div.remove();
            }
          } else {
            const runtime = createRuntime(JXG, div.id, spec);
            try {
              const svg = runtime.snapshot();
              if (!svg) throw Error("Không tạo được SVG");
              output[spec.id] =
                "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
            } finally {
              runtime.destroy();
              div.remove();
            }
          }
        }
        if (!cancelled) {
          setImages(output);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (material?.exam) return <ExamPreview material={material} canShowAnswers={ownsMaterial(user, material.ownerId)} />;
  const orderedBlocks = material?.learningSteps.length
    ? material.learningSteps.flatMap((step) => step.blockIds.flatMap((blockId) => {
        const block = material.blocks.find((item) => item.id === blockId);
        return block ? [block] : [];
      }))
    : material?.blocks || [];
  const printable = ready && orderedBlocks.filter((block) => block.authorKind === "image" && block.content).every((block) => imageReady[block.id]);
  return (
    <div className="print-page">
      <div className="print-controls">
        <a href="/">← Thư viện</a>
        <p>
          Bản in dùng trạng thái visual đã lưu. Chọn “Save as PDF” trong hộp
          thoại in.
        </p>
        <button
          className="primary"
          disabled={!printable}
          onClick={() => window.print()}
        >
          {printable ? "In / Lưu PDF" : "Đang chuẩn bị bản in…"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div
        ref={host}
        style={{ position: "fixed", left: -10000, top: 0 }}
        aria-hidden="true"
      />
      {material && (
        <article className="reader">
          <h1>{material.title}</h1>
          <p>{material.summary}</p>
          <p className="muted">
            {[material.metadata.topic, gradeLabel(material.metadata.grade)].filter(Boolean).join(" · ")}
          </p>
          {orderedBlocks.map((b) =>
            b.type === "visual" ? (
              <figure key={b.id}>
                {images[b.visualId!] && (
                  <img
                    src={images[b.visualId!]}
                    alt={
                      material.visuals.find((v) => v.id === b.visualId)
                        ?.accessibility?.description || b.content
                    }
                    width="760"
                    height="420"
                  />
                )}
                <figcaption>{b.content}</figcaption>
              </figure>
            ) : b.authorKind === "image" ? (
              <figure className="reader-image" key={b.id}>
                {b.content && <MaterialImage src={b.content} alt={b.title || "Hình minh họa"} onLoad={() => setImageReady((state) => state[b.id] ? state : { ...state, [b.id]: true })} />}
                {b.title && <figcaption>{b.title}</figcaption>}
              </figure>
            ) : b.type === "math" ? (
              <section key={b.id}><ReadonlyFormula latex={b.content} /></section>
            ) : b.type === "heading" ? (
              <h2 key={b.id}>{b.content}</h2>
            ) : (
              <p className="reader-text" key={b.id}>
                {b.content}
              </p>
            ),
          )}
        </article>
      )}
    </div>
  );
}
function gradeLabel(grade: string) {
  const value = grade.trim();
  if (!value) return "";
  return /^lớp\s/i.test(value) ? value : `Lớp ${value}`;
}
