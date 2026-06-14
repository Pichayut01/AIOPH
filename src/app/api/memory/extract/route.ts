import {
  extractMemoriesFromMessage,
  deduplicateAndStore,
  summarizeAndStoreConversation,
  updateGlobalUserProfile,
  indexMessagesForRag
} from "@/lib/memory/memory-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { message?: string; model?: string; conversationId?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  const model = body.model?.trim();
  const conversationId = body.conversationId?.trim();

  if (!message) {
    return Response.json({ ok: false, error: "Missing 'message' field." }, { status: 400 });
  }

  if (!model) {
    return Response.json({ ok: false, error: "Missing 'model' field." }, { status: 400 });
  }

  try {
    const extractedFacts = await extractMemoriesFromMessage(message, model);
    const stored = await deduplicateAndStore(extractedFacts, model);

    if (conversationId) {
      // Background conversation summarization (non-blocking)
      summarizeAndStoreConversation(conversationId, model).catch((err) => {
        console.error("Background conversation summarization failed:", err);
      });
      // Background global user profile update (non-blocking)
      updateGlobalUserProfile(conversationId, model).catch((err) => {
        console.error("Background global user profile update failed:", err);
      });
      // Background RAG indexing of messages (non-blocking)
      indexMessagesForRag(conversationId, model).catch((err) => {
        console.error("Background RAG indexing failed:", err);
      });
    }

    return Response.json({
      ok: true,
      extracted: extractedFacts.length,
      stored
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Memory extraction failed.";
    return Response.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
