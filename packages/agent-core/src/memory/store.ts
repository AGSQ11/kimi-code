import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'pathe';
import { DatabaseSync } from 'node:sqlite';

import type { Kaos } from '@moonshot-ai/kaos';

import type {
  ForgetOptions,
  Memory,
  MemoryStoreOptions,
  RecallOptions,
  RememberOptions,
  UpdateOptions,
} from './types';

interface RawMemoryRow {
  id: string;
  content: string;
  category: string | null;
  project: string | null;
  tags: string | null;
  source: string | null;
  pinned: number;
  created_at: number;
  updated_at: number;
  access_count: number;
}

export class MemoryStore {
  private readonly globalDbPath: string;
  private readonly kaos: Kaos;
  private readonly cwd: string;
  private projectDbPromise: Promise<string | undefined> | undefined;
  private projectRoot: string | undefined;

  constructor(options: MemoryStoreOptions) {
    this.globalDbPath = options.globalDbPath;
    this.kaos = options.kaos;
    this.cwd = options.cwd;
    // Keep the store lazy: do not touch the filesystem (or create parent
    // directories) until an operation actually needs the database. This avoids
    // permission errors in CI/test environments that never read or write memory.
  }

  getProjectRoot(): string | undefined {
    return this.projectRoot;
  }

