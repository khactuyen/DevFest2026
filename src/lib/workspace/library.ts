import type { Material } from "../contracts";
import type { VisualPatternSummary } from "../visual-patterns";
export type LibraryEntry = {
  id: string;
  kind: "material" | "pattern";
  title: string;
  description: string;
  topic: string;
  grade: string;
  tags: string[];
  type: string;
  subject: string;
  level: string;
  dimension: "2d" | "3d";
  engine: string;
  sourceLabel: string;
  statusLabel: string;
  url: string;
  updatedAt: string;
  visualCount: number;
};
export type LibraryFilters = {
  subject: string;
  level: string;
  type: string;
  query: string;
  favoritesOnly: boolean;
  sort: string;
};
export const initialLibraryFilters: LibraryFilters = {
  subject: "all",
  level: "all",
  type: "all",
  query: "",
  favoritesOnly: false,
  sort: "relevant",
};
function subjectFor(topic: string) {
  const value = topic.toLocaleLowerCase("vi");
  if (value.includes("xác suất")) return "probability";
  if (value.includes("thống kê")) return "statistics";
  if (value.includes("rời rạc") || value.includes("đồ thị")) return "discrete";
  if (value.includes("giải tích") || value.includes("tích phân"))
    return "calculus";
  if (/hình|đa diện|vectơ|lượng giác/.test(value)) return "geometry";
  return "algebra";
}
function levelFor(grade: string) {
  if (grade.includes("10")) return "g10";
  if (grade.includes("11")) return "g11";
  if (grade.includes("12")) return "g12";
  return "uni";
}
function gradeLabel(grade = "") {
  const value = grade.trim();
  return !value ? "Mọi cấp độ" : /^lớp\s/i.test(value) ? value : `Lớp ${value}`;
}
export function libraryEntries(
  materials: Material[],
  patterns: VisualPatternSummary[],
): LibraryEntry[] {
  return [
    ...materials.map((m): LibraryEntry => ({
      id: `material:${m.id}`,
      kind: "material",
      title: m.title,
      description: m.summary,
      topic: m.metadata.topic || "Chưa phân loại",
      grade: gradeLabel(m.metadata.grade),
      tags: m.metadata.tags,
      type: m.metadata.type,
      subject: subjectFor(m.metadata.topic),
      level: levelFor(m.metadata.grade),
      dimension: m.visuals.some((v) => v.dimension === "3d") ? "3d" : "2d",
      engine: "Học liệu",
      sourceLabel: "Học liệu của bạn",
      statusLabel: m.status === "published" ? "Đã xuất bản" : "Bản nháp",
      url:
        m.status === "published"
          ? `/material/${m.slug || m.id}`
          : `/studio?material=${m.id}`,
      updatedAt: m.updatedAt || m.createdAt,
      visualCount: m.visuals.length,
    })),
    ...patterns.map((p): LibraryEntry => ({
      id: `pattern:${p.key}`,
      kind: "pattern",
      title: p.title,
      description: p.description,
      topic: p.topic || "Toán học",
      grade: gradeLabel(p.gradeLevels?.[0]),
      tags: p.tags,
      type: "exploration",
      subject: subjectFor(p.topic),
      level: levelFor(p.gradeLevels?.[0] || ""),
      dimension: p.dimension,
      engine: p.engine === "threejs" ? "Three.js" : "JSXGraph",
      sourceLabel: "Thư viện mô hình",
      statusLabel: `${p.dimension.toUpperCase()} tương tác`,
      url: `/playground?pattern=${encodeURIComponent(p.key)}`,
      updatedAt: "",
      visualCount: 1,
    })),
  ];
}
export function filterLibrary(
  entries: LibraryEntry[],
  filters: LibraryFilters,
  favorites: ReadonlySet<string>,
) {
  const query = filters.query.trim().toLocaleLowerCase("vi");
  let visible = entries.filter(
    (e) =>
      (!query ||
        [e.title, e.description, e.topic, ...e.tags]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(query)) &&
      (filters.subject === "all" || e.subject === filters.subject) &&
      (filters.level === "all" || e.level === filters.level) &&
      (filters.type === "all" || e.type === filters.type) &&
      (!filters.favoritesOnly || favorites.has(e.id)),
  );
  if (filters.sort === "newest")
    visible = visible.toSorted((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  if (filters.sort === "duration")
    visible = visible.toSorted((a, b) => a.visualCount - b.visualCount);
  return visible;
}
