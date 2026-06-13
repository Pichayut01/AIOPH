import { NextResponse } from "next/server";
import { z } from "zod";

import { searchWebForEvidence } from "@/lib/search/search-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchRequestSchema = z.object({
  query: z.string().trim().min(2).max(500)
});

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "The search endpoint expected a JSON request body." }, { status: 400 });
  }

  const parsedRequest = searchRequestSchema.safeParse(payload);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsedRequest.error.issues[0]?.message ?? "The search query is invalid."
      },
      {
        status: 400
      }
    );
  }

  const evidence = await searchWebForEvidence(parsedRequest.data.query);
  return NextResponse.json(
    {
      ok: true,
      evidence
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
