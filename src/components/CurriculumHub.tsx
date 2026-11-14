"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, GraduationCap, Plus } from "lucide-react";
import type { Curriculum } from "@/lib/curriculum-contracts";
import { request } from "@/lib/client";

export function CurriculumHub() {
  const router = useRouter();
  const [items, setItems] = useState<Curriculum[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<Curriculum[]>("/api/curricula")
      .then(setItems)
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const curriculum = await request<Curriculum>("/api/curricula", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      router.push(`/curricula/${curriculum.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo chương trình.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="curriculum-page">
      <header className="curriculum-hero">
        <div>
          <span className="eyebrow">KHÔNG GIAN GIẢNG DẠY</span>
          <h1>Lộ trình chương trình học</h1>
          <p>Thiết kế khóa học, sắp xếp bài học và theo dõi hành trình của người học.</p>
        </div>
        <div className="curriculum-create-card">
          <label htmlFor="curriculum-title">Tạo chương trình mới</label>
          <div>
            <input
              id="curriculum-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ví dụ: Hình học không gian lớp 10"
            />
            <button className="primary" onClick={create} disabled={creating}>
              <Plus size={17} /> {creating ? "Đang tạo" : "Tạo"}
            </button>
          </div>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="curriculum-list-section">
        <div className="section-heading">
          <div>
            <h2>Chương trình của bạn</h2>
            <p>Dữ liệu được lưu thật và có thể tiếp tục biên soạn bất cứ lúc nào.</p>
          </div>
          <GraduationCap size={25} />
        </div>
        {loading ? <p className="empty">Đang tải chương trình…</p> : items.length ? (
          <div className="curriculum-grid">
            {items.map((item) => {
              const units = item.courses.reduce((count, course) => count + course.units.length, 0);
              const lessons = item.courses.reduce(
                (count, course) => count + course.units.reduce((sum, unit) => sum + unit.lessons.length, 0),
                0,
              );
              return (
                <Link className="curriculum-card" key={item.id} href={`/curricula/${item.id}`}>
                  <span className={`status-pill ${item.status}`}>{item.status === "published" ? "Đã xuất bản" : "Bản nháp"}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description || "Chưa có mô tả chương trình."}</p>
                  <div className="curriculum-card-meta">
                    <span>{item.subject} · {item.gradeBand}</span>
                    <span>{item.courses.length} khóa · {units} chương · {lessons} bài</span>
                  </div>
                  <strong>Thiết kế lộ trình <ChevronRight size={16} /></strong>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="curriculum-empty">
            <BookOpen size={30} />
            <h3>Chưa có chương trình học</h3>
            <p>Bắt đầu bằng tên khóa học; sau đó thêm chương và bài học trong trình xây dựng lộ trình.</p>
          </div>
        )}
      </section>
    </main>
  );
}
