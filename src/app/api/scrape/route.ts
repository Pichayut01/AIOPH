import { NextResponse } from "next/server";
import { z } from "zod";
import { load } from "cheerio";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scrapeRequestSchema = z.object({
  url: z.string().url("Invalid URL format")
});

function normalizePageText(rawText: string): string {
  // Extract up to 6000 characters from page content
  return rawText.replace(/\s+/g, " ").trim().slice(0, 6000);
}

function extractReadableTextFromHtml(html: string): string {
  const $ = load(html);
  $("script, style, noscript, svg, form, nav, header, footer, aside").remove();
  
  // Try to find the title of the page
  const title = $("title").text().trim();
  const articleText = $("article").text();
  const mainText = $("main").text();
  const bodyText = $("body").text();
  
  const content = normalizePageText(articleText || mainText || bodyText);
  return title ? `[Title: ${title}]\n${content}` : content;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = scrapeRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const targetUrl = parsed.data.url;

    const response = await fetchWithTimeout(
      targetUrl,
      {
        headers: {
          "Accept": "text/html,application/xhtml+xml,text/plain",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIOPH/1.0 WebAgent"
        }
      },
      15000
    );

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Web request failed: HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const rawContent = await response.text();
    
    // Parse html or plain text content
    const text = contentType.includes("text/html")
      ? extractReadableTextFromHtml(rawContent)
      : normalizePageText(rawContent);

    // Extract title from HTML or fallback to URL domain
    const $ = load(rawContent);
    let title = $("title").text().trim();
    if (!title) {
      try {
        title = new URL(targetUrl).hostname;
      } catch {
        title = "Attached Webpage";
      }
    }

    return NextResponse.json({ ok: true, text, title });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to scrape link";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
