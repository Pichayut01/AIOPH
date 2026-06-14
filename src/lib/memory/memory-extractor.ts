import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import {
  addMemory,
  updateMemory,
  findSimilarMemoryInCategory,
  findSemanticallySimilarMemory,
  getMemoryCount
} from "@/lib/memory/memory-store";
import {
  getMessages,
  updateConversationSummary,
  getGlobalProfile,
  updateGlobalProfile,
  addMessageRag
} from "@/lib/db/database";

// --- Types ---

export interface ExtractedFact {
  category: string;
  value: string;
}

// --- Constants ---

const MAX_MEMORIES = 100;

const VALID_CATEGORIES = new Set([
  "personal",
  "preference",
  "project",
  "skill",
  "goal",
  "context"
]);

const EXTRACTION_SYSTEM_PROMPT = `You are a Memory Extraction Engine for an AI assistant.
Your ONLY job is to analyze the user's message and extract durable, long-term facts about the user.

EXTRACTION RULES:
1. Extract ONLY lasting personal facts: name, nickname, job, interests, tools/tech stack, projects, goals, preferences, important context about their life or work.
2. DO NOT extract: greetings, temporary emotions, questions they're asking, general knowledge, or conversational fillers.
3. Each extracted fact must be a concise 1-2 sentence summary in the SAME LANGUAGE as the user's message.
4. Categorize each fact into one of these categories:
   - "personal" — name, age, job title, location, personal details
   - "preference" — likes, dislikes, style preferences, communication preferences
   - "project" — current projects, companies, products they're building
   - "skill" — programming languages, tools, frameworks, technical skills
   - "goal" — objectives, plans, aspirations, deadlines
   - "context" — important situational context about their life/work

OUTPUT FORMAT:
Respond ONLY with a valid JSON array. No markdown, no explanation, no preamble.
Example: [{"category": "skill", "value": "ใช้งาน Next.js และ TypeScript เป็นหลัก"}, {"category": "personal", "value": "ชื่อ Pichayut เป็นโปรแกรมเมอร์"}]
If there are no durable facts, respond with: []`;