  async remember(options: RememberOptions): Promise<Memory> {
    const id = generateMemoryId(options);
    const now = Date.now();
    const tags = options.tags !== undefined && options.tags.length > 0 ? options.tags.join(',') : null;
    const category = options.category ?? null;
    const project = options.project ?? null;
    const source = options.source ?? null;

    const dbPath = project !== null ? (await this.projectDbPath()) ?? this.globalDbPath : this.globalDbPath;

    return withDb(dbPath, (db) => {
      const insert = db.prepare(
        'INSERT INTO memories (id, content, category, project, tags, source, pinned, created_at, updated_at, access_count) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      insert.run(id, options.content, category, project, tags, source, 0, now, now, 0);

      return {
        id,
        content: options.content,
        category,
        project,
        tags: options.tags ?? null,
        source,
        pinned: false,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      };
    });
  }

  async recall(options: RecallOptions): Promise<Memory[]> {
    const limit = options.limit ?? 5;
    const includeGlobal = options.includeGlobal ?? true;
    const projectDbPath = await this.projectDbPath();

    const projectMemories =
      options.project !== undefined && projectDbPath !== undefined
        ? await withDb(projectDbPath, (db) => searchDatabase(db, options.query, options.category))
        : [];
    const globalMemories =
      includeGlobal || options.project === undefined
        ? await withDb(this.globalDbPath, (db) => searchDatabase(db, options.query, options.category))
        : [];

    const merged = mergeResults(projectMemories, globalMemories, options.project);
    return merged.slice(0, limit);
  }

  async list(): Promise<Memory[]> {
    const projectDbPath = await this.projectDbPath();
    const projectMemories =
      projectDbPath !== undefined
        ? await withDb(projectDbPath, (db) => listDatabase(db))
        : [];
    const globalMemories = await withDb(this.globalDbPath, (db) => listDatabase(db));

    const seen = new Set<string>();
    const result: Memory[] = [];
    for (const memory of [...projectMemories, ...globalMemories]) {
      if (seen.has(memory.id)) continue;
      seen.add(memory.id);
      result.push(memory);
    }
    return result;
  }

  async update(options: UpdateOptions): Promise<Memory | undefined> {
    if (options.id !== undefined) {
      return this.updateById(options.id, options);
    }
    if (options.query !== undefined) {
      const matches = await this.recall({ query: options.query, category: options.category, limit: 1 });
      const match = matches[0];
      if (match === undefined) return undefined;
      return this.updateById(match.id, options);
    }
    return undefined;
  }

  private async updateById(id: string, options: UpdateOptions): Promise<Memory | undefined> {
    const dbPath = await this.pathForId(id);

    return withDb(dbPath, (db) => {
      const existing = getById(db, id);
      if (existing === undefined) return undefined;

      const content = options.content ?? existing.content;
      const category = options.category !== undefined ? (options.category ?? null) : existing.category;
      const tags =
        options.tags !== undefined
          ? options.tags.length > 0
            ? options.tags.join(',')
            : null
          : existing.tags?.join(',') ?? null;
      const now = Date.now();

      const update = db.prepare(
        'UPDATE memories SET content = ?, category = ?, tags = ?, updated_at = ? WHERE id = ?',
      );
      update.run(content, category, tags, now, id);

      return {
        ...existing,
        content,
        category,
        tags: options.tags ?? existing.tags,
        updatedAt: now,
      };
    });
  }

  async pin(id: string, pinned: boolean): Promise<Memory | undefined> {
    const dbPath = await this.pathForId(id);
    return withDb(dbPath, (db) => {
      const existing = getById(db, id);
      if (existing === undefined) return undefined;

      const update = db.prepare('UPDATE memories SET pinned = ?, updated_at = ? WHERE id = ?');
      const now = Date.now();
      update.run(pinned ? 1 : 0, now, id);

      return {
        ...existing,
        pinned,
        updatedAt: now,
      };
    });
  }

  async forget(options: ForgetOptions): Promise<number> {
    if (options.id !== undefined) {
      const id = options.id;
      const dbPath = await this.pathForId(id);
      return withDb(dbPath, (db) => {
        const statement = db.prepare('DELETE FROM memories WHERE id = ?');
        const result = statement.run(id);
        return Number(result.changes);
      });
    }

    if (options.query !== undefined) {
      const matches = await this.recall({
        query: options.query,
        category: options.category,
        project: options.project,
        includeGlobal: true,
        limit: Number.MAX_SAFE_INTEGER,
      });
      let deleted = 0;
      for (const match of matches) {
        const dbPath = await this.pathForId(match.id);
        const count = await withDb(dbPath, (db) => {
          const statement = db.prepare('DELETE FROM memories WHERE id = ?');
          const result = statement.run(match.id);
          return Number(result.changes);
        });
        deleted += count;
      }
      return deleted;
    }

    return 0;
  }

  close(): void {
    // Handles are opened per-operation and released immediately, so there is
    // nothing persistent to close. This method remains for API symmetry.
  }

  private async pathForId(id: string): Promise<string> {
    if (id.includes('--project--')) {
      const path = await this.projectDbPath();
      if (path !== undefined) return path;
    }
    return this.globalDbPath;
  }

  private async projectDbPath(): Promise<string | undefined> {
    if (this.projectDbPromise === undefined) {
      this.projectDbPromise = this.initProjectDb(this.kaos, this.cwd);
    }
    return this.projectDbPromise;
  }

  private async initProjectDb(kaos: Kaos, cwd: string): Promise<string | undefined> {
    const root = await findProjectRoot(kaos, cwd);
    if (root === undefined) return undefined;
    this.projectRoot = root;
    return join(root, '.kimi-code', 'memory.db');
  }
}

async function findProjectRoot(kaos: Kaos, start: string): Promise<string | undefined> {
  let current = start;
  while (true) {
    try {
      await kaos.stat(join(current, '.git'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

function openDatabase(path: string): DatabaseSync {
  ensureDirectory(dirname(path));
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT,
      project TEXT,
      tags TEXT,
      source TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migrate existing tables that predate the pinned column before creating
  // indexes that reference it.
  migrateAddPinnedColumn(db);

  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned);');

  // Full-text search using FTS5 for better relevance ranking than token overlap.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tags,
      category,
      content_rowid=rowid,
      tokenize='porter unicode61'
    );
  `);

  // Keep the FTS index in sync with the main table.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_insert
    AFTER INSERT ON memories
    BEGIN
      INSERT INTO memories_fts (rowid, content, tags, category)
      VALUES (new.rowid, new.content, new.tags, new.category);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_update
    AFTER UPDATE ON memories
    BEGIN
      UPDATE memories_fts
      SET content = new.content, tags = new.tags, category = new.category
      WHERE rowid = new.rowid;
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_delete
    AFTER DELETE ON memories
    BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
    END;
  `);

  // Migrate any memories that existed before FTS5 was added.
  migrateToFts5(db);

  return db;
}

function migrateToFts5(db: DatabaseSync): void {
  const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM memories_fts');
  const ftsCount = Number((countStmt.get() as { cnt: number }).cnt);
  if (ftsCount > 0) return;

  const rowsStmt = db.prepare('SELECT rowid, content, tags, category FROM memories');
  const rows = rowsStmt.all() as Array<{ rowid: number; content: string; tags: string | null; category: string | null }>;
  if (rows.length === 0) return;

  const insert = db.prepare('INSERT INTO memories_fts (rowid, content, tags, category) VALUES (?, ?, ?, ?)');
  for (const row of rows) {
    insert.run(row.rowid, row.content, row.tags ?? '', row.category ?? '');
  }
}

function migrateAddPinnedColumn(db: DatabaseSync): void {
  try {
    db.exec('ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned)');
  } catch {
    // Column already exists; ignore the error so idempotent migration stays cheap.
  }
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function withDb<T>(path: string, fn: (db: DatabaseSync) => T | Promise<T>): Promise<T> {
  const db = openDatabase(path);
  try {
    return Promise.resolve(fn(db));
  } finally {
    db.close();
  }
}

function generateMemoryId(options: RememberOptions): string {
  const now = Date.now();
  const nonce = randomBytes(4).toString('hex');
  const base = `${options.content}:${options.category ?? ''}:${options.project ?? ''}:${now}:${nonce}`;
  const hash = createHash('sha256').update(base).digest('hex').slice(0, 12);
  const scope = options.project !== undefined ? 'project' : 'global';
  return `mem--${scope}--${hash}`;
}

function listDatabase(db: DatabaseSync): Memory[] {
  const statement = db.prepare('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC');
  return (statement.all() as unknown as RawMemoryRow[]).map(rowToMemory);
}

function searchDatabase(db: DatabaseSync, query: string, category?: string): Memory[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    const statement = db.prepare(
      `SELECT * FROM memories WHERE 1=1 ${category !== undefined ? 'AND category = ?' : ''} ORDER BY pinned DESC, updated_at DESC LIMIT 100`,
    );
    const params = category !== undefined ? [category] : [];
    return (statement.all(...params) as unknown as RawMemoryRow[]).map(rowToMemory);
  }

  const matchExpression = tokens.map(escapeFts5Token).join(' OR ');
  const categoryClause = category !== undefined ? 'AND m.category = ?' : '';

  const statement = db.prepare(
    `SELECT m.*, bm25(memories_fts) AS rank ` +
      `FROM memories_fts ` +
      `JOIN memories AS m ON memories_fts.rowid = m.rowid ` +
      `WHERE memories_fts MATCH ? ${categoryClause} ` +
      `LIMIT 100`,
  );
  const params = category !== undefined ? [matchExpression, category] : [matchExpression];
  const rows = (statement.all(...params) as unknown as Array<RawMemoryRow & { rank: number }>).map((row) => ({
    memory: rowToMemory(row),
    rank: row.rank,
  }));

  // Pinned memories should always be available, even when they do not match
  // the current query terms.
  const matchedIds = new Set(rows.map(({ memory }) => memory.id));
  const pinnedCategoryClause = category !== undefined ? 'AND category = ?' : '';
  const pinnedParams = category !== undefined ? [category] : [];
  const pinnedStatement = db.prepare(
    `SELECT * FROM memories WHERE pinned = 1 ${pinnedCategoryClause}`,
  );
  const pinnedRows = pinnedStatement.all(...pinnedParams) as unknown as RawMemoryRow[];
  for (const row of pinnedRows) {
    const memory = rowToMemory(row);
    if (matchedIds.has(memory.id)) continue;
    rows.push({ memory, rank: 0 });
  }

  return rankMemories(rows);
}

function escapeFts5Token(token: string): string {
  // FTS5 treats double-quotes and * specially; quote tokens that contain them.
  if (/["*]/.test(token)) {
    return `"${token.replace(/"/g, '""')}"`;
  }
  return token;
}

function rankMemories(results: { memory: Memory; rank: number }[]): Memory[] {
  const now = Date.now();
  const scored = results.map(({ memory, rank }) => {
    // rank from bm25() is negative and lower (more negative) means better relevance.
    // Scale it up so relevance dominates recency/access.
    const relevance = -rank * 1000;
    const ageDays = (now - memory.updatedAt) / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 1 - ageDays / 365);
    const access = Math.min(memory.accessCount, 100) / 100;
    const pinnedBoost = memory.pinned ? 10000 : 0;
    const score = relevance + recency * 0.5 + access * 0.2 + pinnedBoost;
    return { memory, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.memory);
}

function mergeResults(
  projectMemories: Memory[],
  globalMemories: Memory[],
  currentProject?: string,
): Memory[] {
  const seen = new Set<string>();
  const result: Memory[] = [];

  const ordered = currentProject !== undefined ? [...projectMemories, ...globalMemories] : globalMemories;
  for (const memory of ordered) {
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    result.push(memory);
  }
  return result;
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/g) ?? [];
  return Array.from(new Set(tokens));
}

function getById(db: DatabaseSync, id: string): Memory | undefined {
  const statement = db.prepare('SELECT * FROM memories WHERE id = ?');
  const row = statement.get(id) as unknown as RawMemoryRow | undefined;
  return row === undefined ? undefined : rowToMemory(row);
}

function rowToMemory(row: RawMemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    project: row.project,
    tags: row.tags === null ? null : row.tags.split(',').filter((tag) => tag.length > 0),
    source: row.source,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accessCount: row.access_count,
  };
}
