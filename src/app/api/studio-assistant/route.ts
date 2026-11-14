import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body } from "../../../lib/http";
import { requireUser } from "../../../lib/auth/server";
import { requestOpenRouterJson } from "../../../lib/openrouter";
import { getVisualPattern, visualPatterns } from "../../../lib/visual-patterns";
import { AppError } from "../../../lib/app-error";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  kind: z.enum(["outline", "content", "question", "activity", "objective", "example", "review"]),
  title: z.string().trim().max(200),
  grade: z.string().trim().max(60),
  topic: z.string().trim().max(100),
  goal: z.string().trim().max(1000),
  step: z.object({
    title: z.string().trim().max(200),
    objective: z.string().trim().max(1000),
    phase: z.string().max(30),
    content: z.string().max(3000),
    visualKey: z.string().max(80).optional(),
  }).optional(),
  outline: z.array(z.object({ title: z.string().max(200), objective: z.string().max(1000), phase: z.string().max(30) })).max(12).default([]),
}).strict();

const SuggestionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  content: z.string().trim().max(3000).default(""),
  phase: z.enum(["warmup", "objective", "explore", "concept", "practice", "assess", "summary"]).optional(),
  minutes: z.number().int().min(0).max(90).optional(),
  visualKey: z.string().max(80).optional(),
});
const ResponseSchema = z.object({ suggestions: z.array(SuggestionSchema).min(1).max(5) });
const suggestionResponseSchema = {
  name: "studio_suggestions",
  schema: {
    type: "object", additionalProperties: false, required: ["suggestions"],
    properties: { suggestions: { type: "array", minItems: 1, maxItems: 5, items: {
      type: "object", additionalProperties: false,
      required: ["title", "description", "content"],
      properties: {
        title: { type: "string" }, description: { type: "string" }, content: { type: "string" },
        phase: { type: "string", enum: ["warmup", "objective", "explore", "concept", "practice", "assess", "summary"] },
        minutes: { type: "integer", minimum: 0, maximum: 90 }, visualKey: { type: "string" },
      },
    } } },
  },
};

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = RequestSchema.parse(await body(req, 12_000));
    const available = visualPatterns.map(({ key, title }) => ({ key, title }));
    const requestSuggestion = (repair = "") => requestOpenRouterJson({
      task: "material",
      routing: { prompt: `${input.kind} ${input.title} ${input.topic}` },
      system: [
        "Bạn là trợ lý biên soạn bài giảng toán bằng tiếng Việt. Trả JSON duy nhất với mảng suggestions gồm 1-5 phần tử. MỖI phần tử bắt buộc có title ngắn không rỗng, description và content là chuỗi; các trường phase, minutes, visualKey chỉ thêm khi phù hợp.",
        "Dựa trên thông tin người dùng cung cấp, không tự khẳng định định lý hoặc kết quả toán học chưa kiểm chứng.",
        "Nếu gợi ý mô hình, visualKey PHẢI là một key trong danh mục; không bịa mô hình mới. Nếu không phù hợp, bỏ visualKey.",
        "Với outline: mỗi gợi ý là một hoạt động học tập, dùng phase trong warmup/objective/explore/concept/practice/assess/summary và minutes phù hợp.",
        "Với review: nêu đúng điểm cần giáo viên kiểm tra, không tuyên bố bài đã đạt chuẩn. Với câu hỏi: content là câu hỏi dành cho học sinh.",
        `Danh mục mô hình có thật: ${JSON.stringify(available)}.`,
      ].join("\n"),
      user: JSON.stringify(input),
      repair,
      responseSchema: suggestionResponseSchema,
      maxTokens: 2400,
      signal: req.signal,
    });
    let parsed = ResponseSchema.safeParse(await requestSuggestion());
    if (!parsed.success) {
      const problems = parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      parsed = ResponseSchema.safeParse(await requestSuggestion(`\nPhản hồi trước sai cấu trúc (${problems}). Hãy tạo JSON mới; từng gợi ý phải có title, description, content.`));
    }
    if (!parsed.success) throw new AppError(502, "AI chưa tạo được gợi ý đầy đủ. Hãy thử lại.", "studio_suggestion_invalid");
    const suggestions = parsed.data.suggestions.map((item) => ({
      ...item,
      visualKey: item.visualKey && getVisualPattern(item.visualKey) ? item.visualKey : undefined,
    }));
    return NextResponse.json({ suggestions, source: "ai" });
  }, req);
}
