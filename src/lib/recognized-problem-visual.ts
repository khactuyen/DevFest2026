import { type AgentResult } from "./contracts";
import { validateAgent } from "./validation";
import { isoscelesRelationVisual } from "./solve-isosceles-visual";
import { tunnelResult } from "./tunnel-visual";
import { cylinderProblemResult, mentionsCylinder } from "./cylinder-problem-visual";
import { AppError } from "./app-error";

/** Prefer reviewed relations over pixel tracing when an image contains a problem. */
export function recognizedProblemVisual(prompt: string): AgentResult | null {
  const tunnel = tunnelResult(prompt);
  if (tunnel) return tunnel;
  const cylinder = cylinderProblemResult(prompt);
  if (cylinder) return cylinder;
  if (mentionsCylinder(prompt)) {
    throw new AppError(422, "Chưa kiểm chứng được cấu trúc hình trụ hoặc phép quay trong đề. Không dùng bộ trace đa giác để thay thế mặt cong; hãy đối chiếu dữ kiện/trục quay.", "unsupported");
  }
  const visual = isoscelesRelationVisual(prompt, [], true);
  if (!visual) return null;
  return validateAgent({
    title: "Tam giác cân và trung điểm",
    explanation: visual.accessibility?.description || "",
    visual,
    entities: [],
    methods: [],
    steps: [],
    suggestions: [
      "Đối chiếu dấu cạnh bằng nhau",
      "Không có số đo độ dài trong đề gốc",
    ],
    source: "template",
  });
}
