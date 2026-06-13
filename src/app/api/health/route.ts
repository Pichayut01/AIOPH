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
        lmStudio: {
          ok: true,
          baseUrl: applicationConfiguration.lmStudioBaseUrl,
          defaultModel: applicationConfiguration.lmStudioDefaultModel ?? null,
          models
        },
        search: {
          provider: applicationConfiguration.searchProvider,
          searxngConfigured: Boolean(applicationConfiguration.searxngBaseUrl),
          resultsLimit: applicationConfiguration.searchResultsLimit,
          pageFetchLimit: applicationConfiguration.searchPageFetchLimit
        }
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LM Studio health check failed.";

    return NextResponse.json(
      {
        ok: false,
        lmStudio: {
          ok: false,
          baseUrl: applicationConfiguration.lmStudioBaseUrl,
          defaultModel: applicationConfiguration.lmStudioDefaultModel ?? null,
          error: errorMessage,
          models: []
        },
        search: {
          provider: applicationConfiguration.searchProvider,
          searxngConfigured: Boolean(applicationConfiguration.searxngBaseUrl),
          resultsLimit: applicationConfiguration.searchResultsLimit,
          pageFetchLimit: applicationConfiguration.searchPageFetchLimit
        }
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
