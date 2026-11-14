import type { Material } from "./contracts";
import { request } from "./client";
import { examSourceQuestionStarts, type ExamKind } from "./exam-document";
import { readExamPdfLayout, readPdfExamAnswers, type PdfExamPage } from "./exam-pdf-layout";
import { pdfImageBoxes, resolvePdfFigureBoxes, type FigureBox } from "./exam-pdf-figures";

type SourcePage = NonNullable<Material["sourcePages"]>[number];
export const studioSourceAccept = "image/png,image/jpeg,image/webp,application/pdf,.pdf,.docx,.txt,text/plain";

function textSourcePages(name: string, transcription: string): SourcePage[] {
  const pages: SourcePage[] = [];
  for (let start = 0; start < transcription.length; start += 8000) {
    pages.push({ name: transcription.length > 8000 ? `${name} · phần ${pages.length + 1}` : name,
      transcription: transcription.slice(start, start + 8000) });
  }
  return pages;
}

async function canvasJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  let working = canvas;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    blob = await new Promise<Blob | null>((resolve) => working.toBlob(resolve, "image/jpeg", 0.76));
    if (blob && blob.size <= 2_000_000) break;
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(working.width * 0.75));
    smaller.height = Math.max(1, Math.round(working.height * 0.75));
    smaller.getContext("2d")?.drawImage(working, 0, 0, smaller.width, smaller.height);
    working = smaller;
  }
  if (!blob || blob.size > 2_000_000) throw Error("Trang ảnh sau khi nén vẫn vượt 2 MB. Hãy chọn ảnh nhỏ hơn.");
  return blob;
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<{ imageDataUrl: string; blob: Blob }> {
  const blob = await canvasJpegBlob(canvas);
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error("Không đọc được trang ảnh.")); reader.readAsDataURL(blob);
  });
  return { imageDataUrl, blob };
}

export async function uploadStudioSourceImage(materialId: string, blob: Blob, signal?: AbortSignal) {
  const response = await fetch("/api/material-assets", { method: "POST", body: blob, signal,
    headers: { "Content-Type": blob.type, "x-material-id": materialId } });
  const data = await response.json() as { url?: string; error?: string };
  if (!response.ok || !data.url) throw Error(data.error || "Không lưu được ảnh đề gốc.");
  return data.url;
}

