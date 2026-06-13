import { NextResponse } from "next/server";

import { applicationConfiguration } from "@/lib/config/environment";
import { fetchLmStudioModels } from "@/lib/llm/lm-studio-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const models = await fetchLmStudioModels();
    return NextResponse.json(
      {
        ok: true,
        defaultModel: applicationConfiguration.lmStudioDefaultModel ?? models[0]?.id ?? "",
        models
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unable to read LM Studio models.";

    return NextResponse.json(
      {
        ok: false,
        defaultModel: applicationConfiguration.lmStudioDefaultModel ?? "",
        models: [],
        error: errorMessage
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
