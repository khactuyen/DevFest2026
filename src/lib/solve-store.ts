import { promises as fs } from "node:fs";
import path from "node:path";
import { userDatabase } from "./auth/server";
import { AppError } from "./app-error";
import {
  migrateSolveSession,
  validateSolveSession,
  type SolveSession,
} from "./solve-contracts";

const directory =
  process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
const file = path.join(directory, "solve-sessions.json");
let queue = Promise.resolve();
async function database() {
  if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_URL) throw new AppError(503, "Kho bài giải production chưa được cấu hình.", "solve_store_unavailable");
  return userDatabase();
}
async function read(): Promise<unknown[]> {
  try {
    const contents = await fs.readFile(file, "utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(contents);
    } catch {
      throw new AppError(
        503,
        "Tệp phiên giải bị hỏng; bản gốc vẫn được giữ để phục hồi.",
        "solve_store_corrupt",
      );
    }
    if (!Array.isArray(raw))
      throw new AppError(503, "Kho phiên không phải danh sách; bản gốc được giữ để phục hồi.", "solve_store_corrupt");
    return raw;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
function rowKey(raw: unknown, field: "id" | "ownerKey") {
  return raw && typeof raw === "object" && field in raw
    ? (raw as Record<string, unknown>)[field]
    : undefined;
}
function readable(raw: unknown): SolveSession | null {
  try {
    return migrateSolveSession(raw);
  } catch {
    console.warn(
      JSON.stringify({
        event: "solve_session_quarantined",
        id:
          typeof rowKey(raw, "id") === "string" ? rowKey(raw, "id") : "unknown",
        reason: "invalid_contract",
      }),
    );
    return null; // original row remains untouched in the backing store
  }
}
export async function listSolveSessions(ownerKey: string) {
  const db = await database();
  if (db) {
    const items: SolveSession[] = [];
    for (let offset = 0; items.length < 30; offset += 100) {
      const { data, error } = await db
        .from("solve_sessions")
        .select("content_json")
        .eq("owner_key", ownerKey)
        .order("updated_at", { ascending: false })
        .range(offset, offset + 99);
      if (error)
        throw new AppError(
          503,
          "Không tải được bài giải đã lưu.",
          "solve_store_unavailable",
        );
      for (const row of data || []) {
        const s = readable(row.content_json);
        if (s && s.ownerKey === ownerKey) items.push(s);
        if (items.length === 30) break;
      }
      if (!data || data.length < 100) break;
    }
    return items;
  }
  return (await read())
    .filter((s) => rowKey(s, "ownerKey") === ownerKey)
    .flatMap((raw) => {
      const s = readable(raw);
      return s ? [s] : [];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30);
}
export async function saveSolveSession(raw: unknown) {
  const input = validateSolveSession(raw),
    db = await database(),
    now = new Date().toISOString();
  const session = {
    ...input,
    updatedAt: now,
    ...(input.revision === 0 ? { createdAt: now } : {}),
  };
  if (input.legacyUnbound && input.revision > 0)
    throw new AppError(
      409,
      "Phiên cũ cần lưu thành bản sao để giữ nguyên bản gốc.",
      "solve_revision_conflict",
    );
  if (db) {
    const { data, error } = await db.rpc("save_solve_session", {
      document: session,
      expected_revision: session.revision,
    });
    if (error)
      throw new AppError(
        /revision_conflict/.test(error.message) ? 409 : 503,
        /revision_conflict/.test(error.message)
          ? "Bài giải đã đổi ở tab khác. Mở lại bản mới nhất hoặc lưu thành bản sao."
          : "Không lưu được bài giải vào cơ sở dữ liệu.",
        /revision_conflict/.test(error.message)
          ? "solve_revision_conflict"
          : "solve_store_unavailable",
      );
    return { ...session, revision: Number(data) };
  }
  let saved: SolveSession | undefined;
  const job = queue.then(async () => {
    const all = await read(),
      rawCurrent = all.find((s) => rowKey(s, "id") === session.id),
      current = rawCurrent ? readable(rawCurrent) : null;
    if (rawCurrent && !current)
      throw new AppError(
        409,
        "ID thuộc phiên hỏng được giữ nguyên. Hãy lưu thành bản sao.",
        "solve_revision_conflict",
      );
    if (current && current.ownerKey !== session.ownerKey)
      throw new AppError(
        409,
        "ID phiên đã tồn tại.",
        "solve_revision_conflict",
      );
    if ((current?.revision ?? 0) !== session.revision)
      throw new AppError(
        409,
        "Bài giải đã đổi ở tab khác. Mở lại bản mới nhất hoặc lưu thành bản sao.",
        "solve_revision_conflict",
      );
    saved = {
      ...session,
      revision: session.revision + 1,
      createdAt: current?.createdAt || now,
    };
    await fs.mkdir(directory, { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(
      temp,
      JSON.stringify(
        [...all.filter((s) => rowKey(s, "id") !== session.id), saved],
        null,
        2,
      ),
    );
    await fs.rename(temp, file);
  });
  queue = job.catch(() => {});
  await job;
  return saved!;
}
export async function deleteSolveSession(id: string, ownerKey: string) {
  const db = await database();
  if (db) {
    const { data: row, error: lookupError } = await db
      .from("solve_sessions")
      .select("content_json")
      .eq("id", id)
      .eq("owner_key", ownerKey)
      .maybeSingle();
    if (lookupError)
      throw new AppError(
        503,
        "Không kiểm tra được phiên trước khi xóa.",
        "solve_store_unavailable",
      );
    if (row && !readable(row.content_json))
      throw new AppError(
        409,
        "Phiên hỏng được giữ nguyên để phục hồi.",
        "solve_revision_conflict",
      );
    const { error } = await db
      .from("solve_sessions")
      .delete()
      .eq("id", id)
      .eq("owner_key", ownerKey);
    if (error)
      throw new AppError(
        503,
        "Không xóa được bài giải.",
        "solve_store_unavailable",
      );
    return;
  }
  const job = queue.then(async () => {
    const all = await read(),
      candidate = all.find(
        (s) => rowKey(s, "id") === id && rowKey(s, "ownerKey") === ownerKey,
      );
    if (candidate && !readable(candidate))
      throw new AppError(
        409,
        "Phiên hỏng được giữ nguyên để phục hồi.",
        "solve_revision_conflict",
      );
    const next = all.filter(
      (s) => rowKey(s, "id") !== id || rowKey(s, "ownerKey") !== ownerKey,
    );
    if (next.length === all.length) return;
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(next, null, 2));
    await fs.rename(temp, file);
  });
  queue = job.catch(() => {});
  await job;
}
