import { promises as fs } from "node:fs";
import path from "node:path";
import { userDatabase } from "./auth/server";
import { AppError } from "./app-error";
import { ExplorationSessionSchema, validateExplorationSession, type ExplorationSession } from "./exploration-contracts";

const directory = process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
const file = path.join(directory, "exploration-sessions.json");
const db = userDatabase;
let queue = Promise.resolve();

async function sessionDatabase() {
  const client = await db();
  if (!client && process.env.NODE_ENV === "production") {
    throw new AppError(503, "Chưa cấu hình kho phiên học bền vững. Hãy cấu hình Supabase trước khi đưa hệ thống lên production.", "session_store_unavailable");
  }
  return client;
}

async function readLocal(): Promise<ExplorationSession[]> {
  try {
    const values: unknown[] = JSON.parse(await fs.readFile(file, "utf8"));
    return values.map(validateExplorationSession);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function mutateLocal(transform: (all: ExplorationSession[]) => ExplorationSession[]) {
  const job = queue.then(async () => {
    await fs.mkdir(directory, { recursive: true });
    const next = transform(await readLocal());
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(next, null, 2));
    await fs.rename(temporary, file);
  });
  queue = job.catch(() => {});
  await job;
}

export async function listExplorationSessions(ownerKey: string) {
  const client = await sessionDatabase();
  if (client) {
    const { data, error } = await client.from("exploration_sessions").select("content_json")
      .eq("owner_key", ownerKey).order("updated_at", { ascending: false }).limit(30);
    if (error) throw new AppError(503, "Không tải được các phiên khám phá đã lưu.", "session_store_unavailable");
    return (data || []).map((row) => validateExplorationSession(row.content_json));
  }
  return (await readLocal()).filter((session) => session.ownerKey === ownerKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
}

export async function saveExplorationSession(raw: unknown) {
  const session = validateExplorationSession(raw);
  const client = await sessionDatabase();
  if (client) {
    const { data, error } = await client.rpc("save_exploration_session", {
      document: session,
      expected_revision: session.revision,
    });
    if (error) {
      if (/revision_conflict/i.test(error.message)) throw new AppError(409, "Phiên này vừa được cập nhật ở nơi khác. Tải lại phiên mới nhất trước khi tiếp tục.", "session_revision_conflict");
      throw new AppError(503, "Không lưu được phiên khám phá vào cơ sở dữ liệu.", "session_store_unavailable");
    }
    return { ...session, revision: Number(data) };
  }
  let saved: ExplorationSession | undefined;
  await mutateLocal((all) => {
    const current = all.find((item) => item.id === session.id);
    if (current && current.ownerKey !== session.ownerKey) throw new AppError(409, "ID phiên đã tồn tại.", "session_revision_conflict");
    if ((current?.revision ?? 0) !== session.revision) throw new AppError(409, "Phiên này đã được cập nhật ở một tab khác.", "session_revision_conflict");
    saved = { ...session, revision: session.revision + 1 };
    return [...all.filter((item) => item.id !== session.id), saved];
  });
  return saved!;
}

export async function deleteExplorationSession(id: string, ownerKey: string) {
  const client = await sessionDatabase();
  if (client) {
    const { error } = await client.from("exploration_sessions").delete().eq("id", id).eq("owner_key", ownerKey);
    if (error) throw new AppError(503, "Không xóa được phiên khám phá.", "session_store_unavailable");
    return;
  }
  await mutateLocal((all) => all.filter((item) => item.id !== id || item.ownerKey !== ownerKey));
}
