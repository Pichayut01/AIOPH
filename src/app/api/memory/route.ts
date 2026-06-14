import { getAllMemories, deleteMemory, clearAllMemories } from "@/lib/memory/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const memories = getAllMemories();
    return Response.json({ ok: true, memories });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch memories.";
    return Response.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { id?: string; all?: boolean };

  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.all === true) {
      const deleted = clearAllMemories();
      return Response.json({ ok: true, deleted });
    }

    if (body.id) {
      const success = deleteMemory(body.id);
      return Response.json({ ok: success, deleted: success ? 1 : 0 });
    }

    return Response.json({ ok: false, error: "Provide 'id' or 'all: true'." }, { status: 400 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to delete memories.";
    return Response.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
