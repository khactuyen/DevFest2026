// Operator-only account bootstrap; this capability has no HTTP endpoint.
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
nextEnv.loadEnvConfig(process.cwd(), true);
const command = process.argv[2], emails = process.argv.slice(3).map(s => s.trim().toLowerCase());
if (command !== "bootstrap-admin" || !emails.length || emails.some(email => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) throw Error("Usage: node scripts/manage-accounts.mjs bootstrap-admin email [email ...]");
if (process.env.SUPABASE_URL) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("SUPABASE_SERVICE_ROLE_KEY is required for operator bootstrap.");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let accounts = [], page = 1;
  while (true) { const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 }); if (error) throw Error("Cannot inspect accounts."); accounts.push(...data.users); if (data.users.length < 100) break; page++; }
  for (const email of emails) {
    const user = accounts.find(u => u.email?.toLowerCase() === email);
    if (!user) throw Error(`Register and verify ${email} before operator bootstrap.`);
    const { error } = await client.from("user_access").update({ role: "admin", status: "active", can_author: true, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) throw Error("Apply migrations 009–011 before bootstrap.");
    const { error: auditError } = await client.from("audit_events").insert({ action: "account.bootstrap_admin", resource_type: "user", resource_id: user.id });
    if (auditError) throw Error("Administrator created but audit write failed; investigate before continuing.");
    console.log(`Administrator enabled: ${email}`);
  }
} else {
  const bundle = await build({ entryPoints: ["src/lib/auth/local.ts"], bundle: true, platform: "node", format: "esm", write: false });
  const local = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  for (const email of emails) { await local.bootstrapLocalAdmin(email); await local.requestLocalRecovery(email, process.env.APP_ORIGIN || "http://localhost:3000"); }
  const directory = process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data");
  const outbox = (await fs.readFile(path.join(directory, "auth-outbox.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const links = emails.map(email => outbox.findLast(message => message.to === email)).filter(Boolean);
  const escape = text => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const target = path.join(directory, "admin-activation.html");
  await fs.writeFile(target, `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Kích hoạt quản trị viên</title><style>body{font:16px system-ui;max-width:680px;margin:64px auto;padding:24px;background:#f4f8f5;color:#173f2d}a{display:block;padding:20px;margin:16px 0;background:white;border:1px solid #cad9cf;border-radius:12px;color:#286b4e}p{line-height:1.6}</style><h1>Đặt mật khẩu quản trị viên</h1><p>Mở ứng dụng trên máy này, rồi chọn tài khoản bên dưới để đặt mật khẩu riêng. Mỗi liên kết dùng một lần, hết hạn sau 30 phút.</p>${links.map(message => `<a href="${escape(message.url)}">${escape(message.to)}</a>`).join("")}</html>`, { mode: 0o600 });
  console.log(`Enabled ${emails.length} local administrators. Activation page: ${target}`);
}
