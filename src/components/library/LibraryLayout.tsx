import type { LibraryLayoutModel } from "./view-contracts";
export function LibraryLayout({ model }: { model: LibraryLayoutModel }) {
  return (
    <div className="native-library bg-background font-body-lg text-body-lg text-on-surface antialiased selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      <main className="w-full pt-16 bg-background min-h-screen">
        <div className="flex flex-col w-full">
          <div className="w-full bg-surface-container-low py-space-lg px-margin-desktop">
            <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-sm">
                  <span className="font-code-badge text-code-badge px-space-sm py-0.5 rounded-full bg-primary-container text-on-primary font-semibold tracking-wider uppercase">
                    {"[D] Kho Lưu Trữ Mở"}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  <span
                    className="font-body-sm text-body-sm text-secondary font-semibold"
                    id="catalog-total"
                  >
                    {model.catalogLabel}
                  </span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
                  {"Thư viện Học liệu Tương tác"}
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-2xl">
                  {
                    "Khám phá, thực nghiệm và nhân bản giáo án 3D không gian mở. Hỗ trợ đầy đủ định dạng mô phỏng hình học vi phân, giải tích đa biến và tối ưu hóa số."
                  }
                </p>
              </div>
              <div className="flex items-center flex-wrap gap-space-sm">
                <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-sm rounded-DEFAULT shadow-sm">
                  <span className="material-symbols-outlined text-secondary text-[22px]">
                    {"history_edu"}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className="font-code-badge text-code-badge text-on-surface-variant"
                      id="stat-resuming-label"
                    >
                      {"Bản nháp"}
                    </span>
                    <span
                      className="font-label-sm text-label-sm font-bold text-primary"
                      id="stat-resuming-count"
                    >
                      {model.draftLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-sm rounded-DEFAULT shadow-sm">
                  <span
                    className="material-symbols-outlined text-error text-[22px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {"favorite"}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className="font-code-badge text-code-badge text-on-surface-variant"
                      id="stat-catalog-label"
                    >
                      {"Mô hình sẵn có"}
                    </span>
                    <span
                      className="font-label-sm text-label-sm font-bold text-primary"
                      id="stat-favorites-count"
                    >
                      {model.patternLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            className="w-full max-w-[1440px] mx-auto px-margin-desktop mt-space-lg"
            id="resume-panel"
            hidden={!model.hasMaterials}
          >
            <div className="bg-surface-container-lowest rounded-DEFAULT p-space-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-md">
                <div className="w-12 h-12 rounded-DEFAULT bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[26px]">
                    {"rotate_right"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-code-badge text-code-badge text-secondary font-bold uppercase">
                      {"Học phần đang thực hiện"}
                    </span>
                  </div>
                  <span className="font-label-sm text-label-sm font-bold text-on-surface">
                    {model.resumeTitle}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-space-sm shrink-0 w-full md:w-auto justify-end">
                <button
                  className="px-space-md py-1.5 rounded-full bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim transition-all font-label-sm text-label-sm font-bold flex items-center gap-1.5 shadow-sm"
                  id="btn-resume-session"
                  onClick={model.onResume}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {"play_arrow"}
                  </span>
                  <span>{"Tiếp tục học ngay"}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[1440px] mx-auto px-margin-desktop mt-space-lg flex flex-col gap-space-sm">
            <div className="bg-surface-container-lowest rounded-full shadow-sm p-1.5 flex items-center gap-space-sm">
              <div className="pl-3 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">
                  {"search"}
                </span>
              </div>
              <input
                className="w-full bg-transparent font-body-sm text-body-sm text-on-surface focus:outline-none placeholder:text-outline"
                id="search-input"
                placeholder="Tìm kiếm theo công thức, bài học, khái niệm (ví dụ: Parabol, Gradient Oxyz, Thales, Tích phân)..."
                type="text"
                value={model.query}
                onChange={(event) => model.onQuery(event.target.value)}
              />
              <button
                className="text-outline hover:text-on-surface pr-2"
                id="btn-clear-search"
                title="Xoá tìm kiếm"
                onClick={() => model.onQuery("")}
                hidden={!model.query}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {"cancel"}
                </span>
              </button>
              <button
                className="shrink-0 px-space-lg py-2 rounded-full bg-primary-container text-on-primary hover:bg-primary font-label-sm text-label-sm font-bold transition-colors flex items-center gap-1"
                id="btn-search-action"
              >
                <span>{"Tra cứu"}</span>
                <span className="font-code-badge text-code-badge bg-surface-container-lowest/20 px-1.5 py-0.5 rounded">
                  {"↵"}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-space-xs overflow-x-auto pb-1 text-on-surface-variant">
              <span className="font-code-badge text-code-badge text-outline shrink-0 mr-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  {"bolt"}
                </span>
                {"Gợi ý nhanh:\n      "}
              </span>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Parabol"
                onClick={() => model.onQuery("Parabol")}
              >
                {"Parabol"}
              </button>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Thales"
                onClick={() => model.onQuery("Thales")}
              >
                {"Thales"}
              </button>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Cực trị Oxyz"
                onClick={() => model.onQuery("Cực trị Oxyz")}
              >
                {"Cực trị Oxyz"}
              </button>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Ma trận"
                onClick={() => model.onQuery("Ma trận")}
              >
                {"Ma trận"}
              </button>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Tích phân Riemann"
                onClick={() => model.onQuery("Tích phân Riemann")}
              >
                {"Tích phân Riemann"}
              </button>
              <button
                className="keyword-chip shrink-0 px-space-sm py-1 rounded-full bg-surface-container-low hover:bg-surface-container font-code-badge text-code-badge transition-colors"
                data-keyword="Vector không gian"
                onClick={() => model.onQuery("Vector không gian")}
              >
                {"Vector không gian"}
              </button>
            </div>
          </div>
          <div className="w-full max-w-[1440px] mx-auto px-margin-desktop mt-space-md">
            <div className="bg-surface-container-lowest rounded-DEFAULT p-space-md shadow-sm flex flex-col gap-space-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-xs shrink-0">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    {"category"}
                  </span>
                  <span className="font-label-sm text-label-sm font-bold text-primary">
                    {"Phân môn:"}
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 md:justify-end"
                  id="filter-subject-group"
                >
                  <button
                    data-subject="all"
                    className={model.subjectClass("all")}
                    onClick={() => model.onSubject("all")}
                  >
                    {"Tất cả"}
                  </button>
                  <button
                    data-subject="algebra"
                    className={model.subjectClass("algebra")}
                    onClick={() => model.onSubject("algebra")}
                  >
                    {"Đại số"}
                  </button>
                  <button
                    data-subject="geometry"
                    className={model.subjectClass("geometry")}
                    onClick={() => model.onSubject("geometry")}
                  >
                    {"Hình học"}
                  </button>
                  <button
                    data-subject="calculus"
                    className={model.subjectClass("calculus")}
                    onClick={() => model.onSubject("calculus")}
                  >
                    {"Giải tích"}
                  </button>
                  <button
                    data-subject="probability"
                    className={model.subjectClass("probability")}
                    onClick={() => model.onSubject("probability")}
                  >
                    {"Xác suất"}
                  </button>
                  <button
                    data-subject="statistics"
                    className={model.subjectClass("statistics")}
                    onClick={() => model.onSubject("statistics")}
                  >
                    {"Thống kê"}
                  </button>
                  <button
                    data-subject="discrete"
                    className={model.subjectClass("discrete")}
                    onClick={() => model.onSubject("discrete")}
                  >
                    {"Toán rời rạc"}
                  </button>
                </div>
              </div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm pt-space-xs">
                <div
                  className="flex items-center gap-1.5 overflow-x-auto"
                  id="filter-level-group"
                >
                  <span className="font-code-badge text-code-badge text-outline shrink-0 mr-1">
                    {"Cấp độ:"}
                  </span>
                  <button
                    data-level="all"
                    className={model.levelClass("all")}
                    onClick={() => model.onLevel("all")}
                  >
                    {"Tất cả lớp"}
                  </button>
                  <button
                    data-level="g10"
                    className={model.levelClass("g10")}
                    onClick={() => model.onLevel("g10")}
                  >
                    {"Lớp 10"}
                  </button>
                  <button
                    data-level="g11"
                    className={model.levelClass("g11")}
                    onClick={() => model.onLevel("g11")}
                  >
                    {"Lớp 11"}
                  </button>
                  <button
                    data-level="g12"
                    className={model.levelClass("g12")}
                    onClick={() => model.onLevel("g12")}
                  >
                    {"Lớp 12"}
                  </button>
                  <button
                    data-level="uni"
                    className={model.levelClass("uni")}
                    onClick={() => model.onLevel("uni")}
                  >
                    {"Đại học / Chuyên sâu"}
                  </button>
                </div>
                <div className="flex items-center gap-space-sm flex-wrap justify-between lg:justify-end">
                  <div
                    className="flex items-center gap-1"
                    id="filter-type-group"
                  >
                    <span className="font-code-badge text-code-badge text-outline shrink-0 mr-1">
                      {"Định dạng:"}
                    </span>
                    <select
                      className="bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-sm py-1 rounded-DEFAULT outline-none cursor-pointer"
                      id="select-type-filter"
                      value={model.type}
                      onChange={(event) => model.onType(event.target.value)}
                    >
                      <option value="all">{"Tất cả loại hình"}</option>
                      <option value="exploration">
                        {"Khám phá trực quan (3D Lab)"}
                      </option>
                      <option value="solved">
                        {"Lời giải từng bước (Solved Problem)"}
                      </option>
                      <option value="lesson">{"Bài giảng tương tác"}</option>
                      <option value="exercise">{"Bài tập thực nghiệm"}</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-code-badge text-code-badge text-outline">
                      {"Sắp xếp:"}
                    </span>
                    <select
                      className="bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-sm py-1 rounded-DEFAULT outline-none font-medium cursor-pointer"
                      id="select-sort-order"
                      value={model.sort}
                      onChange={(event) => model.onSort(event.target.value)}
                    >
                      <option value="relevant">{"Phù hợp nhất"}</option>
                      <option value="newest">{"Mới cập nhật"}</option>
                      <option value="popular">
                        {"Phổ biến nhất (Lượt tương tác)"}
                      </option>
                      <option value="duration">
                        {"Thời lượng ngắn (< 15 phút)"}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[1440px] mx-auto px-margin-desktop mt-space-lg mb-space-xl">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-sm text-headline-sm text-primary">
                  {"Danh mục học liệu"}
                </span>
                <span
                  className="font-code-badge text-code-badge px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-bold"
                  id="results-count-badge"
                >
                  {model.resultLabel}
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <button
                  className="px-space-md py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1 transition-colors"
                  id="filter-only-fav"
                  aria-pressed={model.favoritesOnly}
                  onClick={model.onToggleFavorites}
                >
                  <span className="material-symbols-outlined text-[16px] text-error">
                    {"favorite"}
                  </span>
                  <span>{"Chỉ mục Yêu thích"}</span>
                </button>
              </div>
            </div>
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter-desktop"
              id="library-grid-container"
              aria-busy={model.loading}
            >
              {model.entries}
            </div>
            <div
              className=" w-full py-16 flex flex-col items-center justify-center text-center gap-space-sm bg-surface-container-lowest rounded-DEFAULT"
              id="no-results-msg"
              hidden={!model.empty}
            >
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[32px]">
                  {"manage_search"}
                </span>
              </div>
              <span className="font-headline-sm text-headline-sm text-primary">
                {"Không tìm thấy học liệu phù hợp"}
              </span>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                {
                  "Hãy thử tìm kiếm với từ khóa khác hoặc bỏ các bộ lọc phân môn, cấp độ hiện tại để mở rộng danh sách."
                }
              </p>
              <button
                className="px-space-md py-2 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-bold mt-2"
                id="btn-clear-all-filters"
                onClick={model.onReset}
              >
                {"Đặt lại toàn bộ bộ lọc"}
              </button>
            </div>
          </div>
        </div>
      </main>
      <footer className="w-full bg-surface-container-lowest shadow-[0_-1px_8px_rgba(19,78,74,0.03)] mt-space-xl">
        <div className="max-w-[1440px] mx-auto px-margin-desktop py-space-xl flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[16px]">
                {"functions"}
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {
                "© 2025 Math Vision AI. Không gian tạo và khám phá học liệu toán học tương tác."
              }
            </span>
          </div>
          <div className="flex items-center gap-space-lg">
            <span className="font-code-badge text-code-badge text-secondary font-semibold">
              {"2D / 3D"}
            </span>
            <span className="font-code-badge text-code-badge text-on-surface-variant">
              {"MathLive"}
            </span>
            <span className="font-code-badge text-code-badge text-on-surface-variant">
              {"JSXGraph / Three.js"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
