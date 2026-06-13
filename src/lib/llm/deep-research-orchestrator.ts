import { searchWebForEvidence } from "@/lib/search/search-service";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { applicationConfiguration } from "@/lib/config/environment";
import type { ChatMessage, ContentPart } from "@/lib/chat/message-types";

const PLANNER_SVG = `<svg class="step-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>`;

const SEARCH_SVG = `<svg class="step-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

const CHECK_SVG = `<svg class="step-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;

const WRITE_SVG = `<svg class="step-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

function cleanMessagesForLlm(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(msg => {
    if (typeof msg.content === "string") {
      const trimmed = msg.content.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const textContent = (parsed as ContentPart[])
              .filter(part => part.type === "text" && part.text)
              .map(part => part.text)
              .join("\n");
            return {
              role: msg.role,
              content: textContent
            };
          }
        } catch {}
      }
      return msg;
    }
    if (Array.isArray(msg.content)) {
      const textContent = msg.content
        .filter(part => part.type === "text" && part.text)
        .map(part => part.text)
        .join("\n");
      return {
        role: msg.role,
        content: textContent
      };
    }
    return msg;
  });
}

function createLmStudioUrl(pathname: string): URL {
  const base = applicationConfiguration.lmStudioBaseUrl.endsWith("/")
    ? applicationConfiguration.lmStudioBaseUrl
    : `${applicationConfiguration.lmStudioBaseUrl}/`;
  return new URL(pathname, base);
}

// Utility to execute non-streaming chat requests to LM Studio
async function callLmStudio(
  messages: ChatMessage[],
  model: string,
  temperature: number = 0.2
): Promise<string> {
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
        messages,
        temperature,
        stream: false,
        max_tokens: 4096
      })
    },
    Math.max(applicationConfiguration.lmStudioRequestTimeoutMs, 180000)
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LM Studio returned status ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Invalid or empty response from LM Studio");
  }
  return content.trim();
}

/**
 * Runs the Deep Research loop:
 * 1. Planner: generate 2-3 search queries.
 * 2. Search & Retrieval + Scraper & Reasoner (looping up to 2 times).
 * 3. Final Aggregator: generate detailed final report.
 */
export function runDeepResearchOrchestrator(
  userMessages: ChatMessage[],
  latestUserText: string,
  model: string,
  temperature: number = 0.2
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      function sendUpdate(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      try {
        // --- Step 1: Planner ---
        sendUpdate(`<details class="thinking-block open" open><summary>Deep Research Progress</summary><div class="research-progress-container">`);
        sendUpdate(`<div class="research-step"><div class="step-indicator"><span class="step-icon">${PLANNER_SVG}</span></div><div class="step-details"><div class="step-title">Step 1: Planner</div><div class="step-status">Analyzing query and planning search topics...</div>`);

        const plannerPrompt = `You are the Planner agent in an advanced autonomous Deep Research system.
Your task is to analyze the user's query and formulate a search strategy.
Generate 2 to 3 distinct, highly effective search queries that will gather the required facts and context.

User Query: "${latestUserText}"

