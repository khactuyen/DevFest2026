import { NextResponse } from "next/server";
import { runAgent, makeMaterial } from "@/lib/agent";
import { api, body, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ mode: string }> },
) {
  return api(async () => {
    const { mode } = await params;
    await requireUser(req);
    if (!["explore", "solve", "material"].includes(mode))
      throw new HttpError(404, "Mode không tồn tại");
    const start = Date.now();
    const requestId=/^[\w-]{1,64}$/.test(req.headers.get("X-Request-Id")||"") ? req.headers.get("X-Request-Id")! : crypto.randomUUID();
    let result:Awaited<ReturnType<typeof runAgent>>;
    try {result = await runAgent(mode, await body(req));}
    catch(reason){console.warn(JSON.stringify({event:"agent_rejected",requestId,mode,latencyMs:Date.now()-start,code:reason && typeof reason==="object" && "code" in reason ? reason.code : "invalid_response"}));throw reason;}
    console.info(
      JSON.stringify({
        event: "agent_generation",
        requestId,
        mode,
        latencyMs: Date.now() - start,
        source: result.source,
        objectCount: result.visual.objects.length,
      }),
    );
    return NextResponse.json(
      mode === "material"
        ? { ...result, material: makeMaterial(result) }
        : result,
    );
  }, req);
}
