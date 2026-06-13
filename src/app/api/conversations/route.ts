import { NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/conversations — list all conversations */
export async function GET(): Promise<Response> {
  try {
    const conversations = listConversations(100);
    return NextResponse.json({ ok: true, conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list conversations";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST /api/conversations — create a new conversation */
export async function POST(request: Request): Promise<Response> {
  try {
    let title = "New Chat";
    try {
      const body = await request.json();
      if (body?.title && typeof body.title === "string") {
        title = body.title.slice(0, 200);
      }
    } catch {
      // No body is fine, use default title
    }

    const conversation = createConversation(title);
    return NextResponse.json({ ok: true, conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create conversation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
