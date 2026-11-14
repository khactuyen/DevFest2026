import { AppError } from "./app-error";

/**
 * Server-only OpenRouter gateway.
 *
 * The browser never receives OPENROUTER_API_KEY.  Callers ask for JSON and
 * still validate it against the application's Zod contracts before use.
 */
export type OpenRouterTask = "explore" | "solve" | "material" | "vision";

type RoutingInput = { prompt: string; pattern?: string };
type ChatJsonInput = {
  task: OpenRouterTask;
  system: string;
  user: string;
  routing: RoutingInput;
  repair?: string;
  responseSchema?: { name: string; schema: Record<string, unknown> };
  imageDataUrl?: string;
  maxTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

const defaultPrimary = "google/gemini-4-carbon";
const defaultLight = "deepseek/deepseek-v4-flash-0731";
const defaultVision = "deepseek/deepseek-v4.1-flash";

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * DeepSeek V4 Flash only receives low-risk, bounded Explore requests. Anything that
 * needs multi-step reasoning or authoring goes to the primary model.  The renderer and
 * mathematical validator remain deterministic regardless of this choice.
 */
export function selectOpenRouterModel(task: OpenRouterTask, input: RoutingInput) {
  if (task === "vision") return process.env.OPENROUTER_VISION_MODEL || defaultVision;
  const primary = process.env.OPENROUTER_PRIMARY_MODEL || defaultPrimary;
  const light = process.env.OPENROUTER_LIGHT_MODEL || defaultLight;
  if (task !== "explore") return primary;

  const prompt = input.prompt.trim();
  const requiresReasoning = /chứng\s*minh|vì\s*sao|giải\s*(chi\s*tiết|bài)|suy\s*luận|so\s*sánh|tối\s*ưu|hessian|đạo\s*hàm|integral|proof/i.test(prompt);
  const isBoundedExplore = Boolean(input.pattern && input.pattern !== "generated") && prompt.length <= 240;
  return isBoundedExplore && !requiresReasoning ? light : primary;
}

type CompletionPayload = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      refusal?: string | null;
    };
  }>;
  usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
};

function messageText(content: string | Array<{ type?: string; text?: string }> | null | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n").trim();
  return "";
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const json = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(json) as unknown;
}

export async function requestOpenRouterJson({ task, system, user, routing, repair = "", responseSchema, imageDataUrl, maxTokens, timeoutMs = 45_000, reasoningEffort, signal }: ChatJsonInput) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError(503, "OPENROUTER_API_KEY chưa được cấu hình.", "ai_not_configured");
  const model = selectOpenRouterModel(task, routing);
  const tokenBudget = maxTokens || (task === "material" ? 9000 : 7000);
  const deadline = Date.now() + timeoutMs;
  const attempts = task === "vision" ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new AppError(504, "Dịch vụ AI phản hồi quá lâu. Hãy thử lại.", "ai_timeout");

    let response: Response;
    try {
      response = await fetch(
        `${(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
            ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
          },
          body: JSON.stringify({
            model,
            response_format: responseSchema
              ? {
                  type: "json_schema",
                  json_schema: { name: responseSchema.name, strict: false, schema: responseSchema.schema },
                }
              : { type: "json_object" },
            max_tokens: attempt === 0 ? tokenBudget : Math.max(tokenBudget * 2, 2400),
            ...(task === "vision" ? { reasoning: { enabled: false } } :
              reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: imageDataUrl
                  ? [
                      { type: "text", text: user + repair },
                      { type: "image_url", image_url: { url: imageDataUrl } },
                    ]
                  : user + repair,
              },
            ],
            ...(/^openai\/gpt-6-/.test(model) ? {} : { temperature: 0.2 }),
          }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(remainingMs)]) : AbortSignal.timeout(remainingMs),
        },
      );
    } catch (reason) {
      signal?.throwIfAborted();
      if (reason instanceof Error && ["TimeoutError", "AbortError"].includes(reason.name)) {
        throw new AppError(504, "Dịch vụ AI phản hồi quá lâu. Hãy thử lại.", "ai_timeout");
      }
      throw new AppError(502, "Không kết nối được dịch vụ AI. Kiểm tra mạng hoặc thử lại sau.", "ai_provider");
    }

    if (!response.ok) {
      console.warn(JSON.stringify({ event: "openrouter_error", task, model, status: response.status }));
      if (response.status === 401 || response.status === 403)
        throw new AppError(503, "Thông tin xác thực dịch vụ AI chưa được chấp nhận. Cần kiểm tra cấu hình phía máy chủ.", "ai_credentials");
      if (response.status === 402)
        throw new AppError(503, "Tài khoản dịch vụ AI chưa đủ số dư để xử lý yêu cầu.", "ai_billing");
      if (response.status === 429)
        throw new AppError(429, "Dịch vụ AI đang giới hạn lượt xử lý. Vui lòng thử lại sau.", "ai_quota");
      throw new AppError(502, "Dịch vụ AI hiện chưa phản hồi. Hãy kiểm tra cấu hình model hoặc thử lại sau.", "ai_provider");
    }

    let payload: CompletionPayload;
    try {
      payload = await response.json() as CompletionPayload;
    } catch {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new AppError(504, "Dịch vụ AI phản hồi quá lâu. Hãy thử lại.", "ai_timeout");
      throw new AppError(502, "Dịch vụ AI trả về phản hồi không đọc được.", "ai_provider");
    }
    const choice = payload?.choices?.[0];
    const content = messageText(choice?.message?.content);
    if (!content) {
      console.warn(JSON.stringify({
        event: "openrouter_empty_content", task, model, attempt: attempt + 1,
        finishReason: choice?.finish_reason, refusal: Boolean(choice?.message?.refusal),
        completionTokens: payload?.usage?.completion_tokens,
        reasoningTokens: payload?.usage?.completion_tokens_details?.reasoning_tokens,
      }));
      if (choice?.message?.refusal) throw new AppError(422, "AI không thể nhận diện nội dung ảnh này.", "ai_refusal");
      if (task === "vision" && attempt === 0 && deadline - Date.now() > 8_000) continue;
      throw new AppError(502,
        choice?.finish_reason === "length"
          ? "AI chưa hoàn tất phản hồi. Hãy gửi lại yêu cầu với nội dung ngắn hơn."
          : "Dịch vụ AI không trả về nội dung hợp lệ. Hãy thử lại.",
        "ai_empty_response");
    }
    try {
      return parseJsonContent(content);
    } catch {
      if (task === "vision" && attempt === 0 && choice?.finish_reason === "length" && deadline - Date.now() > 8_000) continue;
      throw new AppError(422, "Model trả về JSON không hợp lệ.", "invalid_plan");
    }
  }
  throw new AppError(502, "Dịch vụ AI không trả về nội dung hợp lệ. Hãy thử lại.", "ai_empty_response");
}
