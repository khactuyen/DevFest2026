import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "essay",
  "multiple_choice",
  "true_false",
  "short_answer",
]);
export const QuestionPreferenceSchema = z.enum([
  "auto",
  "essay",
  "multiple_choice",
  "true_false",
  "short_answer",
]);
export type QuestionPreference = z.infer<typeof QuestionPreferenceSchema>;
export const QUESTION_TYPES = [
  { id: "auto", label: "Tự nhận diện" },
  { id: "essay", label: "Tự luận" },
  { id: "multiple_choice", label: "Trắc nghiệm chọn đáp án" },
  { id: "true_false", label: "Đúng / Sai từng ý" },
  { id: "short_answer", label: "Trả lời ngắn" },
] as const;
export const AssessmentSchema = z
  .object({
    type: QuestionTypeSchema,
    stem: z.string().max(8000),
    items: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-hA-H]$/),
            content: z.string().min(1).max(8000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type QuestionAssessment = z.infer<typeof AssessmentSchema>;
export const ItemConclusionSchema = z
  .object({
    itemId: z.string().regex(/^[a-hA-H]$/),
    verdict: z.enum(["true", "false", "correct"]),
    justification: z.string().trim().min(5).max(400),
  })
  .strict();
export type ItemConclusion = z.infer<typeof ItemConclusionSchema>;

/** Extract labelled source blocks, never fabricate or normalize their mathematics. */
export function readQuestionParts(prompt: string) {
  const source = prompt.trim();
  // Anchored to whitespace, not A(0;100;0), M_1 or formula variables.
  const lineMarkers = [
    ...source.matchAll(/(?:^|\n)[ \t]*\(?([a-hA-H])[).:][ \t]*(?=\S)/g),
  ];
  // Prefer the source's line structure: “tại điểm B. Khi đó ...” inside an
  // existing statement is a sentence, not a new answer option.
  const markers =
    lineMarkers.length >= 2
      ? lineMarkers
      : [...source.matchAll(/(?:^|\s)\(?([a-hA-H])[).:]\s+(?=\S)/g)];
  const letters = markers.map((m) => m[1]);
  const valid =
    markers.length >= 2 &&
    markers.length <= 8 &&
    (letters.join("") === "abcdefgh".slice(0, markers.length) ||
      letters.join("") === "ABCDEFGH".slice(0, markers.length));
  if (!valid) return { stem: source, items: [] as QuestionAssessment["items"] };
  const items = markers.map((m, i) => ({
    id: m[1],
    content: source
      .slice(m.index! + m[0].length, markers[i + 1]?.index ?? source.length)
      .trim(),
  }));
  if (items.some((item) => !item.content))
    return { stem: source, items: [] as QuestionAssessment["items"] };
  return { stem: source.slice(0, markers[0].index).trim(), items };
}

export function detectQuestionType(
  prompt: string,
): QuestionAssessment["type"] | null {
  const parts = readQuestionParts(prompt);
  const instruction = (parts.stem || prompt).normalize("NFC");
  if (
    /đúng\s*[/–—-]?\s*sai|đúng hay sai|xét tính đúng|true\s*[/–-]?\s*false/iu.test(
      instruction,
    )
  )
    return "true_false";
  if (
    /trả\s*lời\s*ngắn|điền\s*(?:đáp\s*án|kết\s*quả)|short.answer/iu.test(
      instruction,
    )
  )
    return "short_answer";
  if (/trắc nghiệm|chọn (?:một |1 )?đáp án|multiple.choice/iu.test(instruction))
    return "multiple_choice";
  if (/(?:^|\n)\s*(?:câu\s+)?tự luận(?![\p{L}\p{M}])/iu.test(instruction))
    return "essay";
  if (
    parts.items.length &&
    parts.items.every((item) => item.id === item.id.toUpperCase())
  )
    return "multiple_choice";
  const task =
    /(?:^|[.!?;:\n]\s*|(?<![\p{L}\p{M}])(?:hãy|thì)\s+)(?:hãy\s+)?(?:tính(?!\s+chất)|tìm|chứng minh|giải|xác định|rút gọn|cho biết|nêu|viết|vẽ|chỉ ra|so sánh|khảo sát|lập\s+(?:phương trình|bảng))(?![\p{L}\p{M}])/iu;
  const requested = parts.items.map((item) =>
    task.test(item.content.normalize("NFC")),
  );
  const commonTask = task.test(instruction) &&
    /(?<![\p{L}\p{M}])(?:các\s+[^.!?;:\n]{1,80}\bsau|từng\s+ý|mỗi\s+ý|lần\s+lượt)(?![\p{L}\p{M}])/iu.test(instruction);
  if (requested.length && (commonTask || requested.every(Boolean))) return "essay";
  // Four declarative lowercase statements (the common exam form). a–d alone
  // does NOT turn an essay with subquestions into a true/false question.
  const declarative =
    /(?:tại thời điểm|khi|quỹ đạo|khoảng cách|(?<!\p{L})(?:là|có)(?!\p{L})|bằng|mệnh đề)/iu;
  if (
    parts.items.length === 4 &&
    parts.items.every(
      (item, index) =>
        item.id === item.id.toLowerCase() &&
        !requested[index] &&
        declarative.test(item.content.normalize("NFC")),
    )
  )
    return "true_false";
  return parts.items.length ? null : "essay";
}

export function questionAssessment(
  prompt: string,
  type: QuestionAssessment["type"],
): QuestionAssessment {
  const source = prompt.trim(),
    parts = readQuestionParts(source);
  if (type === "essay" || type === "short_answer")
    return { type, stem: source, items: [] };
  if (!parts.items.length)
    throw Error(
      "Chưa tách được các lựa chọn/mệnh đề. Hãy giữ nguyên đề và ghi mỗi ý theo a), b), c), d) hoặc A., B., C., D. trên các dòng riêng.",
    );
  return AssessmentSchema.parse({ type, ...parts });
}

export function assessmentGoals(a: QuestionAssessment): string[] | undefined {
  return a.type === "true_false"
    ? a.items.map(
        (item) =>
          `Kết luận đúng hoặc sai cho ý ${item.id} và chứng minh từ dữ kiện gốc.`,
      )
    : a.type === "multiple_choice"
      ? ["Chọn đáp án đúng và chứng minh đáp án đã chọn từ dữ kiện gốc."]
      : undefined;
}

export function isChoiceAssessment(
  a: QuestionAssessment | undefined,
): a is QuestionAssessment & { type: "multiple_choice" | "true_false" } {
  return a?.type === "multiple_choice" || a?.type === "true_false";
}

export function assessmentResultIssues(
  a: QuestionAssessment | undefined,
  results: ItemConclusion[] | undefined,
  partial = false,
): string[] {
  if (!isChoiceAssessment(a))
    return results?.length ? ["unexpected_item_conclusions"] : [];
  if (!results?.length) return partial ? [] : ["missing_item_conclusions"];
  if (
    new Set(results.map((r) => r.itemId)).size !== results.length ||
    results.some((r) => !a.items.some((item) => item.id === r.itemId))
  )
    return ["unknown_or_duplicate_item"];
  if (a.type === "multiple_choice")
    return results.length === 1 && results[0].verdict === "correct"
      ? []
      : ["select_exactly_one_correct_option"];
  return (partial
    ? results.length <= a.items.length
    : results.length === a.items.length) &&
    results.every((r) => r.verdict === "true" || r.verdict === "false")
    ? []
    : ["conclude_every_statement_true_or_false"];
}

export function assessmentAnswer(
  a: QuestionAssessment,
  results: ItemConclusion[],
): string {
  return a.items
    .flatMap((item) => {
      const result = results.find((r) => r.itemId === item.id);
      return result
        ? [
            `${a.type === "multiple_choice" ? "Đáp án" : "Ý"} ${item.id}: ${result.verdict === "correct" ? "Đáp án đúng" : result.verdict === "true" ? "Đúng" : "Sai"}.\n${result.justification}`,
          ]
        : [];
    })
    .join("\n\n");
}
