import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// --- Types ---

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  summary?: string;
  summary_embedding?: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources_json: string | null;
  search_used: number;
  created_at: string;
  memory_saved: number; // 0 = no, 1 = yes
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT,
      summary_embedding TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources_json TEXT,
      search_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      memory_saved INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS user_memories (
      id TEXT PRIMARY KEY,
      memory_text TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      embedding TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memories_category
      ON user_memories(category);

    CREATE TABLE IF NOT EXISTS user_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_rag (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      text_content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_message_rag_message
      ON message_rag(message_id);
  `);

  // Migrate existing table to include embedding column if it doesn't exist
  try {
    db.exec("ALTER TABLE user_memories ADD COLUMN embedding TEXT;");
  } catch {
    // Column already exists or table does not exist yet
  }

  // Migrate conversations table to include summary columns if they don't exist
  try {
    db.exec("ALTER TABLE conversations ADD COLUMN summary TEXT;");
  } catch {
    // Column already exists or table does not exist yet
  }
  try {
    db.exec("ALTER TABLE conversations ADD COLUMN summary_embedding TEXT;");
  } catch {
    // Column already exists or table does not exist yet
  }

  // Migrate messages table to include memory_saved column if it doesn't exist
  try {
    db.exec("ALTER TABLE messages ADD COLUMN memory_saved INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // Column already exists or table does not exist yet
  }

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
    "SELECT id, title, created_at, updated_at, summary, summary_embedding FROM conversations ORDER BY updated_at DESC LIMIT ?"
  ).all(limit) as Conversation[];
}

export function getConversation(id: string): ConversationWithMessages | null {
  const database = getDb();

  const conversation = database.prepare(
    "SELECT id, title, created_at, updated_at, summary, summary_embedding FROM conversations WHERE id = ?"
  ).get(id) as Conversation | undefined;

  if (!conversation) return null;

  const messages = database.prepare(
    "SELECT id, conversation_id, role, content, sources_json, search_used, created_at, memory_saved FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).all(id) as DbMessage[];

  return { ...conversation, messages };
}

export function updateConversationTitle(id: string, title: string): void {
  const database = getDb();
  database.prepare(
    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?"
  ).run(title, nowIso(), id);
}

export function updateConversationSummary(id: string, summary: string, embeddingStr: string | null): void {
  const database = getDb();
  database.prepare(
    "UPDATE conversations SET summary = ?, summary_embedding = ? WHERE id = ?"
  ).run(summary, embeddingStr, id);
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
    "INSERT INTO messages (id, conversation_id, role, content, sources_json, search_used, created_at, memory_saved) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
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
    created_at: now,
    memory_saved: 0
  };
}

export function getMessages(conversationId: string): DbMessage[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, conversation_id, role, content, sources_json, search_used, created_at, memory_saved FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).all(conversationId) as DbMessage[];
}

export function getGlobalProfile(): string | null {
  const database = getDb();
  const row = database.prepare(
    "SELECT value FROM user_profile WHERE key = 'global_profile'"
  ).get() as { value: string } | undefined;
  return row ? row.value : null;
}

export function updateGlobalProfile(profileText: string): void {
  const database = getDb();
  const now = nowIso();
  database.prepare(
    "INSERT INTO user_profile (key, value, updated_at) VALUES ('global_profile', ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run(profileText, now);
}

export function addMessageRag(messageId: string, textContent: string, embedding: number[]): void {
  const database = getDb();
  const id = generateId();
  database.prepare(
    "INSERT INTO message_rag (id, message_id, text_content, embedding) VALUES (?, ?, ?, ?)"
  ).run(id, messageId, textContent, JSON.stringify(embedding));

  // Mark message as processed and saved
  database.prepare(
    "UPDATE messages SET memory_saved = 1 WHERE id = ?"
  ).run(messageId);
}

export interface RagItem {
  message_id: string;
  text_content: string;
  embedding: string;
  created_at: string;
  conversation_id: string;
  role: string;
}

export function getAllRagItems(excludeConversationId?: string): RagItem[] {
  const database = getDb();
  if (excludeConversationId) {
    return database.prepare(`
      SELECT r.message_id, r.text_content, r.embedding, r.created_at, m.conversation_id, m.role
      FROM message_rag r
      JOIN messages m ON r.message_id = m.id
      WHERE m.conversation_id != ?
    `).all(excludeConversationId) as RagItem[];
  } else {
    return database.prepare(`
      SELECT r.message_id, r.text_content, r.embedding, r.created_at, m.conversation_id, m.role
      FROM message_rag r
      JOIN messages m ON r.message_id = m.id
    `).all() as RagItem[];
  }
}