export async function extractEditablePdfQuestion(images: Blob[], kind: ExamKind, signal: AbortSignal, embedded: FigureBox[] = []) {
  const bitmaps: ImageBitmap[] = [];
  try {
    for (const image of images) {
      signal.throwIfAborted();
      bitmaps.push(await createImageBitmap(image));
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(...bitmaps.map((image) => image.width));
    canvas.height = bitmaps.reduce((height, image) => height + image.height, 0);
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw Error("Không mở được ảnh câu hỏi từ PDF.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    let top = 0;
    for (const image of bitmaps) { context.drawImage(image, 0, top); top += image.height; }
    const { imageDataUrl } = await canvasJpeg(canvas);
    const result = await request<{ stem: string; options: string[]; figures: Array<[number, number, number, number]>; warnings: string[] }>("/api/studio-exam-read", {
      method: "POST", signal, body: JSON.stringify({ kind, imageDataUrl }),
    });
    const { figures: boxes, unresolved } = resolvePdfFigureBoxes(
      context.getImageData(0, 0, canvas.width, canvas.height), result.figures, embedded,
    );
    const figures: Blob[] = [];
    for (const box of boxes) {
      signal.throwIfAborted();
      const [left, upper, right, bottom] = box;
      const padding = embedded.includes(box) ? 0 : Math.max(4, Math.round(canvas.width * .006));
      const x = Math.max(0, left - padding), y = Math.max(0, upper - padding);
      const crop = document.createElement("canvas");
      crop.width = Math.min(canvas.width, right + padding) - x;
      crop.height = Math.min(canvas.height, bottom + padding) - y;
      const cropContext = crop.getContext("2d");
      if (!cropContext || crop.width < 3 || crop.height < 3) continue;
      cropContext.drawImage(canvas, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      figures.push(await canvasJpegBlob(crop));
    }
    const warnings = unresolved
      ? [...result.warnings, "Chưa tách chắc chắn được một vùng hình. Mở ảnh câu gốc để đối chiếu và lấy hình đầy đủ."]
      : result.warnings;
    return { ...result, figures, warnings };
  } finally { for (const image of bitmaps) image.close(); }
}

function pdfQuestionBoundary(context: CanvasRenderingContext2D, boundary: number, scale: number, minimum: number) {
  const { width, height } = context.canvas;
  const first = Math.max(0, Math.floor(Math.max(minimum, boundary - 16) * scale));
  const last = Math.min(height, Math.ceil((boundary + 3) * scale));
  if (last <= first) return Math.round(boundary * scale);
  const rows = context.getImageData(0, first, width, last - first).data;
  let best = Math.round(boundary * scale), longest = 0, run = 0;
  for (let y = 0; y < last - first; y++) {
    let ink = false;
    for (let x = Math.floor(width * .04); x < width * .96; x++) {
      const pixel = (y * width + x) * 4;
      if (Math.min(rows[pixel], rows[pixel + 1], rows[pixel + 2]) < 190) { ink = true; break; }
    }
    run = ink ? 0 : run + 1;
    if (run > longest) { longest = run; best = first + y - Math.floor(run / 2); }
  }
  return best;
}

export async function readPdfExam(file: File, code: string, signal: AbortSignal, onStatus: (status: string) => void) {
  if (file.size > 20_000_000) throw Error("PDF vượt giới hạn 20 MB.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const pdf = await task.promise;
    if (pdf.numPages > 30) throw Error("PDF có quá 30 trang. Hãy chọn tệp theo từng nhóm mã đề.");
    const pages: PdfExamPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      onStatus(`Đang xác định câu hỏi ở trang ${number}/${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const { items } = await page.getTextContent();
      const rows = new Map<number, Array<{ text: string; left: number; height: number }>>();
      for (const item of items) {
        if (!("str" in item) || !item.str) continue;
        const [left, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const key = Math.round(baseline);
        const parts = rows.get(key) || [];
        parts.push({ text: item.str, left, height: item.height });
        rows.set(key, parts);
      }
      const lines = [...rows.entries()].sort(([a], [b]) => a - b).map(([baseline, parts]) => {
        parts.sort((a, b) => a.left - b.left);
        return { text: parts.map((part) => part.text).join("").replace(/\s+/g, " ").trim(),
          left: parts.find((part) => part.text.trim())?.left ?? 0,
          cells: parts.filter((part) => part.text.trim()).map(({ text, left }) => ({ text: text.trim(), left })),
          top: baseline - Math.max(...parts.map((part) => part.height)) * .8, bottom: baseline + 3 };
      }).filter((line) => line.text);
      pages.push({ width: viewport.width, height: viewport.height, lines });
    }
    const versions = readExamPdfLayout(pages);
    if (pdf.numPages === 1 && versions[0]?.questions.length === 1 && versions[0].questions[0].kind === "multiple"
      && !pages[0].lines.some(({ text }) => /^A[.)]/.test(text))) return;
    if (!versions.length) return;
    const version = versions.length === 1 ? versions[0] : versions.find((item) => item.code === code);
    if (!version) return { codes: versions.map((item) => item.code) };
    const selectedPages = [...new Set(version.questions.flatMap((question) => question.slices.map((slice) => slice.page)))];
    if (selectedPages.length > 10) throw Error("Mã đề này có quá 10 trang câu hỏi. Hãy chia mã đề thành nhiều phần.");
    const sourcePages: Array<{ page: SourcePage; blob: Blob }> = [];
    const crops = version.questions.map(() => [] as Blob[]);
    const embedded = version.questions.map(() => [] as FigureBox[]);
    const offsets = version.questions.map(() => 0);
    for (const index of selectedPages) {
      signal.throwIfAborted();
      onStatus(`Đang giữ bố cục gốc trang ${index + 1}…`);
      const page = await pdf.getPage(index + 1);
      const scale = 2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw Error("Không hiển thị được trang PDF.");
      await page.render({ canvas, canvasContext: context, viewport, recordImages: true }).promise;
      const pageImages = pdfImageBoxes(page.imageCoordinates, canvas.width, canvas.height);
      const slices = version.questions.flatMap((question) => question.slices).filter((slice) => slice.page === index);
      const headerBottom = pages[index].lines.find((line) => /thời\s*gian.*\d+\s*phút/iu.test(line.text) && line.bottom <= slices[0].top)?.bottom ?? 0;
      const starts = new Map(slices.map((slice) => [slice.top, pdfQuestionBoundary(context, slice.top, scale, headerBottom)]));
      for (const [questionIndex, question] of version.questions.entries()) {
        for (const slice of question.slices.filter((item) => item.page === index)) {
          const crop = document.createElement("canvas");
          const left = Math.floor(canvas.width * .04);
          const top = starts.get(slice.top)!;
          crop.width = canvas.width - 2 * left;
          const bottom = starts.get(slice.bottom) ?? Math.ceil(slice.bottom * scale);
          crop.height = Math.max(1, Math.min(canvas.height, bottom) - top);
          for (const [x0, y0, x1, y1] of pageImages) {
            if (x0 < left || x1 > left + crop.width || y0 < top || y1 > top + crop.height) continue;
            embedded[questionIndex].push([x0 - left, y0 - top + offsets[questionIndex], x1 - left, y1 - top + offsets[questionIndex]]);
          }
          offsets[questionIndex] += crop.height;
          const cropContext = crop.getContext("2d");
          if (!cropContext) throw Error("Không giữ được bố cục câu hỏi.");
          cropContext.drawImage(canvas, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
          crops[questionIndex].push(await canvasJpegBlob(crop));
        }
      }
      sourcePages.push({ page: { name: `${file.name} · trang ${index + 1}`.slice(0, 200), transcription: pages[index].lines.map((line) => line.text).join("\n").slice(0, 8000) }, blob: await canvasJpegBlob(canvas) });
      canvas.width = 0;
    }
    return { version, crops, embedded, sourcePages, answers: readPdfExamAnswers(pages, version) };
  } finally {
    signal.removeEventListener("abort", abort);
    if (!signal.aborted) await task.destroy();
  }
}

async function compressImage(file: File): Promise<{ imageDataUrl: string; blob: Blob }> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
  if (file.size > 12_000_000) throw Error("Ảnh gốc vượt 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    let side = 1600;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw Error("Không xử lý được ảnh.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      if (!blob) throw Error("Không nén được ảnh.");
      if (blob.size <= 2_000_000) return canvasJpeg(canvas);
      side = Math.round(side * 0.72);
    }
    throw Error("Ảnh còn quá lớn sau khi nén. Hãy cắt trang ảnh nhỏ hơn.");
  } finally { bitmap.close(); }
}

export async function readStudioSource(source: string, files: File[], {
  signal, onStatus, includeImages = true,
}: { signal: AbortSignal; onStatus: (status: string) => void; includeImages?: boolean }) {
  const images: Array<{ page: SourcePage; blob: Blob; questionIndex?: number; lessonIllustration?: boolean }> = [];
  const textPages: SourcePage[] = source.trim() ? textSourcePages("Nội dung giáo viên nhập", source.trim()) : [];
  const sections: string[] = [];
  if (source.trim()) sections.push(source.trim());
  for (const [index, file] of files.entries()) {
    signal.throwIfAborted();
    if (file.type === "text/plain" || /\.txt$/i.test(file.name)) {
      const text = (await file.text()).trim();
      if (text) { sections.push(text); textPages.push(...textSourcePages(file.name, text)); }
      continue;
    }
    if (file.name.toLowerCase().endsWith(".docx")) {
      if (file.size > 12_000_000) throw Error("DOCX vượt giới hạn 12 MB.");
      onStatus(`Đang đọc ${file.name}…`);
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value.trim();
      if (!text) throw Error(`Không đọc được nội dung trong ${file.name}.`);
      sections.push(text);
      textPages.push(...textSourcePages(file.name, text));
      if (!includeImages) continue;
      const html = await mammoth.convertToHtml({ arrayBuffer });
      const documentBody = new DOMParser().parseFromString(html.value, "text/html").body;
      for (const [imageIndex, img] of Array.from(documentBody.querySelectorAll("img")).entries()) {
        const data = img.getAttribute("src") || "";
        if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(data)) continue;
        const before = document.createRange();
        before.selectNodeContents(documentBody); before.setEndBefore(img);
        const prefix = before.cloneContents();
        for (const block of prefix.querySelectorAll("p,li,td,h1,h2,h3,h4,h5,h6")) block.prepend("\n");
        const preceding = examSourceQuestionStarts(prefix.textContent ?? "").length;
        const priorFiles = examSourceQuestionStarts(sections.slice(0, -1).join("\n\n")).length;
        const questionIndex = preceding ? priorFiles + preceding - 1 : undefined;
        const blob = await (await fetch(data)).blob();
        const optimized = await compressImage(new File([blob], `docx-${imageIndex}.png`, { type: blob.type }));
        images.push({ page: { name: `${file.name} · hình ${imageIndex + 1}`, transcription: questionIndex === undefined ? "Hình gốc trong DOCX." : `Hình gốc đi kèm câu ${questionIndex + 1} trong DOCX.` }, blob: optimized.blob, questionIndex, lessonIllustration: true });
      }
      continue;
    }
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      if (file.size > 20_000_000) throw Error("PDF vượt giới hạn 20 MB.");
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      if (pdf.numPages > 10) throw Error("PDF có quá 10 trang. Hãy chia đề thành các phần nhỏ hơn.");
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        signal.throwIfAborted();
        onStatus(`Đang đọc PDF: trang ${pageNumber}/${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const scale = Math.min(1.8, 1600 / Math.max(page.view[2], page.view[3]));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw Error("Không hiển thị được trang PDF.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const image = await canvasJpeg(canvas);
        const content = await page.getTextContent();
        let transcription = content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
        if (transcription.length < 80) {
          const recognized = await request<{ transcription: string }>("/api/problem-recognition", {
            method: "POST", body: JSON.stringify({ imageDataUrl: image.imageDataUrl, mode: "photo" }), signal,
          });
          transcription = recognized.transcription.trim();
        }
        if (!transcription) throw Error(`Không đọc được trang ${pageNumber} của PDF.`);
        if (transcription.length > 8000) throw Error(`Trang ${pageNumber} của PDF quá dài để đối chiếu đầy đủ. Hãy chia hoặc rút gọn trang nguồn.`);
        sections.push(transcription);
        if (includeImages) images.push({ page: { name: `${file.name} · trang ${pageNumber}`, transcription }, blob: image.blob });
      }
      continue;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error(`Không hỗ trợ tệp ${file.name}. Hãy chọn ảnh, PDF, DOCX hoặc TXT.`);
    onStatus(`Đang đọc trang ảnh ${index + 1}/${files.length}…`);
    const image = await compressImage(file);
    const result = await request<{ transcription: string; figureDescription: string; ambiguities: string[]; containsDiagram?: boolean }>("/api/problem-recognition", {
      method: "POST", body: JSON.stringify({ imageDataUrl: image.imageDataUrl, mode: "photo" }), signal,
    });
    const transcription = result.transcription.trim();
    if (!transcription || /^không thấy chữ/i.test(transcription)) throw Error(`Không đọc được chữ trong ${file.name}. Hãy dùng ảnh rõ hơn hoặc nhập nội dung bằng tay.`);
    if (transcription.length > 8000) throw Error(`Nội dung nhận diện từ ${file.name} quá dài để lưu đối chiếu đầy đủ.`);
    sections.push(transcription);
    if (includeImages) images.push({ page: { name: file.name, transcription }, blob: image.blob,
      lessonIllustration: result.containsDiagram === true && transcription.length <= 200 });
  }
  const fullSource = sections.join("\n\n");
  if (images.length + textPages.length > 10) throw Error("Tối đa 10 trang nguồn cho một bản nháp. Hãy chia đề thành nhiều phần.");
  signal.throwIfAborted();
  return { fullSource, images, textPages };
}
