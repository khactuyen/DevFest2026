import { z } from "zod";

// Shared data contract only. Credentials and the Decisions transport stay server-side.
export const SolveRecommendationSchema = z
  .object({
    provider: z.enum(["gemini-decision", "jev"]),
    model: z.string().min(1).max(160),
    preferredMethod: z.string().max(60).nullable(),
    confidence: z.number().min(0).max(1),
    accepted: z.boolean(),
    choiceDistribution: z.record(z.number().min(0).max(1)).optional(),
    choiceSelection: z.string().max(10).optional(),
    statementDecisions: z
      .array(
        z
          .object({
            itemId: z.string().regex(/^[A-Ha-h]$/),
            verdict: z.enum(["true", "false", "unknown"]),
            probabilities: z
              .object({
                true: z.number().min(0).max(1),
                false: z.number().min(0).max(1),
              })
              .strict(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    candidateAnswer: z
      .object({
        optionId: z.string().regex(/^[A-Ha-h]$/),
        confidence: z.number().min(0).max(1),
        probability: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SolveRecommendation = z.infer<typeof SolveRecommendationSchema>;

export function solveDecisionLabel(provider?: SolveRecommendation["provider"]) {
  return provider === "jev" ? "Jev" : "Gemini Decision";
}

export const guidedMethodCatalog = [
  {
    id: "algebra",
    label: "Biến đổi đại số",
    description:
      "Dùng hằng đẳng thức, phân tích nhân tử và các phép biến đổi tương đương.",
  },
  {
    id: "substitution",
    label: "Đặt ẩn phụ / thế",
    description:
      "Đặt ẩn phụ hoặc thế một biểu thức để đưa bài toán về dạng quen thuộc.",
  },
  {
    id: "elimination",
    label: "Khử ẩn",
    description:
      "Kết hợp các phương trình để khử ẩn và giải hệ, rồi đối chiếu điều kiện.",
  },
  {
    id: "geometry",
    label: "Hình học tổng hợp",
    description:
      "Dùng quan hệ góc, tam giác, đường tròn và các định lý hình học từ dữ kiện đã cho.",
  },
  {
    id: "coordinates",
    label: "Tọa độ / vectơ",
    description:
      "Biểu diễn các đối tượng bằng tọa độ hoặc vectơ để thiết lập và tính các quan hệ.",
  },
  {
    id: "trigonometry",
    label: "Lượng giác",
    description:
      "Dùng hệ thức lượng giác, định lý sin, cosin hoặc biến đổi phương trình lượng giác.",
  },
  {
    id: "derivative",
    label: "Đạo hàm và khảo sát",
    description:
      "Dùng đạo hàm để xét biến thiên, tìm cực trị hoặc giải bài toán tối ưu.",
  },
  {
    id: "integral",
    label: "Tích phân",
    description:
      "Dùng nguyên hàm hoặc tích phân xác định để tính đại lượng được yêu cầu.",
  },
  {
    id: "probability",
    label: "Đếm và xác suất",
    description:
      "Xác định không gian mẫu, đếm trường hợp hoặc dùng công thức xác suất phù hợp.",
  },
  {
    id: "inequality",
    label: "Đánh giá và bất đẳng thức",
    description:
      "Dùng các bất đẳng thức và điều kiện xảy ra dấu bằng để đánh giá biểu thức.",
  },
  {
    id: "induction",
    label: "Quy nạp toán học",
    description:
      "Chứng minh trường hợp đầu, giả thiết quy nạp và bước chuyển sang chỉ số tiếp theo.",
  },
  {
    id: "number-theory",
    label: "Số học / đồng dư",
    description:
      "Dùng tính chia hết, đồng dư hoặc phân tích số nguyên để tìm hay chứng minh kết quả.",
  },
] as const;
