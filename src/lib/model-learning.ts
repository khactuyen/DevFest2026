import type { ModelReadout } from "./model-inspector";

export type LearningTab = "Giới thiệu" | "Tính chất" | "Ứng dụng" | "Thử ví dụ";
export type LearningSection = {
  tab: LearningTab;
  title: string;
  lead: string;
  groups: Array<{ label: string; items: string[] }>;
};

type Knowledge = {
  concept: string;
  formulas: string[];
  learningGoals?: string[];
  properties: string[];
  applications: string[];
  example: { question: string; solution: string[] };
};

const knowledge: Record<string, Knowledge> = {
  segment: {
    concept: "Đoạn thẳng AB gồm hai đầu mút A, B và các điểm nằm giữa chúng; khác với đường thẳng kéo dài vô hạn.",
    formulas: ["AB = √((xB − xA)² + (yB − yA)²).", "Trung điểm M có tọa độ ((xA + xB)/2; (yA + yB)/2)."],
    properties: ["Hai đầu mút xác định một đoạn thẳng duy nhất.", "Kéo một đầu mút làm thay đổi vị trí hoặc độ dài; đường nối vẫn đi qua cả hai đầu.", "Nét liền/nét đứt là kiểu trình bày, không thay đổi độ dài hình học."],
    applications: ["Biểu diễn cạnh, đường chéo và đường phụ trong hình học.", "Đo khoảng cách giữa hai điểm theo hệ tọa độ đang dùng."],
    example: { question: "A(0; 0), B(3; 4). Tính AB và tọa độ trung điểm.", solution: ["AB = √(3² + 4²) = 5.", "M có tọa độ (1,5; 2)."] },
  },
  "geometry-problem": {
    concept: "Các đỉnh, cạnh, độ dài và góc trên tứ diện được dựng từ dữ kiện đề bài. Hai mặt phẳng (ABC) và (ACD) giao nhau theo cạnh AC.",
    formulas: ["Góc giữa hai mặt phẳng được đo bằng góc giữa hai đường trong một mặt cắt vuông góc với giao tuyến AC.", "Nếu n₁, n₂ là pháp tuyến của hai mặt phẳng, cos φ = |n₁ · n₂| / (|n₁| |n₂|)."],
    learningGoals: ["Đối chiếu từng góc vuông và độ dài trên hình với đề.", "Xoay mô hình để thấy rõ hai mặt ABC, ACD và cạnh chung AC.", "Phân biệt góc được cho giữa AD, CB với góc nhị diện cần tính."],
    properties: ["Các ký hiệu ô vuông cho biết đỉnh của góc 90°.", "Góc giữa hai đường thẳng chéo nhau được đo sau khi đưa hai hướng về cùng một gốc phụ.", "Góc giữa hai mặt phẳng được lấy theo góc nhọn giữa hai mặt."],
    applications: ["Phân tích hình học không gian từ đề bài có ràng buộc độ dài và góc.", "Kiểm tra một mô hình 3D có thỏa mãn đầy đủ dữ kiện hay không."],
    example: { question: "Tìm giao tuyến của (ABC) và (ACD), rồi xác định cách đo góc giữa hai mặt phẳng.", solution: ["Hai mặt có chung A và C nên giao tuyến là AC.", "Dựng mặt cắt vuông góc AC; góc nhọn giữa hai giao tuyến trong mặt cắt là góc cần tính.", "Đọc cos φ và kết quả suy ra ở bảng thông tin hiện tại."] },
  },
  circle: {
    concept: "Đường tròn tâm I(h; k), bán kính r là tập hợp các điểm cách I một khoảng không đổi r.",
    formulas: ["(x − h)² + (y − k)² = r².", "Chu vi C = 2πr = πd.", "Diện tích hình tròn S = πr².", "Khoảng cách từ tâm đến mọi điểm trên đường tròn bằng r."],
    learningGoals: ["Đọc tâm và bán kính từ hình vẽ hoặc phương trình.", "Phân biệt đường tròn (đường biên) với hình tròn (miền bên trong).", "Theo dõi chu vi và diện tích khi bán kính thay đổi."],
    properties: ["Bán kính vuông góc với tiếp tuyến tại tiếp điểm.", "Đường kính là dây cung lớn nhất và bằng 2r.", "Các dây bằng nhau cách đều tâm; đường vuông góc từ tâm đến dây sẽ chia đôi dây."],
    applications: ["Tính kích thước bánh xe, ống, mặt đồng hồ và các chi tiết tròn.", "Mô tả quỹ đạo chuyển động tròn.", "Tính diện tích hoặc chiều dài cung trong thiết kế và đo đạc."],
    example: { question: "Đường tròn có tâm I(2; −1), bán kính 3. Viết phương trình và tính chu vi.", solution: ["Thay h = 2, k = −1, r = 3 vào dạng chuẩn: (x − 2)² + (y + 1)² = 9.", "Chu vi C = 2πr = 6π ≈ 18,85."] },
  },
  polygon: {
    concept: "Đa giác là hình phẳng khép kín được tạo bởi các đoạn thẳng nối các đỉnh liên tiếp.",
    formulas: ["Chu vi P bằng tổng độ dài các cạnh.", "Diện tích đa giác đơn có thể tính bằng công thức dây giày: S = ½|Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)|.", "Tổng góc trong đa giác n cạnh là (n − 2) × 180°."],
    properties: ["Một đa giác đơn không tự cắt các cạnh.", "Số cạnh bằng số đỉnh.", "Với đa giác đều cạnh a: P = na; S = ½ × chu vi × đường cao từ tâm đến cạnh."],
    applications: ["Tính diện tích thửa đất và mặt bằng từ tọa độ các đỉnh.", "Mô hình hóa mặt cắt, mái và các chi tiết phẳng.", "Phân rã hình phức tạp thành các tam giác để tính toán."],
    example: { question: "Một hình chữ nhật có kích thước 4 × 3. Tính chu vi và diện tích.", solution: ["P = 2(4 + 3) = 14.", "S = 4 × 3 = 12 đơn vị diện tích."] },
  },
  "extruded-polygon": {
    concept: "Đùn một đa giác theo phương vuông góc với mặt phẳng đáy tạo thành một khối lăng trụ có tiết diện không đổi.",
    formulas: ["Thể tích V = S_đáy × h.", "Diện tích xung quanh lăng trụ đứng S_xq = P_đáy × h.", "Hai đáy song song, bằng nhau và có diện tích S_đáy."],
    properties: ["h là khoảng cách vuông góc giữa hai đáy.", "Nếu đáy là đa giác không đều, tính S_đáy từ tọa độ hoặc chia thành các hình đơn giản.", "Phép đùn giữ nguyên hình dạng và kích thước của đáy."],
    applications: ["Mô phỏng vật thể đùn, thanh định hình và khối lăng trụ.", "Tính thể tích từ bản vẽ mặt cắt.", "Liên hệ diện tích đáy với thể tích khi thay đổi chiều sâu."],
    example: { question: "Đùn hình chữ nhật diện tích 12 thêm chiều sâu 2. Tính thể tích.", solution: ["V = S_đáy × h = 12 × 2 = 24 đơn vị khối.", "Khối có hai đáy hình chữ nhật bằng nhau, song song."] },
  },
  "quadratic-roots": {
    concept: "Hàm số bậc hai có dạng y = ax² + bx + c (a ≠ 0). Đồ thị là một parabol; hệ số a quyết định chiều mở và độ hẹp/rộng.",
    formulas: ["Δ = b² − 4ac.", "Nếu Δ ≥ 0: x₁,₂ = (−b ± √Δ)/(2a).", "Đỉnh I(−b/(2a); −Δ/(4a)); trục đối xứng x = −b/(2a).", "Viète (khi có nghiệm): x₁ + x₂ = −b/a, x₁x₂ = c/a."],
    learningGoals: ["Nhận diện parabol từ phương trình và đọc các đặc trưng trên đồ thị.", "Xác định đỉnh để giải bài toán giá trị lớn nhất hoặc nhỏ nhất.", "Liên hệ nghiệm thực với các giao điểm của parabol và trục Ox."],
    properties: ["a > 0: parabol mở lên và có giá trị nhỏ nhất tại đỉnh; a < 0: mở xuống và có giá trị lớn nhất tại đỉnh.", "Δ > 0 có hai nghiệm phân biệt; Δ = 0 có nghiệm kép; Δ < 0 không có nghiệm thực.", "Hai điểm có hoành độ đối xứng qua trục x = −b/(2a) có cùng tung độ."],
    applications: ["Mô tả quỹ đạo ném xiên, đường bay của bóng hoặc tia nước.", "Tìm cực trị trong bài toán tối ưu diện tích, doanh thu và chi phí.", "Khảo sát dấu để giải bất phương trình bậc hai."],
    example: { question: "Khảo sát f(x) = x² − 4x + 3.", solution: ["Δ = 16 − 12 = 4 nên x₁ = 1, x₂ = 3.", "Đỉnh I(2; −1), trục đối xứng x = 2.", "Vì a > 0, f(x) đạt GTNN −1 tại x = 2."] },
  },
  "cubic-function": {
    concept: "Hàm số bậc ba có dạng f(x) = ax³ + bx² + cx + d (a ≠ 0). Đồ thị là một đường cong liên tục dạng chữ S và luôn có một điểm uốn.",
    formulas: ["f(x) = ax³ + bx² + cx + d, a ≠ 0.", "f'(x) = 3ax² + 2bx + c.", "Hoành độ điểm uốn: x₀ = −b/(3a).", "Điểm cực trị xuất hiện khi phương trình f'(x) = 0 có hai nghiệm phân biệt, tương đương b² − 3ac > 0."],
    learningGoals: ["Liên hệ từng hệ số với dáng điệu của đồ thị.", "Nhận biết điểm uốn và dự đoán chiều đi của đồ thị từ dấu của a.", "Dùng đạo hàm để xác định khoảng đồng biến, nghịch biến và cực trị."],
    properties: ["a > 0: đồ thị đi từ dưới trái lên trên phải; a < 0: đi từ trên trái xuống dưới phải.", "Hàm bậc ba liên tục trên toàn bộ ℝ và luôn có ít nhất một nghiệm thực.", "b dịch chuyển vị trí điểm uốn; d chỉ tịnh tiến đồ thị theo phương Oy.", "Nếu b² − 3ac > 0 thì có hai điểm cực trị; nếu bằng 0 thì có điểm uốn có tiếp tuyến ngang; nếu nhỏ hơn 0 thì hàm đơn điệu."],
    applications: ["Mô hình hóa một số quá trình có điểm đổi xu hướng, như chi phí–lợi nhuận hoặc tăng trưởng có gia tốc thay đổi.", "Khảo sát đa thức và phương trình bậc ba trong chương trình đại số.", "Dự đoán điểm cực trị và điểm uốn trong phân tích dữ liệu hoặc tối ưu hóa đơn giản."],
    example: { question: "Khảo sát nhanh f(x) = 2x³.", solution: ["a = 2 > 0 nên đồ thị đi từ dưới trái lên trên phải.", "f'(x) = 6x² ≥ 0 nên hàm đồng biến trên ℝ; tại x = 0 có tiếp tuyến ngang.", "Điểm uốn là O(0; 0). Tăng a từ 2 lên 4 làm đồ thị dốc hơn khi x ≠ 0."] },
  },
  "function-transform": {
    concept: "Đồ thị y = a(x − h)² + k nhận được từ y = x² qua co giãn/đối xứng theo a và tịnh tiến theo vectơ (h; k).",
    formulas: ["Dạng đỉnh: y = a(x − h)² + k.", "Đỉnh I(h; k), trục đối xứng x = h.", "|a| > 1: hẹp hơn; 0 < |a| < 1: rộng hơn; a < 0: đối xứng qua Ox."],
    learningGoals: ["Dự đoán tịnh tiến ngang và dọc từ biểu thức hàm số.", "Nhận biết đối xứng, co giãn hoặc nén đồ thị.", "Phối hợp nhiều phép biến đổi để dựng một đồ thị mới từ đồ thị gốc."],
    properties: ["h chỉ dịch ngang, k chỉ dịch dọc; hình dạng không đổi khi chỉ thay h và k.", "Dấu của a quyết định chiều mở, độ lớn |a| quyết định độ mở.", "Giá trị cực trị bằng k tại x = h."],
    applications: ["Đưa hàm bậc hai về dạng đỉnh để tìm cực trị nhanh.", "So sánh ảnh hưởng từng tham số trong mô hình hóa chuyển động.", "Thiết kế đồ thị hàm số theo vị trí đỉnh mong muốn."],
    example: { question: "Mô tả phép biến đổi từ y = x² sang y = −2(x − 3)² + 1.", solution: ["Tịnh tiến sang phải 3 và lên trên 1.", "Đối xứng qua Ox vì a âm.", "Co đứng hệ số 2 nên parabol hẹp hơn; đỉnh là I(3; 1)."] },
  },
  "linear-function": {
    concept: "Hàm số bậc nhất y = ax + b có đồ thị là đường thẳng. Hệ số a là độ dốc, b là tung độ giao điểm với Oy.",
    formulas: ["Đường thẳng: y = ax + b.", "Giao Oy: (0; b); giao Ox: (−b/a; 0) khi a ≠ 0.", "Hai đường thẳng y = a₁x + b₁ và y = a₂x + b₂ song song khi a₁ = a₂, b₁ ≠ b₂; vuông góc khi a₁a₂ = −1."],
    learningGoals: ["Đọc hệ số góc và tung độ gốc từ phương trình hoặc đồ thị.", "Dùng hệ số góc để nhận biết xu hướng tăng, giảm và tốc độ thay đổi.", "So sánh các đường thẳng song song, cắt nhau hoặc vuông góc."],
    properties: ["a > 0 thì đồng biến, a < 0 thì nghịch biến, a = 0 là hàm hằng.", "Biết một điểm và hệ số góc xác định duy nhất một đường thẳng.", "Khi x tăng 1 đơn vị, y thay đổi a đơn vị."],
    applications: ["Mô tả quãng đường theo thời gian với vận tốc không đổi.", "Tính chi phí tuyến tính: tổng tiền = đơn giá × số lượng + phí cố định.", "Nội suy và đọc xu hướng dữ liệu gần đúng."],
    example: { question: "Với y = −2x + 5, tìm các giao điểm và chiều biến thiên.", solution: ["Giao Oy là (0; 5).", "Cho y = 0 được x = 2,5 nên giao Ox là (2,5; 0).", "a = −2 < 0 nên hàm nghịch biến."] },
  },
  "sine-wave": {
    concept: "Sóng sin y = a sin(ωx + φ) là mô hình dao động tuần hoàn; nó lặp lại sau một chu kỳ xác định.",
    formulas: ["Biên độ A = |a|.", "Chu kỳ T = 2π/|ω| (ω ≠ 0).", "Pha ban đầu là φ; độ dịch ngang là −φ/ω.", "Miền giá trị: [−|a|; |a|]."],
    properties: ["Đồ thị tuần hoàn với chu kỳ T và đối xứng tâm theo các điểm thích hợp.", "Tăng |a| làm sóng cao hơn; tăng |ω| làm sóng dày hơn.", "Nghiệm sin(ωx + φ) = 0 khi ωx + φ = kπ."],
    applications: ["Mô tả âm thanh, điện xoay chiều và rung động cơ học.", "Mô hình thủy triều, nhịp sinh học hoặc chu kỳ mùa vụ.", "Phân tích tín hiệu tuần hoàn trong kỹ thuật."],
    example: { question: "Với y = 2sin(3x), hãy tìm biên độ và chu kỳ.", solution: ["Biên độ A = |2| = 2.", "Chu kỳ T = 2π/3.", "Đồ thị dao động giữa −2 và 2."] },
  },
  "unit-circle": {
    concept: "Đường tròn lượng giác là đường tròn tâm O bán kính 1. Góc θ xác định duy nhất điểm P trên đường tròn.",
    formulas: ["P(cos θ; sin θ).", "cos²θ + sin²θ = 1.", "tan θ = sin θ/cos θ khi cos θ ≠ 0.", "Chu kỳ: sin(θ + 2π) = sin θ, cos(θ + 2π) = cos θ."],
    properties: ["Cos là hoành độ, sin là tung độ của P.", "Các giá trị đặc biệt tại 0, π/2, π, 3π/2 giúp đọc nhanh dấu của sin và cos.", "Điểm đối xứng qua Ox, Oy hoặc O tạo các hệ thức lượng giác quen thuộc."],
    applications: ["Quy đổi góc và tính cạnh trong tam giác vuông.", "Mô tả chuyển động tròn đều và dao động điều hòa.", "Dựng đồ thị sin, cos từ chuyển động của điểm P."],
    example: { question: "Cho θ = π/3. Tìm P và tan θ.", solution: ["cos(π/3) = 1/2, sin(π/3) = √3/2.", "P(1/2; √3/2).", "tan(π/3) = √3."] },
  },
  "triangle-thales": {
    concept: "Định lý Thales về góc nội tiếp: góc chắn nửa đường tròn là góc vuông.",
    formulas: ["AB là đường kính ⇒ ∠ACB = 90° với C thuộc đường tròn.", "Trong tam giác vuông, trung điểm cạnh huyền cách đều ba đỉnh.", "AB² = AC² + BC² (hệ quả tam giác vuông)."],
    properties: ["Dù C di chuyển trên cùng nửa đường tròn, ∠ACB luôn bằng 90°.", "Đảo lại: nếu ∠ACB = 90° thì C nằm trên đường tròn đường kính AB.", "Tâm đường tròn ngoại tiếp tam giác vuông là trung điểm cạnh huyền."],
    applications: ["Dựng góc vuông bằng compa và thước thẳng.", "Nhận biết tam giác vuông trong bài toán đường tròn.", "Tính độ dài bằng Pythagore sau khi xác định góc vuông."],
    example: { question: "AB là đường kính dài 10, C thuộc đường tròn và AC = 6. Tìm BC.", solution: ["Theo Thales, tam giác ACB vuông tại C.", "BC² = AB² − AC² = 100 − 36 = 64.", "Vậy BC = 8."] },
  },
  "similar-triangles": {
    concept: "Hai tam giác đồng dạng có các góc tương ứng bằng nhau và các cạnh tương ứng tỉ lệ với cùng một hệ số k.",
    formulas: ["ΔA'B'C' ∼ ΔABC ⇒ A'B'/AB = B'C'/BC = C'A'/CA = k.", "Chu vi tỉ lệ k; diện tích tỉ lệ k².", "Có thể chứng minh bằng góc–góc, cạnh–góc–cạnh hoặc cạnh–cạnh–cạnh."],
    properties: ["Hình dạng được giữ nguyên, chỉ thay đổi kích thước hoặc quay/lật/tịnh tiến.", "Các đường cao, trung tuyến, phân giác tương ứng cũng tỉ lệ k.", "k > 1 phóng to; 0 < k < 1 thu nhỏ."],
    applications: ["Đo chiều cao vật thể bằng bóng và tam giác đồng dạng.", "Đọc tỉ lệ bản đồ, mô hình thu nhỏ và ảnh phóng đại.", "Giải bài toán đoạn thẳng song song trong tam giác."],
    example: { question: "Hai tam giác đồng dạng có k = 1,5. Tam giác nhỏ có diện tích 12 cm². Tìm diện tích tam giác lớn.", solution: ["Diện tích tỉ lệ với k².", "S_lớn = 12 × 1,5² = 12 × 2,25.", "S_lớn = 27 cm²."] },
  },
  "vector-addition": {
    concept: "Vectơ biểu diễn độ dời có hướng. Tổng hai vectơ được dựng bằng quy tắc tam giác hoặc quy tắc hình bình hành.",
    formulas: ["Nếu u = (u₁; u₂), v = (v₁; v₂) thì u + v = (u₁ + v₁; u₂ + v₂).", "u − v = u + (−v).", "|u| = √(u₁² + u₂²)."],
    properties: ["Phép cộng giao hoán và kết hợp.", "Vectơ không là phần tử trung hòa; vectơ đối là phần tử nghịch đảo.", "Đường chéo hình bình hành xuất phát từ cùng gốc biểu diễn tổng."],
    applications: ["Tổng hợp lực, vận tốc và độ dời trong vật lý.", "Dịch chuyển đối tượng trong đồ họa và lập trình game.", "Mô tả tọa độ, hướng đi trong bản đồ và robot."],
    example: { question: "Cho u = (2; −1), v = (−3; 4). Tính u + v và u − v.", solution: ["u + v = (2 − 3; −1 + 4) = (−1; 3).", "u − v = (2 + 3; −1 − 4) = (5; −5).", "Kiểm tra trực quan bằng quy tắc hình bình hành."] },
  },
  "vector-dot-product": {
    concept: "Tích vô hướng của hai vectơ là một số thực, đo mức độ cùng hướng của chúng. Kéo mút hai vectơ để so sánh tọa độ, độ dài, góc và giá trị tích vô hướng.",
    formulas: ["u·v = u₁v₁ + u₂v₂.", "u·v = |u||v|cos θ.", "u ⟂ v khi và chỉ khi u·v = 0 (với u, v khác vectơ không)."],
    learningGoals: ["Tính tích vô hướng từ tọa độ.", "Nhận biết góc nhọn, vuông hay tù từ dấu của u·v.", "Dùng tích vô hướng để kiểm tra hai vectơ vuông góc."],
    properties: ["u·v > 0 khi góc giữa hai vectơ nhọn; u·v = 0 khi vuông góc; u·v < 0 khi góc tù.", "Tích vô hướng giao hoán: u·v = v·u.", "Độ dài thỏa |u|² = u·u."],
    applications: ["Kiểm tra vuông góc trong hình học tọa độ.", "Tính hình chiếu của một vectơ lên vectơ khác.", "Mô hình công cơ học trong vật lý: W = F·s."],
    example: { question: "Cho u = (3; 1), v = (−1; 2). Tính u·v.", solution: ["u·v = 3 × (−1) + 1 × 2.", "u·v = −1.", "Tích âm nên góc giữa u và v là góc tù."] },
  },
  "circle-line": {
    concept: "Vị trí tương đối của đường thẳng d và đường tròn (O; R) phụ thuộc vào khoảng cách d(O, d).",
    formulas: ["d(O, d) > R: không giao nhau.", "d(O, d) = R: tiếp xúc tại một điểm.", "d(O, d) < R: cắt nhau tại hai điểm.", "Độ dài dây cung = 2√(R² − d²)."],
    properties: ["Đường vuông góc từ tâm đến dây đi qua trung điểm dây.", "Hai giao điểm của cát tuyến đối xứng qua đường vuông góc từ tâm đến đường thẳng.", "Tiếp tuyến vuông góc với bán kính đi tới tiếp điểm."],
    applications: ["Xác định tiếp tuyến/cát tuyến trong các bài toán đường tròn.", "Tính chiều dài dây, khoảng cách và vùng giao nhau.", "Thiết kế quỹ đạo hoặc vùng phủ sóng dạng tròn."],
    example: { question: "Đường tròn bán kính 5, khoảng cách từ tâm tới d là 3. Tìm dây cung do d tạo ra.", solution: ["Vì 3 < 5, d là cát tuyến.", "Nửa dây = √(5² − 3²) = 4.", "Dây cung dài 2 × 4 = 8."] },
  },
  "triangle-angles": {
    concept: "Tổng ba góc trong của mọi tam giác phẳng luôn bằng 180°.",
    formulas: ["∠A + ∠B + ∠C = 180°.", "Tam giác cân: hai góc ở đáy bằng nhau.", "Góc ngoài bằng tổng hai góc trong không kề với nó."],
    properties: ["Biết hai góc sẽ xác định được góc còn lại.", "Cạnh lớn hơn đối diện góc lớn hơn.", "Tam giác đều có ba góc cùng bằng 60°; tam giác vuông có một góc bằng 90°."],
    applications: ["Tính góc mái nhà, cầu, bản vẽ kỹ thuật.", "Chứng minh tam giác cân/đều/vuông.", "Dựng hình và đo đạc gián tiếp."],
    example: { question: "Tam giác cân tại C có ∠C = 40°. Tìm ∠A và ∠B.", solution: ["∠A + ∠B = 180° − 40° = 140°.", "Vì tam giác cân tại C nên ∠A = ∠B.", "Mỗi góc bằng 70°."] },
  },
  cube: {
    concept: "Hình lập phương là hình hộp chữ nhật có sáu mặt là các hình vuông bằng nhau.",
    formulas: ["V = a³.", "S_toàn phần = 6a²; S_xung quanh = 4a².", "Đường chéo mặt = a√2; đường chéo khối = a√3."],
    properties: ["Có 6 mặt, 12 cạnh, 8 đỉnh.", "Ba cạnh xuất phát từ một đỉnh đôi một vuông góc.", "Các cặp mặt đối diện song song và bằng nhau."],
    applications: ["Tính dung tích hộp, thể tích khối vật liệu và diện tích bao bì.", "Mô hình hóa ô lưới 3D, xúc xắc và kiến trúc.", "Bài toán khoảng cách trong không gian."],
    example: { question: "Hình lập phương cạnh 4 cm. Tính thể tích và đường chéo khối.", solution: ["V = 4³ = 64 cm³.", "d = 4√3 cm.", "Diện tích toàn phần là 6 × 4² = 96 cm²."] },
  },
  "triangular-prism": {
    concept: "Lăng trụ tam giác có hai đáy là hai tam giác bằng nhau, song song; các cạnh bên song song nhau.",
    formulas: ["V = S_đáy × h.", "S_xung quanh = p_đáy × h với lăng trụ đứng.", "S_toàn phần = S_xung quanh + 2S_đáy."],
    properties: ["Có 5 mặt, 9 cạnh và 6 đỉnh.", "Mặt cắt song song với đáy bằng và đồng dạng với đáy.", "Lăng trụ đứng có cạnh bên vuông góc với mặt đáy."],
    applications: ["Mô hình mái nhà, lều trại, thanh đùn và hộp bao bì.", "Tính thể tích khối có tiết diện tam giác không đổi.", "Đọc bản vẽ kỹ thuật dạng prism."],
    example: { question: "Lăng trụ đứng có đáy là tam giác diện tích 12 cm², chiều cao 8 cm. Tính thể tích.", solution: ["V = S_đáy × h.", "V = 12 × 8.", "V = 96 cm³."] },
  },
  "square-pyramid": {
    concept: "Hình chóp đáy vuông có một đáy là hình vuông và bốn mặt bên là tam giác chung đỉnh.",
    formulas: ["V = ⅓S_đáy × h.", "S_toàn phần = S_đáy + S_xung quanh.", "Với chóp đều: S_xung quanh = ½p_đáy × trung đoạn."],
    properties: ["Có 5 mặt, 8 cạnh, 5 đỉnh.", "Trong chóp đều, chân đường cao là tâm đáy.", "Các mặt bên bằng nhau khi đỉnh thẳng hàng với tâm đáy."],
    applications: ["Mô tả kim tự tháp, mái chóp và phễu.", "Tính thể tích vật liệu dạng chóp.", "Giải bài toán góc giữa đường thẳng và mặt phẳng."],
    example: { question: "Chóp đáy vuông cạnh 6 cm, chiều cao 9 cm. Tính thể tích.", solution: ["S_đáy = 6² = 36 cm².", "V = ⅓ × 36 × 9.", "V = 108 cm³."] },
  },
  cylinder: {
    concept: "Hình trụ tròn xoay có hai đáy là hai đường tròn bằng nhau, song song; trục nối tâm hai đáy.",
    formulas: ["V = πr²h.", "S_xung quanh = 2πrh.", "S_toàn phần = 2πr(h + r)."],
    properties: ["Mọi thiết diện song song đáy là đường tròn bằng đáy.", "Khai triển mặt xung quanh là hình chữ nhật kích thước 2πr và h.", "Trục vuông góc với hai mặt đáy trong hình trụ đứng."],
    applications: ["Tính dung tích lon, bồn chứa, ống dẫn và cột trụ.", "Thiết kế nhãn dán quanh vật thể tròn.", "Ước lượng vật liệu bao phủ bề mặt cong."],
    example: { question: "Hình trụ r = 3 cm, h = 10 cm. Tính thể tích.", solution: ["V = πr²h.", "V = π × 3² × 10.", "V = 90π cm³."] },
  },
  cone: {
    concept: "Hình nón tròn xoay gồm đáy tròn và một đỉnh; đường sinh nối đỉnh với mọi điểm trên đường tròn đáy.",
    formulas: ["V = ⅓πr²h.", "l = √(r² + h²) với nón đứng.", "S_xung quanh = πrl; S_toàn phần = πr(l + r)."],
    properties: ["Mặt cắt qua trục là tam giác cân.", "Đường cao vuông góc với mặt phẳng đáy ở tâm đáy.", "Thể tích bằng một phần ba hình trụ cùng đáy và chiều cao."],
    applications: ["Mô hình nón giao thông, phễu, mái chóp tròn và kem ốc quế.", "Tính thể tích chứa của phễu/nón.", "So sánh thể tích với hình trụ."],
    example: { question: "Hình nón r = 3 cm, h = 4 cm. Tính đường sinh và thể tích.", solution: ["l = √(3² + 4²) = 5 cm.", "V = ⅓π × 3² × 4.", "V = 12π cm³."] },
  },
  sphere: {
    concept: "Hình cầu là tập hợp các điểm trong không gian cách tâm O không vượt quá bán kính r; mặt cầu là biên của hình cầu.",
    formulas: ["S_mặt cầu = 4πr².", "V_hình cầu = ⁴⁄₃πr³.", "Đường kính d = 2r."],
    properties: ["Mọi mặt cắt qua tâm là đường tròn lớn bán kính r.", "Mặt cầu có đối xứng tâm và vô số trục đối xứng.", "Thể tích tăng theo lập phương bán kính."],
    applications: ["Mô hình quả bóng, bồn cầu, hành tinh và vùng phủ sóng.", "Tính lượng vật liệu/phủ sơn cho vật thể tròn.", "Đo đạc theo bán kính hoặc đường kính."],
    example: { question: "Hình cầu bán kính 3 cm. Tính thể tích.", solution: ["V = ⁴⁄₃πr³.", "V = ⁴⁄₃π × 27.", "V = 36π cm³."] },
  },
  tetrahedron: {
    concept: "Tứ diện đều là khối đa diện đều gồm bốn tam giác đều bằng nhau.",
    formulas: ["V = a³√2/12.", "S_toàn phần = √3a².", "Euler: V − E + F = 4 − 6 + 4 = 2."],
    properties: ["Có 4 mặt, 6 cạnh, 4 đỉnh.", "Mỗi đỉnh nối với ba đỉnh còn lại.", "Tất cả mặt và cạnh hoàn toàn bằng nhau."],
    applications: ["Mô hình phân tử methane, kết cấu giàn và xúc xắc bốn mặt.", "Khảo sát công thức Euler cho đa diện.", "Tính thể tích từ độ dài cạnh."],
    example: { question: "Tứ diện đều cạnh 6 cm. Tính thể tích.", solution: ["V = a³√2/12.", "V = 6³√2/12.", "V = 18√2 cm³."] },
  },
  octahedron: {
    concept: "Bát diện đều là đa diện đều gồm tám tam giác đều; có thể hình dung như hai hình chóp đáy vuông ghép đáy với nhau.",
    formulas: ["V = √2a³/3.", "S_toàn phần = 2√3a².", "Euler: 6 − 12 + 8 = 2."],
    properties: ["Có 8 mặt, 12 cạnh, 6 đỉnh.", "Mỗi đỉnh kề với bốn cạnh.", "Đa diện đối ngẫu với hình lập phương."],
    applications: ["Mô hình tinh thể và xúc xắc tám mặt.", "So sánh các đa diện đều qua đối ngẫu.", "Khảo sát đối xứng không gian."],
    example: { question: "Bát diện đều có cạnh a. Có bao nhiêu cạnh và đỉnh?", solution: ["Theo cấu trúc bát diện đều có 8 mặt tam giác.", "Số cạnh là 12.", "Số đỉnh là 6; kiểm tra Euler: 6 − 12 + 8 = 2."] },
  },
  dodecahedron: {
    concept: "Mười hai mặt đều là đa diện đều có mỗi mặt là một ngũ giác đều.",
    formulas: ["Euler: V − E + F = 20 − 30 + 12 = 2.", "Có 12 mặt ngũ giác đều.", "Mỗi đỉnh là nơi gặp của ba mặt."],
    properties: ["Có 12 mặt, 30 cạnh, 20 đỉnh.", "Là đa diện đối ngẫu với hai mươi mặt đều.", "Có đối xứng quay rất cao."],
    applications: ["Thiết kế xúc xắc mười hai mặt và mô hình tinh thể.", "Khảo sát mạng lưới ngũ giác trong không gian.", "Minh họa công thức Euler."],
    example: { question: "Kiểm tra công thức Euler cho mười hai mặt đều.", solution: ["V = 20, E = 30, F = 12.", "V − E + F = 20 − 30 + 12.", "Kết quả bằng 2, đúng với công thức Euler."] },
  },
  icosahedron: {
    concept: "Hai mươi mặt đều là đa diện đều gồm hai mươi tam giác đều bằng nhau.",
    formulas: ["Euler: V − E + F = 12 − 30 + 20 = 2.", "Có 20 mặt tam giác đều.", "Mỗi đỉnh là nơi gặp của năm tam giác."],
    properties: ["Có 20 mặt, 30 cạnh, 12 đỉnh.", "Là đa diện đối ngẫu với mười hai mặt đều.", "Có tính đối xứng quay rất cao."],
    applications: ["Xúc xắc hai mươi mặt trong trò chơi.", "Mô hình virus, vòm địa trắc và cấu trúc tinh thể.", "Khảo sát tam giác hóa bề mặt cầu."],
    example: { question: "Một hai mươi mặt đều có 20 mặt và 30 cạnh. Tìm số đỉnh.", solution: ["Dùng công thức Euler V − E + F = 2.", "V = 2 + E − F = 2 + 30 − 20.", "V = 12."] },
  },
  "cube-slice": {
    concept: "Thiết diện là hình phẳng nhận được khi một mặt phẳng cắt khối đa diện. Hình dạng phụ thuộc vào hướng và vị trí của mặt phẳng cắt.",
    formulas: ["Thiết diện = (mặt phẳng cắt) ∩ (khối đa diện).", "Mặt phẳng song song đáy của lập phương tạo thiết diện là hình vuông.", "Thiết diện song song với một mặt thường đồng dạng với mặt đó."],
    properties: ["Di chuyển mặt phẳng song song đáy chỉ làm thay đổi vị trí, không đổi kích thước thiết diện.", "Mặt phẳng qua các cạnh/đỉnh khác nhau có thể tạo tam giác, tứ giác, ngũ giác hoặc lục giác.", "Thiết diện luôn là một đa giác lồi khi cắt khối lồi."],
    applications: ["Đọc bản vẽ cắt trong kỹ thuật, kiến trúc và cơ khí.", "Tính diện tích mặt cắt của vật thể.", "Tưởng tượng không gian và giải bài toán hình học 3D."],
    example: { question: "Mặt phẳng song song đáy cắt hình lập phương cạnh 5 cm. Thiết diện là gì và có diện tích bao nhiêu?", solution: ["Thiết diện song song đáy là một hình vuông.", "Cạnh thiết diện bằng cạnh đáy: 5 cm.", "Diện tích là 5² = 25 cm²."] },
  },
};

