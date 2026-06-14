import { applicationConfiguration } from "@/lib/config/environment";
import { chatRequestSchema } from "@/lib/chat/chat-request-schema";
import { createHtmlErrorResponse } from "@/lib/chat/html-error";
import type { ChatMessage, ContentPart, SearchMode } from "@/lib/chat/message-types";
import { runDeepResearchOrchestrator } from "@/lib/llm/deep-research-orchestrator";
import {
  createLmStudioChatCompletionResponse,
  createTextStreamFromLmStudioResponse,
  fetchLmStudioModels
} from "@/lib/llm/lm-studio-client";
import { buildHtmlAssistantSystemPrompt } from "@/lib/llm/system-prompt";
import { coordinateQuery } from "@/lib/llm/query-coordinator";
import { searchWebForEvidence } from "@/lib/search/search-service";
import type { SearchEvidence } from "@/lib/search/search-types";
import { buildMemoryContextBlock } from "@/lib/memory/memory-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLatestUserMessage(messages: Array<{ role: string; content: string | ContentPart[] }>): string {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return "";
  if (typeof latestUserMessage.content === "string") {
    const trimmed = latestUserMessage.content.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return (parsed as ContentPart[])
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("\n");
        }
      } catch {}
    }
    return latestUserMessage.content;
  }
  if (Array.isArray(latestUserMessage.content)) {
    return latestUserMessage.content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");
  }
  return "";
}

async function resolveModel(requestedModel?: string): Promise<string> {
  const configuredModel = requestedModel?.trim() || applicationConfiguration.lmStudioDefaultModel;
  if (configuredModel) {
    return configuredModel;
  }

  const models = await fetchLmStudioModels();
  const firstModel = models[0]?.id;
  if (!firstModel) {
    throw new Error("No LM Studio model is loaded. Load a model in LM Studio or set LM_STUDIO_MODEL.");
  }

  return firstModel;
}

