export type ModelReadout = {
  heading: string;
  formula: string;
  metrics: Array<{ label: string; value: string }>;
  observations: string[];
  focus: Array<{ label: string; targets: string[] }>;
  note?: string;
};

const number = (value: number, digits = 2) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(
        Math.abs(value) < 0.0001 ? 0 : value,
      )
    : "—";

const parameter = (values: Record<string, number>, key: string, fallback = 0) =>
  Number.isFinite(values[key]) ? values[key] : fallback;

const signed = (value: number, suffix = "") =>
  `${value >= 0 ? "+" : "−"} ${number(Math.abs(value))}${suffix}`;

const solid = (heading: string, formula: string, metrics: ModelReadout["metrics"], observations: string[]): ModelReadout => ({
  heading,
  formula,
  metrics,
  observations,
  focus: [{ label: "Xem mô hình", targets: ["solid"] }],
});

export function getModelReadout(
  key: string,
  values: Record<string, number>,
): ModelReadout {
  const a = parameter(values, "a", 1),
    b = parameter(values, "b"),
    c = parameter(values, "c"),
    h = parameter(values, "h"),
    k = parameter(values, "k"),
    r = parameter(values, "radius", 1),
    height = parameter(values, "height", 1),
    size = parameter(values, "size", 2);

  switch (key) {
    case "quadratic-roots": {
      if (Math.abs(a) < 0.0001)
        return {
          heading: "Thông số của đồ thị",
          formula: `f(x) = ${number(b)}x ${signed(c)}`,
          metrics: [
            { label: "Hệ số góc", value: number(b) },
            { label: "Tung độ gốc", value: number(c) },
            { label: "Dạng hiện tại", value: "Bậc nhất" },
          ],
          observations: ["a = 0 nên đồ thị không còn là parabol.", "Kéo a khác 0 để xem lại đỉnh, trục đối xứng và nghiệm."],
          focus: [{ label: "Đồ thị", targets: ["graph"] }],
        };
      const delta = b * b - 4 * a * c,
        x = -b / (2 * a),
        y = c - (b * b) / (4 * a),
        roots = delta < 0 ? [] : [(-b - Math.sqrt(delta)) / (2 * a), (-b + Math.sqrt(delta)) / (2 * a)];
      return {
        heading: "Thông số của đồ thị",
        formula: `f(x) = ${number(a)}x² ${signed(b, "x")} ${signed(c)}`,
        metrics: [
          { label: "Đỉnh I", value: `(${number(x)}; ${number(y)})` },
          { label: "Trục đối xứng", value: `x = ${number(x)}` },
          { label: "Biệt thức Δ", value: number(delta) },
        ],
        observations: [
          a > 0 ? "a > 0: parabol mở lên, đỉnh là điểm thấp nhất." : "a < 0: parabol mở xuống, đỉnh là điểm cao nhất.",
          delta > 0
            ? `Δ > 0: cắt Ox tại x₁ = ${number(roots[0])}, x₂ = ${number(roots[1])}.`
            : delta === 0
              ? `Δ = 0: tiếp xúc Ox tại x = ${number(roots[0])}.`
              : "Δ < 0: đồ thị không cắt trục Ox.",
        ],
        focus: [
          { label: "Xem đỉnh", targets: ["vertex"] },
          { label: "Trục đối xứng", targets: ["axis"] },
          { label: "Nghiệm", targets: ["rootL", "rootR"] },
        ],
      };
    }
    case "function-transform":
      return {
        heading: "Phép biến đổi đồ thị",
        formula: `f(x) = ${number(a)}(x ${signed(-h)})² ${signed(k)}`,
        metrics: [
          { label: "Đỉnh I", value: `(${number(h)}; ${number(k)})` },
          { label: "Trục đối xứng", value: `x = ${number(h)}` },
          { label: "Độ mở", value: `|a| = ${number(Math.abs(a))}` },
        ],
        observations: [a > 0 ? "a > 0: đồ thị mở lên." : "a < 0: đồ thị mở xuống.", "h tịnh tiến ngang, k tịnh tiến dọc so với y = x²."],
        focus: [{ label: "Đỉnh", targets: ["vertex"] }, { label: "Đồ thị", targets: ["graph"] }],
      };
    case "linear-function":
      return {
        heading: "Đọc đồ thị đường thẳng",
        formula: `y = ${number(a)}x ${signed(b)}`,
        metrics: [
          { label: "Hệ số góc", value: number(a) },
          { label: "Cắt Oy", value: `(0; ${number(b)})` },
          { label: "Chiều biến thiên", value: a > 0 ? "Đồng biến" : a < 0 ? "Nghịch biến" : "Hằng số" },
        ],
        observations: [a > 0 ? "Khi x tăng 1 đơn vị, y tăng theo hệ số góc a." : "Hệ số góc âm làm đường thẳng đi xuống từ trái sang phải.", "b quyết định vị trí cắt trục Oy."],
        focus: [{ label: "Giao Oy", targets: ["intercept"] }, { label: "Đồ thị", targets: ["graph"] }],
      };
    case "sine-wave": {
      const amplitude = Math.abs(a), w = parameter(values, "w", 1), phase = parameter(values, "h");
      return {
        heading: "Thông số sóng sin",
        formula: `y = ${number(a)}sin(${number(w)}x ${signed(phase)})`,
        metrics: [
          { label: "Biên độ", value: number(amplitude) },
          { label: "Chu kỳ", value: w === 0 ? "—" : number((2 * Math.PI) / Math.abs(w)) },
          { label: "Pha ban đầu", value: `${number(phase)} rad` },
        ],
        observations: ["|a| điều khiển độ cao của sóng.", "|w| càng lớn thì sóng dao động càng dày trên cùng một đoạn trục."],
        focus: [{ label: "Đồ thị sin", targets: ["graph"] }],
      };
    }
    case "unit-circle": {
      const theta = parameter(values, "theta", 0.7), degrees = (theta * 180) / Math.PI;
      return {
        heading: "Đường tròn lượng giác",
        formula: "P = (cos θ; sin θ),   OP = 1",
        metrics: [
          { label: "Góc θ", value: `${number(theta)} rad` },
          { label: "Góc theo độ", value: `${number(degrees)}°` },
          { label: "P", value: `(${number(Math.cos(theta))}; ${number(Math.sin(theta))})` },
        ],
        observations: ["Hoành độ của P là cos θ; tung độ của P là sin θ.", "Điểm P luôn nằm trên đường tròn bán kính 1."],
        focus: [{ label: "Bán kính OP", targets: ["radius"] }, { label: "Hình chiếu", targets: ["projection"] }, { label: "Điểm P", targets: ["P"] }],
      };
    }
    case "triangle-thales":
      return {
        heading: "Định lý Thales",
        formula: "AB là đường kính ⇒ ∠ACB = 90°",
        metrics: [{ label: "Đường kính AB", value: "6" }, { label: "Bán kính", value: "3" }, { label: "Góc ACB", value: "90°" }],
        observations: ["Mọi góc nội tiếp chắn nửa đường tròn đều là góc vuông.", "Kéo C dọc theo đường tròn: góc ACB vẫn bằng 90°."],
        focus: [{ label: "Góc vuông", targets: ["angle"] }, { label: "Tam giác", targets: ["triangle"] }, { label: "Nửa đường tròn", targets: ["circle"] }],
      };
    case "similar-triangles": {
      const ratio = parameter(values, "r", 1.5);
      return {
        heading: "Tỉ số đồng dạng",
        formula: "ΔADE ∼ ΔABC,   k = r",
        metrics: [{ label: "Tỉ số k", value: number(ratio) }, { label: "AB", value: "2" }, { label: "AD", value: number(2 * ratio) }],
        observations: ["Các góc tương ứng bằng nhau.", `Tỉ số diện tích của hai tam giác là k² = ${number(ratio * ratio)}.`],
        focus: [{ label: "Tam giác nhỏ", targets: ["small"] }, { label: "Tam giác lớn", targets: ["large"] }],
      };
    }
    case "vector-addition": {
      const u = parameter(values, "u", 2), v = parameter(values, "v", 2);
      return {
        heading: "Quy tắc hình bình hành",
        formula: "⃗OS = ⃗OU + ⃗US",
        metrics: [{ label: "⃗u", value: `(${number(u)}; 1)` }, { label: "⃗v", value: `(1; ${number(v)})` }, { label: "⃗u + ⃗v", value: `(${number(u + 1)}; ${number(v + 1)})` }],
        observations: ["Đặt gốc của vectơ thứ hai vào ngọn của vectơ thứ nhất.", "Đường chéo từ O đến S là tổng hai vectơ."],
        focus: [{ label: "Vectơ u", targets: ["uLine"] }, { label: "Vectơ v", targets: ["vLine"] }, { label: "Tổng", targets: ["sum"] }],
      };
    }
    case "vector-dot-product": {
      const u = { x: 3, y: 1 }, v = { x: -1, y: 2 }, dot = u.x * v.x + u.y * v.y;
      const angle = Math.acos(dot / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180 / Math.PI;
      return {
        heading: "Tích vô hướng hai vectơ",
        formula: "u·v = u₁v₁ + u₂v₂",
        metrics: [{ label: "u", value: "(3; 1)" }, { label: "v", value: "(−1; 2)" }, { label: "u·v", value: number(dot) }, { label: "Góc θ", value: `${number(angle)}°` }],
        observations: ["Tích vô hướng âm nên góc giữa u và v là góc tù.", "Kéo U hoặc V để xem tích vô hướng và góc giữa hai vectơ cập nhật."],
        focus: [{ label: "Vectơ u", targets: ["uLine"] }, { label: "Vectơ v", targets: ["vLine"] }],
      };
    }
    case "circle-line":
      return {
        heading: "Vị trí tương đối",
        formula: "d(O, d) < R ⇒ d cắt đường tròn tại hai điểm",
        metrics: [{ label: "Bán kính R", value: "3" }, { label: "Khoảng cách d(O, d)", value: "1" }, { label: "Số giao điểm", value: "2" }],
        observations: ["Vì 1 < 3 nên đường thẳng là cát tuyến.", "Hai giao điểm luôn đối xứng qua đường thẳng đi qua O vuông góc với d."],
        focus: [{ label: "Đường tròn", targets: ["circle"] }, { label: "Cát tuyến", targets: ["line"] }, { label: "Giao điểm", targets: ["I"] }],
      };
    case "triangle-angles":
      return {
        heading: "Tổng ba góc tam giác",
        formula: "∠A + ∠B + ∠C = 180°",
        metrics: [{ label: "AB", value: "6" }, { label: "AC = BC", value: "5" }, { label: "Góc C", value: "≈ 73,74°" }],
        observations: ["Đây là tam giác cân tại C nên ∠A = ∠B.", "Kéo các đỉnh để thấy tổng ba góc vẫn không đổi."],
        focus: [{ label: "Góc C", targets: ["angle"] }, { label: "Tam giác", targets: ["triangle"] }],
      };
    case "cube":
      return solid("Phân tích khối lập phương", "V = a³,   S = 6a²", [{ label: "Cạnh a", value: number(size) }, { label: "Thể tích", value: number(size ** 3) }, { label: "Diện tích", value: number(6 * size ** 2) }], ["Khối có 6 mặt vuông, 12 cạnh và 8 đỉnh.", "Xoay mô hình để quan sát các cặp mặt đối diện song song."]);
    case "triangular-prism":
      return solid("Phân tích lăng trụ tam giác", "V = Sđáy × h", [{ label: "Bán kính đáy", value: number(r) }, { label: "Chiều cao", value: number(height) }, { label: "Cấu trúc", value: "5 mặt · 9 cạnh · 6 đỉnh" }], ["Hai đáy là hai tam giác bằng nhau và song song.", "Ba mặt bên là các hình chữ nhật hoặc hình bình hành."]);
    case "square-pyramid":
      return solid("Phân tích hình chóp", "V = ⅓Sđáy × h", [{ label: "Bán kính đáy", value: number(r) }, { label: "Chiều cao", value: number(height) }, { label: "Cấu trúc", value: "5 mặt · 8 cạnh · 5 đỉnh" }], ["Đỉnh chóp nối với bốn đỉnh của đáy vuông.", "Thay đổi chiều cao để so sánh độ nhọn của chóp."]);
    case "cylinder":
      return solid("Thông số hình trụ", "V = πr²h,   Sxq = 2πrh", [{ label: "Bán kính r", value: number(r) }, { label: "Chiều cao h", value: number(height) }, { label: "Thể tích", value: number(Math.PI * r * r * height) }], ["Hai đáy là hai hình tròn bằng nhau và song song.", "Diện tích xung quanh khai triển thành hình chữ nhật có chiều dài 2πr."]);
    case "cone": {
      const slant = Math.sqrt(r * r + height * height);
      return solid("Thông số hình nón", "V = ⅓πr²h,   l = √(r² + h²)", [{ label: "Bán kính r", value: number(r) }, { label: "Đường sinh l", value: number(slant) }, { label: "Thể tích", value: number((Math.PI * r * r * height) / 3) }], ["Đường sinh, bán kính và chiều cao tạo thành tam giác vuông.", "Tăng h làm hình nón nhọn hơn nhưng diện tích đáy không đổi nếu r giữ nguyên."]);
    }
    case "sphere":
      return solid("Thông số hình cầu", "S = 4πr²,   V = ⁴⁄₃πr³", [{ label: "Bán kính r", value: number(r) }, { label: "Diện tích", value: number(4 * Math.PI * r * r) }, { label: "Thể tích", value: number((4 * Math.PI * r ** 3) / 3) }], ["Mọi điểm trên mặt cầu cách tâm một khoảng bằng r.", "Mặt cắt qua tâm luôn là một đường tròn lớn."]);
    case "tetrahedron":
      return solid("Tứ diện đều", "V = a³√2 / 12", [{ label: "Cạnh a", value: number(size) }, { label: "Số mặt", value: "4" }, { label: "Euler", value: "4 − 6 + 4 = 2" }], ["Mỗi mặt là một tam giác đều.", "Tất cả cạnh và góc mặt đều bằng nhau."]);
    case "octahedron":
      return solid("Bát diện đều", "V = √2a³ / 3", [{ label: "Cạnh a", value: number(size) }, { label: "Số mặt", value: "8" }, { label: "Euler", value: "6 − 12 + 8 = 2" }], ["Mỗi mặt là một tam giác đều.", "Có 6 đỉnh, 12 cạnh và 8 mặt."]);
    case "dodecahedron":
      return solid("Mười hai mặt đều", "Mỗi mặt là ngũ giác đều", [{ label: "Cạnh a", value: number(size) }, { label: "Số mặt", value: "12" }, { label: "Euler", value: "20 − 30 + 12 = 2" }], ["Mười hai mặt đều là các ngũ giác đều bằng nhau.", "Có 20 đỉnh và 30 cạnh."]);
    case "icosahedron":
      return solid("Hai mươi mặt đều", "Mỗi mặt là tam giác đều", [{ label: "Cạnh a", value: number(size) }, { label: "Số mặt", value: "20" }, { label: "Euler", value: "12 − 30 + 20 = 2" }], ["Có 20 mặt tam giác đều bằng nhau.", "Khối có 12 đỉnh và 30 cạnh."]);
    case "cube-slice": {
      const slice = parameter(values, "sliceY");
      return {
        ...solid("Khảo sát thiết diện", "Mặt phẳng cắt ∩ hình lập phương = thiết diện", [{ label: "Cạnh lập phương", value: number(size) }, { label: "Vị trí mặt cắt", value: number(slice) }, { label: "Mặt phẳng", value: "Song song đáy" }], ["Di chuyển mặt phẳng để quan sát hình dạng thiết diện.", "Khi song song với đáy, thiết diện là hình vuông bằng với đáy."]),
        focus: [{ label: "Mặt phẳng cắt", targets: ["slice"] }, { label: "Lập phương", targets: ["solid"] }],
      };
    }
    default:
      return {
        heading: "Thông số mô hình",
        formula: "Khám phá mô hình bằng thao tác trực tiếp",
        metrics: Object.entries(values).map(([label, value]) => ({ label, value: number(value) })),
        observations: ["Kéo hoặc xoay mô hình để quan sát sự thay đổi.", "Chọn đối tượng để làm nổi bật trực tiếp trên hình."],
        focus: [],
      };
  }
}
