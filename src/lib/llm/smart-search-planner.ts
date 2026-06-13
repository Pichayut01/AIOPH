import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

const SMART_SEARCH_SYSTEM_PROMPT = `You are a background search assistant in a hallucination-prevention system.
Your ONLY job is to analyze the user's latest message and extract a concise 2-4 word internet search query to gather factual evidence.

RULES:
1. If the user's message requires factual, current, or specific information (e.g., news, prices, facts, technical details), output ONLY the optimal search query.
2. If the user's message is purely conversational (e.g., "hello", "thanks", "how are you"), or does not require internet search, output exactly: NONE
3. Output ONLY the query or NONE. Do not provide preamble, explanation, or commentary.
4. Keep the query concise and relevant. Keep the query in the same language as the user's message.`;

function createLmStudioUrl(pathname: string): URL {
  const base = applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`;
  return new URL(pathname, base);
}

export async function generateSmartSearchQuery(
  userMessage: string,
  model: string
): Promise<string | null> {
  // Skip search for extremely short/trivial inputs
  if (userMessage.trim().length < 3) {
    return null;
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
            { role: "system", content: SMART_SEARCH_SYSTEM_PROMPT },
            { role: "user", content: userMessage }
          ],
          temperature: 0.1,
          stream: false,
          max_tokens: 30
        })
      },
      Math.min(applicationConfiguration.lmStudioRequestTimeoutMs, 20000)
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() || "NONE";

    if (content === "NONE" || content === "" || content.toLowerCase().includes("none")) {
      return null;
    }

    // Sanitize the query (e.g., remove quotes if the model wraps it)
    const sanitizedQuery = content.replace(/^["'](.*)["']$/, '$1').trim();
    return sanitizedQuery;
  } catch {
    // Fail gracefully by returning null, meaning no search will be performed.
    return null;
  }
}
