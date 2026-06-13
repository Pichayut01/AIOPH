import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

export interface EnhancedPromptResult {
  enhancedPrompt: string;
  thinking: string;
}

const PROMPT_ENGINEER_SYSTEM = `You are an expert prompt engineer. Your ONLY job is to rewrite the user's raw query into a clearer, better-structured prompt that will produce a higher-quality response from an AI assistant.

RULES:
1. Output ONLY the rewritten prompt — no preamble, no explanation, no commentary.
2. Preserve the user's intent and language (Thai stays Thai, English stays English).
3. Add structure: clarify the goal, add relevant context, specify the desired output format if helpful.
4. Keep it concise — do not bloat the prompt unnecessarily.
5. Do NOT answer the question yourself. Just rewrite the prompt.`;

function createLmStudioUrl(pathname: string): URL {
  const base = applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`;
  return new URL(pathname, base);
}

export async function enhanceUserPrompt(
  userMessage: string,
  model: string
): Promise<EnhancedPromptResult> {
  const fallback: EnhancedPromptResult = { enhancedPrompt: userMessage, thinking: "" };

  // Skip enhancement for very short inputs (single word / trivial)
  if (userMessage.trim().length < 8) {
    return fallback;
  }

  try {
    const response = await fetchWithTimeout(
      createLmStudioUrl("chat/completions"),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: PROMPT_ENGINEER_SYSTEM },
            { role: "user", content: userMessage }
          ],
          temperature: 0.1,
          stream: false,
          // Request thinking/reasoning if the model supports it
          thinking: { type: "enabled", budget_tokens: 512 }
        })
      },
      Math.min(applicationConfiguration.lmStudioRequestTimeoutMs, 30000)
    );

    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
          thinking?: string;
        };
      }>;
    };

    const message = payload.choices?.[0]?.message;
    if (!message) {
      return fallback;
    }

    const enhancedPrompt = message.content?.trim() || userMessage;
    const thinking =
      (message.reasoning_content ?? message.thinking ?? "").trim();

    return { enhancedPrompt, thinking };
  } catch {
    // Silently fall back to original prompt on any error
    return fallback;
  }
}
