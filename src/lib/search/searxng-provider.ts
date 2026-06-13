import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { SearchProvider, SearchResult } from "@/lib/search/search-types";

interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

export const searxngProvider: SearchProvider = {
  name: "searxng",
  async search(query: string, limit: number): Promise<SearchResult[]> {
    if (!applicationConfiguration.searxngBaseUrl) {
      throw new Error("SEARXNG_BASE_URL is not configured");
    }

    const searchUrl = new URL("/search", applicationConfiguration.searxngBaseUrl);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("safesearch", "1");

    const response = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          "Accept": "application/json"
        }
      },
      applicationConfiguration.searchRequestTimeoutMs
    );

    if (!response.ok) {
      throw new Error(`SearxNG search failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as SearxngResponse;
    return (payload.results ?? [])
      .filter((result): result is Required<Pick<SearxngResult, "title" | "url">> & SearxngResult => {
        return Boolean(result.title && result.url);
      })
      .slice(0, limit)
      .map((result, index) => ({
        title: result.title,
        url: result.url,
        snippet: result.content ?? "",
        rank: index + 1
      }));
  }
};
