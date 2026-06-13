function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function createHtmlErrorFragment(title: string, details: string): string {
  return [
    '<section class="aioph-answer aioph-answer-error">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<p>${escapeHtml(details)}</p>`,
    "</section>"
  ].join("");
}

export function createHtmlErrorResponse(title: string, details: string, status = 500): Response {
  return new Response(createHtmlErrorFragment(title, details), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
