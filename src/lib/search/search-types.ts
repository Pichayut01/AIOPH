import type { SearchProviderName } from "@/lib/config/environment";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  rank: number;
}

export interface SearchDocument extends SearchResult {
  text: string;
  wasFetched: boolean;
  fetchError?: string;
}

export interface SearchEvidence {
  query: string;
  provider: SearchProviderName;
  generatedAt: string;
  documents: SearchDocument[];
  warnings: string[];
}

export interface SearchProvider {
  name: SearchProviderName;
  search(query: string, limit: number): Promise<SearchResult[]>;
}
