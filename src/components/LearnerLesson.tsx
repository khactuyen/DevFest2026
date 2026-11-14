"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock3, Flag, RotateCcw } from "lucide-react";
import { isLessonUnlocked, type Curriculum, type CurriculumLesson as CurriculumLessonType, type CurriculumProgress } from "@/lib/curriculum-contracts";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";
import { learnerRequestHeaders } from "@/lib/learner";
import { Visual } from "@/components/Visual";
import type { VisualRuntime } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import type { BlankBoardRuntime } from "@/lib/blank-board-runtime";

export function LearnerLesson({ curriculumId, lessonId }: { curriculumId: string; lessonId: string }) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [lesson, setLesson] = useState<CurriculumLessonType | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [progress, setProgress] = useState<CurriculumProgress | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const runtimes = useRef<Record<string, VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime | null | undefined>>({});
  useEffect(() => {
    const headers = learnerRequestHeaders();
    request<Curriculum>(`/api/curricula/${curriculumId}?published=1`)
      .then(async (loaded) => {
        const selected = loaded.courses.flatMap((course) => course.units).flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
        if (!selected?.materialId) throw Error("Bài học chưa có học liệu sẵn sàng.");
        const [loadedMaterial, savedProgress] = await Promise.all([
          request<Material>(`/api/curricula/${curriculumId}/lessons/${lessonId}/material`),
          request<CurriculumProgress>(`/api/curricula/${curriculumId}/progress`, { headers }),
        ]);
        const completedLessons = new Set(savedProgress.lessons.filter((item) => item.completedAt).map((item) => item.lessonId));
        if (!isLessonUnlocked(loaded, selected.id, completedLessons))
          throw Error("Bài học này chưa được mở khóa.");
        setCurriculum(loaded); setLesson(selected); setMaterial(loadedMaterial); setProgress(savedProgress);
        const completed = new Set(savedProgress.lessons.find((item) => item.lessonId === lessonId)?.completedStepIds || []);
        const firstOpen = loadedMaterial.learningSteps.findIndex((step) => !completed.has(step.id));
        setActiveIndex(Math.max(0, firstOpen));
      })
      .catch((cause) => setError(cause.message));
  }, [curriculumId, lessonId]);
  const completedIds = useMemo(() => new Set(progress?.lessons.find((item) => item.lessonId === lessonId)?.completedStepIds || []), [progress, lessonId]);
  if (error) return <main className="learner-page"><p className="error">{error}</p></main>;
  if (!curriculum || !lesson || !material || !progress) return <main className="learner-page"><p className="empty">Đang chuẩn bị bài học…</p></main>;
  const activeMaterial = material;
  const step = activeMaterial.learningSteps[activeIndex];
  if (!step) return <main className="learner-page"><p className="error">Bài học chưa có bước học tập.</p></main>;
  const blocks = step.blockIds.map((id) => activeMaterial.blocks.find((block) => block.id === id)).filter((block): block is Material["blocks"][number] => Boolean(block));
  const canOpen = (index: number) => index <= activeIndex || completedIds.has(activeMaterial.learningSteps[index]?.id);
  async function completeStep() {
    const nextIds = [...new Set([...completedIds, step.id])];
    try {
      const saved = await request<CurriculumProgress>(`/api/curricula/${curriculumId}/progress`, { method: "POST", headers: learnerRequestHeaders(), body: JSON.stringify({ lessonId, completedStepIds: nextIds }) });
      setProgress(saved);
      const nextIndex = Math.min(activeIndex + 1, activeMaterial.learningSteps.length - 1);
      setActiveIndex(nextIndex);
      if (step.visualId && step.visualActions.length) runtimes.current[step.visualId]?.actions(step.visualActions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tiến độ."); }
  }
  const allDone = activeMaterial.learningSteps.every((item) => completedIds.has(item.id));
  return <main className="student-lesson-page">
    <header className="student-lesson-topbar"><Link href={`/learn/${curriculumId}`}><ArrowLeft size={17} /> Lộ trình học</Link><span><Clock3 size={15} /> {lesson.estimatedMinutes} phút</span></header>
    <section className="student-lesson-layout"><aside className="student-stepper"><span className="eyebrow">BÀI HỌC</span><h1>{lesson.title}</h1><p>{lesson.objective}</p><div>{activeMaterial.learningSteps.map((item, index) => <button disabled={!canOpen(index)} className={`${index === activeIndex ? "active" : ""} ${completedIds.has(item.id) ? "complete" : ""}`} key={item.id} onClick={() => setActiveIndex(index)}><b>{completedIds.has(item.id) ? <CheckCircle2 size={15} /> : String(index + 1)}</b><span>{item.title}<small>{item.estimatedMinutes} phút</small></span></button>)}</div></aside>
      <article className="student-step-content"><span className="eyebrow">BƯỚC {activeIndex + 1} / {activeMaterial.learningSteps.length} · {step.phase}</span><h2>{step.title}</h2><p className="student-step-description">{step.description}</p>{blocks.map((block) => <StudentBlock key={block.id} block={block} material={activeMaterial} runtimes={runtimes} />)}<footer><button className="outline" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}><ArrowLeft size={16} /> Bước trước</button>{allDone ? <Link className="primary" href={`/learn/${curriculumId}`}><Flag size={16} /> Hoàn thành bài học</Link> : <button className="primary" onClick={() => void completeStep()}>{completedIds.has(step.id) ? <><ArrowRight size={16} /> Bước tiếp</> : <><CheckCircle2 size={16} /> Hoàn thành bước</>}</button>}</footer></article>
    </section>
  </main>;
}

function StudentBlock({ block, material, runtimes }: { block: Material["blocks"][number]; material: Material; runtimes: MutableRefObject<Record<string, VisualRuntime | ThreeVisualRuntime | BlankBoardRuntime | null | undefined>>; }) {
  if (block.type === "visual") {
    const visual = material.visuals.find((item) => item.id === block.visualId);
    return <figure className="student-visual">{visual && <Visual spec={visual} ref={(runtime) => { runtimes.current[visual.id] = runtime; }} />}<figcaption>{block.content}</figcaption></figure>;
  }
  if (block.type === "math") return <pre className="math-block">{block.content}</pre>;
  if (block.type === "exercise") return <aside className="student-exercise"><strong>Bài tập</strong><p>{block.content}</p></aside>;
  if (block.type === "callout") return <aside className="student-callout"><strong>Gợi ý</strong><p>{block.content}</p></aside>;
  return <p className="student-text">{block.content}</p>;
}
