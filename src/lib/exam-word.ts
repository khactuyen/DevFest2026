import { strToU8, zipSync } from "fflate";
import { examHasOptions, examKinds, examPartLabels, examQuestions, examSourceFigures } from "./exam-document";
import type { Material } from "./contracts";
import { studentIdentityLine, type StudentIdentity } from "./lesson-check-roster";

export const examWordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const esc = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const mathRun = (value: string) => `<m:r><m:t xml:space="preserve">${esc(value)}</m:t></m:r>`;
const wrap = (tag: string, value: string) => `<m:${tag}>${value}</m:${tag}>`;

function officeMath(node: Element): string {
  const children = [...node.children];
  const at = (index: number) => children[index] ? officeMath(children[index]) : "";
  const content = () => children.map(officeMath).join("");
  const text = node.textContent || "";
  switch (node.localName) {
    case "mi": case "mn": case "mo": case "mtext": return mathRun(text.replace(/[\u2061-\u2064]/g, ""));
    case "mspace": return mathRun(" ");
    case "mfrac": return wrap("f", wrap("num", at(0)) + wrap("den", at(1)));
    case "msqrt": return wrap("rad", '<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + wrap("e", content()));
    case "mroot": return wrap("rad", wrap("deg", at(1)) + wrap("e", at(0)));
    case "msub": return wrap("sSub", wrap("e", at(0)) + wrap("sub", at(1)));
    case "msup": return wrap("sSup", wrap("e", at(0)) + wrap("sup", at(1)));
    case "msubsup": return wrap("sSubSup", wrap("e", at(0)) + wrap("sub", at(1)) + wrap("sup", at(2)));
    case "munder": return wrap("limLow", wrap("e", at(0)) + wrap("lim", at(1)));
    case "mover": return node.getAttribute("accent") === "true"
      ? wrap("acc", `<m:accPr><m:chr m:val="${esc(children[1]?.textContent || "̂")}"/></m:accPr>` + wrap("e", at(0)))
      : wrap("limUpp", wrap("e", at(0)) + wrap("lim", at(1)));
    case "munderover": return wrap("limUpp", wrap("e", wrap("limLow", wrap("e", at(0)) + wrap("lim", at(1)))) + wrap("lim", at(2)));
    case "mtable": return wrap("m", content());
    case "mtr": return wrap("mr", content());
    case "mtd": return wrap("e", content());
    case "mrow": {
      if (children[1]?.localName === "mtable" && children[0]?.localName === "mo") {
        const end = children[2]?.localName === "mo" ? children[2].textContent || "" : "";
        const delimiters = `<m:dPr><m:begChr m:val="${esc(children[0].textContent || "")}"/><m:endChr m:val="${esc(end)}"/></m:dPr>`;
        return wrap("d", delimiters + wrap("e", at(1))) + children.slice(end ? 3 : 2).map(officeMath).join("");
      }
      return content();
    }
    case "semantics": return at(0);
    case "annotation": case "annotation-xml": return "";
    case "merror": throw Error("Có công thức LaTeX chưa hợp lệ.");
    default: return children.length ? content() : mathRun(text);
  }
}

export type ExamWordImage = { id: string; bytes: Uint8Array; width: number; height: number };

export async function examWordFile(material: Material, teacher: boolean, figures: ExamWordImage[], student?: StudentIdentity) {
  const exam = material.exam;
  if (!exam) throw Error("Học liệu này chưa có mẫu đề thi.");
  const { convertLatexToMathMl } = await import("mathlive");
  const parser = new DOMParser();
  const formula = (latex: string) => {
    const xml = parser.parseFromString(`<math>${convertLatexToMathMl(latex)}</math>`, "application/xml");
    if (xml.querySelector("parsererror") || !xml.documentElement.textContent?.trim()) throw Error(`Không xuất được công thức ${latex.slice(0, 70)}.`);
    return wrap("oMath", officeMath(xml.documentElement));
  };
  const run = (value: string, marks?: string[]) => `<w:r><w:rPr>${marks?.includes("bold") ? "<w:b/>" : ""}${marks?.includes("italic") ? "<w:i/>" : ""}${marks?.includes("underline") ? '<w:u w:val="single"/>' : ""}</w:rPr>${value.split("\n").map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t>`).join("")}</w:r>`;
  const bold = (text: string) => run(text, ["bold"]);
  const rich = (value: string, marks?: string[]) => {
    const parts = value.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/);
    return parts.map((part, index) => index % 2
      ? formula(part.startsWith("$$") || part.startsWith("\\") ? part.slice(2, -2) : part.slice(1, -1))
      : run(part, marks)).join("");
  };
  const p = (content: string, align = "left") => `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr>${content}</w:p>`;
  const rows = examQuestions(material);
  const doc: string[] = [
    p(bold(exam.school || (student ? "MathCos" : "TRƯỜNG …")), "center"), p(bold(material.title), "center"),
    p(bold(`Môn ${exam.subject} · Lớp ${material.metadata.grade}`), "center"),
    p(run(`Thời gian làm bài ${exam.duration} phút${exam.code ? ` · Mã đề ${exam.code}` : ""}`), "center"),
    p(run(student ? studentIdentityLine(student) : "Họ và tên .............................................. Lớp .............. Số báo danh ..............")),
  ];
  const relationships: string[] = ['<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
  const parts: Record<string, Uint8Array> = {};
  function image(id: string, width: number, align: string, alt: string) {
    const figure = figures.find((item) => item.id === id);
    if (!figure) throw Error("Một hình minh họa chưa sẵn sàng để xuất.");
    const index = relationships.length;
    const key = `figure-${index}.png`;
    relationships.push(`<Relationship Id="img${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${key}"/>`);
    parts[`word/media/${key}`] = figure.bytes;
    const cx = Math.min(Math.round(5900000 * width / 100), Math.round(5400000 * figure.width / figure.height));
    const cy = Math.round(cx * figure.height / figure.width);
    return p(`<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index}" name="Hình ${index}" descr="${esc(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="${key}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img${index}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, align);
  }
  let part = 0;
  for (const kind of examKinds) {
    const questions = rows.filter((row) => row.kind === kind);
    if (!questions.length) continue;
    doc.push(p(bold(`Phần ${++part}. ${examPartLabels[kind]}`)));
    for (const { number, question, figures: images } of questions) {
      const { assessment, examQuestion } = question;
      const sourceFigures = examSourceFigures(question);
      const label = bold(`Câu ${number}.${kind === "written" && assessment?.points ? ` (${assessment.points} điểm)` : ""} `);
      if (sourceFigures.length === 0) {
        if (examQuestion?.prompt) examQuestion.prompt.forEach((paragraph, index) => doc.push(p((index === 0 ? label : "") + paragraph
          .map((item) => item.type === "formula" ? formula(item.latex) : rich(item.text, item.marks)).join(""))));
        else doc.push(p(label + rich(question.content)));
      }
      for (const figure of [...sourceFigures, ...images]) {
        const settings = figure.examFigure || { width: 65, align: "center" };
        doc.push(image(figure.id, settings.width, settings.align, figure.title || "Hình minh họa"));
        const caption = figure.authorKind === "image" ? figure.title : figure.content;
        if (caption) doc.push(p(rich(caption), settings.align));
      }
      const options = sourceFigures.length === 0 && examHasOptions(kind) ? assessment?.options || [] : [];
      const columns = examQuestion?.columns || 1;
      const cellWidth = Math.floor(9360 / columns);
      const optionRows: string[] = [];
      for (let start = 0; start < options.length; start += columns) {
        const cells = Array.from({ length: columns }, (_, column) => {
          const index = start + column;
          if (index >= options.length) return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
          const marker = kind === "multiple" ? "ABCD"[index] + "." : "abcd"[index] + ")";
          const correct = teacher && kind === "multiple" && assessment?.correctIndex === index;
          const truth = teacher && kind === "true-false" ? assessment?.answer?.split(" ")[index] : "";
          const indicator = correct ? bold(" ✓") : truth === "Đ" ? bold(" (Đúng)") : truth === "S" ? bold(" (Sai)") : "";
          return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr>${p(bold(marker + " ") + rich(options[index], correct ? ["bold"] : undefined) + indicator)}</w:tc>`;
        });
        optionRows.push(`<w:tr>${cells.join("")}</w:tr>`);
      }
      if (optionRows.length) doc.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array(columns).fill(`<w:gridCol w:w="${cellWidth}"/>`).join("")}</w:tblGrid>${optionRows.join("")}</w:tbl>`);
      if (teacher && sourceFigures.length && kind === "multiple" && assessment?.correctIndex !== undefined) doc.push(p(bold(`Đáp án ${"ABCD"[assessment.correctIndex]}`)));
      if (teacher && sourceFigures.length && kind === "true-false" && assessment?.answer) doc.push(p(bold(`Đáp án ${assessment.answer}`)));
      if (!teacher && (student || kind === "short")) doc.push(p(run("Trả lời ................................................................")));
      if (!teacher && student && kind === "written") doc.push(p(run("....................................................................................")));
      if (teacher && !examHasOptions(kind) && assessment?.answer) doc.push(p(bold("Đáp án ") + rich(assessment.answer)));
      if (teacher && assessment?.explanation) doc.push(p(bold("Lời giải ") + rich(assessment.explanation)));
    }
  }
  const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const rel = "http://schemas.openxmlformats.org/package/2006/relationships";
  const ns = `xmlns:w="${word}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
  const xml = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${rel}"><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="${rel}">${relationships.join("")}</Relationships>`,
    "word/document.xml": `<w:document ${ns}><w:body>${doc.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1273" w:bottom="1080" w:left="1273" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${exam.font}" w:hAnsi="${exam.font}" w:cs="${exam.font}"/><w:sz w:val="${exam.fontSize * 2}"/><w:szCs w:val="${exam.fontSize * 2}"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`,
  };
  for (const [file, value] of Object.entries(xml)) parts[file] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + value);
  return zipSync(parts);
}
