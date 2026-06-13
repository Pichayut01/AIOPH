import { NextResponse } from "next/server";
import {
  getConversation,
  deleteConversation,
  updateConversationTitle
} from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/conversations/[id] — get a conversation with messages */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const conversation = getConversation(id);

    if (!conversation) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get conversation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** PATCH /api/conversations/[id] — update conversation title */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body?.title || typeof body.title !== "string") {
      return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
    }

    updateConversationTitle(id, body.title.slice(0, 200));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update conversation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/conversations/[id] — delete a conversation */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const deleted = deleteConversation(id);

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete conversation";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
