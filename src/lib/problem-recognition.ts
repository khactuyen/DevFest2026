import { z } from "zod";
import { AppError } from "./app-error";
import { isOpenRouterConfigured, requestOpenRouterJson } from "./openrouter";

const ImageDataUrlSchema = z.string().max(4_500_000).regex(
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
  "Ảnh cần ở định dạng JPEG, PNG hoặc WebP.",
);

export const RecognizeProblemRequestSchema = z.object({
  imageDataUrl: ImageDataUrlSchema,
  mode: z.enum(["photo", "handwriting"]).default("photo"),
  prompt: z.string().max(8000).default(""),
}).strict();

const RecognitionSchema = z.object({
  transcription: z.string().trim().max(8000).default(""),
  figureDescription: z.string().trim().max(1200).default(""),
  containsDiagram: z.boolean().default(false),
  ambiguities: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  needsReview: z.literal(true),
}).strict().refine(value => Boolean(value.transcription || value.figureDescription), "Ảnh chưa có nội dung nhận diện.");

export type ProblemRecognition = z.infer<typeof RecognitionSchema>;

export async function recognizeProblemImage(raw: unknown, signal?: AbortSignal): Promise<ProblemRecognition> {
  const input = RecognizeProblemRequestSchema.parse(raw);
  if (!isOpenRouterConfigured())
    throw new AppError(503, "Nhận diện ảnh cần cấu hình OpenRouter.", "ai_not_configured");

  // The browser resizes images before upload. Keep an independent server-side
  // bound as base64 expands payloads and external providers charge by input.
  const encoded = input.imageDataUrl.slice(input.imageDataUrl.indexOf(",") + 1);
  if (Math.floor(encoded.length * 3 / 4) > 3_300_000)
    throw new AppError(413, "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn 3 MB.", "image_too_large");

  const handwriting = input.mode === "handwriting";
  const result = await requestOpenRouterJson({
    task: "vision",
    signal,
    system: `Bạn là công cụ thị giác và nhận dạng toán học tiếng Việt. Chỉ trả JSON theo schema. transcription chép chữ, số, công thức và nhãn điểm nhìn thấy theo thứ tự; dùng ký pháp toán học rõ ràng, ưu tiên LaTeX cho phân số, căn, số mũ và hệ phương trình. Ảnh có thể chỉ chứa công thức hoặc hình phác, không nhất thiết có câu văn. containsDiagram chỉ true khi ảnh thực sự có sơ đồ/hình vẽ toán học; chữ mô tả hình hoặc công thức không được tính là sơ đồ. Không giải bài, tự sửa đề hoặc suy diễn dữ kiện mờ. figureDescription mô tả có cấu trúc các đối tượng nhìn thấy (điểm, đoạn, đường, đường tròn, đa giác, mũi tên, góc), nhãn, vị trí tương đối, giao cắt và quan hệ hình học; ghi rõ chỗ nào chỉ là ước lượng từ nét vẽ, không khẳng định quan hệ không có dấu hiệu. ambiguities liệt kê phần không đọc chắc hoặc bị che/mờ. needsReview luôn true để người dùng kiểm tra. Nếu không thấy chữ, ghi rõ trong transcription nhưng vẫn mô tả hình trong figureDescription. ${handwriting ? "Ảnh là nét viết và hình do người dùng tự vẽ trên bảng trắng. Phân tích đồng thời chữ viết và toàn bộ sơ đồ phác: nhận ra hình tổng thể, từng cạnh/đường nét, điểm giao, ký hiệu góc/vuông góc/song song và nhãn. Bỏ qua nền lưới; không coi các chấm nền là dữ kiện." : "Ảnh là đề toán; giữ nguyên văn bản, công thức, hình vẽ và dữ kiện theo bố cục nhìn thấy."} Ghi chú người dùng: ${input.prompt || "không có"}`,
    user: handwriting
      ? "Nhận diện chữ viết và sơ đồ hình học trong ảnh. Hãy chép nguyên văn công thức/nhãn vào transcription, mô tả rõ các nét hình và quan hệ nhìn thấy vào figureDescription. containsDiagram phản ánh có hình vẽ thật hay chỉ có chữ. Không biến thành lời giải, không tự thêm điểm hay dữ kiện. Đánh dấu từng chỗ chưa chắc chắn."
      : "Hãy chép lại đề toán trong ảnh và xác định ảnh có sơ đồ hình học thật hay chỉ có văn bản. Đánh dấu các chỗ không chắc chắn, đừng tự điền dữ kiện.",
    routing: { prompt: handwriting ? "Nhận dạng công thức viết tay" : "Nhận diện đề toán từ ảnh", pattern: "vision" },
    imageDataUrl: input.imageDataUrl,
    maxTokens: 1800,
    responseSchema: {
      name: "problem_image_recognition",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["transcription", "figureDescription", "containsDiagram", "ambiguities", "needsReview"],
        properties: {
          transcription: { type: "string" },
          figureDescription: { type: "string" },
          containsDiagram: { type: "boolean" },
          ambiguities: { type: "array", items: { type: "string" } },
          needsReview: { type: "boolean" },
        },
      },
    },
  });
  try {
    const reviewed = result && typeof result === "object" && !Array.isArray(result)
      ? { ...result, needsReview: true }
      : result;
    return RecognitionSchema.parse(reviewed);
  } catch {
    throw new AppError(422, "Không đọc được cấu trúc đề toán từ ảnh. Hãy thử ảnh rõ hơn hoặc nhập đề bằng văn bản.", "recognition_invalid");
  }
}
