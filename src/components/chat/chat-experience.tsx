"use client";

import {
  Activity,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Check,
  Download,
  ExternalLink,
  Globe,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  WifiOff,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { HtmlStreamBuffer } from "@/lib/html/html-stream-buffer";
import { HtmlMessage } from "@/components/chat/html-message";
import { DotMatrixLoader } from "@/components/chat/dot-matrix-loader";
import { safeCopyToClipboard } from "@/lib/utils/clipboard";
import type { SearchMode } from "@/lib/chat/message-types";

// ── Types ──

type InterfaceRole = "user" | "assistant";

interface InterfaceMessage {
  id: string;
  role: InterfaceRole;
  content: string;
  createdAt: string;
  sources?: SourceMetadata[];
  searchUsed?: boolean;
  enhancedPrompt?: string;
  enhancedThinking?: string;
}

interface SourceMetadata {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  wasFetched: boolean;
  fetchError?: string;
}

interface SearchMetadataHeader {
  query: string;
  provider: string;
  generatedAt: string;
  warnings: string[];
  sources: SourceMetadata[];
}

interface HealthPayload {
  ok: boolean;
  lmStudio: {
    ok: boolean;
    baseUrl: string;
    defaultModel: string | null;
    error?: string;
    models: Array<{ id: string }>;
  };
  search: {
    provider: string;
    searxngConfigured: boolean;
    resultsLimit: number;
    pageFetchLimit: number;
  };
}

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ── Constants ──

const PROMPT_POOL = [
  "Search for the latest AI news and summarize",
  "Explain your system architecture",
  "Generate a sample HTML report",
  "ค้นหาข่าวด่วนวันนี้แล้วสรุปให้ฟังหน่อย",
  "เขียน Python script สำหรับทำ Web Scraping ให้ที",
  "อธิบายเรื่อง Quantum Computing ให้เด็ก 10 ขวบเข้าใจ",
  "ช่วยคิดโครงร่าง Presentation แผนธุรกิจร้านกาแฟ 10 สไลด์",
  "เขียนรีวิวเปรียบเทียบ React กับ Vue.js ในปีนี้",
  "สร้างตารางตารางเปรียบเทียบ Frameworks ของ Node.js",
  "How do I implement binary search in Rust?",
  "Write a polite email to decline a job offer",
  "ค้นหาข้อมูลเกี่ยวกับภารกิจ Artemis ของ NASA ล่าสุด",
  "ช่วยเขียนคำคมสอนใจเกี่ยวกับความพยายามเป็นภาษาอังกฤษ",
  "อธิบายหลักการทำงานของ Docker ให้ฟังหน่อย",
  "เขียน Code CSS สำหรับทำปุ่มที่มีเอฟเฟกต์ Glassmorphism",
  "แนะนำ 5 เครื่องมือที่ช่วยเพิ่ม Productivity สำหรับ Developer",
  "สรุปหนังสือ Atomic Habits สั้นๆ เป็น 5 ข้อคิด",
  "What are the best practices for REST API design?",
  "ค้นหาสภาพอากาศที่โตเกียวช่วงนี้และแนะนำการแต่งตัว",
  "สร้างรายการ Check-list สำหรับการเตรียมตัวไปเที่ยวญี่ปุ่น",
  "เขียนฟังก์ชัน JavaScript สำหรับเช็คว่าเป็น Prime Number",
  "อธิบายความแตกต่างระหว่าง TCP และ UDP พร้อมยกตัวอย่าง",
  "ช่วยคิดไอเดียของขวัญวันเกิดให้เพื่อนที่เป็นโปรแกรมเมอร์"
];

// ── Utilities ──

function createMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function decodeSearchMetadataHeader(headerValue: string | null): SearchMetadataHeader | undefined {
  if (!headerValue) return undefined;
  try {
    const normalizedValue = headerValue.replace(/-/g, "+").replace(/_/g, "/");
    const paddedValue = normalizedValue + "=".repeat((4 - (normalizedValue.length % 4)) % 4);
    const binaryValue = window.atob(paddedValue);
    const bytes = Uint8Array.from(binaryValue, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as SearchMetadataHeader;
  } catch {
    return undefined;
  }
}

function decodeBase64Header(headerValue: string | null): string {
  if (!headerValue) return "";
  try {
    const normalizedValue = headerValue.replace(/-/g, "+").replace(/_/g, "/");
    const paddedValue = normalizedValue + "=".repeat((4 - (normalizedValue.length % 4)) % 4);
    const binaryValue = window.atob(paddedValue);
    const bytes = Uint8Array.from(binaryValue, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function escapeForHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    const e: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return e[c];
  });
}

function createClientErrorHtml(title: string, details: string): string {
  return `<section class="aioph-answer aioph-answer-error"><h2>${escapeForHtml(title)}</h2><p>${escapeForHtml(details)}</p></section>`;
}

function exportConversationAsHtml(messages: InterfaceMessage[]): void {
  const bodyContent = messages
    .map((m) => m.role === "user"
      ? `<section class="export-user"><h2>User</h2><p>${escapeForHtml(m.content)}</p></section>`
      : `<section class="export-assistant"><h2>Assistant</h2>${m.content}</section>`)
    .join("\n");

  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIOPH Chat Export</title><style>body{margin:0;padding:32px;background:#000;color:#e5e5e5;font-family:Inter,Arial,sans-serif;line-height:1.6}a{color:#fff}section{border:1px solid #1a1a1f;padding:20px;margin:0 0 16px;border-radius:8px}.export-user{background:#111114}.export-assistant{background:#0a0a0a}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #1a1a1f;padding:8px;text-align:left}</style></head><body>${bodyContent}</body></html>`;

  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aioph-chat-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function autoResizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const max = 160;
  textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
  textarea.style.overflowY = textarea.scrollHeight > max ? "auto" : "hidden";
}

function truncateTitle(text: string, maxLen = 40): string {
  const cleaned = text.replace(/\n/g, " ").trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + "…" : cleaned;
}

// ── Sub-components ──

function SourceChips({ sources }: { sources: SourceMetadata[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="source-chips">
      <button type="button" className="source-chip" onClick={() => setExpanded(!expanded)}>
        <Globe size={10} />
        <span>{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {expanded && (
        <div className="sources-expanded">
          {sources.map((s) => (
            <a key={`${s.rank}-${s.url}`} href={s.url} target="_blank" rel="noreferrer noopener" className="source-link">
              <ExternalLink size={10} />
              <span>{s.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageCopyButton({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    safeCopyToClipboard(temp.innerText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(console.error);
  };

  return (
    <div className="message-actions">
      <button className={`message-copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} aria-label="Copy message">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

function EnhancedPromptBadge({ enhancedPrompt, thinking }: { enhancedPrompt: string; thinking: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="enhanced-prompt-wrapper">
      <button
        type="button"
        className={`enhanced-prompt-badge${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Sparkles size={11} />
        <span>Prompt Enhanced</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div className="enhanced-prompt-panel">
          {thinking && (
            <details className="enhanced-thinking">
              <summary>AI Thinking</summary>
              <pre>{thinking}</pre>
            </details>
          )}
          <div className="enhanced-prompt-label">Enhanced Prompt</div>
          <p className="enhanced-prompt-text">{enhancedPrompt}</p>
        </div>
      )}
    </div>
  );
}

function parseUserMessageContent(content: string): { text: string; imageUrls: string[] } {
  if (content.startsWith("[") && content.endsWith("]")) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        let text = "";
        const imageUrls: string[] = [];
        for (const part of parsed) {
          if (part.type === "text") {
            text += part.text;
          } else if (part.type === "image_url") {
            imageUrls.push(part.image_url.url);
          }
        }
        return { text, imageUrls };
      }
    } catch {
      // ignore
    }
  }
  return { text: content, imageUrls: [] };
}

// ── Main Component ──

export function ChatExperience() {
  // Chat state
  const [messages, setMessages] = useState<InterfaceMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<InterfaceMessage | undefined>();
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isWaitingForFirstChunk, setIsWaitingForFirstChunk] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [deepResearchMode, setDeepResearchMode] = useState(false);

  // Settings state
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<Array<{ id: string }>>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [temperature, setTemperature] = useState(0.2);
  const [health, setHealth] = useState<HealthPayload | undefined>();

  // UI state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [randomSuggestions, setRandomSuggestions] = useState<string[]>([]);

  // History state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isHistoryMounted = useRef(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const isRestoringScrollRef = useRef(false);

  const isAtWelcomeState = messages.length === 0;
  const isConnected = health?.lmStudio.ok ?? false;

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === "string") {
          setAttachedImages((prev) => [...prev, e.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result && typeof event.target.result === "string") {
              setAttachedImages((prev) => [...prev, event.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
          hasImage = true;
        }
      }
    }
    if (hasImage) {
      e.preventDefault();
    }
  };

  // ── System status ──

  const refreshSystemStatus = useCallback(async () => {
    try {
      const [hr, mr] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/models", { cache: "no-store" })
      ]);
      const h = (await hr.json()) as HealthPayload;
      const m = (await mr.json()) as { defaultModel: string; models: Array<{ id: string }> };
      setHealth(h);
      setAvailableModels(m.models);
      setSelectedModel((cur) => cur || m.defaultModel || m.models[0]?.id || "");
    } catch { /* silent */ }
  }, []);

  // ── Conversations ──

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setConversations(data.conversations);
    } catch { /* silent */ }
  }, []);

  const loadConversation = useCallback(async (id: string, restoreScroll = true) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        const msgs: InterfaceMessage[] = data.conversation.messages.map((m: { id: string; role: string; content: string; sources_json: string | null; search_used: number; created_at: string }) => ({
          id: m.id,
          role: m.role as InterfaceRole,
          content: m.content,
          createdAt: m.created_at,
          sources: m.sources_json ? JSON.parse(m.sources_json) : undefined,
          searchUsed: m.search_used === 1
        }));
        
        isRestoringScrollRef.current = true;
        setMessages(msgs);
        setActiveConversationId(id);

        if (typeof window !== "undefined") {
          sessionStorage.setItem("aioph_active_conversation_id", id);
        }

        if (typeof window !== "undefined" && window.innerWidth < 768) {
          setIsHistoryOpen(false);
        }

        // Restore scroll position after React DOM update
        setTimeout(() => {
          if (typeof window !== "undefined") {
            const savedScroll = sessionStorage.getItem(`aioph_scroll_${id}`);
            const el = chatBodyRef.current;
            if (restoreScroll && savedScroll !== null && el) {
              el.scrollTop = Number(savedScroll);
            } else {
              bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
            }
          }
          isRestoringScrollRef.current = false;
        }, 50);
      }
    } catch { /* silent */ }
  }, []);

  const createNewConversation = useCallback(async (title = "New Chat"): Promise<string | null> => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await res.json();
      if (data.ok) {
        setActiveConversationId(data.conversation.id);
        void loadConversations();
        return data.conversation.id;
      }
    } catch { /* silent */ }
    return null;
  }, [loadConversations]);

  const saveMessage = useCallback(async (convId: string, role: "user" | "assistant", content: string, sources?: SourceMetadata[], searchUsed = false) => {
    try {
      await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          content,
          sourcesJson: sources ? JSON.stringify(sources) : null,
          searchUsed
        })
      });
    } catch { /* silent */ }
  }, []);

  const deleteConv = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("aioph_active_conversation_id");
          sessionStorage.removeItem(`aioph_scroll_${id}`);
        }
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(`aioph_scroll_${id}`);
        }
      }
      void loadConversations();
    } catch { /* silent */ }
  }, [activeConversationId, loadConversations]);

  // ── Effects ──

  useEffect(() => {
    void refreshSystemStatus();
    void loadConversations();
  }, [refreshSystemStatus, loadConversations]);

  // Shuffle prompts
  useEffect(() => {
    // Only shuffle when there are no messages (e.g. at welcome screen)
    if (messages.length === 0) {
      const shuffled = [...PROMPT_POOL].sort(() => 0.5 - Math.random());
      setRandomSuggestions(shuffled.slice(0, 3));
    }
  }, [messages.length]);

  useEffect(() => {
    if (isRestoringScrollRef.current) return;
    // Only auto-scroll when a new message is added (not during streaming content updates)
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem("aioph_sidebar_open");
    if (saved !== null) {
      setIsHistoryOpen(saved === "true");
    }
    isHistoryMounted.current = true;
  }, []);

  useEffect(() => {
    if (isHistoryMounted.current) {
      localStorage.setItem("aioph_sidebar_open", String(isHistoryOpen));
    }
  }, [isHistoryOpen]);

  // Load saved session conversation on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedActiveId = sessionStorage.getItem("aioph_active_conversation_id");
      if (savedActiveId) {
        void loadConversation(savedActiveId, true);
      }
    }
  }, [loadConversation]);

  // ── Send message ──

  async function sendMessage(promptOverride?: string): Promise<void> {
    const prompt = (promptOverride ?? inputValue).trim();
    const hasImages = attachedImages.length > 0;
    if ((!prompt && !hasImages) || isSending) return;

    // Create conversation if none active
    let convId = activeConversationId;
    if (!convId) {
      const firstLine = prompt || "Sent an image";
      convId = await createNewConversation(truncateTitle(firstLine));
      if (!convId) return;
    }

    let userMessageContent = prompt;
    if (hasImages) {
      const parts = [
        { type: "text", text: prompt },
        ...attachedImages.map((img) => ({ type: "image_url", image_url: { url: img } }))
      ];
      userMessageContent = JSON.stringify(parts);
    }

    const userMessage: InterfaceMessage = {
      id: createMessageId(),
      role: "user",
      content: userMessageContent,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInputValue("");
    setAttachedImages([]);
    setIsSending(true);
    setIsEnhancingPrompt(true);
    setIsWaitingForFirstChunk(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // Save user message to DB
    void saveMessage(convId, "user", userMessageContent);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel || undefined,
          temperature,
          searchMode,
          deepResearch: deepResearchMode
        })
      });

      const searchMetadata = decodeSearchMetadataHeader(response.headers.get("X-AIOPH-Search-Sources"));
      const searchUsed = response.headers.get("X-AIOPH-Search-Used") === "true";
      const promptWasEnhanced = response.headers.get("X-AIOPH-Prompt-Enhanced") === "true";
      const enhancedPrompt = promptWasEnhanced
        ? decodeBase64Header(response.headers.get("X-AIOPH-Enhanced-Prompt"))
        : "";
      const enhancedThinking = decodeBase64Header(response.headers.get("X-AIOPH-Enhanced-Thinking"));

      if (!response.ok || !response.body) {
        const errorHtml = await response.text();
        setIsWaitingForFirstChunk(false);
        const errContent = errorHtml || createClientErrorHtml("Request failed", `HTTP ${response.status}`);
        setMessages((cur) => [...cur, {
          id: createMessageId(), role: "assistant", content: errContent,
          createdAt: new Date().toISOString(), sources: searchMetadata?.sources, searchUsed
        }]);
        void saveMessage(convId, "assistant", errContent, searchMetadata?.sources, searchUsed);
        return;
      }

      const assistantMessageId = createMessageId();
      const streamBuffer = new HtmlStreamBuffer();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setIsEnhancingPrompt(false);
      setStreamingMessage({
        id: assistantMessageId, role: "assistant", content: "",
        createdAt: new Date().toISOString(), sources: searchMetadata?.sources, searchUsed,
        enhancedPrompt: enhancedPrompt || undefined,
        enhancedThinking: enhancedThinking || undefined
      });

      let hasReceivedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const renderableHtml = streamBuffer.push(chunk);
        if (!hasReceivedContent && renderableHtml.trim().length > 0) {
          hasReceivedContent = true;
          setIsWaitingForFirstChunk(false);
        }
        setStreamingMessage((cur) => cur ? { ...cur, content: renderableHtml } : cur);
      }

      const finalHtml = streamBuffer.flush().trim() || createClientErrorHtml("Empty response", "LM Studio returned an empty response.");
      setMessages((cur) => [...cur, {
        id: assistantMessageId, role: "assistant", content: finalHtml,
        createdAt: new Date().toISOString(), sources: searchMetadata?.sources, searchUsed,
        enhancedPrompt: enhancedPrompt || undefined,
        enhancedThinking: enhancedThinking || undefined
      }]);
      setStreamingMessage(undefined);
      setIsWaitingForFirstChunk(false);

      // Save assistant message to DB
      void saveMessage(convId, "assistant", finalHtml, searchMetadata?.sources, searchUsed);
      // Update title if first message
      if (nextMessages.length === 1) {
        try {
          await fetch(`/api/conversations/${convId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: truncateTitle(prompt || "Sent an image") })
          });
          void loadConversations();
        } catch { /* silent */ }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to send message";
      setStreamingMessage(undefined);
      setIsWaitingForFirstChunk(false);
      setIsEnhancingPrompt(false);
      const errContent = createClientErrorHtml("Client request failed", errorMessage);
      setMessages((cur) => [...cur, {
        id: createMessageId(), role: "assistant", content: errContent, createdAt: new Date().toISOString()
      }]);
      void saveMessage(convId, "assistant", errContent);
    } finally {
      setIsSending(false);
    }
  }

  const handleScroll = useCallback(() => {
    const el = chatBodyRef.current;
    if (!el || !activeConversationId || isRestoringScrollRef.current) return;
    sessionStorage.setItem(`aioph_scroll_${activeConversationId}`, String(el.scrollTop));
  }, [activeConversationId]);

  function startNewChat(): void {
    setMessages([]);
    setActiveConversationId(null);
    setIsWaitingForFirstChunk(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("aioph_active_conversation_id");
    }
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsHistoryOpen(false);
    }
  }

  function clearConversation(): void {
    if (activeConversationId) {
      void deleteConv(activeConversationId);
    }
    startNewChat();
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setInputValue(event.target.value);
    autoResizeTextarea(event.target);
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  // ── Render ──

  return (
    <div className="app-shell">
      {/* ── Sidebar (inline) ── */}
      <div className={`history-panel${isHistoryOpen ? " open" : ""}`}>
        <div className="history-header">
          <span className="history-title">HISTORY</span>
          <button className="header-button" type="button" onClick={() => setIsHistoryOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <button className="history-new-btn" type="button" onClick={startNewChat}>
          <Plus size={14} />
          <span>New Chat</span>
        </button>
        <div className="history-list">
          {conversations.length === 0 ? (
            <p className="history-empty">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`history-item${activeConversationId === conv.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  className="history-item-btn"
                  onClick={() => void loadConversation(conv.id)}
                >
                  <MessageSquare size={14} />
                  <span>{conv.title}</span>
                </button>
                <button
                  type="button"
                  className="history-item-delete"
                  onClick={(e) => { e.stopPropagation(); void deleteConv(conv.id); }}
                  aria-label="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="main-content">
        {/* ── Header ── */}
        <header className="chat-header">
          <div className="chat-header-left">
            <button className="header-button" type="button" onClick={() => setIsHistoryOpen(!isHistoryOpen)} aria-label="Chat history">
              <MessageSquare size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="AIOPH" className="chat-header-logo" />
            <span className="chat-header-title">AIOPH</span>
          </div>
          <div className="chat-header-right">
            <button className="header-button" type="button" onClick={() => setIsDrawerOpen(true)} aria-label="Settings">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* ── Chat Body ── */}
        <div ref={chatBodyRef} className="chat-body" onScroll={handleScroll}>
          {isAtWelcomeState ? (
            <div className="welcome-screen">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="AIOPH" className="welcome-logo" />
              <h1 className="welcome-title">AIOPH</h1>
              <p className="welcome-subtitle">Local AI Assistant</p>
              <div className="suggestion-strip">
                {randomSuggestions.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void sendMessage(prompt)} disabled={isSending}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message-row ${message.role}`}>
                  {message.role === "user" ? (
                    <div className="user-message-container">
                      {(() => {
                        const { text, imageUrls } = parseUserMessageContent(message.content);
                        return (
                          <>
                            {imageUrls.length > 0 && (
                              <div className="user-message-images">
                                {imageUrls.map((url, i) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={i} src={url} alt="User upload" className="user-message-image" />
                                ))}
                              </div>
                            )}
                            {text && <div className="user-message">{text}</div>}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="assistant-message">
                      {message.enhancedPrompt && (
                        <EnhancedPromptBadge
                          enhancedPrompt={message.enhancedPrompt}
                          thinking={message.enhancedThinking ?? ""}
                        />
                      )}
                      <HtmlMessage html={message.content} />
                      <SourceChips sources={message.sources ?? []} />
                      <MessageCopyButton html={message.content} />
                    </div>
                  )}
                </article>
              ))}

              {isWaitingForFirstChunk && !streamingMessage?.content ? (
                <article key="typing-indicator" className="message-row assistant">
                  <div className="assistant-message">
                    <div className="dot-matrix-loader-wrap">
                      {isEnhancingPrompt ? (
                        <>
                          <DotMatrixLoader
                            size={36}
                            colorOn="rgba(255,255,255,0.9)"
                            colorOff="rgba(255,255,255,0.06)"
                          />
                          <span className="dot-matrix-label">Enhancing prompt…</span>
                        </>
                      ) : (
                        <>
                          <DotMatrixLoader
                            size={36}
                            colorOn="rgba(255,255,255,0.9)"
                            colorOff="rgba(255,255,255,0.06)"
                          />
                          <span className="dot-matrix-label">Thinking…</span>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ) : null}

              {streamingMessage && streamingMessage.content ? (
                <article key="streaming-message" className="message-row assistant">
                  <div className="assistant-message assistant-message-streaming">
                    {streamingMessage.enhancedPrompt && (
                      <EnhancedPromptBadge
                        enhancedPrompt={streamingMessage.enhancedPrompt}
                        thinking={streamingMessage.enhancedThinking ?? ""}
                      />
                    )}
                    <HtmlMessage html={streamingMessage.content} isStreaming />
                    {isSending ? (
                      <div className="dot-matrix-loader-wrap" style={{ marginTop: 12 }}>
                        <DotMatrixLoader
                          size={28}
                          colorOn="rgba(255,255,255,0.75)"
                          colorOff="rgba(255,255,255,0.05)"
                        />
                      </div>
                    ) : null}
                  </div>
                </article>
              ) : null}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Composer ── */}
        <div className="composer">
          <div className="composer-container">
            {attachedImages.length > 0 && (
              <div className="image-previews">
                {attachedImages.map((img, index) => (
                  <div key={index} className="image-preview-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="Preview" />
                    <button
                      type="button"
                      className="remove-image-btn"
                      onClick={() => removeAttachedImage(index)}
                      aria-label="Remove image"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form className="composer-inner" onSubmit={(e) => { e.preventDefault(); void sendMessage(); }}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                multiple
                onChange={(e) => handleImageUpload(e.target.files)}
              />
              <button
                type="button"
                className="attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                aria-label="Attach image"
              >
                <Plus size={16} />
              </button>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleTextareaKeyDown}
                onPaste={handlePaste}
                placeholder="Type your question..."
                rows={1}
                disabled={isSending}
              />
              <button
                className="send-button"
                type="submit"
                disabled={isSending || (!inputValue.trim() && attachedImages.length === 0)}
                aria-label="Send"
              >
                <Send size={14} />
              </button>
            </form>
            <div className="composer-toolbar">
              <button
                type="button"
                className={`deep-research-toggle${deepResearchMode ? " active" : ""}`}
                onClick={() => setDeepResearchMode(!deepResearchMode)}
                disabled={isSending}
              >
                <Sparkles size={12} className={deepResearchMode ? "enhancing-icon" : ""} />
                <span>Deep Research</span>
              </button>
              <span className="composer-hint">Enter to send · Shift+Enter for new line</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Settings Drawer Overlay ── */}
      <div className={`drawer-overlay${isDrawerOpen ? " open" : ""}`} onClick={() => setIsDrawerOpen(false)} />

      {/* ── Settings Drawer ── */}
      <aside className={`settings-drawer${isDrawerOpen ? " open" : ""}`} aria-label="Settings">
        <div className="drawer-header">
          <span className="drawer-header-title">SETTINGS</span>
          <button className="drawer-close" type="button" onClick={() => setIsDrawerOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <section className="control-section">
            <div className="section-heading">
              <Activity size={13} style={{ marginRight: 6, flexShrink: 0 }} />
              STATUS
              <button type="button" onClick={() => void refreshSystemStatus()}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 4 }} title="Refresh">
                <RefreshCw size={12} />
              </button>
            </div>
            <div className={`status-readout${isConnected ? " status-online" : " status-offline"}`}>
              {isConnected ? <Activity size={14} /> : <WifiOff size={14} />}
              <span>{isConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <Code2 size={13} style={{ marginRight: 6, flexShrink: 0 }} />
              MODEL
            </div>
            {availableModels.length > 0 ? (
              <select className="field" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {availableModels.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            ) : (
              <input className="field" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} placeholder="Load model in LM Studio" />
            )}
            <div className="range-field">
              <label><span>Temperature</span><strong>{temperature.toFixed(1)}</strong></label>
              <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <Globe size={13} style={{ marginRight: 6, flexShrink: 0 }} />
              INTERNET
            </div>
            <div className={`segmented-control${deepResearchMode ? " disabled" : ""}`} role="group" aria-label="Search mode">
              {(["auto", "on", "off"] as SearchMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={searchMode === mode ? "active" : ""}
                  onClick={() => !deepResearchMode && setSearchMode(mode)}
                  disabled={deepResearchMode}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            {deepResearchMode ? (
              <p className="microcopy" style={{ color: "var(--color-text-muted)" }}>Deep Research handles searches automatically.</p>
            ) : (
              <p className="microcopy">Auto searches when questions mention current events.</p>
            )}
          </section>

          <div className="drawer-actions">
            <button className="utility-button" type="button" onClick={() => exportConversationAsHtml(messages)}>
              <Download size={13} /><span>Export</span>
            </button>
            <button className="utility-button" type="button" onClick={clearConversation}>
              <Trash2 size={13} /><span>Clear</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
