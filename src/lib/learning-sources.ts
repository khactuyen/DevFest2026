export type LearningSource = {
  provider: string;
  title: string;
  url: string;
  license: string;
  use: string;
  /** "adapted" means the Vietnamese lesson is authored from this CC-licensed scope. */
  role: "adapted" | "reference";
  attribution?: string;
};

const voer: LearningSource = {
  provider: "VOER",
  title: "Thư viện Học liệu Mở Việt Nam",
  url: "https://voer.edu.vn/",
  license: "CC BY 3.0, trừ khi học liệu ghi khác",
  use: "Nguồn tiếng Việt để đối chiếu thuật ngữ và mở rộng bài học.",
  role: "reference",
};

const quadratic: LearningSource = {
  provider: "OpenStax",
  title: "College Algebra 2e · Quadratic Functions",
  url: "https://openstax.org/books/college-algebra-2e/pages/5-1-quadratic-functions",
  license: "CC BY 4.0",
  use: "Bản tiếng Việt được biên soạn theo phạm vi: parabol, đỉnh, cực trị và đồ thị hàm bậc hai.",
  role: "adapted",
  attribution: "Tham khảo và biên soạn từ College Algebra 2e của OpenStax, CC BY 4.0; Math Studio đã điều chỉnh bằng tiếng Việt. Access for free at openstax.org.",
};

const linear: LearningSource = {
  provider: "OpenStax",
  title: "College Algebra 2e · Linear Functions",
  url: "https://openstax.org/books/college-algebra-2e/pages/4-1-linear-functions",
  license: "CC BY 4.0",
  use: "Bản tiếng Việt được biên soạn theo phạm vi: hệ số góc, đồ thị và các quan hệ giữa đường thẳng.",
  role: "adapted",
  attribution: "Tham khảo và biên soạn từ College Algebra 2e của OpenStax, CC BY 4.0; Math Studio đã điều chỉnh bằng tiếng Việt. Access for free at openstax.org.",
};

const transformations: LearningSource = {
  provider: "OpenStax",
  title: "College Algebra 2e · Transformation of Functions",
  url: "https://openstax.org/books/college-algebra-2e/pages/3-5-transformation-of-functions",
  license: "CC BY 4.0",
  use: "Bản tiếng Việt được biên soạn theo phạm vi: tịnh tiến, đối xứng, co giãn và phối hợp phép biến đổi.",
  role: "adapted",
  attribution: "Tham khảo và biên soạn từ College Algebra 2e của OpenStax, CC BY 4.0; Math Studio đã điều chỉnh bằng tiếng Việt. Access for free at openstax.org.",
};

const trigonometry: LearningSource = {
  provider: "OpenStax",
  title: "Precalculus 2e · Trigonometric Functions",
  url: "https://openstax.org/books/precalculus-2e/pages/5-introduction-to-trigonometric-functions",
  license: "CC BY-NC-SA 4.0",
  use: "Nguồn tham khảo về đường tròn lượng giác, sin và ứng dụng lượng giác.",
  role: "reference",
};

const vectors: LearningSource = {
  provider: "OpenStax",
  title: "Precalculus 2e · Vectors",
  url: "https://openstax.org/books/precalculus-2e/pages/8-key-concepts",
  license: "CC BY-NC-SA 4.0",
  use: "Nguồn tham khảo về thành phần, tổng và hiệu vectơ.",
  role: "reference",
};

const geometry: LearningSource = {
  provider: "OpenStax",
  title: "Prealgebra 2e · Geometry Applications",
  url: "https://openstax.org/books/prealgebra-2e/pages/9-4-use-properties-of-rectangles-triangles-and-trapezoids",
  license: "CC BY-NC-SA 4.0",
  use: "Nguồn tham khảo về tam giác, đường tròn và lập luận hình học.",
  role: "reference",
};

const solids: LearningSource = {
  provider: "OpenStax",
  title: "Prealgebra 2e · Volume and Surface Area",
  url: "https://openstax.org/books/prealgebra-2e/pages/9-6-solve-geometry-applications-volume-and-surface-area",
  license: "CC BY-NC-SA 4.0",
  use: "Nguồn tham khảo về thể tích và diện tích bề mặt khối 3D.",
  role: "reference",
};

const linearKeys = new Set(["linear-function"]);
const trigonometryKeys = new Set(["sine-wave", "unit-circle"]);
const vectorKeys = new Set(["vector-addition"]);
const flatGeometryKeys = new Set([
  "triangle-thales",
  "similar-triangles",
  "circle-line",
  "triangle-angles",
]);

/**
 * The lesson text is authored for Math Studio. These links are the visible,
 * license-aware reading sources that inform the curriculum and let learners
 * continue studying from the original provider.
 */
export function getLearningSources(key: string): LearningSource[] {
  if (key === "quadratic-roots") return [voer, quadratic];
  if (key === "function-transform") return [voer, transformations];
  if (linearKeys.has(key)) return [voer, linear];
  if (trigonometryKeys.has(key)) return [voer, trigonometry];
  if (vectorKeys.has(key)) return [voer, vectors];
  if (flatGeometryKeys.has(key)) return [voer, geometry];
  return [voer, solids];
}
