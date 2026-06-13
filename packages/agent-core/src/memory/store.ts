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
  created_at: number;
  updated_at: number;
  access_count: number;
}

export class MemoryStore {
  private readonly globalDbPath: string;
  private projectDbPromise: Promise<string | undefined> | undefined;
  private projectRoot: string | undefined;

  constructor(options: MemoryStoreOptions) {
    this.globalDbPath = options.globalDbPath;
    // Initialize the schema and immediately release the handle so tests and
    // tooling can delete the parent directory on Windows.
    openDatabase(this.globalDbPath).close();
    this.projectDbPromise = this.initProjectDb(options.kaos, options.cwd);
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
        'INSERT INTO memories (id, content, category, project, tags, source, created_at, updated_at, access_count) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      insert.run(id, options.content, category, project, tags, source, now, now, 0);

      return {
        id,
        content: options.content,
        category,
        project,
        tags: options.tags ?? null,
        source,
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
    if (this.projectDbPromise === undefined) return undefined;
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);');
  return db;
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

function searchDatabase(db: DatabaseSync, query: string, category?: string): Memory[] {
  const tokens = tokenize(query);
  const categoryClause = category !== undefined ? 'AND category = ?' : '';
  const statement = db.prepare(
    `SELECT * FROM memories WHERE 1=1 ${categoryClause} ORDER BY updated_at DESC LIMIT 500`,
  );
  const params = category !== undefined ? [category] : [];
  const rows = (statement.all(...params) as unknown as RawMemoryRow[]).map(rowToMemory);

  if (tokens.length === 0) {
    return rows.slice(0, 100);
  }

  return rankMemories(rows, tokens);
}

function rankMemories(memories: Memory[], queryTokens: string[]): Memory[] {
  const now = Date.now();
  const scored = memories
    .map((memory) => {
      const text = `${memory.content} ${(memory.tags ?? []).join(' ')}`.toLowerCase();
      const matches = queryTokens.filter((token) => text.includes(token)).length;
      if (matches === 0) return undefined;
      const ageDays = (now - memory.updatedAt) / (1000 * 60 * 60 * 24);
      const recency = Math.max(0, 1 - ageDays / 365);
      const score = matches * 10 + recency * 2 + Math.min(memory.accessCount, 100) * 0.05;
      return { memory, score };
    })
    .filter((entry): entry is { memory: Memory; score: number } => entry !== undefined);
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accessCount: row.access_count,
  };
}
