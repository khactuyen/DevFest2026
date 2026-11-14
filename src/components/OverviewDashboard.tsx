"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, GraduationCap, Plus, Route } from "lucide-react";
import type { Material } from "@/lib/contracts";
import type { Curriculum } from "@/lib/curriculum-contracts";
import { request } from "@/lib/client";

export function OverviewDashboard() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([request<Material[]>("/api/materials"), request<Curriculum[]>("/api/curricula")])
      .then(([materialItems, curriculumItems]) => {
        setMaterials(materialItems);
        setCurricula(curriculumItems);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu tổng quan."))
      .finally(() => setLoading(false));
  }, []);

  const lessonCount = useMemo(() => curricula.reduce(
    (total, curriculum) => total + curriculum.courses.reduce(
      (courseTotal, course) => courseTotal + course.units.reduce((unitTotal, unit) => unitTotal + unit.lessons.length, 0),
      0,
    ),
    0,
  ), [curricula]);
  const recent = useMemo(() => [
    ...materials.map((material) => ({ id: `material-${material.id}`, title: material.title, type: "Học liệu", updatedAt: material.updatedAt, href: material.status === "published" ? `/material/${material.slug}` : `/studio?material=${material.id}` })),
    ...curricula.map((curriculum) => ({ id: `curriculum-${curriculum.id}`, title: curriculum.title, type: "Lộ trình", updatedAt: curriculum.updatedAt, href: `/curricula/${curriculum.id}` })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [materials, curricula]);

  return <main className="real-dashboard">
    <header className="real-dashboard-hero">
      <div><span className="eyebrow">TỔNG QUAN</span><h1>Không gian giảng dạy</h1><p>Dữ liệu bên dưới được tính trực tiếp từ học liệu và lộ trình đã lưu.</p></div>
      <div className="real-dashboard-actions"><Link className="outline" href="/curricula"><Route size={16} /> Thiết kế lộ trình</Link><Link className="primary" href="/studio"><Plus size={16} /> Tạo học liệu</Link></div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="empty">Đang tải dữ liệu…</p> : <>
      <section className="real-stat-grid" aria-label="Thống kê dữ liệu thật">
        <article><BookOpen /><span>Học liệu</span><strong>{materials.length}</strong></article>
        <article><CheckCircle2 /><span>Đã xuất bản</span><strong>{materials.filter((item) => item.status === "published").length}</strong></article>
        <article><GraduationCap /><span>Lộ trình</span><strong>{curricula.length}</strong></article>
        <article><Route /><span>Bài học trong lộ trình</span><strong>{lessonCount}</strong></article>
      </section>
      <section className="real-recent-section">
        <div className="section-heading"><div><h2>Hoạt động gần đây</h2><p>Được sắp xếp theo thời điểm cập nhật thật.</p></div><Clock3 size={22} /></div>
        {recent.length ? <div className="real-recent-list">{recent.map((item) => <Link href={item.href} key={item.id}><span>{item.type}</span><strong>{item.title}</strong><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("vi-VN")}</time></Link>)}</div> : <div className="curriculum-empty"><BookOpen size={30} /><h3>Chưa có dữ liệu hoạt động</h3><p>Tạo học liệu hoặc lộ trình đầu tiên để bắt đầu.</p></div>}
      </section>
    </>}
  </main>;
}
