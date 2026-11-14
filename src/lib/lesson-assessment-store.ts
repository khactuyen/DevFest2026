import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "./app-error";
import { reserveLocalRun, settleLocalRun } from "./auth/local";
import type { Assessment, AssessmentSummary, StudentAssessment } from "./lesson-assessment";

type Attempt = { student: StudentAssessment; revision: number };
type LocalBatch = { assessment: Assessment; attempts: Attempt[] };
const queued = new Map<string, Promise<unknown>>();
const directory = () => path.join(process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data"), "lesson-assessments");
const filename = (id: string) => path.join(directory(), `${id}.json`);
const dbUnavailable = () => new AppError(503, "Kho phiếu online chưa sẵn sàng. Kiểm tra cấu hình hoặc migration 015.", "assessment_store");

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (url || key || process.env.NODE_ENV === "production") throw dbUnavailable();
  return null;
}

export async function reserveAssessmentGrade(ownerId: string, requestId: ReturnType<typeof randomUUID>) {
  const db = database();
  if (!db) {
    const run = await reserveLocalRun(ownerId, "/api/lesson-assessments/grade", requestId);
    return (succeeded: boolean) => settleLocalRun(ownerId, run, succeeded);
  }
  const { data, error } = await db.rpc("reserve_lesson_assessment_grade", { actor: ownerId, request_key: requestId });
  if (error || !data) throw new AppError(429, "Chưa cấp được hạn mức chấm AI.");
  return async (succeeded: boolean) => {
    const settled = await db.rpc("settle_ai_run", { run_id: data, actor_id: ownerId, succeeded });
    if (settled.error) throw dbUnavailable();
  };
}

async function readLocal(id: string): Promise<LocalBatch | undefined> {
  try { return JSON.parse(await fs.readFile(filename(id), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

async function writeLocal(batch: LocalBatch) {
  await fs.mkdir(directory(), { recursive: true });
  const file = filename(batch.assessment.id);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(batch), { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function inQueue<T>(id: string, operation: () => Promise<T>) {
  const job = (queued.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
  queued.set(id, job);
  try { return await job; }
  finally { if (queued.get(id) === job) queued.delete(id); }
}

export async function createAssessment(assessment: Assessment, roster: Pick<StudentAssessment, "id" | "name" | "email">[]) {
  const attempts = roster.map((student) => ({ ...student, key: randomUUID(), code: randomBytes(8).toString("hex").toUpperCase() }));
  const db = database();
  if (!db) return inQueue(assessment.id, async () => {
    const existing = await readLocal(assessment.id);
    if (existing) return existing.assessment;
    await writeLocal({ assessment, attempts: attempts.map((student) => ({ student, revision: 1 })) });
    return assessment;
  });
  const { error } = await db.rpc("create_lesson_assessment", { assessment, attempts });
  if (!error) return assessment;
  if (error.code === "23505") {
    const existing = await getAssessment(assessment.id);
    if (existing) return existing;
  }
  throw dbUnavailable();
}

export async function getAssessment(id: string): Promise<Assessment | undefined> {
  const db = database();
  if (!db) return (await readLocal(id))?.assessment;
  const { data, error } = await db.from("lesson_assessments").select("payload").eq("id", id).maybeSingle();
  if (error) throw dbUnavailable();
  return data?.payload;
}

export async function assessmentHistory(ownerId: string, lessonId: string): Promise<AssessmentSummary[]> {
  const db = database();
  let records: Assessment[];
  if (db) {
    const { data, error } = await db.from("lesson_assessments").select("payload").eq("owner_id", ownerId)
      .eq("lesson_id", lessonId).order("created_at", { ascending: false }).limit(50);
    if (error) throw dbUnavailable();
    records = data.map((row) => row.payload);
  } else {
    const entries = await fs.readdir(directory()).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const batches = await Promise.all(entries.filter((name) => name.endsWith(".json")).map((name) => readLocal(name.slice(0, -5))));
    records = batches.flatMap((batch) => batch ? [batch.assessment] : [])
      .filter((batch) => batch.ownerId === ownerId && batch.lessonId === lessonId)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 50);
  }
  return records.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
}

export async function listAssessmentStudents(id: string): Promise<StudentAssessment[]> {
  const db = database();
  if (!db) return (await readLocal(id))?.attempts.map(({ student }) => student) ?? [];
  const { data, error } = await db.from("lesson_assessment_attempts").select("payload").eq("assessment_id", id).order("position");
  if (error) throw dbUnavailable();
  return data.map((row) => row.payload);
}

export async function findAssessmentStudent(id: string, field: "code" | "id", value: string): Promise<StudentAssessment | undefined> {
  const db = database();
  if (!db) return (await readLocal(id))?.attempts.find(({ student }) => (field === "id" ? student.key : student.code) === value)?.student;
  const { data, error } = await db.from("lesson_assessment_attempts").select("payload").eq("assessment_id", id).eq(field, value).maybeSingle();
  if (error) throw dbUnavailable();
  return data?.payload;
}

export async function updateAssessmentStudent(id: string, key: string, change: (student: StudentAssessment) => StudentAssessment | undefined) {
  const db = database();
  if (!db) return inQueue(id, async () => {
    const batch = await readLocal(id);
    const attempt = batch?.attempts.find(({ student }) => student.key === key);
    if (!batch || !attempt) throw new AppError(404, "Không tìm thấy phiếu.");
    const next = change(attempt.student);
    if (!next) return { student: attempt.student, changed: false };
    attempt.student = next;
    attempt.revision++;
    await writeLocal(batch);
    return { student: next, changed: true };
  });
  const row = () => db.from("lesson_assessment_attempts");
  for (let retry = 0; retry < 8; retry++) {
    const { data, error } = await row().select("payload,revision").eq("assessment_id", id).eq("id", key).maybeSingle();
    if (error) throw dbUnavailable();
    if (!data) throw new AppError(404, "Không tìm thấy phiếu.");
    const next = change(data.payload);
    if (!next) return { student: data.payload as StudentAssessment, changed: false };
    const saved = await row().update({ payload: next, revision: data.revision + 1 })
      .eq("assessment_id", id).eq("id", key).eq("revision", data.revision).select("id").maybeSingle();
    if (saved.error) throw dbUnavailable();
    if (saved.data) return { student: next, changed: true };
  }
  throw new AppError(409, "Phiếu vừa được cập nhật. Hãy tải lại và thử tiếp.");
}
