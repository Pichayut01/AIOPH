import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// --- Types ---

export interface UserMemory {
  id: string;
  memory_text: string;
  category: string;
  created_at: string;
  updated_at: string;
  embedding?: string; // Stored as serialized JSON string of number[]
}

// --- Database Access (reuses the same singleton DB file) ---

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "aioph.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Ensure table exists (idempotent)
  db.exec(`
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
  `);

  // Migrate existing table to include embedding column if it doesn't exist
  try {
    db.exec("ALTER TABLE user_memories ADD COLUMN embedding TEXT;");
  } catch {
    // Column already exists or table does not exist yet
  }

  return db;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// --- Memory CRUD ---

export function getAllMemories(): UserMemory[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, memory_text, category, created_at, updated_at, embedding FROM user_memories ORDER BY category ASC, updated_at DESC"
  ).all() as UserMemory[];
}

export function getMemoriesByCategory(category: string): UserMemory[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, memory_text, category, created_at, updated_at, embedding FROM user_memories WHERE category = ? ORDER BY updated_at DESC"
  ).all(category) as UserMemory[];
}

export function addMemory(memoryText: string, category: string, embedding?: number[]): UserMemory {
  const database = getDb();
  const id = generateId();
  const now = nowIso();
  const embeddingStr = embedding ? JSON.stringify(embedding) : null;

  database.prepare(
    "INSERT INTO user_memories (id, memory_text, category, created_at, updated_at, embedding) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, memoryText, category, now, now, embeddingStr);

  return { id, memory_text: memoryText, category, created_at: now, updated_at: now, embedding: embeddingStr ?? undefined };
}

export function updateMemory(id: string, memoryText: string, embedding?: number[]): boolean {
  const database = getDb();
  const now = nowIso();
  const embeddingStr = embedding ? JSON.stringify(embedding) : null;

  let result;
  if (embeddingStr) {
    result = database.prepare(
      "UPDATE user_memories SET memory_text = ?, embedding = ?, updated_at = ? WHERE id = ?"
    ).run(memoryText, embeddingStr, now, id);
  } else {
    result = database.prepare(
      "UPDATE user_memories SET memory_text = ?, updated_at = ? WHERE id = ?"
    ).run(memoryText, now, id);
  }
  return result.changes > 0;
}

export function deleteMemory(id: string): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM user_memories WHERE id = ?").run(id);
  return result.changes > 0;
}

export function clearAllMemories(): number {
  const database = getDb();
  const result = database.prepare("DELETE FROM user_memories").run();
  return result.changes;
}

export function getMemoryCount(): number {
  const database = getDb();
  const row = database.prepare("SELECT COUNT(*) as count FROM user_memories").get() as { count: number };
  return row.count;
}

/**
 * Token-based keyword overlap check.
 * Used as a fallback if embeddings are not available.
 */
export function findSimilarMemoryInCategory(category: string, newText: string): UserMemory | null {
  const database = getDb();
  const existing = database.prepare(
    "SELECT id, memory_text, category, created_at, updated_at FROM user_memories WHERE category = ? ORDER BY updated_at DESC"
  ).all(category) as UserMemory[];

  if (existing.length === 0) return null;

  // Simple keyword overlap check: tokenize both texts, find the one with highest overlap ratio
  const newTokens = new Set(
    newText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(t => t.length > 2)
  );

  if (newTokens.size === 0) return null;

  let bestMatch: UserMemory | null = null;
  let bestOverlap = 0;

  for (const mem of existing) {
    const memTokens = new Set(
      mem.memory_text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(t => t.length > 2)
    );

    let overlap = 0;
    for (const token of newTokens) {
      if (memTokens.has(token)) overlap++;
    }

    const overlapRatio = overlap / Math.max(newTokens.size, 1);
    if (overlapRatio > bestOverlap && overlapRatio >= 0.4) {
      bestOverlap = overlapRatio;
      bestMatch = mem;
    }
  }

  return bestMatch;
}

/**
 * Calculate Cosine Similarity between two numeric vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  if (vecA.length !== vecB.length) return 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find a memory in the same category that is semantically similar using Cosine Similarity.
 * Used for deduplication during memory extraction.
 */
export function findSemanticallySimilarMemory(
  category: string,
  newEmbedding: number[],
  threshold = 0.82
): UserMemory | null {
  const database = getDb();
  const existing = database.prepare(
    "SELECT id, memory_text, category, created_at, updated_at, embedding FROM user_memories WHERE category = ?"
  ).all(category) as UserMemory[];

  if (existing.length === 0) return null;

  let bestMatch: UserMemory | null = null;
  let bestSimilarity = 0;

  for (const mem of existing) {
    if (!mem.embedding) continue;
    try {
      const embeddingArray = JSON.parse(mem.embedding) as number[];
      if (embeddingArray.length !== newEmbedding.length) continue;

      const similarity = cosineSimilarity(newEmbedding, embeddingArray);
      if (similarity > bestSimilarity && similarity >= threshold) {
        bestSimilarity = similarity;
        bestMatch = mem;
      }
    } catch {
      // Ignore malformed JSON embeddings
    }
  }

  return bestMatch;
}
