"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CircleCheck,
  ClipboardList,
  Eye,
  FilePenLine,
  FolderPlus,
  GraduationCap,
  Library,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import type {
  Curriculum,
  CurriculumCourse,
  CurriculumLesson,
  CurriculumUnit,
} from "@/lib/curriculum-contracts";
import type { Material } from "@/lib/contracts";
import { request } from "@/lib/client";

const nodeId = (kind: string) => `${kind}_${crypto.randomUUID().replace(/-/g, "")}`;
const inputValue = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => event.target.value;

export function CurriculumBuilder({ curriculumId }: { curriculumId: string }) {
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      request<Curriculum>(`/api/curricula/${curriculumId}`),
      request<Material[]>("/api/materials"),
    ])
      .then(([next, loadedMaterials]) => {
        setCurriculum(next);
        setMaterials(loadedMaterials);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [curriculumId]);

  const lessonCount = useMemo(
    () => curriculum?.courses.reduce((count, course) => count + course.units.reduce((sum, unit) => sum + unit.lessons.length, 0), 0) || 0,
    [curriculum],
  );

  function change(next: Curriculum) {
    setCurriculum(next);
    setDirty(true);
    setNotice("");
  }

  async function save(next = curriculum) {
    if (!next) return;
    setSaving(true);
    setError("");
    try {
      const saved = await request<Curriculum>(`/api/curricula/${curriculumId}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setCurriculum(saved);
      setDirty(false);
      setNotice("Đã lưu cấu trúc chương trình.");
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu chương trình.");
    } finally {
      setSaving(false);
    }
  }

  function updateRoot(patch: Partial<Curriculum>) {
    if (curriculum) change({ ...curriculum, ...patch });
  }

  function addCourse() {
    if (!curriculum) return;
    const course: CurriculumCourse = {
      id: nodeId("course"), title: `Khóa học ${curriculum.courses.length + 1}`, description: "",
      prerequisites: [], objectives: [], estimatedMinutes: 0, orderIndex: curriculum.courses.length, units: [],
    };
    change({ ...curriculum, courses: [...curriculum.courses, course] });
  }

  function updateCourse(courseId: string, patch: Partial<CurriculumCourse>) {
    if (curriculum) change({ ...curriculum, courses: curriculum.courses.map((course) => course.id === courseId ? { ...course, ...patch } : course) });
  }

  function moveCourse(courseId: string, offset: number) {
    if (!curriculum) return;
    const index = curriculum.courses.findIndex((course) => course.id === courseId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= curriculum.courses.length) return;
    const courses = [...curriculum.courses];
    [courses[index], courses[destination]] = [courses[destination], courses[index]];
    change({ ...curriculum, courses: courses.map((course, orderIndex) => ({ ...course, orderIndex })) });
  }

  function removeCourse(courseId: string) {
    if (!curriculum || !window.confirm("Xóa khóa học này cùng các chương và bài học bên trong?")) return;
    change({ ...curriculum, courses: curriculum.courses.filter((course) => course.id !== courseId).map((course, index) => ({ ...course, orderIndex: index })) });
  }

  function addUnit(courseId: string) {
    if (!curriculum) return;
    change({
      ...curriculum,
      courses: curriculum.courses.map((course) => course.id !== courseId ? course : {
        ...course,
        units: [...course.units, { id: nodeId("unit"), title: `Chương ${course.units.length + 1}`, description: "", objectives: [], orderIndex: course.units.length, lessons: [] }],
      }),
    });
  }

  function updateUnit(courseId: string, unitId: string, patch: Partial<CurriculumUnit>) {
    if (!curriculum) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => course.id !== courseId ? course : { ...course, units: course.units.map((unit) => unit.id === unitId ? { ...unit, ...patch } : unit) }) });
  }

  function moveUnit(courseId: string, unitId: string, offset: number) {
    if (!curriculum) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => {
      if (course.id !== courseId) return course;
      const index = course.units.findIndex((unit) => unit.id === unitId);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= course.units.length) return course;
      const units = [...course.units];
      [units[index], units[destination]] = [units[destination], units[index]];
      return { ...course, units: units.map((unit, orderIndex) => ({ ...unit, orderIndex })) };
    }) });
  }

  function removeUnit(courseId: string, unitId: string) {
    if (!curriculum || !window.confirm("Xóa chương này cùng các bài học bên trong?")) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => course.id !== courseId ? course : { ...course, units: course.units.filter((unit) => unit.id !== unitId).map((unit, index) => ({ ...unit, orderIndex: index })) }) });
  }

  function addLesson(courseId: string, unitId: string) {
    if (!curriculum) return;
    change({
      ...curriculum,
      courses: curriculum.courses.map((course) => course.id !== courseId ? course : { ...course, units: course.units.map((unit) => unit.id !== unitId ? unit : {
        ...unit,
        lessons: [...unit.lessons, { id: nodeId("lesson"), materialId: null, title: `Bài học ${unit.lessons.length + 1}`, objective: "", prerequisites: [], estimatedMinutes: 15, orderIndex: unit.lessons.length, unlockRule: { type: unit.lessons.length ? "previous_lesson" : "immediate" }, completionRule: { type: "all_steps" } }],
      }) }),
    });
  }

  function updateLesson(courseId: string, unitId: string, lessonId: string, patch: Partial<CurriculumLesson>) {
    if (!curriculum) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => course.id !== courseId ? course : { ...course, units: course.units.map((unit) => unit.id !== unitId ? unit : { ...unit, lessons: unit.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...patch } : lesson) }) }) });
  }

  function moveLesson(courseId: string, unitId: string, lessonId: string, offset: number) {
    if (!curriculum) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => course.id !== courseId ? course : {
      ...course,
      units: course.units.map((unit) => {
        if (unit.id !== unitId) return unit;
        const index = unit.lessons.findIndex((lesson) => lesson.id === lessonId);
        const destination = index + offset;
        if (index < 0 || destination < 0 || destination >= unit.lessons.length) return unit;
        const lessons = [...unit.lessons];
        [lessons[index], lessons[destination]] = [lessons[destination], lessons[index]];
        return { ...unit, lessons: lessons.map((lesson, orderIndex) => ({ ...lesson, orderIndex })) };
      }),
    }) });
  }

  function removeLesson(courseId: string, unitId: string, lessonId: string) {
    if (!curriculum || !window.confirm("Xóa bài học khỏi lộ trình? Học liệu Studio liên kết sẽ không bị xóa.")) return;
    change({ ...curriculum, courses: curriculum.courses.map((course) => course.id !== courseId ? course : { ...course, units: course.units.map((unit) => unit.id !== unitId ? unit : { ...unit, lessons: unit.lessons.filter((lesson) => lesson.id !== lessonId).map((lesson, index) => ({ ...lesson, orderIndex: index })) }) }) });
  }

  async function attachMaterial(lessonId: string, materialId: string) {
    if (!materialId) return;
    try {
      // A newly added course/unit/lesson only exists in React state. Persist
      // that tree first so the server can safely attach the material by ID.
      if (dirty) {
        const savedStructure = await save();
        if (!savedStructure) return;
      }
      const saved = await request<Curriculum>(`/api/curricula/${curriculumId}/lessons/${lessonId}`, { method: "POST", body: JSON.stringify({ materialId }) });
      setCurriculum(saved);
      setDirty(false);
      setNotice("Đã liên kết học liệu vào bài học.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể liên kết học liệu.");
    }
  }

  async function authorNewLesson(lesson: CurriculumLesson) {
    try {
      if (dirty) {
        const savedStructure = await save();
        if (!savedStructure) return;
      }
      const material = await request<Material>("/api/materials/template", { method: "POST", body: JSON.stringify({ title: lesson.title }) });
      await attachMaterial(lesson.id, material.id);
      // This boundary crosses from the React builder into the preserved legacy
      // Studio surface. A browser navigation reliably resets the Studio frame
      // and keeps the curriculum context in its URL.
      window.location.assign(`/studio?material=${material.id}&curriculum=${curriculumId}&lesson=${lesson.id}&returnTo=${encodeURIComponent(`/curricula/${curriculumId}`)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo bản nháp học liệu.");
    }
  }

  async function publish() {
    if (!curriculum || !window.confirm("Xuất bản chương trình này? Người học sẽ có thể truy cập các bài học đã sẵn sàng.")) return;
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    try {
      const published = await request<Curriculum>(`/api/curricula/${curriculumId}/publish`, { method: "POST" });
      setCurriculum(published);
      setNotice("Chương trình đã xuất bản và sẵn sàng cho người học.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xuất bản chương trình.");
    }
  }

  if (loading) return <main className="curriculum-page"><p className="empty">Đang tải trình xây dựng lộ trình…</p></main>;
  if (!curriculum) return <main className="curriculum-page"><p className="error">{error || "Không tìm thấy chương trình học."}</p></main>;

  return (
    <main className="curriculum-builder">
      <header className="curriculum-builder-topbar">
        <Link href="/curricula"><ArrowLeft size={17} /> Chương trình học</Link>
        <div>
          <span className={`status-pill ${curriculum.status}`}>{curriculum.status === "published" ? "Đã xuất bản" : "Bản nháp"}</span>
          <button className="outline" onClick={() => void save()} disabled={saving || !dirty}><Save size={16} /> {saving ? "Đang lưu" : dirty ? "Lưu thay đổi" : "Đã lưu"}</button>
          <Link className="outline" href={`/learn/${curriculum.id}`}><Eye size={16} /> Xem người học</Link>
          <button className="primary" onClick={() => void publish()}><Send size={16} /> Xuất bản</button>
        </div>
      </header>
      {(error || notice) && <p className={error ? "error" : "success"} role="status">{error || notice}</p>}
      <section className="curriculum-builder-intro">
        <div>
          <span className="eyebrow">CURRICULUM BUILDER</span>
          <input aria-label="Tên chương trình" value={curriculum.title} onChange={(event) => updateRoot({ title: inputValue(event) })} />
          <textarea aria-label="Mô tả chương trình" value={curriculum.description} onChange={(event) => updateRoot({ description: inputValue(event) })} placeholder="Mô tả mục tiêu và đối tượng học tập." rows={2} />
        </div>
        <div className="curriculum-root-meta">
          <label>Môn học<input value={curriculum.subject} onChange={(event) => updateRoot({ subject: inputValue(event) })} /></label>
          <label>Cấp học<input value={curriculum.gradeBand} onChange={(event) => updateRoot({ gradeBand: inputValue(event) })} /></label>
          <span><BookOpen size={17} /> {curriculum.courses.length} khóa học</span>
          <span><ClipboardList size={17} /> {lessonCount} bài học</span>
        </div>
      </section>
      <section className="curriculum-flow-builder" aria-label="Cấu trúc chương trình học">
        <div className="curriculum-flow-heading"><div><span className="eyebrow">CẤU TRÚC HỌC TẬP</span><h2>Khóa học, chương và bài học</h2><p>Mỗi bài học liên kết đúng một học liệu Studio.</p></div><button className="outline" onClick={addCourse}><Plus size={16} /> Thêm khóa học</button></div>
        {curriculum.courses.length ? curriculum.courses.map((course, courseIndex) => (
          <article className="course-node" key={course.id}>
            <div className="course-node-header"><div className="node-order">{String(courseIndex + 1).padStart(2, "0")}</div><div className="node-fields"><input aria-label={`Tên khóa học ${courseIndex + 1}`} value={course.title} onChange={(event) => updateCourse(course.id, { title: inputValue(event) })} /><textarea aria-label={`Mô tả khóa học ${courseIndex + 1}`} value={course.description} onChange={(event) => updateCourse(course.id, { description: inputValue(event) })} placeholder="Mô tả khóa học" rows={1} /></div><div className="node-actions"><button className="icon-button" aria-label={`Đưa ${course.title} lên`} disabled={courseIndex === 0} onClick={() => moveCourse(course.id, -1)}>↑</button><button className="icon-button" aria-label={`Đưa ${course.title} xuống`} disabled={courseIndex === curriculum.courses.length - 1} onClick={() => moveCourse(course.id, 1)}>↓</button><button className="icon-button danger" aria-label={`Xóa khóa học ${course.title}`} onClick={() => removeCourse(course.id)}><Trash2 size={16} /></button></div></div>
            <div className="unit-list">
              {course.units.map((unit, unitIndex) => (
                <section className="unit-node" key={unit.id}>
                  <div className="unit-node-header"><FolderPlus size={16} /><div><input aria-label={`Tên chương ${unitIndex + 1}`} value={unit.title} onChange={(event) => updateUnit(course.id, unit.id, { title: inputValue(event) })} /><textarea aria-label={`Mô tả ${unit.title}`} value={unit.description} onChange={(event) => updateUnit(course.id, unit.id, { description: inputValue(event) })} placeholder="Mục tiêu chương" rows={1} /></div><div className="node-actions"><button className="icon-button" aria-label={`Đưa ${unit.title} lên`} disabled={unitIndex === 0} onClick={() => moveUnit(course.id, unit.id, -1)}>↑</button><button className="icon-button" aria-label={`Đưa ${unit.title} xuống`} disabled={unitIndex === course.units.length - 1} onClick={() => moveUnit(course.id, unit.id, 1)}>↓</button><button className="icon-button danger" aria-label={`Xóa ${unit.title}`} onClick={() => removeUnit(course.id, unit.id)}><Trash2 size={15} /></button></div></div>
                  <div className="lesson-list">
                    {unit.lessons.map((lesson, lessonIndex) => <LessonRow key={lesson.id} lesson={lesson} lessonIndex={lessonIndex} materials={materials} onPatch={(patch) => updateLesson(course.id, unit.id, lesson.id, patch)} onAttach={(materialId) => void attachMaterial(lesson.id, materialId)} onAuthor={() => void authorNewLesson(lesson)} onOpenStudio={() => lesson.materialId && window.location.assign(`/studio?material=${lesson.materialId}&curriculum=${curriculumId}&lesson=${lesson.id}&returnTo=${encodeURIComponent(`/curricula/${curriculumId}`)}`)} onMove={(offset) => moveLesson(course.id, unit.id, lesson.id, offset)} canMoveUp={lessonIndex > 0} canMoveDown={lessonIndex < unit.lessons.length - 1} onRemove={() => removeLesson(course.id, unit.id, lesson.id)} />)}
                    <button className="add-lesson" onClick={() => addLesson(course.id, unit.id)}><Plus size={15} /> Thêm bài học</button>
                  </div>
                </section>
              ))}
              <button className="add-unit" onClick={() => addUnit(course.id)}><Plus size={16} /> Thêm chương / chủ đề</button>
            </div>
          </article>
        )) : <div className="curriculum-empty"><GraduationCap size={30} /><h3>Chương trình chưa có khóa học</h3><p>Thêm khóa học, sau đó tạo chương và bài học để bắt đầu thiết kế lộ trình.</p></div>}
      </section>
    </main>
  );
}

function LessonRow({ lesson, lessonIndex, materials, onPatch, onAttach, onAuthor, onOpenStudio, onMove, canMoveUp, canMoveDown, onRemove }: { lesson: CurriculumLesson; lessonIndex: number; materials: Material[]; onPatch: (patch: Partial<CurriculumLesson>) => void; onAttach: (materialId: string) => void; onAuthor: () => void; onOpenStudio: () => void; onMove: (offset: number) => void; canMoveUp: boolean; canMoveDown: boolean; onRemove: () => void; }) {
  const linked = materials.find((material) => material.id === lesson.materialId);
  return <article className="lesson-node">
    <div className="lesson-order"><CircleCheck size={15} /> {lessonIndex + 1}</div>
    <div className="lesson-main"><input aria-label={`Tên bài học ${lessonIndex + 1}`} value={lesson.title} onChange={(event) => onPatch({ title: inputValue(event) })} /><textarea aria-label={`Mục tiêu ${lesson.title}`} value={lesson.objective} onChange={(event) => onPatch({ objective: inputValue(event) })} placeholder="Mục tiêu bài học" rows={1} /><div className="lesson-controls"><label>Thời lượng<input aria-label={`Thời lượng ${lesson.title}`} type="number" min="0" value={lesson.estimatedMinutes} onChange={(event) => onPatch({ estimatedMinutes: Number(event.target.value) || 0 })} /> phút</label><label>Mở khóa<select aria-label={`Điều kiện mở khóa ${lesson.title}`} value={lesson.unlockRule.type} onChange={(event) => onPatch({ unlockRule: { type: inputValue(event) as CurriculumLesson["unlockRule"]["type"] } })}><option value="immediate">Ngay</option><option value="previous_lesson">Xong bài trước</option><option value="previous_unit">Xong chương trước</option><option value="manual">Giáo viên mở</option></select></label></div></div>
    <div className="lesson-material"><Library size={16} /><select aria-label={`Học liệu cho ${lesson.title}`} value={lesson.materialId || ""} onChange={(event) => onAttach(inputValue(event))}><option value="">Chọn học liệu đã có</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.title} · {material.status === "published" ? "đã xuất bản" : "bản nháp"}</option>)}</select>{linked ? <><span className={linked.status === "published" ? "material-ready" : "material-draft"}>{linked.status === "published" ? "Sẵn sàng" : "Cần xuất bản"}</span><button className="outline compact" onClick={onOpenStudio}><FilePenLine size={14} /> Mở Studio</button></> : <button className="outline compact" onClick={onAuthor}><FilePenLine size={14} /> Soạn mới</button>}</div>
    <div className="node-actions"><button className="icon-button" aria-label={`Đưa ${lesson.title} lên`} disabled={!canMoveUp} onClick={() => onMove(-1)}>↑</button><button className="icon-button" aria-label={`Đưa ${lesson.title} xuống`} disabled={!canMoveDown} onClick={() => onMove(1)}>↓</button><button className="icon-button danger" aria-label={`Xóa bài ${lesson.title}`} onClick={onRemove}><Trash2 size={15} /></button></div>
  </article>;
}
