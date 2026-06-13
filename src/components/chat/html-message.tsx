"use client";

import { useEffect, useRef, useState } from "react";
import { safeCopyToClipboard } from "@/lib/utils/clipboard";

interface HtmlMessageProps {
  html: string;
  isStreaming?: boolean;
}

const ALLOWED_TAGS = [
  "section", "article", "aside", "div", "span", "p",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "strong", "em", "b", "i",
  "code", "pre", "table", "thead", "tbody", "tfoot", "caption", "colgroup", "col", "tr", "th", "td",
  "blockquote", "a", "br", "hr",
  "details", "summary", "figure", "figcaption", "small", "sup", "sub", "mark", "del", "ins",
  "svg", "rect", "path", "polyline", "circle", "line", "polygon", "button"
];

const ALLOWED_ATTR = [
  "class", "style", "href", "title", "target", "rel",
  "aria-label", "role", "colspan", "rowspan", "open",
  "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "x", "y", "width", "height", "rx", "ry", "d", "points", "cx", "cy", "r", "x1", "y1", "x2", "y2"
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DOMPurifyInstance: any = null;

export function HtmlMessage({ html, isStreaming = false }: HtmlMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userToggledDetailsRef = useRef<"open" | "closed" | null>(null);
  const [sanitizedHtml, setSanitizedHtml] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function sanitize(): Promise<void> {
      try {
        if (!DOMPurifyInstance) {
          const DOMPurify = (await import("dompurify")).default;
          DOMPurifyInstance = DOMPurify(window);
        }
        
        if (isCancelled) return;

        const { Marked } = await import("marked");
        const hljs = (await import("highlight.js")).default;
        
        const renderCodeBlock = (text: string, lang?: string) => {
          // Guard: if marked mistakenly treated indented AIOPH component HTML as code,
          // return it as raw HTML instead of rendering a code block.
          if (
            text.includes('class="aioph-') ||
            text.includes("class='aioph-") ||
            text.includes('class="research-') ||
            text.includes("class='research-") ||
            text.includes('class="step-') ||
            text.includes("class='step-")
          ) {
            return text;
          }

          const rawLanguage = lang || "plaintext";
          const LANGUAGE_ALIASES: Record<string, string> = {
            "c++": "cpp", "c#": "csharp", "f#": "fsharp", "html/css": "html",
            "html5": "xml", "vue": "xml", "vuejs": "xml", "react": "jsx",
            "reactjs": "jsx", "next.js": "javascript", "nextjs": "javascript",
            "node.js": "javascript", "nodejs": "javascript", "ts": "typescript",
            "js": "javascript", "sh": "bash", "shell": "bash", "zsh": "bash",
            "cmd": "dos", "powershell": "powershell", "ps1": "powershell",
            "docker": "dockerfile", "k8s": "yaml", "kubernetes": "yaml",
            "yml": "yaml", "rs": "rust", "golang": "go", "py": "python",
            "rb": "ruby",
          };
          const language = LANGUAGE_ALIASES[rawLanguage.toLowerCase()] || rawLanguage;
          
          let highlightedCode = text;
          if (language !== "plaintext" && hljs.getLanguage(language)) {
            highlightedCode = hljs.highlight(text, { language, ignoreIllegals: true }).value;
          } else {
            try {
              highlightedCode = hljs.highlightAuto(text).value;
            } catch {
              // Fallback to text
            }
          }

          // Add line numbers
          const lineCount = text.split('\n').length;
          const lineNumbersHtml = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
          
          // Base64 encode the code for the copy button to prevent attribute breaking
          const encodedCode = encodeURIComponent(text);

          return `
<div class="aioph-code">
  <div class="aioph-code-header">
    <span>${rawLanguage.toUpperCase()}</span>
    <button class="aioph-copy-btn" data-code="${encodedCode}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span>Copy</span>
    </button>
  </div>
  <pre class="aioph-code-pre"><div class="aioph-line-numbers">${lineNumbersHtml}</div><code class="hljs language-${language}">${highlightedCode}</code></pre>
</div>`;
        };

        const markedInstance = new Marked({
          renderer: {
            code({ text, lang }: { text: string; lang?: string }) {
              return renderCodeBlock(text, lang);
            }
          }
        });

        const parsedHtml = await markedInstance.parse(html, { async: true });

        const clean = DOMPurifyInstance.sanitize(parsedHtml as string, {
          ALLOWED_TAGS: ALLOWED_TAGS,
          ALLOWED_ATTR: ALLOWED_ATTR,
          ALLOW_DATA_ATTR: true
        });

        let finalClean = clean;

        // Upgrade any raw <pre> tags (often outputted by Claude instead of markdown backticks)
        // into our rich .aioph-code UI so that copy buttons and line numbers always work!
        if (finalClean.includes("<pre")) {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = finalClean;
          
          tempDiv.querySelectorAll("pre:not(.aioph-code-pre)").forEach(pre => {
            const codeEl = pre.querySelector("code");
            const text = codeEl ? codeEl.textContent || "" : pre.textContent || "";
            
            let lang = "plaintext";
            if (pre.hasAttribute("data-language")) {
              lang = pre.getAttribute("data-language") || "plaintext";
            } else if (codeEl && codeEl.className) {
              const match = codeEl.className.match(/language-(\w+)/);
              if (match) lang = match[1];
            }
            
            pre.outerHTML = renderCodeBlock(text, lang);
          });
          
          finalClean = tempDiv.innerHTML;
        }

        if (finalClean.includes("<details")) {
          finalClean = finalClean.replace(/<details\b([^>]*)>/gi, (match: string, p1: string) => {
            const hasOpen = /\bopen\b/i.test(p1);
            
            // If the user explicitly toggled it, respect their choice.
            // Otherwise, keep the attribute as generated (or false if missing).
            let shouldBeOpen = hasOpen;
            if (userToggledDetailsRef.current === "open") {
              shouldBeOpen = true;
            } else if (userToggledDetailsRef.current === "closed") {
              shouldBeOpen = false;
            }

            if (shouldBeOpen && !hasOpen) {
              return `<details open${p1}>`;
            } else if (!shouldBeOpen && hasOpen) {
              return `<details${p1.replace(/\bopen(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")}>`;
            }
            return match;
          });
        }

        setSanitizedHtml(finalClean);
      } catch (err) {
        console.error("Sanitization error", err);
        setSanitizedHtml(html);
      }
    }

    void sanitize();

    return () => {
      isCancelled = true;
    };
  }, [html, isStreaming]);

  // Persist event delegation listeners ONCE so they don't detach/reattach during streaming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Handle user toggling <details> during streaming so it doesn't flicker back
    const handleDetailsToggle = (e: MouseEvent) => {
      const summary = (e.target as HTMLElement).closest("summary");
      if (!summary) return;
      
      const details = summary.closest("details");
      if (!details) return;

      // Prevent native toggle to avoid race conditions with React re-rendering
      e.preventDefault();

      const isOpen = details.hasAttribute("open");
      if (isOpen) {
        details.removeAttribute("open");
        userToggledDetailsRef.current = "closed";
      } else {
        details.setAttribute("open", "");
        userToggledDetailsRef.current = "open";
      }
    };

    // Handle Code Copy buttons using event delegation
    const handleCopyClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.aioph-copy-btn');
      if (!btn) return;
      
      e.preventDefault();
      const code = btn.getAttribute("data-code");
      if (!code) return;

      safeCopyToClipboard(decodeURIComponent(code))
        .then(() => {
          const oldHtml = btn.innerHTML;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> <span style="color:#4ade80;">Copied!</span>`;
          setTimeout(() => { btn.innerHTML = oldHtml; }, 2000);
        })
        .catch(console.error);
    };

    container.addEventListener("click", handleDetailsToggle);
    container.addEventListener("click", handleCopyClick);

    return () => {
      container.removeEventListener("click", handleDetailsToggle);
      container.removeEventListener("click", handleCopyClick);
    };
  }, []);

  // Post-process: force links to new tab and make tables responsive
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Force all regular links to open in new tabs
    container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      // Don't override our smart cards below
      if (!anchor.classList.contains("aioph-link-card")) {
        anchor.target = "_blank";
        anchor.rel = "noreferrer noopener";
      }
    });

    // Process Smart Link Cards
    container.querySelectorAll(".aioph-link-card").forEach((card) => {
      (card as HTMLElement).style.cursor = "pointer";
      
      // Clean up old listeners if re-running
      const newCard = card.cloneNode(true) as HTMLElement;
      if (card.parentNode) {
        card.parentNode.replaceChild(newCard, card);
      }
      
      newCard.addEventListener("click", (e) => {
        e.preventDefault();
        const titleEl = newCard.querySelector(".aioph-link-card-title span:first-child") || newCard.querySelector(".aioph-link-card-title");
        const title = titleEl?.textContent?.trim();
        
        const anchor = newCard as HTMLAnchorElement;
        const href = anchor.getAttribute("href");
        
        // If it's a real external URL (not a placeholder), open it
        if (href && href.startsWith("http") && !href.includes("example.com")) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else if (title) {
          // Otherwise, smartly search Google for the topic
          window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}`, "_blank", "noopener,noreferrer");
        }
      });
    });

    // Make tables responsive by wrapping them
    container.querySelectorAll("table").forEach((table) => {
      if (!table.parentElement?.classList.contains("table-responsive")) {
        const wrapper = document.createElement("div");
        wrapper.className = "table-responsive";
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });

  }, [sanitizedHtml]);

  if (!sanitizedHtml && !isStreaming) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`html-output${isStreaming ? " html-output-streaming" : ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