Output your response as a raw JSON array of strings. Do not include any formatting, preamble, backticks, or other text.
Example:
["latest news about Nvidia Blackwell chips", "Nvidia GPU release schedule 2026", "Nvidia Blackwell performance specs"]`;

        const plannerMessages: ChatMessage[] = [
          { role: "system", content: "You output only raw JSON arrays of strings. No formatting or explanation." },
          { role: "user", content: plannerPrompt }
        ];

        let plannerResponse = "";
        try {
          plannerResponse = await callLmStudio(plannerMessages, model, 0.1);
        } catch (err) {
          throw new Error(`Planner failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Parse JSON queries
        let queries: string[] = [];
        // Extract array from markdown code block if present
        let cleanedResponse = plannerResponse.trim();
        if (cleanedResponse.includes("```")) {
          const match = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (match && match[1]) {
            cleanedResponse = match[1].trim();
          }
        }
        try {
          queries = JSON.parse(cleanedResponse) as string[];
          if (!Array.isArray(queries) || queries.length === 0) {
            throw new Error("Parsed JSON is not a non-empty array");
          }
        } catch {
          // Fallback: use the user's latest query directly
          queries = [latestUserText];
          sendUpdate(`<div class="step-data">⚠️ Failed to parse search plan JSON. Falling back to original query.</div>`);
        }

        sendUpdate(`<div class="step-data">Planned queries: ${queries.map(q => `<code>"${q}"</code>`).join(", ")}</div></div></div>`);

        // --- Step 2 & 3: Search & Reason Loop (Max 2 loops) ---
        let findings = "";
        let loopCount = 0;
        const maxLoops = 2;
        const processedQueries = new Set<string>();

        while (queries.length > 0 && loopCount < maxLoops) {
          loopCount++;
          sendUpdate(`<div class="research-step"><div class="step-indicator"><span class="step-icon">${SEARCH_SVG}</span></div><div class="step-details"><div class="step-title">Step 2: Search & Retrieval (Iteration ${loopCount}/${maxLoops})</div><div class="step-status">Searching sources and analyzing contents...</div><div class="step-logs">`);
          
          const currentQueries = [...queries];
          queries = []; // reset for next loop

          const reasonings: string[] = [];

          for (const query of currentQueries) {
            if (processedQueries.has(query)) continue;
            processedQueries.add(query);

            sendUpdate(`<div class="step-log-item">🔍 Searching <code>"${query}"</code>... `);
            const searchResult = await searchWebForEvidence(query);
            const docCount = searchResult.documents.length;
            sendUpdate(`Found <strong>${docCount}</strong> documents.</div>`);

            if (docCount === 0) continue;

            sendUpdate(`<div class="step-log-item">📄 Reading and summarizing details for <code>"${query}"</code>... `);

            // Compile document texts
            const docsText = searchResult.documents
              .map((doc, idx) => `[Doc ${idx + 1}] Title: ${doc.title}\nURL: ${doc.url}\nContent:\n${doc.text}\n---`)
              .join("\n\n");

            const reasonerPrompt = `You are the Scraper & Reasoner agent in a Deep Research system.
Analyze the following documents retrieved for the search query: "${query}".
Extract and summarize the key facts, findings, statistics, and detailed answers related to the user's main request: "${latestUserText}".
Format your summary in clear bullet points. Include references to [Doc X] where applicable.

Documents:
${docsText.slice(0, 12000)}`;

            const reasonerMessages: ChatMessage[] = [
              { role: "system", content: "You summarize information into detailed bullet points based only on provided source documents." },
              { role: "user", content: reasonerPrompt }
            ];

            try {
              const summary = await callLmStudio(reasonerMessages, model, 0.2);
              reasonings.push(`### Summary for query "${query}":\n${summary}`);
              sendUpdate(`Done.</div>`);
            } catch (err) {
              sendUpdate(`⚠️ Reasoner failed: ${err instanceof Error ? err.message : String(err)}</div>`);
            }
          }

          // Accumulate findings
          findings += (findings ? "\n\n" : "") + reasonings.join("\n\n");

          sendUpdate(`</div></div></div>`);

          // Check if complete (if not last loop)
          if (loopCount < maxLoops) {
            sendUpdate(`<div class="research-step"><div class="step-indicator"><span class="step-icon">${CHECK_SVG}</span></div><div class="step-details"><div class="step-title">Information Check</div><div class="step-status">Evaluating if gathered info is sufficient...</div>`);
            const checkerPrompt = `You are the Planner agent in a Deep Research system.
Analyze the user's request and the research findings gathered so far.
Determine if we have enough detailed information to write a comprehensive report.

User Query: "${latestUserText}"
Research Findings So Far:
${findings.slice(0, 8000)}

If we have enough information, output: "COMPLETE"
If we need more info, output a JSON array containing 1 to 2 new follow-up search queries.
Output ONLY "COMPLETE" or the JSON array. No preamble, no explainers.`;

            const checkerMessages: ChatMessage[] = [
              { role: "system", content: "Output either \"COMPLETE\" or a raw JSON array of strings." },
              { role: "user", content: checkerPrompt }
            ];

            let checkResult = "";
            try {
              checkResult = (await callLmStudio(checkerMessages, model, 0.1)).trim();
            } catch {
              checkResult = "COMPLETE";
            }

            if (checkResult.includes("COMPLETE")) {
              sendUpdate(`<div class="step-data">✅ Sufficiency Check: Complete! Proceeding to aggregate report.</div></div></div>`);
              break;
            } else {
              let newQueries: string[] = [];
              let cleanedCheck = checkResult;
              if (cleanedCheck.includes("```")) {
                const match = cleanedCheck.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (match && match[1]) {
                  cleanedCheck = match[1].trim();
                }
              }
              try {
                newQueries = JSON.parse(cleanedCheck) as string[];
                if (Array.isArray(newQueries) && newQueries.length > 0) {
                  queries = newQueries.filter(q => !processedQueries.has(q));
                  sendUpdate(`<div class="step-data">🔄 Gaps identified. Follow-up queries: ${queries.map(q => `<code>"${q}"</code>`).join(", ")}</div></div></div>`);
                }
              } catch {
                sendUpdate(`<div class="step-data">✅ Sufficiency Check: Complete (Failed to parse gap queries).</div></div></div>`);
                break;
              }
            }
          }
        }

        sendUpdate(`<div class="research-step"><div class="step-indicator"><span class="step-icon">${WRITE_SVG}</span></div><div class="step-details"><div class="step-title">Step 4: Final Aggregator</div><div class="step-status">Compiling final report and references...</div></div></div></div></details>\n\n`);

        // --- Step 4: Final Aggregator ---
        const aggregatorSystemPrompt = `You are the Final Aggregator agent in an advanced Deep Research system.
Your job is to compile the final comprehensive report based on the gathered findings.
You must structure the report with professional headers, summaries, detailed sections, markdown tables where useful, and clear citations.
Format the output as clean HTML/Markdown. Do not output metadata or conversational replies, just the report text.`;

        const aggregatorPrompt = `Create a comprehensive, professional, and detailed report answering the user's query: "${latestUserText}".
Use the following research findings gathered from our search loop:

---
${findings}
---

Structure the report logically, include a summary/overview, deep dive sections, facts, statistics, and references. Do not include markdown code block wraps (like \`\`\`markdown) for the final response.`;

        const cleanedUserMessages = cleanMessagesForLlm(userMessages);

        const lmResponse = await fetchWithTimeout(
          createLmStudioUrl("chat/completions"),
          {
            method: "POST",
            headers: {
              Accept: "text/event-stream",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: aggregatorSystemPrompt },
                ...cleanedUserMessages.slice(0, -1), // include history if any, using cleaned messages
                { role: "user", content: aggregatorPrompt }
              ],
              temperature: temperature,
              stream: true,
              max_tokens: 4096
            })
          },
          Math.max(applicationConfiguration.lmStudioRequestTimeoutMs, 180000)
        );

        if (!lmResponse.ok || !lmResponse.body) {
          throw new Error(`Aggregator stream failed: ${lmResponse.status}`);
        }

        const reader = lmResponse.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = "";

        function getDeltaText(line: string): string {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return "";
          const payload = trimmed.replace(/^data:\s*/, "");
          if (payload === "[DONE]") return "";
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                };
              }>;
            };
            return parsed.choices?.[0]?.delta?.content ?? "";
          } catch {
            return "";
          }
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lineBuffer += decoder.decode(value, { stream: true });

          let newlineIndex;
          while ((newlineIndex = lineBuffer.indexOf("\n")) !== -1) {
            const rawLine = lineBuffer.slice(0, newlineIndex).replace(/\r$/, "");
            lineBuffer = lineBuffer.slice(newlineIndex + 1);
            const text = getDeltaText(rawLine);
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        }

        controller.close();
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`\n\n<div class="aioph-callout"><strong>Deep Research Error:</strong> ${errMessage}</div>`));
        try {
          controller.close();
        } catch {}
      }
    }
  });
}
