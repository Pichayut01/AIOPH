export type SearchProviderName = "duckduckgo" | "searxng";

function readOptionalString(environmentKey: string): string | undefined {
  const value = process.env[environmentKey]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readNumber(environmentKey: string, fallbackValue: number): number {
  const rawValue = readOptionalString(environmentKey);
  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function readSearchProvider(): SearchProviderName {
  const configuredProvider = readOptionalString("SEARCH_PROVIDER")?.toLowerCase();
  return configuredProvider === "searxng" ? "searxng" : "duckduckgo";
}

export const applicationConfiguration = {
  applicationName: readOptionalString("NEXT_PUBLIC_APP_NAME") ?? "AIOPH HTML Agent",
  lmStudioBaseUrl: readOptionalString("LM_STUDIO_BASE_URL") ?? "http://127.0.0.1:1234/v1",
  lmStudioDefaultModel: readOptionalString("LM_STUDIO_MODEL"),
  lmStudioRequestTimeoutMs: readNumber("LM_STUDIO_REQUEST_TIMEOUT_MS", 120000),
  searchProvider: readSearchProvider(),
  searxngBaseUrl: readOptionalString("SEARXNG_BASE_URL"),
  searchResultsLimit: Math.min(readNumber("SEARCH_RESULTS_LIMIT", 6), 10),
  searchPageFetchLimit: Math.min(readNumber("SEARCH_PAGE_FETCH_LIMIT", 3), 5),
  searchRequestTimeoutMs: readNumber("SEARCH_REQUEST_TIMEOUT_MS", 12000)
} as const;
