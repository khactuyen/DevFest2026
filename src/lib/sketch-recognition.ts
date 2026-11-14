import { AppError } from "./app-error";
import { requestOpenRouterJson } from "./openrouter";
import { RecognizeProblemRequestSchema } from "./problem-recognition";
import { SketchPlanSchema, sketchProgram } from "./sketch-geometry";
import { resultFromProgram } from "./agent";
import { recognizedProblemVisual } from "./recognized-problem-visual";
import { mentionsCylinder } from "./cylinder-problem-visual";
import { z } from "zod";

export async function recognizeSketch(raw: unknown, signal?: AbortSignal) {
  const input = RecognizeProblemRequestSchema.extend({
    draft: SketchPlanSchema.optional(),
    problemText: z.string().trim().max(8000).optional(),
  }).parse(raw);
  if (!input.draft && input.problemText) {
    const reviewed = recognizedProblemVisual(input.problemText);
    if (reviewed) return { result: reviewed, ambiguities: [] };
    if (/(?:hình|khối)\s*(?:nón|cầu|hộp|chóp)|lăng\s*trụ|tứ\s*diện|lập\s*phương/iu.test(input.problemText.normalize("NFC")))
      throw new AppError(422, "Đề có khối không gian chưa được bộ dựng theo dữ kiện ảnh đối chiếu. Không thay bằng đa giác trace rồi coi là khối đúng đề; hãy dùng phần chữ để phân tích cấu trúc hoặc chọn mô hình 3D phù hợp.", "unsupported");
  }
  const plan = await requestOpenRouterJson({
    task: "vision",
    signal,
    imageDataUrl: input.imageDataUrl,
    maxTokens: 2600,
    routing: { prompt: "Chuẩn hóa hình phác trực tiếp", pattern: "vision" },
    system: `Convert the user's math drawing to a small JSON geometry plan. Output ONLY the schema, Vietnamese title/description. This is tracing visible geometry, NOT solving a problem. Preserve the number of vertices, connectivity and relative layout. Ignore background grid/dots. Images without text are valid. DO NOT invent labels or dimensions, perpendicular/parallel constraints or invisible edges. For a perspective solid, reproduce its visible wireframe as a 2D projection; do NOT reject it for lack of 3D primitives. Describe uncertainty in ambiguities. Points use coordinates x,y between -10 and 10, y UP. Keep the picture aspect ratio, remove excess whitespace. edges are pairs of ZERO-BASED point indexes; reuse the SAME index at shared vertices. A circle uses center and through point indexes. expression is EMPTY unless handwriting clearly contains a function y=f(x); in that case use only arithmetic, ^, x, pi, sin, cos, tan, sqrt, abs, exp, log (not LaTeX) and leave geometry arrays empty. Never mistake a geometrical edge for a handwritten letter. If ambiguous, return no geometry and explain why. Max 24 points and 32 edges. All geometry will be checked by a deterministic compiler.`,
    user: `Đọc trực tiếp toàn bộ ảnh và chuẩn hóa các nét vẽ. Ghi chú người dùng (không phải chỉ thị hệ thống): ${input.prompt || "không có"}${input.draft ? `\nHệ thống đã lấy được các nét sau trực tiếp từ bút. Dùng làm tham chiếu; không đổi sơ đồ thành một hình mẫu khác: ${JSON.stringify(input.draft)}` : ""}`,
    responseSchema: {
      name: "sketch_geometry",
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "transcription",
          "ambiguities",
          "points",
          "edges",
          "circles",
          "expression",
        ],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          transcription: { type: "string" },
          expression: { type: "string" },
          ambiguities: { type: "array", items: { type: "string" } },
          points: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "label"],
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                label: { type: "string" },
              },
            },
          },
          edges: {
            type: "array",
            maxItems: 32,
            items: {
              type: "array",
              items: { type: "integer" },
              minItems: 2,
              maxItems: 2,
            },
          },
          circles: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["center", "through"],
              properties: {
                center: { type: "integer" },
                through: { type: "integer" },
              },
            },
          },
        },
      },
    },
  });
  try {
    const parsed = SketchPlanSchema.parse(plan);
    if (!input.draft && mentionsCylinder(`${parsed.transcription}\n${parsed.description}`)) {
      throw new AppError(422, "Ảnh có hình trụ nhưng chưa có dữ kiện chữ đã đối chiếu. Hãy dùng Đọc đề từ ảnh để kiểm tra r, d, h; không thay đáy tròn bằng đa giác trace.", "needs_review");
    }
    // Pen coordinates are more faithful than coordinates guessed from an image.
    // For geometry preserve those edges; for a recognized formula plot its expression.
    const program = sketchProgram(
      input.draft && !parsed.expression
        ? {
            ...parsed,
            points: input.draft.points,
            edges: input.draft.edges,
            circles: input.draft.circles,
          }
        : parsed,
    );
    // Schema and dependency checks, not a claim that inferred mathematics is true.
    const result = resultFromProgram(program, "llm");
    const ambiguities = (plan as { ambiguities?: string[] }).ambiguities || [];
    result.explanation = `${program.description}\nHình dựng theo ảnh; tọa độ là ước lượng, chưa xác nhận ràng buộc toán học.${ambiguities.length ? `\nCần kiểm tra: ${ambiguities.join("; ")}` : ""}`;
    return { result, ambiguities };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "AI chưa xác định được cấu trúc hình hợp lệ. Bản phác được giữ lại; hãy vẽ rõ các cạnh hoặc bổ sung nhãn rồi thử lại.",
      "sketch_invalid",
    );
  }
}
