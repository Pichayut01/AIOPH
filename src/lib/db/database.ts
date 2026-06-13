import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// --- Types ---

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources_json: string | null;
  search_used: number;
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: DbMessage[];
}

// --- Database Singleton ---

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "aioph.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources_json TEXT,
      search_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);
  `);

  return db;
}

// --- Helpers ---

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// --- Conversation CRUD ---

export function createConversation(title = "New Chat"): Conversation {
  const database = getDb();
  const id = generateId();
  const now = nowIso();

  database.prepare(
    "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, title, now, now);

  return { id, title, created_at: now, updated_at: now };
}

export function listConversations(limit = 50): Conversation[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ?"
  ).all(limit) as Conversation[];
}

export function getConversation(id: string): ConversationWithMessages | null {
  const database = getDb();

  const conversation = database.prepare(
    "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?"
  ).get(id) as Conversation | undefined;

  if (!conversation) return null;

  const messages = database.prepare(
    "SELECT id, conversation_id, role, content, sources_json, search_used, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).all(id) as DbMessage[];

  return { ...conversation, messages };
}

export function updateConversationTitle(id: string, title: string): void {
  const database = getDb();
  database.prepare(
    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?"
  ).run(title, nowIso(), id);
}

export function deleteConversation(id: string): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return result.changes > 0;
}

export function touchConversation(id: string): void {
  const database = getDb();
  database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(nowIso(), id);
}

// --- Message CRUD ---

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: unknown,
  sourcesJson: string | null = null,
  searchUsed = false
): DbMessage {
  const database = getDb();
  const id = generateId();
  const now = nowIso();
  const serializedContent = typeof content === "string" ? content : JSON.stringify(content);

  database.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, sources_json, search_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, conversationId, role, serializedContent, sourcesJson, searchUsed ? 1 : 0, now);

  // Touch the conversation to update its updated_at
  touchConversation(conversationId);

  return {
    id,
    conversation_id: conversationId,
    role,
    content: serializedContent,
    sources_json: sourcesJson,
    search_used: searchUsed ? 1 : 0,
    created_at: now
  };
}

export function getMessages(conversationId: string): DbMessage[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, conversation_id, role, content, sources_json, search_used, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).all(conversationId) as DbMessage[];
}