function createLmStudioUrl(pathname: string): URL {
  const base = applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`;
  return new URL(pathname, base);
}

/**
 * Sends the user's latest message to the LLM for fact extraction.
 * Returns an array of extracted facts (may be empty).
 */
export async function extractMemoriesFromMessage(
  userMessage: string,
  model: string
): Promise<ExtractedFact[]> {
  // Skip very short messages (greetings, single words)
  if (userMessage.trim().length < 10) {
    return [];
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
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: userMessage }
          ],
          temperature: 0.1,
          stream: false
        })
      },
      Math.min(applicationConfiguration.lmStudioRequestTimeoutMs, 20000)
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const rawContent = payload.choices?.[0]?.message?.content?.trim();
    if (!rawContent) return [];

    // Parse the JSON response
    let parsed: unknown;

    // Strip markdown code fences if present
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
      // Try regex extraction
      const jsonRegex = /\[[\s\S]*\]/;
      const regexMatch = cleanedJson.match(jsonRegex);
      if (regexMatch) {
        try {
          parsed = JSON.parse(regexMatch[0]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];

    // Validate and filter
    const validFacts: ExtractedFact[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.category === "string" &&
        typeof item.value === "string" &&
        item.value.trim().length > 0
      ) {
        const category = VALID_CATEGORIES.has(item.category) ? item.category : "context";
        validFacts.push({
          category,
          value: item.value.trim()
        });
      }
    }

    return validFacts;
  } catch {
    return [];
  }
}

/**
 * Fetch embeddings for a given text from LM Studio.
 * Returns null if the endpoint fails or model doesn't support embeddings.
 */
export async function fetchEmbedding(
  text: string,
  model: string
): Promise<number[] | null> {
  try {
    const response = await fetchWithTimeout(
      createLmStudioUrl("embeddings"),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: text
        })
      },
      5000 // 5 seconds timeout
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: Array<{
        embedding?: number[];
      }>;
    };

    const embedding = payload.data?.[0]?.embedding;
    if (Array.isArray(embedding) && embedding.length > 0) {
      return embedding;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Takes extracted facts, checks for duplicates using semantic/keyword checks, and stores or updates them in the database.
 * Returns the number of new/updated memories.
 */
export async function deduplicateAndStore(facts: ExtractedFact[], model: string): Promise<number> {
  if (facts.length === 0) return 0;

  let stored = 0;
  const currentCount = getMemoryCount();

  for (const fact of facts) {
    // Check if we've hit the memory limit
    if (currentCount + stored >= MAX_MEMORIES) {
      break;
    }

    // Attempt to get embedding for the new fact
    const embedding = await fetchEmbedding(fact.value, model);

    if (embedding) {
      // Semantic Deduplication using Cosine Similarity
      const similar = findSemanticallySimilarMemory(fact.category, embedding, 0.82);

      if (similar) {
        updateMemory(similar.id, fact.value, embedding);
      } else {
        addMemory(fact.value, fact.category, embedding);
      }
    } else {
      // Fallback: Keyword-based overlap deduplication
      const similar = findSimilarMemoryInCategory(fact.category, fact.value);

      if (similar) {
        updateMemory(similar.id, fact.value);
      } else {
        addMemory(fact.value, fact.category);
      }
    }

    stored++;
  }

  return stored;
}

/**
 * Summarizes the conversation and stores its summary and embedding in the database.
 */
export async function summarizeAndStoreConversation(
  conversationId: string,
  model: string
): Promise<void> {
  try {
    const messages = getMessages(conversationId);
    
    // Only summarize if there are at least 4 messages (meaning user and assistant had a proper turn)
    if (messages.length < 4) {
      return;
    }

    // Format chat history for the summarizer LLM (last 12 messages)
    const formattedHistory = messages
      .slice(-12)
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n\n");

    const prompt = `You are a conversation summarization engine.
Your task is to summarize the core topics and outcomes of the conversation history below into a concise 1-2 sentence summary.
RULES:
1. Output ONLY the summary. No explanation, no markdown fences, no preamble.
2. The summary must be in the same language as the conversation (e.g. Thai, English).
3. Do not include metadata (like date, usernames) unless important.

CONVERSATION HISTORY:
${formattedHistory}`;

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
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
          stream: false
        })
      },
      15000 // 15 seconds timeout
    );

    if (!response.ok) return;

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const summaryText = payload.choices?.[0]?.message?.content?.trim();
    if (!summaryText) return;

    // Generate embedding for the summary
    const embedding = await fetchEmbedding(summaryText, model);
    const embeddingStr = embedding ? JSON.stringify(embedding) : null;

    // Save to database
    updateConversationSummary(conversationId, summaryText, embeddingStr);
  } catch (error) {
    console.error("Failed to summarize conversation:", error);
  }
}

/**
 * Updates the user's global profile summary in the database based on the latest interaction.
 */
export async function updateGlobalUserProfile(
  conversationId: string,
  model: string
): Promise<void> {
  try {
    const messages = getMessages(conversationId);
    if (messages.length === 0) return;

    // Get the last user message and the last assistant message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

    if (!lastUserMessage) return;

    // Retrieve the existing profile
    const currentProfile = getGlobalProfile() || "No profile stored yet. Complete identity summary will be generated.";

    const prompt = `You are a User Profiling Engine.
Your job is to analyze the latest chat turn and update the User's Global Profile Summary.
The profile summarizes the user's persistent characteristics, such as:
1. Identity: Name, background, profession.
2. Tech Stack & Skills: Programming languages, frameworks, libraries, systems used.
3. Preferences & Interests: Style preferences, coding style, liked/disliked topics.
4. Current Focus: Active projects, immediate goals, study/work focus.

INSTRUCTIONS:
- Review the current profile and the latest messages.
- Integrate any new details, correct any outdated information, and refine existing points.
- Keep the output format as a clean Markdown list structure. Do not lose existing details unless they are explicitly contradicted/updated.
- Output ONLY the updated markdown profile. No preamble, no explanation, no markdown code fences (\`\`\`).
- Write the profile in the same language as the chat (Thai / English).

=== Current Profile ===
${currentProfile}

=== Latest Interaction ===
User: ${lastUserMessage}
Assistant: ${lastAssistantMessage}

=== Updated Profile ===`;

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
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
          stream: false
        })
      },
      20000 // 20 seconds timeout
    );

    if (!response.ok) return;

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const updatedProfileText = payload.choices?.[0]?.message?.content?.trim();
    if (!updatedProfileText) return;

    // Save back to DB
    updateGlobalProfile(updatedProfileText);
  } catch (error) {
    console.error("Failed to update global user profile:", error);
  }
}

/**
 * Indexes any unsaved messages of a conversation in the RAG vector database.
 */
export async function indexMessagesForRag(
  conversationId: string,
  model: string
): Promise<void> {
  try {
    const messages = getMessages(conversationId);
    const unsaved = messages.filter((m) => m.memory_saved === 0);

    for (const msg of unsaved) {
      // Clean content (strip JSON serialization if it's a user multi-part message)
      let cleanText = msg.content.trim();
      if (msg.role === "user" && cleanText.startsWith("[") && cleanText.endsWith("]")) {
        try {
          const parsed = JSON.parse(cleanText);
          if (Array.isArray(parsed)) {
            cleanText = (parsed as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("\n");
          }
        } catch {
          // Ignore
        }
      }

      // If assistant, strip HTML tags for cleaner embeddings
      if (msg.role === "assistant") {
        cleanText = cleanText.replace(/<[^>]*>/g, "").trim();
      }

      if (cleanText.length < 5) continue;

      const formatText = `${msg.role === "user" ? "User" : "Assistant"}: ${cleanText}`;

      // Fetch embedding from LM Studio
      const embedding = await fetchEmbedding(formatText, model);
      if (embedding) {
        // Save in RAG table & update memory_saved = 1
        addMessageRag(msg.id, formatText, embedding);
      }
    }
  } catch (error) {
    console.error("Failed to index messages for RAG:", error);
  }
}
