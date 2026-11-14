import type { ExploreRuntime } from "@/components/explore/shared";
async function loadImage(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}
function svgData(svg: SVGSVGElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.querySelectorAll("foreignObject").forEach((n) => n.remove());
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(new XMLSerializer().serializeToString(copy))
  );
}
/** Render measured text using loaded browser fonts; no foreignObject or remote images. */
function drawText(
  context: CanvasRenderingContext2D,
  root: HTMLElement | ShadowRoot,
  stage: DOMRect,
) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest(
        "button,textarea,input,select,svg,style,script,.ML__sr-only,.board-content-handle,.board-table-controls,.board-content-editor",
      )
    )
      continue;
    const style = getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden") continue;
    context.fillStyle = style.color;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = "alphabetic";
    const range = document.createRange(),
      text = node.textContent || "";
    for (let i = 0; i < text.length; i++) {
      if (!text[i].trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const metrics = context.measureText(text[i]),
        descent = metrics.actualBoundingBoxDescent || 0;
      context.fillText(
        text[i],
        r.left - stage.left,
        r.bottom - stage.top - descent,
      );
    }
  }
  for (const element of root.querySelectorAll<HTMLElement>("span")) {
    const style = getComputedStyle(element),
      r = element.getBoundingClientRect(),
      border = parseFloat(style.borderBottomWidth);
    if (element.classList.contains("ML__frac-line")) {
      context.fillStyle = style.color;
      context.fillRect(
        r.left - stage.left,
        r.top - stage.top,
        r.width,
        Math.max(0.6, r.height),
      );
    }
    for (const side of ["Top", "Bottom"] as const) {
      const width = parseFloat(style[`border${side}Width`]);
      if (width > 0 && style[`border${side}Style`] !== "none") {
        context.strokeStyle = style[`border${side}Color`];
        context.lineWidth = width;
        context.beginPath();
        const y =
          (side === "Top" ? r.top + width / 2 : r.bottom - width / 2) -
          stage.top;
        context.moveTo(r.left - stage.left, y);
        context.lineTo(r.right - stage.left, y);
        context.stroke();
      }
    }
  }
  for (const field of root.querySelectorAll("math-field"))
    if (field.shadowRoot) drawText(context, field.shadowRoot, stage);
}
export async function exportBoardCanvas(
  stage: HTMLElement,
  runtime: ExploreRuntime,
  { transparent = false }: { transparent?: boolean } = {},
) {
  const started = performance.now();
  while (
    [...stage.querySelectorAll(".formatted-ai-math")].some(
      (host) => !host.querySelector("math-field"),
    )
  ) {
    if (performance.now() - started > 4000)
      throw Error("Công thức chưa tải xong. Hãy thử xuất lại sau vài giây.");
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await document.fonts.ready;
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1)
    throw Error("Bảng chưa có kích thước hiển thị.");
  const canvas = document.createElement("canvas"),
    scale = Math.min(2, Math.sqrt(16000000 / (rect.width * rect.height)));
  canvas.width = Math.ceil(rect.width * scale);
  canvas.height = Math.ceil(rect.height * scale);
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  if (!transparent) {
    context.fillStyle = "white";
    context.fillRect(0, 0, rect.width, rect.height);
  }
  const base = stage.querySelector<HTMLElement>(".math-board"),
    snapshot = "snapshot" in runtime ? runtime.snapshot() : "";
  if (base && snapshot) {
    const r = base.getBoundingClientRect(),
      source = snapshot.startsWith("<")
        ? "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            snapshot.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, ""),
          )
        : snapshot;
    context.drawImage(
      await loadImage(source),
      r.left - rect.left,
      r.top - rect.top,
      r.width,
      r.height,
    );
    for (const label of base.querySelectorAll<HTMLElement>(
      ".JXGtext,.three-scene-label",
    ))
      if (!label.closest("svg")) drawText(context, label, rect);
  }
  for (const ink of stage.querySelectorAll<HTMLCanvasElement>(
    ".graph-ink-canvas",
  )) {
    const r = ink.getBoundingClientRect();
    if (ink.width && ink.height)
      context.drawImage(
        ink,
        r.left - rect.left,
        r.top - rect.top,
        r.width,
        r.height,
      );
  }
  for (const ink of stage.querySelectorAll<SVGSVGElement>(".lesson-board-ink")) {
    const r = ink.getBoundingClientRect();
    if (r.width && r.height) {
      const copy = ink.cloneNode(true) as SVGSVGElement;
      copy.setAttribute("width", String(r.width));
      copy.setAttribute("height", String(r.height));
      context.drawImage(await loadImage(svgData(copy)), r.left - rect.left, r.top - rect.top, r.width, r.height);
    }
  }
  for (const item of stage.querySelectorAll<HTMLElement>(
    ".board-content-item",
  )) {
    const r = item.getBoundingClientRect(),
      x = r.left - rect.left,
      y = r.top - rect.top;
    context.fillStyle = "white";
    context.fillRect(x, y, r.width, r.height);
    context.strokeStyle = "#d9e5dd";
    context.lineWidth = 1;
    context.strokeRect(x, y, r.width, r.height);
    context.save();
    context.beginPath();
    context.rect(x, y, r.width, r.height);
    context.clip();
    for (const image of item.querySelectorAll<HTMLImageElement>("img")) {
      if (!image.src.startsWith("data:image/") && new URL(image.src).origin !== location.origin)
        throw Error("Ảnh cần được nhập vào bảng trước khi xuất.");
      await image.decode();
      const b = image.getBoundingClientRect(),
        ratio = Math.min(
          b.width / image.naturalWidth,
          b.height / image.naturalHeight,
        ),
        w = image.naturalWidth * ratio,
        h = image.naturalHeight * ratio;
      context.drawImage(
        image,
        b.left - rect.left + (b.width - w) / 2,
        b.top - rect.top + (b.height - h) / 2,
        w,
        h,
      );
    }
    for (const svg of item.querySelectorAll<SVGSVGElement>("svg")) {
      if (svg.closest("button,.board-content-handle,.board-content-editor"))
        continue;
      const b = svg.getBoundingClientRect();
      if (b.width && b.height)
        context.drawImage(
          await loadImage(svgData(svg)),
          b.left - rect.left,
          b.top - rect.top,
          b.width,
          b.height,
        );
    }
    drawText(context, item, rect);
    for (const cell of item.querySelectorAll<HTMLInputElement>("td input")) {
      const b = cell.getBoundingClientRect(),
        style = getComputedStyle(cell);
      context.strokeStyle = "#bed3c5";
      context.strokeRect(
        b.left - rect.left,
        b.top - rect.top,
        b.width,
        b.height,
      );
      context.font = `${style.fontSize} ${style.fontFamily}`;
      context.fillStyle = style.color;
      context.fillText(
        cell.value,
        b.left - rect.left + 5,
        b.top - rect.top + b.height * 0.68,
      );
    }
    for (const field of item.querySelectorAll("math-field"))
      for (const svg of field.shadowRoot?.querySelectorAll<SVGSVGElement>(
        ".ML__content svg",
      ) || []) {
        const b = svg.getBoundingClientRect();
        if (b.width && b.height)
          context.drawImage(
            await loadImage(svgData(svg)),
            b.left - rect.left,
            b.top - rect.top,
            b.width,
            b.height,
          );
      }
    context.restore();
  }
  return canvas;
}
export function downloadBoard(canvas: HTMLCanvasElement) {
  const link = document.createElement("a");
  link.download = "MathCos-bang-ve.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
