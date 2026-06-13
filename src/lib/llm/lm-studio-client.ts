import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { ChatMessage } from "@/lib/chat/message-types";

export interface LmStudioModel {
  id: string;
  object?: string;
}

interface LmStudioModelsResponse {
  data?: LmStudioModel[];
}

interface StreamChatCompletionOptions {
  messages: ChatMessage[];
  model: string;
  temperature: number;
}

function createLmStudioUrl(pathname: string): URL {
  return new URL(pathname, applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`);
}

export async function fetchLmStudioModels(): Promise<LmStudioModel[]> {
  const response = await fetchWithTimeout(
    createLmStudioUrl("models"),
    {
      headers: {
        "Accept": "application/json"
      }
    },
    2500
  );

  if (!response.ok) {
    throw new Error(`LM Studio models endpoint failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LmStudioModelsResponse;
  return payload.data ?? [];
}

export async function createLmStudioChatCompletionResponse(
  options: StreamChatCompletionOptions
): Promise<Response> {
  const response = await fetchWithTimeout(
    createLmStudioUrl("chat/completions"),
    {
      method: "POST",
      headers: {
        "Accept": "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature,
        stream: true
      })
    },
    applicationConfiguration.lmStudioRequestTimeoutMs
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LM Studio chat endpoint failed with HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`);
  }

  return response;
}

interface ExtractedChunk {
  content: string;
  reasoning: string;
  error: string;
}

function extractChunkFromServerSentEvent(dataLine: string): ExtractedChunk {
  const empty: ExtractedChunk = { content: "", reasoning: "", error: "" };

  if (dataLine === "[DONE]") {
    return empty;
  }

  try {
    const payload = JSON.parse(dataLine) as {
      choices?: Array<{
        delta?: { content?: string; reasoning_content?: string };
        message?: { content?: string; reasoning_content?: string };
      }>;
      error?: { message?: string };
    };

    if (payload.error?.message) {
      return {
        content: "",
        reasoning: "",
        error: payload.error.message
      };
    }

    const delta = payload.choices?.[0]?.delta;
    const message = payload.choices?.[0]?.message;

    return {
      content: delta?.content ?? message?.content ?? "",
      reasoning: delta?.reasoning_content ?? message?.reasoning_content ?? "",
      error: ""
    };
  } catch {
    return empty;
  }
}

function escapeHtmlForThinking(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createTextStreamFromLmStudioResponse(responseBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = responseBody.getReader();
      let lineBuffer = "";
      let isClosed = false;
      let accumulatedDataLines: string[] = [];

      // Track whether we are currently inside a thinking block
      let isInsideThinkingBlock = false;

      function enqueueText(text: string): void {
        if (!isClosed && text.length > 0) {
          controller.enqueue(encoder.encode(text));
        }
      }

      function closeStream(): void {
        // Close the thinking block if it was left open
        if (isInsideThinkingBlock) {
          enqueueText("</pre></div></details>");
          isInsideThinkingBlock = false;
        }
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      }

      function emitChunk(chunk: ExtractedChunk): void {
        // Handle error messages from the model
        if (chunk.error) {
          if (isInsideThinkingBlock) {
            enqueueText("</pre></div></details>");
            isInsideThinkingBlock = false;
          }
          enqueueText(`<div class="aioph-callout"><strong>LM Studio Error:</strong> ${escapeHtmlForThinking(chunk.error)}</div>`);
          return;
        }

        // Emit reasoning content inside a collapsible block
        if (chunk.reasoning) {
          if (!isInsideThinkingBlock) {
            isInsideThinkingBlock = true;
            enqueueText('<details class="thinking-block"><summary>Thinking</summary><div class="thinking-content"><pre>');
          }
          enqueueText(escapeHtmlForThinking(chunk.reasoning));
        }

        // Emit regular content, closing the thinking block first if needed
        if (chunk.content) {
          if (isInsideThinkingBlock) {
            enqueueText("</pre></div></details>");
            isInsideThinkingBlock = false;
          }
          enqueueText(chunk.content);
        }
      }

      function flushAccumulatedEvent(): void {
        if (accumulatedDataLines.length === 0) {
          return;
        }

        const pendingLines = accumulatedDataLines.slice();
        accumulatedDataLines = [];

        for (const dataLine of pendingLines) {
          if (dataLine === "[DONE]") {
            closeStream();
            return;
          }

          emitChunk(extractChunkFromServerSentEvent(dataLine));
        }
      }

      function processLine(line: string): void {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
          // Empty line signals end of the current SSE event
          flushAccumulatedEvent();
          return;
        }

        if (trimmed.startsWith("data:")) {
          const payload = trimmed.replace(/^data:\s*/, "");
          accumulatedDataLines.push(payload);

          // Handle data: [DONE] immediately even without a trailing empty line
          if (payload === "[DONE]") {
            flushAccumulatedEvent();
          }
          return;
        }

        // Ignore non-data SSE fields (id:, event:, retry:, comments)
      }

      try {
        while (!isClosed) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          lineBuffer += decoder.decode(value, { stream: true });

          // Process complete lines one at a time
          let newlineIndex: number;
          while ((newlineIndex = lineBuffer.indexOf("\n")) !== -1) {
            const rawLine = lineBuffer.slice(0, newlineIndex).replace(/\r$/, "");
            lineBuffer = lineBuffer.slice(newlineIndex + 1);
            processLine(rawLine);
          }
        }

        // Flush any remaining partial line and accumulated data
        if (lineBuffer.trim().length > 0) {
          processLine(lineBuffer);
        }
        flushAccumulatedEvent();
      } finally {
        reader.releaseLock();
        closeStream();
      }
    }
  });
}

