import type { ExamKind } from "./exam-document";

export type PdfExamLine = { text: string; top: number; bottom: number; left: number; cells?: Array<{ text: string; left: number }> };
export type PdfExamPage = { width: number; height: number; lines: PdfExamLine[] };
type Slice = { page: number; top: number; bottom: number };
export type PdfExamQuestion = { number: number; kind: ExamKind; slices: Slice[] };
export type PdfExamVersion = { code: string; grade: string; school: string; duration: number; questions: PdfExamQuestion[] };

export function readPdfExamAnswers(pages: PdfExamPage[], version: PdfExamVersion) {
  const candidates = version.questions.map(() => new Set<string>());
  for (const page of pages) {
    if (page.lines.some(({ text }) => /^\s*(?:câu|bài)\s+\d+\s*[.:)]/iu.test(text))) continue;
    if (!version.code && page.lines.some(({ text }) => /^\s*(?:bảng\s+)?đáp\s*án\s*[:.]?\s*$/iu.test(text))) {
      for (const { text } of page.lines) for (const [, number, answer] of text.matchAll(/(?:^|\s)(\d{1,3})\s*[.)]\s*([A-D])(?=\s|$)/g)) {
        const index = version.questions.findIndex((question) => question.number === Number(number) && question.kind === "multiple");
        if (index >= 0) candidates[index].add(answer);
      }
      continue;
    }
    if (!version.code || !page.lines.some(({ text }) => /mã\s*đề\s*thi/iu.test(text))) continue;
    const header = page.lines.find(({ cells }) => cells?.some(({ text }) => text === version.code)
      && cells.filter(({ text }) => /^\d{3,6}$/.test(text)).length >= 2);
    const codes = header?.cells?.filter(({ text }) => /^\d{3,6}$/.test(text));
    if (!header || !codes) continue;
    const column = codes.findIndex(({ text }) => text === version.code);
    if (column < 0) continue;
    for (const line of page.lines) {
      const [number, ...answers] = line.cells ?? [];
      if (line.top <= header.top || !number || !/^\d{1,3}$/.test(number.text) || answers.length !== codes.length) continue;
      const index = Number(number.text) - 1;
      const kind = version.questions[index]?.kind;
      const value = answers[column].text;
      if (kind === "multiple" && /^[A-D]$/.test(value)
        || kind === "true-false" && /^[ĐS]{4}$/u.test(value)
        || kind === "short" && /^[-−+]?\d+(?:[.,]\d+)?$/.test(value)) candidates[index].add(value);
    }
  }
  return candidates.map((values) => values.size === 1 ? [...values][0] : undefined);
}

function sectionKind(text: string): ExamKind | undefined {
  const heading = /^phần\s+(?:[IVX]+|\d+)\s*[.:–-]?\s*(.*)/iu.exec(text)?.[1];
  if (!heading) return;
  if (/đúng\s*[-–/]?\s*sai/iu.test(heading)) return "true-false";
  if (/trả\s*lời\s*ngắn/iu.test(heading)) return "short";
  if (/trắc\s*nghiệm/iu.test(heading)) return "multiple";
  if (/tự\s*luận/iu.test(heading)) return "written";
}

export function readExamPdfLayout(pages: PdfExamPage[]) {
  const versions: PdfExamVersion[] = [];
  let version: PdfExamVersion | undefined;
  let question: PdfExamQuestion | undefined;
  let kind: ExamKind | undefined;
  for (const [pageIndex, page] of pages.entries()) {
    const body = page.lines.filter((line) => line.top >= page.height * .018 && line.bottom <= page.height * .978);
    const footer = page.lines.find((line) => /mã\s*đề\s*[:\-]?\s*([\w-]+).*trang\s*\d+\s*\//iu.test(line.text));
    const code = /mã\s*đề\s*[:\-]?\s*([\w-]+)/iu.exec(footer?.text ?? body.slice(0, 12).map((line) => line.text).join(" "))?.[1] ?? "";
    const markers = body.filter((line) => /^\s*(?:câu|bài)\s+\d{1,3}\s*[.:)]/iu.test(line.text));
    if (markers.length === 0) {
      if (body.some((line) => /^(?:bảng\s+)?đáp\s*án\b|^mã\s*đề\s*thi\b|^hướng\s*dẫn\s*chấm/iu.test(line.text))) question = undefined;
      continue;
    }
    if (!version || (code && code !== version.code)) {
      const header = body.filter((line) => line.top < markers[0].top).map((line) => line.text);
      const text = header.join(" ");
      version = { code, questions: [], grade: /lớp\s*(\d{1,2})/iu.exec(text)?.[1] ?? (/tốt\s*nghiệp\s*thpt/iu.test(text) ? "12" : ""),
        school: /trường\s+.+?(?=\s*năm\s*học|$)/iu.exec(header.find((line) => /trường\s+thpt/iu.test(line)) ?? "")?.[0] ?? "",
        duration: Number(/(\d{1,3})\s*phút/iu.exec(text)?.[1]) || 45 };
      versions.push(version);
      question = undefined;
      kind = undefined;
    }
    const left = Math.min(...markers.map((line) => line.left));
    const contentBottom = Math.min(footer ? footer.top - 9 : page.height * .976,
      Math.max(...body.map((line) => line.bottom)) + 9);
    // The continuation can start with a drawing before the first text line.
    let start = question ? page.height * .025 : 0;
    function close(bottom: number) {
      if (question && bottom > start + 3) question.slices.push({ page: pageIndex, top: start, bottom });
    }
    for (const line of body) {
      const newKind = sectionKind(line.text);
      const marker = line.left <= left + 18 ? /^\s*(?:câu|bài)\s+(\d{1,3})\s*[.:)]/iu.exec(line.text) : null;
      const end = /^\s*[-–—.\s]*hết\s*[-–—.\s]*$/iu.test(line.text);
      if (!newKind && !marker && !end) continue;
      const boundary = Math.max(0, line.top - 2);
      close(boundary);
      question = undefined;
      if (newKind) kind = newKind;
      if (!marker) continue;
      question = { number: Number(marker[1]), kind: kind ?? "multiple", slices: [] };
      version.questions.push(question);
      start = boundary;
    }
    close(contentBottom);
  }
  return versions.filter((version) => version.questions.length && version.questions.every((question) => question.slices.length));
}