function createSearchMetadataHeader(searchEvidence?: SearchEvidence): string {
  if (!searchEvidence) {
    return "";
  }

  const metadata = {
    query: searchEvidence.query,
    provider: searchEvidence.provider,
    generatedAt: searchEvidence.generatedAt,
    warnings: searchEvidence.warnings,
    sources: searchEvidence.documents.map((document) => ({
      title: document.title,
      url: document.url,
      snippet: document.snippet,
      rank: document.rank,
      wasFetched: document.wasFetched,
      fetchError: document.fetchError
    }))
  };

  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function encodeTextHeader(text: string): string {
  if (!text) return "";
  return Buffer.from(text, "utf8").toString("base64url");
}

function flattenMessageForLlm(message: { role: string; content: string | ContentPart[] }): { role: string; content: string | ContentPart[] } {
  if (message.role !== "user") return message;

  let parts: ContentPart[] = [];
  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        parts = JSON.parse(trimmed);
      } catch {
        return message;
      }
    } else {
      return message;
    }
  } else if (Array.isArray(message.content)) {
    parts = message.content;
  } else {
    return message;
  }

  let text = "";
  const imageUrlParts: ContentPart[] = [];
  const files: Array<{ name: string; size: number; content: string }> = [];
  const links: Array<{ url: string; title: string; content: string }> = [];

  for (const part of parts) {
    if (part.type === "text" && part.text) {
      text += (text ? "\n" : "") + part.text;
    } else if (part.type === "image_url" && part.image_url) {
      imageUrlParts.push(part);
    } else if (part.type === "file" && part.file) {
      files.push(part.file);
    } else if (part.type === "link" && part.link) {
      links.push(part.link);
    }
  }

  let contextExtensions = "";
  if (files.length > 0) {
    contextExtensions += "\n\n=== Attached Files ===\n" + files.map(file => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const langMap: Record<string, string> = {
        js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
        py: "python", html: "html", css: "css", json: "json", md: "markdown",
        csv: "csv", xml: "xml", yml: "yaml", yaml: "yaml", sh: "bash"
      };
      const lang = langMap[ext] || "";
      return `[File: ${file.name} (${file.size} bytes)]\n\`\`\`${lang}\n${file.content}\n\`\`\``;
    }).join("\n\n");
  }

  if (links.length > 0) {
    contextExtensions += "\n\n=== Attached Links ===\n" + links.map(link => {
      return `[Link: ${link.title} (${link.url})]\nWebpage Scraped Text Content:\n${link.content}`;
    }).join("\n\n");
  }

  const flattenedText = text + contextExtensions;

  if (imageUrlParts.length > 0) {
    return {
      role: message.role,
      content: [
        { type: "text", text: flattenedText },
        ...imageUrlParts
      ]
    };
  } else {
    return {
      role: message.role,
      content: flattenedText
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  let requestPayload: unknown;

  try {
    requestPayload = await request.json();
  } catch {
    return createHtmlErrorResponse("Invalid request", "The chat endpoint expected a JSON request body.", 400);
  }

  const parsedRequest = chatRequestSchema.safeParse(requestPayload);
  if (!parsedRequest.success) {
    return createHtmlErrorResponse("Invalid request", parsedRequest.error.issues[0]?.message ?? "The chat payload is invalid.", 400);
  }

  const messagesInput = parsedRequest.data.messages.map(flattenMessageForLlm);
  const latestUserMessage = getLatestUserMessage(messagesInput);
  const searchMode: SearchMode = parsedRequest.data.searchMode ?? "auto";

  let model: string;
  try {
    model = await resolveModel(parsedRequest.data.model);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unable to resolve an LM Studio model.";
    return createHtmlErrorResponse("LM Studio model unavailable", errorMessage, 503);
  }

  if (parsedRequest.data.deepResearch) {
    const rawMessages = messagesInput.slice(-6);
    const processedMessages = rawMessages.map((message) => {
      if (typeof message.content === "string") {
        const trimmed = message.content.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return {
                role: message.role,
                content: parsed as ContentPart[]
              };
            }
          } catch {}
        }
      }
      return message;
    }) as ChatMessage[];

    const drStream = runDeepResearchOrchestrator(
      processedMessages,
      latestUserMessage,
      model,
      parsedRequest.data.temperature ?? 0.2
    );

    const responseHeaders = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AIOPH-Search-Used": "true",
    });

    return new Response(drStream, {
      headers: responseHeaders
    });
  }

  // ── Single Pass: Coordinate Query (Decide search, generate query, and enhance prompt) ──
  const { shouldSearch, searchQuery, enhancedPrompt, thinking: enhancedThinking } = 
    await coordinateQuery(latestUserMessage, model, searchMode);

  const wasPromptEnhanced = enhancedPrompt !== latestUserMessage;
  let searchEvidence: SearchEvidence | undefined;

  if (shouldSearch && searchQuery) {
    searchEvidence = await searchWebForEvidence(searchQuery);
  }

  // Build the messages array, replacing the last user message with the enhanced version
  const rawMessages = messagesInput.slice(-6);
  const processedMessages = rawMessages.map((message, index) => {
    const isLastUserMessage =
      message.role === "user" &&
      index === rawMessages.map((m) => m.role).lastIndexOf("user");

    if (isLastUserMessage) {
      if (typeof message.content === "string") {
        const trimmed = message.content.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              const newContent = (parsed as ContentPart[]).map((part) => {
                if (part.type === "text") {
                  return { type: "text", text: enhancedPrompt } as ContentPart;
                }
                return part;
              });
              return {
                role: message.role,
                content: newContent
              };
            }
          } catch {}
        }
        return {
          role: message.role,
          content: enhancedPrompt
        };
      } else if (Array.isArray(message.content)) {
        const newContent = message.content.map((part) => {
          if (part.type === "text") {
            return { type: "text", text: enhancedPrompt } as ContentPart;
          }
          return part;
        });
        return {
          role: message.role,
          content: newContent
        };
      }
    }

    // For other messages, parse if serialized JSON array
    if (typeof message.content === "string") {
      const trimmed = message.content.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return {
              role: message.role,
              content: parsed as ContentPart[]
            };
          }
        } catch {}
      }
    }

    return message;
  }) as ChatMessage[];

  // Fetch long-term memory context (fast SQLite SELECT + vector search)
  const memoryContext = await buildMemoryContextBlock(latestUserMessage, model);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildHtmlAssistantSystemPrompt(searchEvidence, memoryContext || undefined)
    },
    ...processedMessages
  ];

  try {
    const lmStudioResponse = await createLmStudioChatCompletionResponse({
      messages,
      model,
      temperature: parsedRequest.data.temperature ?? 0.2
    });

    if (!lmStudioResponse.body) {
      return createHtmlErrorResponse("LM Studio stream unavailable", "LM Studio returned no response body.", 502);
    }

    const responseHeaders = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AIOPH-Search-Used": searchEvidence ? "true" : "false",
      "X-AIOPH-Search-Sources": createSearchMetadataHeader(searchEvidence),
      "X-AIOPH-Prompt-Enhanced": wasPromptEnhanced ? "true" : "false",
      "X-AIOPH-Enhanced-Prompt": wasPromptEnhanced ? encodeTextHeader(enhancedPrompt) : "",
      "X-AIOPH-Enhanced-Thinking": enhancedThinking ? encodeTextHeader(enhancedThinking) : ""
    });

    return new Response(createTextStreamFromLmStudioResponse(lmStudioResponse.body), {
      headers: responseHeaders
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "The local model request failed.";
    return createHtmlErrorResponse("LM Studio request failed", errorMessage, 502);
  }
}


