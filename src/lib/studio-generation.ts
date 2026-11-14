import { z } from "zod";
import type { Material, VisualSpec } from "./contracts";
import { createLessonDraft } from "./material-defaults";
import { getVisualPattern, instantiateVisualPattern } from "./visual-patterns";
import { buildConstrainedTetrahedron, isConstrainedTetrahedronProblem } from "./tetrahedron-problem";
import { createExamQuestion, defaultExamSettings, examHasOptions, examSourceQuestionStarts, type ExamKind } from "./exam-document";
import { detectQuestionType, readQuestionParts } from "./solve-question";

const phase = z.enum(["warmup", "objective", "explore", "concept", "practice", "assess", "summary"]);
export const LessonGenerationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).default(""),
  topic: z.string().trim().max(100).default("Toán học"),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    phase,
    objective: z.string().trim().max(1000).default(""),
    minutes: z.number().int().min(1).max(90),
    blocks: z.array(z.object({
      kind: z.enum(["text", "formula", "question", "hint", "example"]),
      title: z.string().trim().max(200).default(""),
      content: z.string().trim().min(1).max(8000),
      answer: z.string().trim().max(400).optional(),
      explanation: z.string().trim().max(1200).optional(),
    })).min(1).max(8),
    visualKey: z.string().max(80).optional(),
    visualCaption: z.string().trim().max(500).optional(),
  })).min(1).max(8),
});
export type LessonGeneration = z.infer<typeof LessonGenerationSchema>;

export function lessonDepthIssues(plan: LessonGeneration) {
  const blocks = plan.steps.flatMap((step) => step.blocks);
  const issues: string[] = [];
  if (plan.steps.length < 4 || !plan.steps.some(({ phase }) => phase === "summary"))
    issues.push("Cần ít nhất 4 hoạt động và có tổng kết.");
  if (!plan.steps.some(({ phase }) => phase === "concept") || !plan.steps.some(({ phase }) => phase === "practice" || phase === "assess"))
    issues.push("Cần hoạt động hình thành kiến thức và luyện tập hoặc đánh giá.");
  if (!blocks.some((block) => block.kind === "example" && block.content.length >= 140 && /\n\s*\n/.test(block.content)))
    issues.push("Cần ví dụ cụ thể, có các bước giải và kết quả.");
  if (blocks.filter((block) => block.kind === "question" && block.answer && block.explanation).length < 2)
    issues.push("Cần ít nhất hai câu luyện tập có đáp án và lời giải thích.");
  if (plan.steps.some(({ blocks }) => blocks.filter((block) => block.kind !== "formula").map(({ content }) => content).join(" ").length < 120))
    issues.push("Mỗi hoạt động cần đủ nội dung để giáo viên triển khai, ít nhất 120 ký tự ngoài công thức riêng.");
  return issues;
}

export const ExamGenerationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).default(""),
  topic: z.string().trim().max(100).default("Toán học"),
  questions: z.array(z.object({
    prompt: z.string().trim().min(1).max(4000),
    type: z.enum(["multiple", "short"]),
    options: z.array(z.string().trim().min(1).max(400)).max(6).optional(),
    correctIndex: z.number().int().min(0).max(5).optional(),
    answer: z.string().trim().max(400).optional(),
    explanation: z.string().trim().max(1200).default(""),
    points: z.number().int().min(1).max(20),
    difficulty: z.enum(["Nhận biết", "Thông hiểu", "Vận dụng"]),
    visualKey: z.string().max(80).optional(),
  })).min(4).max(20),
}).superRefine((plan, context) => {
  plan.questions.forEach((question, index) => {
    if (question.type === "multiple" && (!question.options || question.options.length < 2 || question.correctIndex === undefined || question.correctIndex >= question.options.length)) {
      context.addIssue({ code: "custom", path: ["questions", index], message: "Câu trắc nghiệm cần ít nhất hai lựa chọn và đáp án đúng hợp lệ." });
    }
    if (question.type === "short" && !question.answer?.trim()) {
      context.addIssue({ code: "custom", path: ["questions", index, "answer"], message: "Câu tự luận ngắn cần đáp án tham khảo." });
    }
  });
});
export type ExamGeneration = z.infer<typeof ExamGenerationSchema>;

