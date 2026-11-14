import { createHash } from "node:crypto";
import { AppError } from "../app-error";
const buckets = new Map<string, { count: number; until: number }>();
export function limitAuth(request: Request, account = "") {
  const now = Date.now();
  // This bounds a single instance; Supabase also enforces provider-side auth limits.
  const fingerprint = createHash("sha256").update(`${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}:${account}`).digest("hex");
  const current = buckets.get(fingerprint);
  if (current && current.until > now && current.count >= 12) throw new AppError(429, "Có quá nhiều yêu cầu. Vui lòng thử lại sau.");
  if (!current || current.until <= now) {
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    if (buckets.size >= 10000) throw new AppError(429, "Vui lòng thử lại sau.");
    buckets.set(fingerprint, { count: 1, until: now + 15 * 60000 });
  } else current.count++;
}
