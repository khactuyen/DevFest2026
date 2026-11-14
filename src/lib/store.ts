import { ownsMaterial } from "./auth/types";
import { createHash, randomBytes } from "node:crypto";
import { MaterialSchema, type Material } from "./contracts";
import { validateMaterial } from "./validation";
import { publicMaterial } from "./public-material";
import { AppError } from "./app-error";
import { getAuthContext, requireOwner, requireRole, requireUser, readCookie, userDatabase } from "./auth/server";
import { localRepository } from "./local-repository";
import { recordLocalAudit } from "./auth/local";
type ShareLink = { id: string; tokenHash: string; expiresAt: string | null; revokedAt: string | null; createdAt: string };
type Stored = { document: Material; publication: Material | null; links: ShareLink[]; withdrawn?: boolean };
function compatible(raw: unknown) {
  const parsed = MaterialSchema.parse(raw), seen = new Set<string>();
  const steps = parsed.learningSteps.map(step => ({ ...step, blockIds: step.blockIds.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; }) }));
  for (const block of parsed.blocks) {
    if (seen.has(block.id)) continue;
    const target = steps.at(-1);
    if (target) target.blockIds.push(block.id);
    else steps.push({ id: "step_recovered_1", title: "Bước học tập khôi phục", description: "", phase: "explore", objective: "", estimatedMinutes: 0, blockIds: [block.id], actionLabels: [], visualActions: [] });
  }
  return validateMaterial({ ...parsed, learningSteps: steps });
}
const local = localRepository<Stored>("materials.json", raw => {
  if (raw && typeof raw === "object" && "document" in raw) {
    const row = raw as Stored;
    return { document: compatible(row.document), publication: row.publication ? compatible(row.publication) : null, links: row.links || [], withdrawn: row.withdrawn || false };
  }
  return { document: compatible(raw), publication: null, links: [] }; // unowned legacy rows are quarantined
});
async function database() {
  if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_URL) throw new AppError(503, "Chưa cấu hình kho học liệu bền vững.", "material_store_unavailable");
  return userDatabase();
}
function conflict() { return new AppError(409, "Học liệu đã thay đổi ở nơi khác. Tải lại trước khi lưu.", "material_revision_conflict"); }
export const shareCookieName = (id: string) => `mv_share_${id}`;
async function tokenFor(id: string, token?: string) { return token || await readCookie(shareCookieName(id)); }
function readable(row: Stored, token?: string, ownerId?: string) {
  const m = row.document;
  if (!m.ownerId || m.status !== "published" || !row.publication || row.withdrawn) return false;
  if (ownerId === m.ownerId) return true;
  if (m.visibility === "public") return true;
  if (m.visibility !== "link" || !token) return false;
  const hash = createHash("sha256").update(token).digest("hex");
  return row.links.some(link => link.tokenHash === hash && !link.revokedAt && (!link.expiresAt || Date.parse(link.expiresAt) > Date.now()));
}
export async function listMaterials() {
  const db = await database();
  if (db) {
    const { user } = await getAuthContext();
    const { data: own, error } = user?.status === "active" ? await db.from("materials").select("content_json").eq("owner_id", user.id).order("updated_at", { ascending: false }) : { data: [], error: null };
    const { data: published, error: readError } = await db.rpc("list_published_materials");
    if (error || readError) throw new AppError(503, "Không tải được thư viện học liệu.");
    const map = new Map<string, Material>();
    for (const raw of [...(published || []), ...(own || []).map(r => r.content_json)]) { const m = compatible(raw); map.set(m.id, m); }
    return [...map.values()];
  }
  const { user } = await getAuthContext();
  return (await local.read()).flatMap(row => ownsMaterial(user, row.document.ownerId) ? [row.document] : readable(row) ? [publicMaterial({ ...row.publication!, visibility: row.document.visibility })] : [])
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getMaterial(id: string, options: { edit?: boolean; publishedOnly?: boolean; token?: string } = {}) {
  const db = await database();
  const { user } = await getAuthContext();
  if (db) {
    if (!options.publishedOnly && user?.status === "active") {
      const query = db.from("materials").select("content_json").eq("owner_id", user.id);
      const { data, error } = await (/^[0-9a-f-]{36}$/i.test(id) ? query.eq("id", id) : query.eq("slug", id)).maybeSingle();
      if (error) throw new AppError(503, "Không tải được học liệu.");
      if (data) return compatible(data.content_json);
    }
    if (options.edit) return undefined;
    const token = await tokenFor(id, options.token);
    const { data, error } = await db.rpc("read_published_material", { identifier: id, share_token: token || "" });
    if (error) throw new AppError(503, "Không tải được học liệu.");
    return data ? compatible(data) : undefined;
  }
  const row = (await local.read()).find(r => r.document.id === id || r.document.slug === id);
  if (!row) return undefined;
  if (!options.publishedOnly && ownsMaterial(user, row.document.ownerId)) return row.document;
  if (options.edit) return undefined;
  return readable(row, await tokenFor(row.document.id, options.token), user?.status === "active" ? user.id : undefined) ? publicMaterial({ ...row.publication!, visibility: row.document.visibility }) : undefined;
}
export async function publishedMaterialSnapshot(id: string) {
  const row = (await local.read()).find(r => r.document.id === id);
  return row && row.document.visibility === "public" && readable(row) ? structuredClone(row.publication!) : undefined;
}
export async function saveMaterial(raw: unknown, expectedRevision: number | null, operation: "save" | "publish" | "unpublish" = "save") {
  const user = await requireUser();
  const m = validateMaterial({ ...(raw as Record<string, unknown>), ownerId: user.id });
  if (m.visibility === "school") throw new AppError(400, "Phạm vi trường học chưa được bật. Chọn riêng tư, liên kết hoặc công khai.");
  if (m.revision !== (expectedRevision ?? 0) + 1) throw conflict();
  const db = await database();
  if (db) {
    const { error } = await db.rpc("save_owned_material", { document: m, expected_revision: expectedRevision, publication_action: operation });
    if (error?.code === "40001") throw conflict();
    if (error) throw new AppError(error.code === "42501" ? 403 : 503, "Không lưu được học liệu.");
  } else await local.mutate(rows => {
    const row = rows.find(r => r.document.id === m.id);
    if (expectedRevision === null ? Boolean(row) : !row || row.document.ownerId !== user.id || row.document.revision !== expectedRevision) throw conflict();
    if (operation === "save" && m.status !== (row?.document.status || "draft")) throw new AppError(400, "Đổi trạng thái qua chức năng xuất bản.");
    if (row) {
      row.document = m;
      if (operation === "publish") row.publication = structuredClone(m);
      if (operation === "unpublish") row.publication = null;
    } else rows.push({ document: m, publication: null, links: [] });
  });
  if (!db && operation !== "save") await recordLocalAudit(user.id, `material.${operation}`, m.id);
  return m;
}
export async function deleteMaterial(id: string, draftRevision?: number) {
  const m = await getMaterial(id, { edit: true });
  if (!m) throw new AppError(404, "Không tìm thấy học liệu.");
  await requireOwner(m.ownerId);
  if (draftRevision !== undefined && (m.status !== "draft" || m.revision !== draftRevision)) throw conflict();
  const db = await database();
  if (db) {
    const query = db.from("materials").delete().eq("id", m.id);
    if (draftRevision !== undefined) query.eq("revision", draftRevision).eq("status", "draft");
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw new AppError(error.code === "23503" ? 409 : 503, "Không xóa được học liệu.");
    if (!data) throw conflict();
  } else {
    if (await (await import("./curriculum-repository")).curriculumReferencesMaterial(m.id)) throw new AppError(409, "Học liệu đang được một lộ trình đã xuất bản sử dụng.");
    await local.mutate(rows => {
      const i = rows.findIndex(r => r.document.id === m.id && r.document.ownerId === m.ownerId);
      if (i < 0 || (draftRevision !== undefined && (rows[i].document.status !== "draft" || rows[i].document.revision !== draftRevision))) throw conflict();
      rows.splice(i, 1);
    });
  }
  if (!db) await recordLocalAudit(m.ownerId!, "material.delete", m.id);
}
export async function createMaterialLink(id: string, expiresAt: string | null) {
  const m = await getMaterial(id, { edit: true });
  if (!m || m.status !== "published" || m.visibility !== "link") throw new AppError(400, "Xuất bản học liệu với phạm vi liên kết trước khi chia sẻ.");
  await requireOwner(m.ownerId);
  const token = randomBytes(32).toString("base64url"), tokenHash = createHash("sha256").update(token).digest("hex"), linkId = crypto.randomUUID();
  const db = await database();
  if (db) {
    const { error } = await db.rpc("create_material_link", { material_id: id, link_id: linkId, token_hash: tokenHash, expires_at: expiresAt });
    if (error) throw new AppError(400, "Không tạo được liên kết.");
  } else await local.mutate(rows => {
    const row = rows.find(r => r.document.id === id && r.document.ownerId === m.ownerId);
    if (!row) throw new AppError(404, "Không tìm thấy học liệu.");
    row.links.push({ id: linkId, tokenHash, expiresAt, revokedAt: null, createdAt: new Date().toISOString() });
  });
  if (!db) await recordLocalAudit(m.ownerId!, "material.share.create", m.id);
  return { id: linkId, url: `/material/${m.id}?share=${token}`, expiresAt };
}
export async function revokeMaterialLinks(id: string) {
  const m = await getMaterial(id, { edit: true });
  if (!m) throw new AppError(404, "Không tìm thấy học liệu.");
  await requireOwner(m.ownerId);
  const db = await database();
  if (db) {
    const { error } = await db.rpc("revoke_material_links", { material_id: id });
    if (error) throw new AppError(400, "Không thu hồi được liên kết.");
  } else await local.mutate(rows => { const row = rows.find(r => r.document.id === id); if (row) for (const link of row.links) link.revokedAt = new Date().toISOString(); });
  if (!db) await recordLocalAudit(m.ownerId!, "material.share.revoke", m.id);
}
export async function localMaterialSummaries() {
  await requireRole("admin");
  return (await local.read()).filter(row => row.publication).map(row => ({ id: row.document.id, title: row.publication!.title, withdrawn: !!row.withdrawn }));
}
export async function moderateLocalMaterial(actorId: string, id: string, withdrawn: boolean, reason: string) {
  const actor = await requireRole("admin");
  if (actor.id !== actorId) throw new AppError(403, "Không có quyền quản trị.");
  await local.mutate(rows => { const row = rows.find(r => r.document.id === id && r.publication); if (!row) throw new AppError(404, "Không tìm thấy học liệu."); row.withdrawn = withdrawn; });
  await recordLocalAudit(actorId, withdrawn ? "material.moderate.withdraw" : "material.moderate.restore", id, reason);
}
export async function gradeMaterial(id: string, blockId: string, answer: string, token?: string) {
  const db = await database();
  if (db) {
    if ((await getMaterial(id, { publishedOnly: true, token }))?.exam)
      throw new AppError(404, "Đề kiểm tra không mở tự chấm.");
    const { data, error } = await db.rpc("grade_published_material", { identifier: id, block_id: blockId, submitted_answer: answer, share_token: await tokenFor(id, token) || "" });
    if (error || !data) throw new AppError(404, "Không tìm thấy câu hỏi.");
    return data as { correct: boolean; explanation: string };
  }
  const row = (await local.read()).find(r => r.document.id === id);
  const { user } = await getAuthContext();
  if (!row || !readable(row, await tokenFor(id, token), user?.status === "active" ? user.id : undefined)) throw new AppError(404, "Không tìm thấy học liệu.");
  if (row.publication!.exam) throw new AppError(404, "Đề kiểm tra không mở tự chấm.");
  const assessment = row.publication!.blocks.find(b => b.id === blockId && b.type === "exercise")?.assessment;
  if (!assessment) throw new AppError(404, "Không tìm thấy câu hỏi.");
  const correct = assessment.type === "multiple" ? answer.trim() !== "" && /^\d+$/.test(answer) && Number(answer) === assessment.correctIndex
    : assessment.type === "short" && !!assessment.answer?.trim() && answer.trim().toLocaleLowerCase("vi") === assessment.answer.trim().toLocaleLowerCase("vi");
  return { correct, explanation: correct ? assessment.explanation || "" : "" };
}
export function slugify(title: string, id: string) {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
  return `${slug || "material"}-${id}`;
}