export function buildGeneratedExamMaterial(plan: ExamGeneration, grade: string, minutes = 45) {
  const material = createLessonDraft(plan.title);
  material.summary = plan.summary || "Đề kiểm tra được tạo từ nội dung chương; giáo viên cần rà soát đáp án trước khi giao.";
  material.metadata = { grade, topic: plan.topic, type: "exercise", tags: ["Đề kiểm tra"] };
  material.blocks = [];
  material.visuals = [];
  material.learningSteps = [];
  const review = ["Rà soát toàn bộ câu hỏi, độ khó, đáp án và thang điểm trước khi sử dụng."];
  const questionStep = {
    id: `step_${crypto.randomUUID().replace(/-/g, "")}`, title: "Đề kiểm tra", description: "Các câu hỏi được tạo từ nội dung nguồn.",
    phase: "assess" as const, objective: "Đánh giá mức độ nắm vững nội dung chương.", estimatedMinutes: minutes,
    blockIds: [] as string[], actionLabels: [], visualActions: [],
  };
  for (const [index, question] of plan.questions.entries()) {
    const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
    const assessment = question.type === "multiple"
      ? question.options && question.correctIndex !== undefined && question.correctIndex < question.options.length
        ? { type: "multiple" as const, points: question.points, options: question.options, correctIndex: question.correctIndex, explanation: question.explanation || undefined }
        : undefined
      : question.answer?.trim()
        ? { type: "short" as const, points: question.points, answer: question.answer, explanation: question.explanation || undefined }
        : undefined;
    if (!assessment) throw new Error(`Câu ${index + 1} thiếu đáp án hoặc lựa chọn hợp lệ.`);
    material.blocks.push({ id, type: "exercise", authorKind: "question", title: `Câu ${index + 1} · ${question.difficulty}`,
      content: question.prompt, assessment });
    questionStep.blockIds.push(id);
    if (question.visualKey && getVisualPattern(question.visualKey) && visualEvidence[question.visualKey]?.test(question.prompt)) {
      const visual = instantiateVisualPattern(question.visualKey, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
      material.visuals.push(visual);
      const visualBlock = `block_${crypto.randomUUID().replace(/-/g, "")}`;
      material.blocks.push({ id: visualBlock, type: "visual", authorKind: visual.dimension === "3d" ? "visual3d" : "visual2d",
        title: `Hình minh họa câu ${index + 1}`, content: "Hình minh họa được chọn theo dạng hình trong câu hỏi; hãy kiểm tra nhãn và dữ kiện.", visualId: visual.id });
      questionStep.blockIds.push(visualBlock);
      review.push(`Câu ${index + 1}: đối chiếu hình ${visual.dimension.toUpperCase()} với nội dung câu hỏi.`);
    }
  }
  material.learningSteps.push(questionStep);
  return { material, review, questionCount: plan.questions.length };
}

export function buildLessonMaterial(plan: LessonGeneration, grade: string): Material {
  const source = createLessonDraft(plan.title);
  const material: Material = {
    ...source, summary: plan.summary,
    metadata: { grade, topic: plan.topic, type: "lesson", tags: [] },
    blocks: [], visuals: [], learningSteps: [],
  };
  const rich = plan.steps.some(({ blocks }) => blocks.some(({ kind }) => kind === "example"));
  const usedVisuals = new Set<string>();
  for (const [index, entry] of plan.steps.entries()) {
    const stepId = `step_${index}_${crypto.randomUUID().replace(/-/g, "")}`;
    const blockIds: string[] = [];
    for (const item of entry.blocks) {
      const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
      const type = item.kind === "formula" ? "math" : item.kind === "question" ? "exercise" : item.kind === "hint" ? "callout" : "paragraph";
      material.blocks.push({
        id, type, authorKind: item.kind === "example" ? "text" : item.kind,
        title: item.kind === "example" ? item.title || "Ví dụ có lời giải" : item.title || undefined,
        content: item.content, ...(item.kind === "example" ? { teachingRole: "example" as const } : {}),
        ...(type === "exercise" && item.answer ? { assessment: {
          type: "short" as const, points: 1, answer: item.answer, explanation: item.explanation,
        } } : {}),
      });
      blockIds.push(id);
    }
    let visualId: string | undefined;
    const fallback = rich && (entry.phase === "explore" || entry.phase === "concept")
      ? supportedVisualForQuestion([entry.title, entry.objective, ...entry.blocks.map(({ content }) => content)].join(" ")) : null;
    const visualKey = entry.visualKey && getVisualPattern(entry.visualKey) ? entry.visualKey
      : fallback && !usedVisuals.has(fallback) ? fallback : undefined;
    if (visualKey) {
      usedVisuals.add(visualKey);
      const visual = instantiateVisualPattern(visualKey, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
      material.visuals.push(visual);
      visualId = visual.id;
      const block = `block_${crypto.randomUUID().replace(/-/g, "")}`;
      material.blocks.push({ id: block, type: "visual", authorKind: visual.dimension === "3d" ? "visual3d" : "visual2d",
        title: getVisualPattern(visualKey)?.title || "Mô hình tương tác", content: entry.visualCaption || "", visualId });
      const firstQuestion = entry.blocks.findIndex(({ kind }) => kind === "question");
      blockIds.splice(firstQuestion < 0 ? blockIds.length : firstQuestion, 0, block);
    }
    material.learningSteps.push({ id: stepId, title: entry.title, description: "", phase: entry.phase,
      objective: entry.objective, estimatedMinutes: entry.minutes, blockIds, visualId,
      actionLabels: [], visualActions: [] });
  }
  return material;
}

export function splitExamSource(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  const indexes = examSourceQuestionStarts(normalized);
  if (!indexes.length) return { header: "", questions: [normalized] };
  const header = normalized.slice(0, indexes[0]).trim();
  const questions = indexes.map((start, index) => normalized.slice(start, indexes[index + 1] ?? normalized.length).trim());
  return { header, questions };
}

const visualEvidence: Record<string, RegExp> = {
  "cube-slice": /(?:thiết diện|mặt phẳng cắt)[\s\S]{0,120}(?:lập phương)|(?:lập phương)[\s\S]{0,120}(?:thiết diện|mặt phẳng cắt)/i,
  cube: /hình lập phương|khối lập phương/i,
  "triangular-prism": /lăng trụ (?:đứng )?tam giác đều/i,
  "square-pyramid": /hình chóp (?:tứ giác đều|đáy vuông)|chóp đáy vuông/i,
  cylinder: /hình trụ|khối trụ/i,
  cone: /hình nón|khối nón/i,
  sphere: /hình cầu|khối cầu/i,
  tetrahedron: /tứ diện đều/i,
  "circle-line": /đường tròn[\s\S]{0,120}đường thẳng|đường thẳng[\s\S]{0,120}đường tròn/i,
  "triangle-thales": /định lý\s*thales/i,
  "quadratic-roots": /hàm số bậc hai|parabol|y\s*=\s*[^\n]*x\s*(?:\^\s*2|²)/i,
};

export function supportedVisualForQuestion(question: string): string | null {
  if (isConstrainedTetrahedronProblem(question)) return "tetrahedron";
  for (const [key, evidence] of Object.entries(visualEvidence)) if (evidence.test(question)) return key;
  return null;
}

export function buildExamMaterial(source: string, grade: string, requested: Array<{ questionIndex: number; visualKey: string }> = []) {
  const { header, questions } = splitExamSource(source);
  const draft = createLessonDraft("Đề kiểm tra");
  const material: Material = { ...draft, summary: "Bản dựng lại từ đề giáo viên cung cấp. Kiểm tra nội dung và hình trước khi sử dụng.",
    metadata: { grade, topic: "Đề kiểm tra", type: "exercise", tags: [] },
    blocks: [], visuals: [], learningSteps: [] };
  const review: string[] = [`Đã tách ${questions.length} câu từ nguồn; đối chiếu số câu và công thức với tài liệu gốc.`];
  if (header) {
    const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
    material.blocks.push({ id, type: "paragraph", authorKind: "text", title: "Thông tin đề", content: header });
    material.learningSteps.push({ id: `step_${crypto.randomUUID().replace(/-/g, "")}`, title: "Thông tin đề", description: "",
      phase: "objective", objective: "Đọc hướng dẫn của đề", estimatedMinutes: 0, blockIds: [id], actionLabels: [], visualActions: [] });
  }
  questions.forEach((question, index) => {
    const id = `block_${crypto.randomUUID().replace(/-/g, "")}`;
    const blockIds = [id];
    material.blocks.push({ id, type: "paragraph", authorKind: "text", title: `Câu ${index + 1}`, content: question });
    const candidate = requested.find((item) => item.questionIndex === index)?.visualKey || supportedVisualForQuestion(question);
    let visual: VisualSpec | undefined;
    if (material.visuals.length < 30 && candidate && getVisualPattern(candidate) && (visualEvidence[candidate]?.test(question) || candidate === "tetrahedron" && isConstrainedTetrahedronProblem(question))) {
      if (candidate === "tetrahedron" && isConstrainedTetrahedronProblem(question)) {
        try { visual = buildConstrainedTetrahedron(question).visual; } catch { /* Flag ambiguous geometry below. */ }
      }
      if (!visual && candidate === "tetrahedron" && !/tứ diện đều/i.test(question)) {
        review.push(`Câu ${index + 1}: tứ diện có ràng buộc chưa dựng được; cần giáo viên chọn hình.`);
      } else {
        visual ||= instantiateVisualPattern(candidate, `visual_${crypto.randomUUID().replace(/-/g, "")}`);
        visual = { ...visual, id: `visual_${crypto.randomUUID().replace(/-/g, "")}` };
        material.visuals.push(visual);
        const visualBlock = `block_${crypto.randomUUID().replace(/-/g, "")}`;
        material.blocks.push({ id: visualBlock, type: "visual", authorKind: visual.dimension === "3d" ? "visual3d" : "visual2d",
          title: `Hình minh họa câu ${index + 1}`, content: "Hình minh họa cần giáo viên đối chiếu với đề gốc; không mặc định đúng tỷ lệ.", visualId: visual.id });
        blockIds.push(visualBlock);
        review.push(`Câu ${index + 1}: kiểm tra hình ${visual.dimension.toUpperCase()} và mọi nhãn/số đo trước khi dùng.`);
      }
    } else if (/hình|đường tròn|tam giác|tứ diện|lăng trụ|chóp/i.test(question)) {
      review.push(`Câu ${index + 1}: chưa có mô hình đủ chắc chắn; giữ nguyên lời đề để giáo viên chọn hình.`);
    }
    material.learningSteps.push({ id: `step_${crypto.randomUUID().replace(/-/g, "")}`, title: `Câu ${index + 1}`,
      description: "", phase: "assess", objective: "Thực hiện đúng yêu cầu của đề", estimatedMinutes: 5,
      blockIds, visualId: visual?.id, actionLabels: [], visualActions: [] });
  });
  return { material, review, questionCount: questions.length };
}

export function editableExamQuestionSource(source: string) {
  return source.split(/^[ \t]*(?:(?:phần|mục)\s+[IVX\d]+[.\s:–-]+)?(?:(?:bảng\s+)?đáp\s*án(?:\s+tham\s+khảo)?|hướng\s*dẫn\s*chấm|lời\s*giải\s*chi\s*tiết)\s*[:.\-–]?\s*$/imu, 1)[0].trim();
}

function importSectionKind(line: string): ExamKind | undefined {
  const label = line.trim().replace(/^(?:(?:phần|mục)\s+[IVX\d]+\s*[.:–-]?|[IVX]+\s*[.:–-])\s*/iu, "");
  if (/^(?:câu\s+)?(?:trắc\s*nghiệm\s+)?đúng\s*[/–—-]?\s*sai(?=\s|[.:]|$)/iu.test(label)) return "true-false";
  if (/^(?:câu\s+)?(?:trắc\s*nghiệm\s+)?trả\s*lời\s*ngắn(?=\s|[.:]|$)/iu.test(label)) return "short";
  if (/^(?:câu\s+)?trắc\s*nghiệm(?=\s|[.:]|$)/iu.test(label)) return "multiple";
  if (/^(?:câu\s+)?tự\s*luận(?=\s|[.:]|$)/iu.test(label)) return "written";
}

export function buildEditableExamMaterial(source: string, grade: string, requested: Array<{ questionIndex: number; visualKey: string }> = []) {
  const questionSource = editableExamQuestionSource(source);
  const { header, questions } = splitExamSource(questionSource);
  const { material: imported, review } = buildExamMaterial(questionSource, grade, requested);
  const steps = imported.learningSteps.slice(header ? 1 : 0);
  const byId = new Map(imported.blocks.map((block) => [block.id, block]));
  const blocks: Material["blocks"] = [];
  const learningSteps: Material["learningSteps"] = [];
  let section = header.split("\n").map(importSectionKind).filter(Boolean).at(-1);
  let needsAnswerReview = false, needsStructureReview = false;
  for (const [index, raw] of questions.entries()) {
    const lines = raw.split("\n");
    const nextHeading = lines.findIndex((line, n) => n > 0 && importSectionKind(line));
    const sourceText = (nextHeading < 0 ? raw : lines.slice(0, nextHeading).join("\n"))
      .trim().replace(/^(?:(?:Câu|Bài)\s+)?\d{1,3}\s*[.:)]\s*/iu, "").trim();
    const parts = readQuestionParts(sourceText);
    const detected = detectQuestionType(sourceText);
    let kind = section ?? (detected === "multiple_choice" ? "multiple" : detected === "true_false" ? "true-false" : "written");
    const options = parts.items.map(({ content }) => content);
    if (examHasOptions(kind) && (options.length !== 4 || options.some((option) => option.length > 400))) {
      kind = "written";
      needsStructureReview = true;
    }
    needsAnswerReview ||= kind !== "written";
    const { question, step } = createExamQuestion(kind, (examHasOptions(kind) ? parts.stem : sourceText) || sourceText || raw,
      examHasOptions(kind) ? { options } : {});
    const original = steps[index];
    question.title = original.title;
    step.title = original.title;
    step.visualId = original.visualId;
    blocks.push(question);
    for (const id of original.blockIds.slice(1)) {
      const figure = byId.get(id);
      if (figure) {
        blocks.push(figure);
        step.blockIds.push(id);
      }
    }
    learningSteps.push(step);
    if (nextHeading >= 0) section = lines.slice(nextHeading).map(importSectionKind).filter(Boolean).at(-1) ?? section;
  }
  if (needsStructureReview) review.unshift("Một số câu chưa tách đủ bốn phương án hoặc mệnh đề. Nội dung gốc được giữ trong phần Tự luận để rà soát.");
  if (needsAnswerReview || source.trim() !== questionSource) review.unshift("Đối chiếu đáp án trong tài liệu nguồn và nhập vào từng câu trước khi xuất bản.");
  const time = Number(/\b(\d{1,3})\s*phút/iu.exec(header)?.[1]);
  const school = header.split("\n").find((line) => /^trường\s/iu.test(line.trim()))?.trim().slice(0, 160) || "";
  const code = /mã\s*đề\s*[:\-]?\s*([\w-]+)/iu.exec(header)?.[1].slice(0, 24) || "";
  return { material: { ...imported, blocks, learningSteps, exam: {
    ...defaultExamSettings, school, code, duration: time >= 1 && time <= 360 ? time : defaultExamSettings.duration,
  } }, review: review.slice(0, 50), questionCount: questions.length };
}
