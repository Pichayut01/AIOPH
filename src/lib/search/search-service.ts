import { load } from "cheerio";

import { applicationConfiguration } from "@/lib/config/environment";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { duckDuckGoProvider } from "@/lib/search/duck-duck-go-provider";
import { searxngProvider } from "@/lib/search/searxng-provider";
import type { SearchDocument, SearchEvidence, SearchProvider, SearchResult } from "@/lib/search/search-types";

const MINIMUM_DOCUMENT_TEXT_LENGTH = 180;
const MAXIMUM_DOCUMENT_TEXT_LENGTH = 2000;

function getActiveSearchProvider(): SearchProvider {
  if (applicationConfiguration.searchProvider === "searxng" && applicationConfiguration.searxngBaseUrl) {
    return searxngProvider;
  }

  return duckDuckGoProvider;
}

function normalizePageText(rawText: string): string {
  return rawText.replace(/\s+/g, " ").trim().slice(0, MAXIMUM_DOCUMENT_TEXT_LENGTH);
}

async function fetchSearchDocument(result: SearchResult): Promise<SearchDocument> {
  try {
    const response = await fetchWithTimeout(
      result.url,
      {
        headers: {
          "Accept": "text/html,application/xhtml+xml,text/plain",
          "User-Agent": "Mozilla/5.0 AIOPH local research agent"
        }
      },
      applicationConfiguration.searchRequestTimeoutMs
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const rawContent = await response.text();
    const text = contentType.includes("text/html")
      ? extractReadableTextFromHtml(rawContent)
      : normalizePageText(rawContent);

    if (text.length < MINIMUM_DOCUMENT_TEXT_LENGTH) {
      return {
        ...result,
        text: result.snippet,
        wasFetched: false,
        fetchError: "Fetched page did not contain enough readable text"
      };
    }

    return {
      ...result,
      text,
      wasFetched: true
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown fetch failure";
    return {
      ...result,
      text: result.snippet,
      wasFetched: false,
      fetchError: errorMessage
    };
  }
}

function extractReadableTextFromHtml(html: string): string {
  const $ = load(html);
  $("script, style, noscript, svg, form, nav, header, footer, aside").remove();
  const articleText = $("article").text();
  const mainText = $("main").text();
  const bodyText = $("body").text();
  return normalizePageText(articleText || mainText || bodyText);
}

export async function searchWebForEvidence(query: string): Promise<SearchEvidence> {
  const provider = getActiveSearchProvider();
  const warnings: string[] = [];

  let results: SearchResult[] = [];
  try {
    results = await provider.search(query, applicationConfiguration.searchResultsLimit);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Search provider failed";
    warnings.push(errorMessage);
  }

  const documentsToFetch = results.slice(0, applicationConfiguration.searchPageFetchLimit);
  const fetchedDocuments = await Promise.all(documentsToFetch.map((result) => fetchSearchDocument(result)));
  const remainingDocuments = results.slice(applicationConfiguration.searchPageFetchLimit).map<SearchDocument>((result) => ({
    ...result,
    text: result.snippet,
    wasFetched: false
  }));

  return {
    query,
    provider: provider.name,
    generatedAt: new Date().toISOString(),
    documents: [...fetchedDocuments, ...remainingDocuments],
    warnings
  };
}

