import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./app-error";
import { assertMutationOrigin, getAuthContext, requireRole, requireUser, withAuthRequest } from "./auth/server";
import { reserveLocalRun, settleLocalRun } from "./auth/local";
import { createClient } from "@supabase/supabase-js";
import { canAuthor } from "./auth/types";
export class HttpError extends AppError {}
export async function isAuthor(req: Request) {
  const { user } = await getAuthContext(req);
  return canAuthor(user);
}
export async function requireAuthor(req: Request) {
  assertMutationOrigin(req);
  return requireRole("author", req);
}
export async function body(req: Request, maxBytes = 300000) {
  const declaredSize = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes)
    throw new HttpError(413, "Nội dung quá lớn");
  if (!req.body) throw new HttpError(400, "Thiếu nội dung yêu cầu");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Nội dung quá lớn");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new HttpError(400, "Nội dung không phải UTF-8 hợp lệ"); }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON không hợp lệ");
  }
}
const quotaRoutes = /^\/api\/(solve(?:-ask|-guided|-guided-ask|-visual|-discover|-recommend|-plan|-outcome)?|explore-assistant|sketch|problem-recognition|studio-(?:generate|assistant|ask|exam-read)|agent\/[^/]+)$/;
export function api(fn: () => Promise<Response>, request?: Request) {
  const run = async () => {
    let reservation: string | undefined;
    let success = false;
    let actorId: string | undefined;
    let database: Awaited<ReturnType<typeof getAuthContext>>["db"] = null;
    try {
      if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) assertMutationOrigin(request);
      if (request?.method === "POST" && quotaRoutes.test(new URL(request.url).pathname)) {
        const user = await requireUser(request);
        actorId = user.id;
        const path = new URL(request.url).pathname;
        database = (await getAuthContext(request)).db;
        if (database) {
          if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, "Chưa cấu hình dịch vụ hạn mức xử lý.");
          const { data, error } = await database.rpc("reserve_ai_run", { operation: path, request_key: request.headers.get("idempotency-key") || crypto.randomUUID() });
          if (error) throw new HttpError(error.message.includes("duplicate_request") ? 409 : error.message.includes("quota_exceeded") ? 429 : 503, error.message.includes("duplicate_request") ? "Yêu cầu này đã được xử lý hoặc đang chạy." : "Không thể cấp hạn mức xử lý. Vui lòng thử lại sau.", "quota_unavailable");
          reservation = data;
        } else reservation = await reserveLocalRun(user.id, path, request.headers.get("idempotency-key") || crypto.randomUUID());
      }
      const response = await fn();
      success = response.ok;
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } finally {
      if (reservation && actorId) {
        if (database) {
          const worker = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
          const { error } = await worker.rpc("settle_ai_run", { run_id: reservation, actor_id: actorId, succeeded: success });
          if (error) console.error(JSON.stringify({ event: "quota_settlement_failed", runId: reservation }));
        } else { try { await settleLocalRun(actorId, reservation, success); } catch { console.error(JSON.stringify({ event: "quota_settlement_failed", runId: reservation })); } }
      }
    }
  };
  return (request ? withAuthRequest(request, run) : run()).catch((e) => {
    console.error(
      JSON.stringify({
        event: "api_error",
        code: e instanceof AppError ? e.code : "request_failed",
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      {
        error:
          e instanceof ZodError
            ? "Dữ liệu không hợp lệ: " +
              e.issues.map((i) => i.path.join(".") + " " + i.message).join(";")
            : e instanceof Error
              ? (process.env.NODE_ENV === "production" ? "Không xử lý được yêu cầu." : e.message)
              : "Lỗi hệ thống",
        ...(e instanceof AppError && e.code ? { code: e.code } : {}),
      },
      { status: e instanceof AppError ? e.status : 400, headers: { "Cache-Control": "no-store" } },
    );
  });
}
