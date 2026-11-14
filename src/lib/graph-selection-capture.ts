/** SVGs containing JSXGraph's HTML labels taint a canvas when loaded from a
 * blob URL in Chromium. A self-contained SVG image data URL stays origin-clean;
 * image-mode SVG also disables scripts and loading external resources.
 * Do not replace this with object URLs without testing foreignObject labels. */
export function selectionSvgDataUrl(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const bounds = svg.getBoundingClientRect();
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(bounds.width));
  copy.setAttribute("height", String(bounds.height));
  // JSXGraph also places normal labels beside the SVG as HTML. Preserve these
  // and their rich math layout instead of losing them from the AI's context.
  const viewBox = svg.viewBox.baseVal;
  const xScale = viewBox.width ? viewBox.width / bounds.width : 1;
  const yScale = viewBox.height ? viewBox.height / bounds.height : 1;
  for (const label of svg.parentElement?.querySelectorAll<HTMLElement>(".JXGtext") || []) {
    if (svg.contains(label) || label.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const style = getComputedStyle(label), box = label.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || !box.width || !box.height) continue;
    const html = label.cloneNode(true) as HTMLElement;
    const sourceNodes = [label, ...label.querySelectorAll<HTMLElement>("*")];
    const clonedNodes = [html, ...html.querySelectorAll<HTMLElement>("*")];
    sourceNodes.forEach((source, index) => {
      const computed = getComputedStyle(source);
      if (!clonedNodes[index].style) return;
      for (const property of Array.from(computed))
        clonedNodes[index].style.setProperty(property, computed.getPropertyValue(property));
    });
    Object.assign(html.style, { position: "static", left: "auto", top: "auto", margin: "0", transform: "none" });
    const foreign = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    foreign.setAttribute("x", String((box.left - bounds.left) * xScale + viewBox.x));
    foreign.setAttribute("y", String((box.top - bounds.top) * yScale + viewBox.y));
    foreign.setAttribute("width", String(box.width * xScale));
    foreign.setAttribute("height", String(box.height * yScale));
    html.style.width = `${box.width}px`;
    html.style.height = `${box.height}px`;
    if (xScale !== 1 || yScale !== 1) {
      html.style.transformOrigin = "top left";
      html.style.transform = `scale(${xScale},${yScale})`;
    }
    foreign.append(html);
    copy.append(foreign);
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
}

/** Draw using DOM coordinates rather than stretching a partial overlap across
 * the entire crop. The output canvas clips off-screen parts automatically. */
export function drawSelectionFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  stage: Pick<DOMRect, "left" | "top">,
  crop: { x: number; y: number },
  scale: number,
) {
  context.save();
  context.scale(scale, scale);
  context.translate(-crop.x, -crop.y);
  context.drawImage(image, bounds.left - stage.left, bounds.top - stage.top, bounds.width, bounds.height);
  context.restore();
}

export function selectionCaptureError(reason: unknown): string {
  if (reason instanceof Error && reason.name === "SecurityError")
    return "Trình duyệt không cho đọc ảnh vùng chọn. Hãy tải lại bảng và khoanh vùng lần nữa; ảnh chưa được gửi đến AI.";
  return reason instanceof Error ? reason.message : "Không đọc được vùng đã chọn.";
}
