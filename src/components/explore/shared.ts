import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";
import { type VisualSpec } from "@/lib/contracts";
import { type ExplorationSession } from "@/lib/exploration-contracts";
import { type LearningTab } from "@/lib/model-learning";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import type { VisualRuntime } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import type { VisualPatternSummary } from "@/lib/visual-patterns";
export type PatternResponse = {
  pattern: VisualPatternSummary;
  spec: VisualSpec;
};

export type ExploreStep = "choose" | "observe" | "explain" | "apply";

export type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";

export type ExploreRuntime =
  VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime;

export type BoardOptions = {
  axes: boolean;
  grid: boolean;
  snap: boolean;
  labels: boolean;
};

export type GeometryAnnotationKind =
  "structure" | "vertex" | "length" | "angle" | "face" | "helper";

export const geometryAnnotationLabels: Record<GeometryAnnotationKind, string> =
  {
    structure: "Cạnh",
    vertex: "Điểm và tên đỉnh",
    length: "Kích thước cạnh",
    angle: "Ký hiệu và số đo góc",
    face: "Các mặt phẳng",
    helper: "Đường phụ minh họa",
  };

export function recognitionHasDiagram(recognition: ProblemRecognition) {
  const textOnly =
    /không\s+có\s+(?:hình|sơ đồ)|chỉ\s+có\s+(?:văn bản|chữ)|no\s+(?:visible\s+)?diagram/i.test(
      recognition.figureDescription,
    );
  return recognition.containsDiagram && !textOnly;
}

export type LassoContext = {
  imageDataUrl: string;
  rect: { x: number; y: number; width: number; height: number };
  inkStrokeCount: number;
  objects: Array<{ label: string; kind: string; details: string[] }>;
  region: string;
};

export async function prepareProblemImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/"))
    throw Error("Hãy chọn tệp ảnh PNG, JPEG hoặc WebP.");
  if (file.size > 12_000_000) throw Error("Tệp ảnh gốc vượt quá 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Không xử lý được ảnh trong trình duyệt.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
    if (dataUrl.length > 4_500_000)
      throw Error("Ảnh sau khi tối ưu vẫn quá lớn. Hãy cắt ảnh nhỏ hơn.");
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

export const steps: Array<{
  id: ExploreStep;
  title: string;
  description: string;
  tab: LearningTab;
}> = [
  {
    id: "choose",
    title: "Chọn mô hình và nhận diện đối tượng",
    description:
      "Chọn một mô hình để xác định đối tượng, biến số và thông tin cần quan sát.",
    tab: "Giới thiệu",
  },
  {
    id: "observe",
    title: "Thao tác và quan sát thay đổi",
    description:
      "Kéo thanh tham số hoặc xoay mô hình. So sánh điều thay đổi với điều được bảo toàn.",
    tab: "Tính chất",
  },
  {
    id: "explain",
    title: "Hình thành nhận xét",
    description:
      "Đọc công thức, tính chất và các giá trị đang xuất hiện trực tiếp trên mô hình.",
    tab: "Giới thiệu",
  },
  {
    id: "apply",
    title: "Kiểm chứng bằng ví dụ",
    description:
      "Đặt câu hỏi hoặc thử ví dụ để kiểm tra kết luận trước khi lưu thành học liệu.",
    tab: "Thử ví dụ",
  },
];

export function hasRecoverableContent(session: ExplorationSession) {
  return Boolean(
    session.visual ||
    session.result ||
    session.prompt.trim() ||
    session.reflectionPrompt.trim() ||
    session.events.length ||
    session.handwritingDraft?.length ||
    session.latexDraft ||
    session.inkDraft?.strokes.length ||
    session.inkDraft?.past.length ||
    session.inkDraft?.future.length ||
    session.inkDraft?.selection,
  );
}
