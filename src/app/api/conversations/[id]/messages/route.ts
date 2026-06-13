import { NextResponse } from "next/server";
import { addMessage } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/conversations/[id]/messages — add a message */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body?.role || !body?.content) {
      return NextResponse.json({ ok: false, error: "role and content are required" }, { status: 400 });
    }

    if (body.role !== "user" && body.role !== "assistant") {
      return NextResponse.json({ ok: false, error: "role must be 'user' or 'assistant'" }, { status: 400 });
    }

    const message = addMessage(
      id,
      body.role,
      body.content,
      body.sourcesJson ?? null,
      body.searchUsed ?? false
    );

    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add message";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
