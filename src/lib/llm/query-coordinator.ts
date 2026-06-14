import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

export interface QueryCoordinationResult {
  shouldSearch: boolean;
  searchQuery: string | null;
  enhancedPrompt: string;
  thinking: string;
}

const COORDINATOR_SYSTEM_PROMPT = `You are the AIOPH Smart Query Coordinator.
Your job is to analyze the user's latest query, decide whether an internet search is needed, generate the best search query if so, and rewrite the user's query into an enhanced, clear, well-structured prompt.

You MUST follow these critical rules:
1. Determine if a web search is needed ("shouldSearch").
   - You MUST search for almost any questions about current events, news, specific products, errors, coding bugs, API usages, system architecture, library versions, facts, history, or whenever up-to-date and verified information is needed.
   - You should NOT search ONLY for purely conversational greetings (e.g. "hi", "how are you"), simple expressions of gratitude, or requests for creative tasks that don't need real-world facts (e.g. "Write a poem about a cat").
   - When in doubt, ALWAYS prefer to search (set "shouldSearch" to true). Do not rely on your own training data too much. We want to prevent hallucinations and ground our answers in fresh, real-time facts.
2. If "shouldSearch" is true, formulate an optimal, concise 2-5 word search query ("searchQuery") in the same language as the user's message.
3. Rewrite the user's message into an enhanced prompt ("enhancedPrompt") that clarifies their intent, structures their request, and asks for a professional, detailed, structured HTML answer. Keep the same language.
4. Output your decision ONLY as a valid JSON object. Do not output any preamble, markdown code fences, or explanation outside the JSON.

Expected JSON schema:
{
  "shouldSearch": boolean,
  "searchQuery": string | null,
  "searchExplanation": string,
  "enhancedPrompt": string
}
`;

function createLmStudioUrl(pathname: string): URL {
  const base = applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`;
  return new URL(pathname, base);
}

export async function coordinateQuery(
  userMessage: string,
  model: string,
  searchMode: "auto" | "on" | "off"
): Promise<QueryCoordinationResult> {
  const fallback: QueryCoordinationResult = {
    shouldSearch: searchMode === "on",
    searchQuery: searchMode === "on" ? userMessage : null,
    enhancedPrompt: userMessage,
    thinking: "Fallback used due to network or parsing failure."
  };

  // If input is extremely short, skip search and enhancement
  if (userMessage.trim().length < 3) {
    return {
      shouldSearch: false,
      searchQuery: null,
      enhancedPrompt: userMessage,
      thinking: "Message too short to coordinate."
    };
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
            { role: "system", content: COORDINATOR_SYSTEM_PROMPT },
            { role: "user", content: userMessage }
          ],
          temperature: 0.1,
          stream: false,
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
    if (!message || !message.content) {
      return fallback;
    }

    const rawContent = message.content.trim();
    const thinking = (message.reasoning_content ?? message.thinking ?? "").trim();

    // Parse JSON safely
    let parsed: {
      shouldSearch?: boolean;
      searchQuery?: string | null;
      searchExplanation?: string;
      enhancedPrompt?: string;
    } = {};

    let cleanedJson = rawContent;
    if (cleanedJson.includes("```")) {
      const match = cleanedJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        cleanedJson = match[1].trim();
      }
    }

    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      // If parsing fails, try to extract JSON using regex or fallback
      const jsonRegex = /\{[\s\S]*\}/;
      const regexMatch = cleanedJson.match(jsonRegex);
      if (regexMatch) {
        try {
          parsed = JSON.parse(regexMatch[0]);
        } catch {}
      }
    }

    let shouldSearch = parsed.shouldSearch ?? (searchMode === "on");
    let searchQuery = parsed.searchQuery?.trim() || null;
    const enhancedPrompt = parsed.enhancedPrompt?.trim() || userMessage;

    // Apply searchMode constraints override
    if (searchMode === "on") {
      shouldSearch = true;
      if (!searchQuery) {
        searchQuery = userMessage;
      }
    } else if (searchMode === "off") {
      shouldSearch = false;
      searchQuery = null;
    }

    return {
      shouldSearch,
      searchQuery,
      enhancedPrompt,
      thinking: thinking || parsed.searchExplanation || "Query coordinated successfully."
    };
  } catch {
    return fallback;
  }
}
