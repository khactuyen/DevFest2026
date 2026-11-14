import type { Material } from "./contracts";
import { examKinds, examQuestions } from "./exam-document";

function randomFor(key: string) {
  let state = 2166136261;
  for (const letter of key) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const optionReference = /(?:phương\s*án|đáp\s*án|chọn)\s*[A-D](?![\p{L}\p{N}])|cả\s+(?:[A-D](?![\p{L}\p{N}])|hai|ba|bốn)|tất\s*cả.{0,24}(?:trên|đáp\s*án|phương\s*án)|(?:ở|phía)\s+trên\b/iu;

export function buildExamVariant(material: Material, code: string, attempt = 0, order = { questions: true, options: true }): Material {
  if (!material.exam) return material;
  const rows = examQuestions(material);
  const seed = attempt ? `${material.id}:${code}:${attempt}` : `${material.id}:${code}`;
  const steps = order.questions ? examKinds.flatMap((kind) => {
    const groups = new Map<string, Material["learningSteps"]>();
    for (const { step, question } of rows.filter((row) => row.kind === kind)) {
      const group = question.examQuestion?.shuffleGroup?.trim();
      const key = group ? `group:${group}` : `question:${question.id}`;
      groups.set(key, [...(groups.get(key) || []), step]);
    }
    return shuffle([...groups.values()], randomFor(`${seed}:${kind}`)).flat();
  }) : material.learningSteps;
  const blocks = material.blocks.map((block) => {
    const config = block.examQuestion, assessment = block.assessment;
    if (!order.options || config?.kind !== "multiple" || config.keepOptionOrder || config.useSourceLayout !== false && config.sourceImages?.length
      || assessment?.options?.length !== 4 || assessment.options.some((option) => !option.trim() || optionReference.test(option))
      || optionReference.test(block.content) || optionReference.test(assessment.explanation || "")) return block;
    const choices = shuffle(assessment.options.map((text, index) => ({ text, index })), randomFor(`${seed}:${block.id}`));
    const newIndex = choices.findIndex(({ index }) => index === assessment.correctIndex);
    return { ...block, assessment: { ...assessment, options: choices.map(({ text }) => text), correctIndex: newIndex < 0 ? undefined : newIndex } };
  });
  return { ...material, exam: { ...material.exam, code }, learningSteps: steps, blocks };
}

export function examVariantFingerprint(material: Material) {
  return JSON.stringify(examQuestions(material).map(({ question }) => [question.content, question.assessment?.options]));
}

export function buildExamVariants(material: Material, count: number) {
  const seen = new Set<string>();
  let repeated = 0;
  const variants = Array.from({ length: count }, (_, index) => {
    const code = `M${String(index + 1).padStart(2, "0")}`;
    let variant = buildExamVariant(material, code);
    for (let attempt = 1; attempt <= 12; attempt++) {
      const fingerprint = examVariantFingerprint(variant);
      if (!seen.has(fingerprint)) { seen.add(fingerprint); return variant; }
      if (attempt < 12) variant = buildExamVariant(material, code, attempt);
    }
    repeated++;
    return variant;
  });
  return { variants, repeated };
}

export function examAnswerKeyCsv(variants: Material[]) {
  const lines = variants.flatMap((material) => examQuestions(material).map(({ question, number, kind }) => {
    const assessment = question.assessment;
    const answer = kind === "multiple" ? "ABCD"[assessment?.correctIndex ?? -1] ?? "" : assessment?.answer || "";
    return [material.exam?.code || "", number.toString(), answer, String(assessment?.points ?? 0)];
  }));
  const escape = (value: string) => {
    const safe = (/^[=+\-@]/.test(value.trimStart()) || /^[\t\r]/.test(value))
      && !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim()) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [["Mã đề", "Câu", "Đáp án", "Điểm"], ...lines].map((row) => row.map(escape).join(",")).join("\r\n");
}
