import { pattern, patternNames } from "./patterns";
import { threePattern, threePatternNames } from "./three-patterns";
import type { VisualSpec } from "./contracts";

export type VisualDimension = "2d" | "3d";

export type VisualPatternSummary = {
  key: string;
  version: number;
  title: string;
  description: string;
  dimension: VisualDimension;
  engine: "jsxgraph" | "threejs";
  topic: string;
  gradeLevels: string[];
  tags: string[];
};

const twoDTopics: Record<string, { topic: string; tags: string[] }> = {
  "quadratic-roots": { topic: "Hàm số", tags: ["parabol", "nghiệm", "Lớp 10"] },
  "function-transform": { topic: "Hàm số", tags: ["biến đổi", "đồ thị", "Lớp 10"] },
  "linear-function": { topic: "Hàm số", tags: ["đường thẳng", "Lớp 10"] },
  "sine-wave": { topic: "Lượng giác", tags: ["sin", "đồ thị", "Lớp 11"] },
  "unit-circle": { topic: "Lượng giác", tags: ["đường tròn", "góc", "Lớp 10"] },
  "triangle-thales": { topic: "Hình học phẳng", tags: ["Thales", "tam giác", "Lớp 9"] },
  "similar-triangles": { topic: "Hình học phẳng", tags: ["đồng dạng", "tam giác", "Lớp 8"] },
  "vector-addition": { topic: "Vectơ", tags: ["cộng vectơ", "Lớp 10"] },
  "vector-dot-product": { topic: "Vectơ", tags: ["tích vô hướng", "Lớp 10"] },
  "circle-line": { topic: "Hình học phẳng", tags: ["đường tròn", "giao điểm", "Lớp 9"] },
  "triangle-angles": { topic: "Hình học phẳng", tags: ["góc", "tam giác", "Lớp 7"] },
};

const threeDTopics: Record<string, { topic: string; tags: string[] }> = {
  cube: { topic: "Hình học không gian", tags: ["lập phương", "mặt cạnh đỉnh", "Lớp 11"] },
  "triangular-prism": { topic: "Hình học không gian", tags: ["lăng trụ", "Lớp 11"] },
  "square-pyramid": { topic: "Hình học không gian", tags: ["hình chóp", "Lớp 11"] },
  cylinder: { topic: "Hình học không gian", tags: ["hình trụ", "Lớp 12"] },
  cone: { topic: "Hình học không gian", tags: ["hình nón", "Lớp 12"] },
  sphere: { topic: "Hình học không gian", tags: ["hình cầu", "Lớp 12"] },
  tetrahedron: { topic: "Đa diện", tags: ["đa diện đều", "Euler", "Lớp 11"] },
  octahedron: { topic: "Đa diện", tags: ["đa diện đều", "Euler", "Lớp 11"] },
  dodecahedron: { topic: "Đa diện", tags: ["đa diện đều", "Euler", "Lớp 11"] },
  icosahedron: { topic: "Đa diện", tags: ["đa diện đều", "Euler", "Lớp 11"] },
  "cube-slice": { topic: "Hình học không gian", tags: ["thiết diện", "mặt phẳng cắt", "Lớp 11"] },
};

export const visualPatterns: VisualPatternSummary[] = [
  ...Object.entries(patternNames).map(([key, title]) => {
    const metadata = twoDTopics[key] || { topic: "Toán học", tags: [] };
    return {
      key,
      version: 1,
      title,
      description: `Mô hình 2D tương tác: ${title}.`,
      dimension: "2d" as const,
      engine: "jsxgraph" as const,
      topic: metadata.topic,
      gradeLevels: metadata.tags.filter((tag) => tag.startsWith("Lớp")),
      tags: metadata.tags,
    };
  }),
  ...Object.entries(threePatternNames).map(([key, title]) => {
    const metadata = threeDTopics[key] || { topic: "Hình học không gian", tags: [] };
    return {
      key,
      version: 1,
      title,
      description: `Mô hình 3D tương tác: ${title}.`,
      dimension: "3d" as const,
      engine: "threejs" as const,
      topic: metadata.topic,
      gradeLevels: metadata.tags.filter((tag) => tag.startsWith("Lớp")),
      tags: metadata.tags,
    };
  }),
];

export function listVisualPatterns(filters: {
  dimension?: string | null;
  topic?: string | null;
  q?: string | null;
}) {
  const q = filters.q?.trim().toLocaleLowerCase("vi") || "";
  return visualPatterns.filter((pattern) => {
    if (filters.dimension && pattern.dimension !== filters.dimension) return false;
    if (filters.topic && pattern.topic !== filters.topic) return false;
    if (!q) return true;
    return [pattern.title, pattern.topic, ...pattern.tags]
      .join(" ")
      .toLocaleLowerCase("vi")
      .includes(q);
  });
}

export function getVisualPattern(key: string) {
  return visualPatterns.find((pattern) => pattern.key === key) || null;
}

export function instantiateVisualPattern(key: string, id = "visual_main"): VisualSpec {
  const summary = getVisualPattern(key);
  if (!summary) throw Error("Mẫu mô hình không tồn tại");
  const spec =
    summary.dimension === "2d"
      ? pattern(key)
      : threePattern(key as keyof typeof threePatternNames);
  return { ...structuredClone(spec), id, source: { key, version: summary.version } };
}
