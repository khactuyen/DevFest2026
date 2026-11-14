export async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let target = url;
  if (typeof window !== "undefined" && url.startsWith("/api/materials/")) {
    const share = new URLSearchParams(window.location.search).get("share");
    if (share && /^[\w-]{40,100}$/.test(share)) { const value = new URL(url, window.location.origin); value.searchParams.set("share", share); target = value.pathname + value.search; }
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const diagnosticId=url.startsWith("/api/agent/explore") || url.startsWith("/api/explore-assistant") ? crypto.randomUUID() : undefined;
  if(diagnosticId)headers.set("X-Request-Id",diagnosticId);
  let res:Response;
  try {res = await fetch(target, {
    ...init,credentials:"same-origin",cache:"no-store",headers,
  });} catch(reason) {
    if(!diagnosticId || reason instanceof Error && reason.name==="AbortError")throw reason;
    const error=Object.assign(Error(`Kết nối tới máy chủ bị gián đoạn. Đề/bản nháp được giữ; hãy thử lại. Mã đối chiếu: ${diagnosticId}`),{code:"transport_error",requestId:diagnosticId});
    throw error;
  }
  const data = await res.json();
  if (!res.ok) {
    const error = Error(data.error || "Yêu cầu thất bại") as Error & {
      code?: string;
      status?: number;
    };
    if (typeof data.code === "string") error.code = data.code;
    error.status = res.status;
    throw error;
  }
  return data;
}
