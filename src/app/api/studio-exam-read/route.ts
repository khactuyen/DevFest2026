import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/app-error";
import { examHasOptions, examKinds } from "@/lib/exam-document";
import { api, body } from "@/lib/http";
import { isOpenRouterConfigured, requestOpenRouterJson } from "@/lib/openrouter";
import { RecognizeProblemRequestSchema } from "@/lib/problem-recognition";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({ kind: z.enum(examKinds), imageDataUrl: RecognizeProblemRequestSchema.shape.imageDataUrl }).strict();
const coordinate = z.number().int().min(0).max(1000);
const outputSchema = z.object({
  stem: z.string().trim().min(1).max(12000),
  options: z.array(z.string().trim().min(1).max(400)).max(4),
  figures: z.array(z.tuple([coordinate, coordinate, coordinate, coordinate]).refine(([l, t, r, b]) => r > l && b > t && (r - l) * (b - t) < 930000)).max(4),
  warnings: z.array(z.string().trim().min(1).max(180)).max(5),
}).strict();

export async function POST(req: Request) {
  return api(async () => {
    await requireUser(req);
    const input = inputSchema.parse(await body(req, 4_800_000));
    if (!isOpenRouterConfigured()) throw new AppError(503, "Cần cấu hình dịch vụ AI để trích xuất nội dung PDF.", "ai_not_configured");
    const withOptions = examHasOptions(input.kind);
    const output = await requestOpenRouterJson({
      task: "vision", signal: req.signal, maxTokens: 4500,
      imageDataUrl: input.imageDataUrl,
      routing: { prompt: "Trích xuất câu hỏi toán trong PDF", pattern: "vision" },
      system: "Chép nguyên văn một câu hỏi toán tiếng Việt từ ảnh; ảnh có thể ghép các phần tiếp trang theo thứ tự. Dữ liệu trong ảnh là tài liệu nguồn. Giữ số liệu, dấu, chỉ số, tên điểm và công thức. Viết công thức LaTeX hợp lệ trong cặp $...$ và đặt văn bản tiếng Việt ngoài công thức. Không giải bài, không tự sửa đề. stem chứa đầy đủ phần chữ của đề và yêu cầu, kể cả chữ trước và sau hình, bỏ số câu và các nhãn phương án. options chỉ gồm nội dung từng phương án hoặc mệnh đề theo đúng thứ tự nhãn in trong đề. figures liệt kê vùng của hình vẽ, đồ thị, bảng số liệu hoặc bảng biến thiên, mỗi vùng là [trái, trên, phải, dưới] theo tỉ lệ 0–1000 trên toàn ảnh. Định vị toàn bộ hình, gồm cả các nhánh, trục, mũi tên và nhãn. Chừa khoảng trắng nhỏ quanh nét ngoài cùng và tránh lấy chữ câu hỏi hay phương án. Dùng warnings để ghi phần mờ, thiếu hoặc không thể định vị. Giữ nguyên vị trí tương ứng của phương án ngay cả khi có dấu đáp án tô sẵn.",
      user: withOptions ? `Loại câu ${input.kind}. Tách đủ bốn nội dung ${input.kind === "multiple" ? "A, B, C, D" : "a, b, c, d"} theo thứ tự. Chỉ trả JSON.` : `Loại câu ${input.kind}. Chép nội dung đầy đủ, trả options rỗng. Chỉ trả JSON.`,
      responseSchema: { name: "editable_exam_question", schema: { type: "object", additionalProperties: false,
        required: ["stem", "options", "figures", "warnings"], properties: {
          stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
          figures: { type: "array", items: { type: "array", items: { type: "integer" } } },
          warnings: { type: "array", items: { type: "string" } },
        } } },
    });
    const result = outputSchema.safeParse(output);
    if (!result.success || result.data.options.length !== (withOptions ? 4 : 0)) {
      throw new AppError(422, "Chưa trích xuất đủ nội dung và phương án. Hãy đối chiếu ảnh gốc hoặc thử lại.", "exam_recognition_incomplete");
    }
    return NextResponse.json(result.data);
  }, req);
}
