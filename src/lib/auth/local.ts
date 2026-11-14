import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "../app-error";
import type { AuthUser, Role, AccountStatus } from "./types";

const scrypt = promisify(derive);
type Account = AuthUser & { salt: string; passwordHash: string; quota: number; createdAt: string };
type State = {
  accounts: Account[];
  sessions: { hash: string; userId: string; expiresAt: number }[];
  recovery: { hash: string; userId: string; expiresAt: number }[];
  audit: { actorId: string; action: string; targetId: string; at: string; reason?: string }[];
  runs: { id: string; userId: string; operation: string; requestKey?: string; day: string; state: "held" | "settled" | "released"; expiresAt: number }[];
};
const runtimeState = globalThis as typeof globalThis & { __mathAuthQueues?: Map<string, Promise<void>> };
const queues = runtimeState.__mathAuthQueues ||= new Map<string, Promise<void>>();
const pending = () => queues.get(filename()) || Promise.resolve();
const directory = () => process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
const filename = () => path.join(directory(), "accounts.json");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
function assertLocal() {
  if (process.env.NODE_ENV === "production") throw new AppError(503, "Cần cấu hình Supabase Auth cho production.", "auth_unavailable");
}
async function load(): Promise<State> {
  assertLocal();
  try { return JSON.parse(await fs.readFile(filename(), "utf8")); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { accounts: [], sessions: [], recovery: [], audit: [], runs: [] };
    throw new AppError(503, "Không đọc được kho tài khoản.", "auth_store_unavailable");
  }
}
async function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  let result!: T;
  const target = filename();
  const task = pending().then(async () => {
    const state = await load();
    result = await fn(state);
    await fs.mkdir(directory(), { recursive: true });
    const temporary = `${filename()}.${randomBytes(8).toString("hex")}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await fs.rename(temporary, filename());
  });
  queues.set(target, task.catch(() => {}));
  await task;
  return result;
}
function publicUser(account: Account): AuthUser {
  const { id, email, displayName, role, status, canAuthor = false } = account;
  return { id, email, displayName, role, status, canAuthor };
}
export async function registerLocal(email: string, password: string, displayName: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(password, salt, 64) as Buffer).toString("hex");
  return mutate(state => {
    if (state.accounts.some(a => a.email === email)) throw new AppError(400, "Không thể đăng ký bằng địa chỉ này.");
    const account: Account = { id: crypto.randomUUID(), email, displayName, role: "learner", status: "active", salt, passwordHash, quota: 50, createdAt: new Date().toISOString() };
    state.accounts.push(account);
    return publicUser(account);
  });
}
export async function loginLocal(email: string, password: string) {
  await pending();
  const state = await load(), account = state.accounts.find(a => a.email === email);
  const supplied = await scrypt(password, account?.salt || "unknown-account-dummy-salt", 64) as Buffer;
  if (!account || !timingSafeEqual(supplied, Buffer.from(account.passwordHash, "hex")) || account.status !== "active")
    throw new AppError(401, "Email hoặc mật khẩu không hợp lệ.", "invalid_credentials");
  const token = randomBytes(32).toString("base64url");
  await mutate(s => {
    const current = s.accounts.find(a => a.id === account.id);
    if (!current || current.status !== "active" || current.passwordHash !== account.passwordHash) throw new AppError(401, "Vui lòng đăng nhập lại.");
    s.sessions = s.sessions.filter(session => session.expiresAt > Date.now());
    s.sessions.push({ hash: hashToken(token), userId: account.id, expiresAt: Date.now() + 7 * 86400000 });
  });
  return { user: publicUser(account), token };
}
export async function localUser(token?: string): Promise<AuthUser | null> {
  if (!token) return null;
  await pending();
  const state = await load(), session = state.sessions.find(s => s.hash === hashToken(token) && s.expiresAt > Date.now());
  const account = session && state.accounts.find(a => a.id === session.userId);
  return account ? publicUser(account) : null;
}
export async function logoutLocal(token: string) {
  await mutate(s => { s.sessions = s.sessions.filter(session => session.hash !== hashToken(token)); });
}
export async function updateLocalProfile(userId: string, displayName: string) {
  return mutate(s => {
    const account = s.accounts.find(a => a.id === userId);
    if (!account || account.status !== "active") throw new AppError(401, "Vui lòng đăng nhập lại.");
    account.displayName = displayName;
    return publicUser(account);
  });
}
export async function requestLocalRecovery(email: string, origin: string) {
  const token = randomBytes(32).toString("base64url");
  const exists = await mutate(s => {
    const account = s.accounts.find(a => a.email === email);
    if (!account) return false;
    s.recovery = s.recovery.filter(r => r.userId !== account.id && r.expiresAt > Date.now());
    s.recovery.push({ hash: hashToken(token), userId: account.id, expiresAt: Date.now() + 30 * 60000 });
    return true;
  });
  if (exists) {
    await fs.mkdir(directory(), { recursive: true });
    await fs.appendFile(path.join(directory(), "auth-outbox.jsonl"), JSON.stringify({ to: email, url: `${origin}/reset-password?token=${token}`, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
  }
}
export async function resetLocalPassword(token: string, password: string) {
  const salt = randomBytes(16).toString("hex"), passwordHash = (await scrypt(password, salt, 64) as Buffer).toString("hex");
  await mutate(s => {
    const recovery = s.recovery.find(r => r.hash === hashToken(token) && r.expiresAt > Date.now());
    const account = recovery && s.accounts.find(a => a.id === recovery.userId && a.status === "active");
    if (!account) throw new AppError(400, "Liên kết khôi phục không hợp lệ hoặc đã hết hạn.");
    account.salt = salt; account.passwordHash = passwordHash;
    s.recovery = s.recovery.filter(r => r.userId !== account.id);
    s.sessions = s.sessions.filter(session => session.userId !== account.id);
  });
}
export async function localAdminData(actorId: string) {
  await pending();
  const s = await load();
  if (!s.accounts.some(a => a.id === actorId && a.role === "admin" && a.status === "active")) throw new AppError(403, "Không có quyền quản trị.");
  return { users: s.accounts.map(a => ({ ...publicUser(a), quota: a.quota })), audit: s.audit.slice(-100).reverse() };
}
export async function changeLocalAccess(actorId: string, targetId: string, role: Role, status: AccountStatus, quota: number, canAuthor = false) {
  await mutate(s => {
    if (!s.accounts.some(a => a.id === actorId && a.role === "admin" && a.status === "active")) throw new AppError(403, "Không có quyền quản trị.");
    const target = s.accounts.find(a => a.id === targetId);
    if (!target) throw new AppError(404, "Không tìm thấy tài khoản.");
    if (target.role === "admin" && target.status === "active" && (role !== "admin" || status !== "active") && s.accounts.filter(a => a.role === "admin" && a.status === "active").length === 1)
      throw new AppError(409, "Không thể vô hiệu hóa quản trị viên cuối cùng.");
    target.role = role; target.status = status; target.quota = quota; target.canAuthor = role === "admin" && canAuthor;
    if (status === "suspended") s.sessions = s.sessions.filter(session => session.userId !== targetId);
    s.audit.push({ actorId, targetId, action: "account.access.update", at: new Date().toISOString() });
  });
}
export async function bootstrapLocalAdmin(email: string) {
  assertLocal();
  await pending();
  if (!(await load()).accounts.some(a => a.email === email)) await registerLocal(email, randomBytes(48).toString("base64url"), email.split("@")[0]);
  await mutate(s => {
    const account = s.accounts.find(a => a.email === email)!;
    account.role = "admin"; account.status = "active"; account.canAuthor = true;
    s.audit.push({ actorId: account.id, targetId: account.id, action: "account.bootstrap_admin", at: new Date().toISOString() });
  });
}
export async function recordLocalAudit(actorId: string, action: string, targetId: string, reason?: string) {
  await mutate(s => { s.audit.push({ actorId, action, targetId, at: new Date().toISOString(), ...(reason ? { reason } : {}) }); });
}
export async function reserveLocalRun(userId: string, operation: string, requestKey = crypto.randomUUID()) {
  return mutate(s => {
    const account = s.accounts.find(a => a.id === userId && a.status === "active");
    if (!account) throw new AppError(401, "Vui lòng đăng nhập lại.");
    if (requestKey.length > 200) throw new AppError(400, "Mã yêu cầu quá dài.");
    if (s.runs.some(r => r.userId === userId && r.requestKey === requestKey)) throw new AppError(409, "Yêu cầu này đã được xử lý hoặc đang chạy.", "duplicate_request");
    const day = new Date().toISOString().slice(0, 10), now = Date.now();
    for (const run of s.runs) if (run.state === "held" && run.expiresAt <= now) run.state = "settled"; // conservatively charge abandoned work
    const used = s.runs.filter(r => r.userId === userId && r.day === day && r.state !== "released");
    if (used.length >= account.quota || used.filter(r => r.state === "held").length >= 3) throw new AppError(429, "Đã đạt hạn mức sử dụng. Vui lòng thử lại sau.", "quota_exceeded");
    const id = crypto.randomUUID();
    s.runs.push({ id, userId, operation, requestKey, day, state: "held", expiresAt: now + 10 * 60000 });
    return id;
  });
}
export async function settleLocalRun(userId: string, id: string, success: boolean) {
  await mutate(s => { const run = s.runs.find(r => r.id === id && r.userId === userId && r.state === "held"); if (run) run.state = success ? "settled" : "released"; });
}

