import { load } from "cheerio";

import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { SearchProvider, SearchResult } from "@/lib/search/search-types";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
];

const RESULT_SELECTORS = [".result", ".web-result", ".result__body"];

function pickRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDuckDuckGoUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const absoluteUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const parsedUrl = new URL(absoluteUrl);
    const redirectedUrl = parsedUrl.searchParams.get("uddg");
    return redirectedUrl ? decodeURIComponent(redirectedUrl) : parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function parseResultsFromHtml(html: string, limit: number): SearchResult[] {
  const $ = load(html);
  const results: SearchResult[] = [];

  for (const selector of RESULT_SELECTORS) {
    $(selector).each((index, element) => {
      if (results.length >= limit) {
        return false;
      }

      const titleAnchor = $(element).find(".result__a").first();
      const title = titleAnchor.text().replace(/\s+/g, " ").trim();
      const url = normalizeDuckDuckGoUrl(titleAnchor.attr("href"));
      const snippet = $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim();

      if (title && url) {
        results.push({
          title,
          url,
          snippet,
          rank: results.length + 1
        });
      }

      return undefined;
    });

    if (results.length > 0) {
      break;
    }
  }

  return results;
}

async function executeSearch(query: string, limit: number): Promise<SearchResult[]> {
  const searchUrl = new URL("https://duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetchWithTimeout(
    searchUrl,
    {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": pickRandomUserAgent()
      }
    },
    applicationConfiguration.searchRequestTimeoutMs
  );

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseResultsFromHtml(html, limit);
}

export const duckDuckGoProvider: SearchProvider = {
  name: "duckduckgo",
  async search(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const results = await executeSearch(query, limit);

      if (results.length > 0) {
        return results;
      }

      // Retry once after a delay if the first attempt returned 0 results
      await delay(1000);
      return await executeSearch(query, limit);
    } catch (firstError: unknown) {
      // Retry once after a delay if the first attempt threw an error
      try {
        await delay(1000);
        return await executeSearch(query, limit);
      } catch {
        // Never throw from the provider; return empty results on total failure
        const message = firstError instanceof Error ? firstError.message : String(firstError);
        console.error(`DuckDuckGo provider failed after retry: ${message}`);
        return [];
      }
    }
  }
};
