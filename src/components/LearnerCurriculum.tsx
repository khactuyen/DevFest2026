"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, LockKeyhole, PlayCircle } from "lucide-react";
import { isLessonUnlocked, type Curriculum, type CurriculumProgress } from "@/lib/curriculum-contracts";
import { request } from "@/lib/client";
import { learnerRequestHeaders } from "@/lib/learner";

export function LearnerCurriculum({ curriculumId }: { curriculumId: string }) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [progress, setProgress] = useState<CurriculumProgress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const headers = learnerRequestHeaders();
    Promise.all([
      request<Curriculum>(`/api/curricula/${curriculumId}?published=1`),
      request<CurriculumProgress>(`/api/curricula/${curriculumId}/progress`, { headers }),
    ]).then(([loaded, saved]) => { setCurriculum(loaded); setProgress(saved); }).catch((cause) => setError(cause.message));
  }, [curriculumId]);
  const completed = useMemo(() => new Set(progress?.lessons.filter((lesson) => lesson.completedAt).map((lesson) => lesson.lessonId)), [progress]);
  if (error) return <main className="learner-page"><p className="error">{error}</p></main>;
  if (!curriculum || !progress) return <main className="learner-page"><p className="empty">Đang tải lộ trình học tập…</p></main>;
  const totalLessons = curriculum.courses.reduce((count, course) => count + course.units.reduce((sum, unit) => sum + unit.lessons.length, 0), 0);
  const percent = totalLessons ? Math.round((completed.size / totalLessons) * 100) : 0;
  return <main className="learner-page">
    <header className="learner-hero"><Link href="/curricula">← Về không gian học tập</Link><span className="eyebrow">LỘ TRÌNH CỦA BẠN</span><h1>{curriculum.title}</h1><p>{curriculum.description || "Học theo từng bài, khám phá và hoàn thành mục tiêu của bạn."}</p><div className="learner-progress"><div><strong>{percent}%</strong><span>hoàn thành</span></div><div className="learner-progress-track"><i style={{ width: `${percent}%` }} /></div></div></header>
    <section className="learner-course-list">
      {curriculum.courses.map((course, courseIndex) => <article className="learner-course" key={course.id}><div className="learner-course-heading"><span>{String(courseIndex + 1).padStart(2, "0")}</span><div><h2>{course.title}</h2><p>{course.description || "Khóa học đang được thiết kế."}</p></div></div>{course.units.map((unit, unitIndex) => <section className="learner-unit" key={unit.id}><h3>Chương {unitIndex + 1}: {unit.title}</h3>{unit.lessons.map((lesson) => {
        const unlocked = isLessonUnlocked(curriculum, lesson.id, completed);
        const done = completed.has(lesson.id);
        const ready = Boolean(lesson.materialId) && unlocked;
        return <div className={`learner-lesson ${done ? "done" : ""} ${!ready ? "locked" : ""}`} key={lesson.id}><span>{done ? <CheckCircle2 size={20} /> : ready ? <PlayCircle size={20} /> : <LockKeyhole size={18} />}</span><div><strong>{lesson.title}</strong><small>{lesson.objective || `${lesson.estimatedMinutes} phút học tập`}</small></div>{ready ? <Link href={`/learn/${curriculum.id}/lesson/${lesson.id}`}>{done ? "Học lại" : "Bắt đầu"} <ChevronRight size={16} /></Link> : <em>{lesson.materialId ? "Cần hoàn thành bài trước" : "Đang chuẩn bị"}</em>}</div>;
      })}</section>)}</article>)}
    </section>
  </main>;
}