export function getLearningSection(
  key: string,
  tab: LearningTab,
  readout: ModelReadout,
): LearningSection {
  if (!knowledge[key]) {
    const sections: Record<LearningTab, LearningSection> = {
      "Giới thiệu": { tab, title: "Tổng quan bản vẽ hiện tại", lead: "Bản vẽ chưa được xác nhận là một loại hình cụ thể, hoặc chứa nhiều đối tượng khác nhau. Chọn riêng một đối tượng để đọc thông tin phù hợp.", groups: [{ label: "Đối tượng đã dựng", items: readout.observations }, { label: "Cách làm rõ hình", items: ["Khoanh từng hình riêng; chọn kiểu hình trước khi chuẩn hóa nếu nét vẽ không rõ.", "Giữ nguyên nét phác khi nhận dạng chưa chắc chắn; không mặc định suy ra góc vuông, cạnh bằng nhau hoặc một khối 3D."] }] },
      "Tính chất": { tab, title: "Tính chất cần xác nhận", lead: "Chỉ hiển thị quan hệ đã dựng và số đo hiện tại; không tự gán định lý hoặc loại hình cho một nét chưa xác định.", groups: [{ label: "Số đo hiện tại", items: readout.metrics.map((m) => `${m.label}: ${m.value}`) }, { label: "Giới hạn", items: ["Các số đo trên bản phác là giá trị quan sát, không tự trở thành giả thiết của đề bài.", "Chọn điểm/cạnh để đọc quan hệ đã dựng; bổ sung nhãn hoặc sửa loại hình khi cần."] }] },
      "Ứng dụng": { tab, title: "Sử dụng bản phác", lead: "Bản phác hỗ trợ trao đổi ý tưởng và chuẩn bị dựng hình; chưa đủ cơ sở để áp dụng một công thức chuyên biệt.", groups: [{ label: "Bạn có thể làm", items: ["Nối các đỉnh, bổ sung nhãn và ghi chú dữ kiện.", "Khoanh riêng phần cần giải thích rồi dùng Ask AI; kiểm tra lại nhận xét AI với đề."] }] },
      "Thử ví dụ": { tab, title: "Thử làm rõ một đối tượng", lead: "Đây là thao tác kiểm tra, không phải lời giải hay dữ kiện tự thêm vào hình.", groups: [{ label: "Các bước thử", items: ["Khoanh một nét, chọn Đoạn thẳng và chuẩn hóa; kiểm tra chỉ có một đoạn nối hai đầu.", "Với nét khép kín, chọn đúng kiểu hình hoặc giữ nguyên nếu còn mơ hồ.", "Chọn hai đỉnh để nối, sau đó thử 2D → 3D → 2D và đối chiếu các đối tượng."] }] },
    };
    return sections[tab];
  }
  const data = knowledge[key] || {
    concept: "Mô hình trực quan giúp kết nối biểu diễn hình học với ngôn ngữ toán học.",
    formulas: [readout.formula],
    properties: readout.observations,
    applications: ["Quan sát, đưa ra giả thuyết và kiểm chứng bằng thao tác trực tiếp."],
    example: { question: "Thay đổi một tham số và mô tả điều thay đổi.", solution: ["Ghi lại trạng thái trước và sau khi thay đổi.", "Đối chiếu với công thức trong bảng đọc hình."] },
  };
  if (tab === "Giới thiệu")
    return {
      tab,
      title: `Giới thiệu · ${readout.heading}`,
      lead: data.concept,
      groups: [
        { label: "Công thức liên quan", items: data.formulas },
        ...(data.learningGoals ? [{ label: "Mục tiêu khám phá", items: data.learningGoals }] : []),
        { label: "Đọc từ mô hình hiện tại", items: readout.observations },
      ],
    };
  if (tab === "Tính chất")
    return {
      tab,
      title: "Tính chất và hệ quả",
      lead: "Các nhận xét dưới đây giúp bạn dự đoán điều gì thay đổi và điều gì được bảo toàn khi tương tác.",
      groups: [
        { label: "Tính chất cốt lõi", items: data.properties },
        { label: "Trạng thái trên hình", items: readout.metrics.map((metric) => `${metric.label}: ${metric.value}.`) },
      ],
    };
  if (tab === "Ứng dụng")
    return {
      tab,
      title: "Ứng dụng thực tế",
      lead: "Mô hình này không chỉ để quan sát; các công thức của nó được dùng để giải quyết những tình huống cụ thể.",
      groups: [{ label: "Nơi sử dụng", items: data.applications }],
    };
  return {
    tab,
    title: "Ví dụ có hướng dẫn",
    lead: "Ví dụ minh họa độc lập với trạng thái đang vẽ. Các số liệu dưới đây không được tự thêm vào hình hiện tại; hãy tự làm rồi đối chiếu các bước.",
    groups: [
      { label: "Đề bài", items: [data.example.question] },
      { label: "Lời giải / gợi ý", items: data.example.solution },
    ],
  };
}
