/** Reviewed sample syntax: these are complete problems, not fuzzy intent hints. */
export const SOLVER_EXAMPLE_GROUPS = [
  {
    id: "equations",
    label: "Phương trình & bất phương trình",
    examples: [
      {
        label: "Phương trình bậc hai",
        preview: "x² − 5x + 6 = 0",
        source: "x² - 5x + 6 = 0",
      },
      {
        label: "Đa thức bậc ba",
        preview: "x³ − 6x² + 11x − 6 = 0",
        source: "x^3-6x^2+11x-6=0",
      },
      {
        label: "Phân thức có điều kiện",
        preview: "(x² − 1)/(x − 1) = 0",
        source: "(x^2-1)/(x-1)=0",
      },
      {
        label: "Giá trị tuyệt đối",
        preview: "|2x − 3| ≤ 5",
        source: "abs(2x-3)<=5",
      },
      {
        label: "Căn thức, loại nghiệm ngoại lai",
        preview: "√(x + 1) = x − 1",
        source: "sqrt(x+1)=x-1",
      },
      {
        label: "Xét dấu phân thức",
        preview: "(x − 1)/(x − 2) > 0",
        source: "(x-1)/(x-2)>0",
      },
    ],
  },
  {
    id: "systems",
    label: "Hệ phương trình & ma trận",
    examples: [
      {
        label: "Gauss–Jordan hoặc Cramer",
        preview: "x + y = 3; x − y = 1",
        source: "Giải hệ phương trình: x+y=3; x-y=1",
      },
      {
        label: "Hệ có vô số nghiệm",
        preview: "x + y = 2; 2x + 2y = 4",
        source: "Giải hệ phương trình: x+y=2; 2x+2y=4",
      },
      {
        label: "Định thức 3×3",
        preview: "Ma trận [[1,2,3],[0,4,5],[1,0,6]]",
        source: "Định thức [[1,2,3],[0,4,5],[1,0,6]]",
      },
      {
        label: "Ma trận nghịch đảo",
        preview: "[[1,2],[3,4]]⁻¹",
        source: "Ma trận nghịch đảo [[1,2],[3,4]]",
      },
    ],
  },
  {
    id: "calculus",
    label: "Đạo hàm, tích phân & giới hạn",
    examples: [
      {
        label: "Đạo hàm đa thức",
        preview: "f(x) = x⁵ − 3x² + 2",
        source: "Đạo hàm x^5-3x^2+2",
      },
      {
        label: "Quy tắc đạo hàm thương",
        preview: "f(x) = (x + 1)/(x − 1)",
        source: "Đạo hàm (x+1)/(x-1)",
      },
      {
        label: "Nguyên hàm và hằng số C",
        preview: "∫(3x² − 4x + 2) dx",
        source: "Nguyên hàm 3x^2-4x+2",
      },
      {
        label: "Tích phân xác định",
        preview: "∫₀¹ 3x² dx",
        source: "Tích phân từ 0 đến 1: 3x^2",
      },
      {
        label: "Giới hạn dạng 0/0",
        preview: "x → 1: (x² − 1)/(x − 1)",
        source: "Giới hạn khi x -> 1: (x^2-1)/(x-1)",
      },
      {
        label: "Phương trình tiếp tuyến",
        preview: "y = x² tại x = 2",
        source: "Tiếp tuyến y=x^2 tại x=2",
      },
    ],
  },
  {
    id: "expressions",
    label: "Khai triển, phân tích & rút gọn",
    examples: [
      {
        label: "Khai triển lũy thừa",
        preview: "(x + 2)⁴",
        source: "Khai triển (x+2)^4",
      },
      {
        label: "Phân tích đa thức",
        preview: "x³ − 6x² + 11x − 6",
        source: "Phân tích thành nhân tử x^3-6x^2+11x-6",
      },
      {
        label: "Khử nhân tử, giữ miền gốc",
        preview: "(x² − 1)/(x − 1)",
        source: "Rút gọn (x^2-1)/(x-1)",
      },
    ],
  },
  {
    id: "sequences",
    label: "Dãy số & hệ thức truy hồi",
    examples: [
      {
        label: "Truy hồi hai nghiệm hữu tỉ",
        preview: "aₙ = 5aₙ₋₁ − 6aₙ₋₂",
        source: "Tìm công thức tổng quát: a_n=5a_{n-1}-6a_{n-2};a_0=1,a_1=5",
      },
      {
        label: "Fibonacci bằng căn thức chính xác",
        preview: "aₙ = aₙ₋₁ + aₙ₋₂",
        source: "Tìm công thức tổng quát: a_n=a_{n-1}+a_{n-2};a_0=0,a_1=1",
      },
      {
        label: "Tổng cấp số cộng",
        preview: "u₁ = 2, d = 3; tìm S₅",
        source: "Cấp số cộng: u_1=2; d=3; tính S_5",
      },
      {
        label: "Tổng cấp số nhân",
        preview: "u₁ = 2, q = 3; tìm S₄",
        source: "Cấp số nhân: u_1=2; q=3; tính S_4",
      },
    ],
  },
  {
    id: "functions",
    label: "Mũ, logarit & lượng giác",
    examples: [
      { label: "Phương trình mũ", preview: "4ˣ = 8", source: "4^x=8" },
      {
        label: "Phương trình logarit",
        preview: "log₂(2x + 1) = 3",
        source: "log_2(2x+1)=3",
      },
      {
        label: "Đủ nhánh và chu kỳ",
        preview: "sin(2x) = 1/2",
        source: "sin(2x)=1/2",
      },
    ],
  },
  {
    id: "discrete",
    label: "Tổ hợp & số học",
    examples: [
      { label: "Tổ hợp", preview: "C(10,3)", source: "C(10,3)" },
      { label: "Chỉnh hợp", preview: "A(5,3)", source: "A(5,3)" },
      {
        label: "Ước chung lớn nhất",
        preview: "UCLN(84,30)",
        source: "UCLN(84,30)",
      },
      {
        label: "Phân tích nguyên tố",
        preview: "360 = ?",
        source: "Phân tích thừa số nguyên tố 360",
      },
      { label: "Lũy thừa modulo", preview: "2¹⁰ mod 7", source: "2^10 mod 7" },
    ],
  },
  {
    id: "statistics",
    label: "Thống kê & xác suất nhị thức",
    examples: [
      {
        label: "Trung bình cộng",
        preview: "[1,2,3,4]",
        source: "Trung bình [1,2,3,4]",
      },
      {
        label: "Phương sai tổng thể",
        preview: "[1,2,3] · chia cho n",
        source: "Phương sai tổng thể [1,2,3]",
      },
      {
        label: "Phương sai mẫu",
        preview: "[1,2,3] · chia cho n−1",
        source: "Phương sai mẫu [1,2,3]",
      },
      {
        label: "Xác suất theo mô hình nhị thức",
        preview: "n = 3, k = 2, p = 1/2",
        source: "Nhị thức(n=3,k=2,p=1/2)",
      },
    ],
  },
  {
    id: "vectors",
    label: "Vector & tọa độ",
    examples: [
      {
        label: "Tích vô hướng",
        preview: "(1,2,3) · (4,5,6)",
        source: "Tích vô hướng (1,2,3) và (4,5,6)",
      },
      {
        label: "Tích có hướng",
        preview: "(1,0,0) × (0,1,0)",
        source: "Tích có hướng (1,0,0) và (0,1,0)",
      },
      {
        label: "Khoảng cách Euclid",
        preview: "(1,2) đến (4,6)",
        source: "Khoảng cách (1,2) và (4,6)",
      },
    ],
  },
];
