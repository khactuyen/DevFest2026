import { canAuthor } from "./auth/types";
import { AppError } from "./app-error";
import { curriculumLessonList, type Curriculum, type CurriculumProgress, validateCurriculum, validateCurriculumProgress } from "./curriculum-contracts";
import { getAuthContext, requireOwner, requireRole, requireUser, userDatabase } from "./auth/server";
import { localRepository } from "./local-repository";
import { publishedMaterialSnapshot } from "./store";
import { publicMaterial } from "./public-material";
import { validateMaterial } from "./validation";
import type { Material } from "./contracts";
import { recordLocalAudit } from "./auth/local";
type Stored = { document: Curriculum; publication: Curriculum | null; pins?: Record<string, Material> };
const curricula = localRepository<Stored>("curricula.json", raw => {
  if (raw && typeof raw === "object" && "document" in raw) { const row = raw as Stored; return { document: validateCurriculum(row.document), publication: row.publication ? validateCurriculum(row.publication) : null, pins: row.pins || {} }; }
  return { document: validateCurriculum(raw), publication: null };
});
const progress = localRepository<CurriculumProgress>("curriculum-progress.json", validateCurriculumProgress);
async function database() {
  if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_URL) throw new AppError(503, "Chưa cấu hình kho chương trình học và tiến độ bền vững.", "curriculum_store_unavailable");
  return userDatabase();
}
export async function listCurricula(includeDrafts = false) {
  const db = await database();
  if (db) {
    const { data: published, error } = await db.rpc("list_published_curricula");
    const result = new Map<string, Curriculum>();
    if (error) throw new AppError(503, "Không tải được lộ trình học.");
    for (const row of published || []) { const c = validateCurriculum(row); result.set(c.id, c); }
    if (includeDrafts) {
      const { data, error: ownError } = await db.from("curricula").select("content_json");
      if (ownError) throw new AppError(503, "Không tải được lộ trình của bạn.");
      for (const row of data || []) { const c = validateCurriculum(row.content_json); result.set(c.id, c); }
    }
    return [...result.values()];
  }
  const { user } = await getAuthContext();
  return (await curricula.read()).flatMap(row => includeDrafts && user && canAuthor(user) && row.document.ownerId === user.id ? [row.document]
    : row.document.status === "published" && row.publication ? [row.publication] : []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getCurriculum(id: string, includeDraft = false) { return (await listCurricula(includeDraft)).find(c => c.id === id); }
export async function curriculumReferencesMaterial(id: string) { return (await curricula.read()).some(r => Object.values(r.pins || {}).some(m => m.id === id)); }
export async function getCurriculumMaterial(curriculumId: string, lessonId: string) {
  const db = await database();
  let material: Material | undefined;
  if (db) {
    const { data, error } = await db.rpc("read_curriculum_material", { curriculum_id: curriculumId, lesson_id: lessonId });
    if (error) throw new AppError(503, "Không tải được phiên bản bài học.");
    material = data ? validateMaterial(data) : undefined;
  } else {
    const row = (await curricula.read()).find(r => r.document.id === curriculumId && r.document.status === "published" && r.publication);
    const pinned = row?.pins?.[lessonId];
    if (pinned && await publishedMaterialSnapshot(pinned.id)) material = publicMaterial({ ...pinned, visibility: "public" });
  }
  if (!material) return undefined;
  // Image requests carry the same approved curriculum context as the snapshot.
  return { ...material, blocks: material.blocks.map(b => b.authorKind === "image" && b.content.startsWith("/api/material-assets/") ? { ...b, content: `${b.content}?curriculum=${curriculumId}&lesson=${encodeURIComponent(lessonId)}` } : b) };
}
export async function saveCurriculum(raw: unknown, operation: "save" | "publish" = "save") {
  const user = await requireRole("author");
  const c = validateCurriculum({ ...(raw as Record<string, unknown>), ownerId: user.id });
  const db = await database();
  if (db) {
    const { error } = await db.rpc("save_owned_curriculum", { document: c, expected_revision: c.revision - 1, publication_action: operation });
    if (error) throw new AppError(error.code === "40001" ? 409 : 400, "Không lưu được lộ trình. Kiểm tra quyền và phiên bản.", "curriculum_revision_conflict");
  } else {
    const pins: Record<string, Material> = {};
    if (operation === "publish") for (const { lesson } of curriculumLessonList(c)) {
      const snapshot = lesson.materialId && await publishedMaterialSnapshot(lesson.materialId);
      if (!snapshot) throw new AppError(400, "Mọi bài học cần học liệu đã xuất bản công khai.");
      pins[lesson.id] = snapshot;
    }
    await curricula.mutate(rows => {
    const current = rows.find(r => r.document.id === c.id);
    if (c.revision !== (current?.document.revision ?? 0) + 1 || current && current.document.ownerId !== user.id) throw new AppError(409, "Lộ trình đã thay đổi hoặc không thuộc tài khoản này.", "curriculum_revision_conflict");
    if (operation === "save" && c.status === "published" && current?.document.status !== "published") throw new AppError(400, "Sử dụng chức năng xuất bản để công bố lộ trình.");
    if (current) { current.document = c; if (operation === "publish") { current.publication = structuredClone(c); current.pins = pins; } }
    else rows.push({ document: c, publication: null });
    });
    if (operation === "publish") await recordLocalAudit(user.id, "curriculum.publish", c.id);
  }
  return c;
}
export async function deleteCurriculum(id: string) {
  const c = await getCurriculum(id, true); if (!c) throw new AppError(404, "Không tìm thấy lộ trình.");
  await requireOwner(c.ownerId);
  const db = await database();
  if (db) { const { error } = await db.from("curricula").delete().eq("id", id); if (error) throw new AppError(400, "Không xóa được lộ trình."); }
  else { await curricula.mutate(rows => { const i = rows.findIndex(r => r.document.id === id); if (i >= 0) rows.splice(i, 1); }); await progress.mutate(rows => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].curriculumId === id) rows.splice(i, 1); }); await recordLocalAudit(c.ownerId, "curriculum.delete", id); }
}
export async function getCurriculumProgress(curriculumId: string, _learnerId?: string) {
  const user = await requireUser(), curriculum = await getCurriculum(curriculumId);
  if (!curriculum) throw new AppError(404, "Không tìm thấy lộ trình.");
  const db = await database();
  if (db) {
    const { data, error } = await db.from("curriculum_progress").select("content_json").eq("curriculum_id", curriculumId).eq("learner_id", user.id).eq("curriculum_revision", curriculum.revision).maybeSingle();
    if (error) throw new AppError(503, "Không tải được tiến độ.");
    if (data) return validateCurriculumProgress(data.content_json);
  } else {
    const row = (await progress.read()).find(p => p.curriculumId === curriculumId && p.learnerId === user.id && p.curriculumRevision === curriculum.revision);
    if (row) return row;
  }
  return validateCurriculumProgress({ curriculumId, curriculumRevision: curriculum.revision, learnerId: user.id, lessons: [], updatedAt: new Date().toISOString() });
}
export async function saveCurriculumProgress(raw: unknown) {
  const user = await requireUser();
  const p = validateCurriculumProgress({ ...(raw as Record<string, unknown>), learnerId: user.id });
  const curriculum = await getCurriculum(p.curriculumId);
  if (!curriculum || p.curriculumRevision !== curriculum.revision) throw new AppError(409, "Lộ trình đã thay đổi. Vui lòng tải lại.");
  const db = await database();
  if (db) {
    const { error } = await db.from("curriculum_progress").upsert({ curriculum_id: p.curriculumId, curriculum_revision: p.curriculumRevision, learner_id: user.id, learner_user_id: user.id, content_json: p, updated_at: p.updatedAt }, { onConflict: "curriculum_id,learner_id,curriculum_revision" });
    if (error) throw new AppError(400, "Không lưu được tiến độ.");
  } else await progress.mutate(rows => { const i = rows.findIndex(r => r.curriculumId === p.curriculumId && r.learnerId === user.id && r.curriculumRevision === p.curriculumRevision); if (i >= 0) rows[i] = p; else rows.push(p); });
  return p;
}
export async function attachMaterialToLesson(curriculumId: string, lessonId: string, materialId: string) {
  const c = await getCurriculum(curriculumId, true); if (!c) throw new AppError(404, "Không tìm thấy lộ trình.");
  await requireOwner(c.ownerId);
  let found = false;
  const updated = { ...c, revision: c.revision + 1, updatedAt: new Date().toISOString(), courses: c.courses.map(course => ({ ...course, units: course.units.map(unit => ({ ...unit, lessons: unit.lessons.map(lesson => { if (lesson.id !== lessonId) return lesson; found = true; return { ...lesson, materialId }; }) })) })) };
  if (!found) throw new AppError(404, "Không tìm thấy bài học.");
  return saveCurriculum(updated);
}
export function curriculumCompletionPercent(curriculum: Curriculum, p: CurriculumProgress) {
  const lessons = curriculumLessonList(curriculum); if (!lessons.length) return 0;
  const completed = new Set(p.lessons.filter(l => l.completedAt).map(l => l.lessonId));
  return Math.round(completed.size / lessons.length * 100);
}
