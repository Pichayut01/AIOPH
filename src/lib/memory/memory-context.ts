import { getAllMemories, cosineSimilarity, UserMemory } from "@/lib/memory/memory-store";
import { fetchEmbedding } from "@/lib/memory/memory-extractor";
import { listConversations, Conversation, getGlobalProfile, getAllRagItems } from "@/lib/db/database";

/**
 * Builds a formatted memory context block for injection into the system prompt.
 * Performs semantic vector search over facts, past conversation summaries, and chat history (RAG).
 */
export async function buildMemoryContextBlock(
  latestQuery?: string,
  model?: string
): Promise<string> {
  const memories = getAllMemories();
  const recentConversations = listConversations(15);
  const globalProfile = getGlobalProfile();

  let selectedMemories: UserMemory[] = [];
  let relevantPastChats: Array<{ title: string; summary: string }> = [];
  let semanticRagMatches: Array<{ text: string; date: string; similarity: number }> = [];

  let queryEmbedding: number[] | null = null;
  if (latestQuery && model) {
    // Attempt to get embedding for the latest user message
    queryEmbedding = await fetchEmbedding(latestQuery, model);
  }

  // --- 1. Fact Memory Selection ---
  if (queryEmbedding && memories.length > 0) {
    const scoredMemories: Array<{ memory: UserMemory; score: number }> = [];

    for (const mem of memories) {
      if (!mem.embedding) {
        scoredMemories.push({ memory: mem, score: 0 });
        continue;
      }

      try {
        const embeddingArray = JSON.parse(mem.embedding) as number[];
        if (embeddingArray.length === queryEmbedding.length) {
          const similarity = cosineSimilarity(queryEmbedding, embeddingArray);
          scoredMemories.push({ memory: mem, score: similarity });
        } else {
          scoredMemories.push({ memory: mem, score: 0 });
        }
      } catch {
        scoredMemories.push({ memory: mem, score: 0 });
      }
    }

    // Always keep personal & preference core identities
    const coreMemories = scoredMemories.filter(
      (sm) => sm.memory.category === "personal" || sm.memory.category === "preference"
    ).map((sm) => sm.memory);

    // Semantically retrieve the top relevant memories (similarity >= 0.65)
    const semanticMatches = scoredMemories
      .filter(
        (sm) =>
          sm.score >= 0.65 &&
          sm.memory.category !== "personal" &&
          sm.memory.category !== "preference"
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((sm) => sm.memory);

    const combined = [...coreMemories];
    for (const sem of semanticMatches) {
      if (!combined.some((m) => m.id === sem.id)) {
        combined.push(sem);
      }
    }

    selectedMemories = combined;
  } else {
    selectedMemories = memories.slice(0, 25);
  }

  // --- 2. Past Chat Summaries Semantic Retrieval ---
  if (queryEmbedding && recentConversations.length > 0) {
    const scoredChats: Array<{ chat: Conversation; score: number }> = [];

    for (const chat of recentConversations) {
      if (!chat.summary || !chat.summary_embedding) continue;

      try {
        const embeddingArray = JSON.parse(chat.summary_embedding) as number[];
        if (embeddingArray.length === queryEmbedding.length) {
          const similarity = cosineSimilarity(queryEmbedding, embeddingArray);
          scoredChats.push({ chat, score: similarity });
        }
      } catch {
        // Ignore JSON error
      }
    }

    // Retrieve top 2 semantically similar past chat sessions (similarity >= 0.65)
    relevantPastChats = scoredChats
      .filter((sc) => sc.score >= 0.65)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((sc) => ({
        title: sc.chat.title,
        summary: sc.chat.summary!
      }));
  }

  // --- 3. Chat History Vector RAG Semantic Retrieval ---
  if (queryEmbedding) {
    const ragItems = getAllRagItems();
    if (ragItems.length > 0) {
      const scoredRags: Array<{ text: string; date: string; score: number }> = [];

      for (const item of ragItems) {
        try {
          const embeddingArray = JSON.parse(item.embedding) as number[];
          if (embeddingArray.length === queryEmbedding.length) {
            const similarity = cosineSimilarity(queryEmbedding, embeddingArray);
            if (similarity >= 0.70) {
              scoredRags.push({
                text: item.text_content,
                date: item.created_at.slice(0, 10),
                score: similarity
              });
            }
          }
        } catch {
          // Ignore
        }
      }

      // Sort by similarity and take top 5 matches
      semanticRagMatches = scoredRags
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((sr) => ({
          text: sr.text,
          date: sr.date,
          similarity: sr.score
        }));
    }
  }

  // --- 4. Format Prompt Blocks ---
  const blocks: string[] = [];

  // Global User Profile block
  if (globalProfile) {
    blocks.push(`=== Global User Profile & Interests ===
This is a holistic summary of the user's background, active tech stack, design/work preferences, and current focus area. Use this profile to align your communication style and technical recommendations:

${globalProfile}`);
  }

  // Fact memory block
  if (selectedMemories.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const mem of selectedMemories) {
      const cat = mem.category || "general";
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(mem.memory_text);
    }

    const categoryLabels: Record<string, string> = {
      personal: "Personal",
      preference: "Preferences",
      project: "Projects",
      skill: "Skills & Tools",
      goal: "Goals & Plans",
      context: "Context",
      general: "General"
    };

    const lines: string[] = [];
    for (const [category, facts] of Object.entries(grouped)) {
      const label = categoryLabels[category] || category;
      for (const fact of facts) {
        lines.push(`[${label}] ${fact}`);
      }
    }

    blocks.push(`=== Long-Term Memory About This User ===
You know this user personally. Use the following stored knowledge to give answers that are naturally relevant to their life, work, and preferences.
IMPORTANT: Never say "I have stored that..." or "According to my memory..." — weave the knowledge seamlessly into your responses as if you naturally know these things.

${lines.join("\n")}`);
  }

  // Semantic past conversation summaries block
  if (relevantPastChats.length > 0) {
    const chatLines = relevantPastChats.map(
      (c) => `- [Topic: "${c.title}"] Summary: ${c.summary}`
    );
    blocks.push(`=== Relevant Past Conversation Summaries ===
You have discussed these topics in previous chat sessions. Use this history to answer if the user asks "What did we talk about?" or references past conversations:
${chatLines.join("\n")}`);
  }

  // Vector RAG past chat messages block
  if (semanticRagMatches.length > 0) {
    const ragLines = semanticRagMatches.map(
      (m) => `[Date: ${m.date}] ${m.text}`
    );
    blocks.push(`=== Relevant Chat History (Vector RAG) ===
The following are highly relevant message segments retrieved from past conversations using semantic vector search. Use this context to answer queries about past conversations, previous answers, and related details:
${ragLines.join("\n")}`);
  }

  // General Index of Recent Conversations (so AI always knows names of other chats)
  if (recentConversations.length > 0) {
    const recentLines = recentConversations
      .slice(0, 10)
      .map((c) => `- "${c.title}"`);
    
    blocks.push(`=== Recent Chat Sessions ===
Here is an index of recent chat sessions. If the user asks what they have talked about or asks about other chats, you can reference these titles:
${recentLines.join("\n")}`);
  }

  if (blocks.length === 0) {
    return "";
  }

  return `
${blocks.join("\n\n")}
=== End of Memory & History Context ===
`.trim();
}
