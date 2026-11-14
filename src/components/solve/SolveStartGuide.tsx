"use client";

import { ArrowUpRight, BookOpen, ShieldCheck, Zap } from "lucide-react";
import { SOLVER_EXAMPLE_GROUPS } from "@/lib/solve-examples";
import { useState } from "react";

export function SolveStartGuide({
  useExample,
}: {
  useExample(source: string): void;
}) {
  const [category, setCategory] = useState(SOLVER_EXAMPLE_GROUPS[0].id);
  const group = SOLVER_EXAMPLE_GROUPS.find((item) => item.id === category)!;
  return (
    <aside className="solve-start-guide" aria-label="Gợi ý bắt đầu">
      <section className="solve-guide-card">
        <span className="solve-eyebrow">Học theo cách của bạn</span>
        <h2>Từ đáp án đến cách hiểu.</h2>
        <div className="solve-guide-route">
          <span>
            <Zap size={18} />
          </span>
          <div>
            <h3>Xem đáp án nhanh</h3>
            <p>Lấy kết quả và phép kiểm tra khi bộ giải hỗ trợ.</p>
          </div>
        </div>
        <div className="solve-guide-route">
          <span>
            <BookOpen size={18} />
          </span>
          <div>
            <h3>Hiểu từng bước giải</h3>
            <p>
              Chọn phương pháp, theo dõi biến đổi và hỏi thêm ở bước cần hiểu.
            </p>
          </div>
        </div>
        <div className="solve-guide-note">
          <ShieldCheck size={16} />
          <p>Luôn biết kết quả đã được kiểm tra đến đâu.</p>
        </div>
      </section>
      <section className="solve-example-card">
        <div className="solve-aside-heading">
          <h3>Khám phá bộ giải trực tiếp</h3>
          <span>Chọn nhóm và bấm bài mẫu để thử</span>
        </div>
        <label className="solve-example-category">
          Nhóm bài toán
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {SOLVER_EXAMPLE_GROUPS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="solve-examples">
          {group.examples.map(({ source, label, preview }) => (
            <button
              key={source}
              onClick={() => {
                useExample(source);
                document.getElementById("solve-source")?.focus();
              }}
            >
              <span>
                <small>{label}</small>
                <strong>{preview}</strong>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
