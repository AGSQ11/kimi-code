/**
 * Long-term memory types for the "Second Brain" context store.
 *
 * Memories are local-only facts the agent can remember across sessions,
 * scoped either globally (user preferences) or to a project root
 * (project facts, decisions).
 */

export type MemoryCategory = string;

export interface Memory {
  readonly id: string;
  readonly content: string;
  readonly category: string | null;
  readonly project: string | null;
  readonly tags: readonly string[] | null;
  readonly source: string | null;
  readonly pinned: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly accessCount: number;
}

export interface RememberOptions {
  readonly content: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly project?: string;
  readonly source?: string;
}

export interface RecallOptions {
  readonly query: string;
  readonly category?: string;
  readonly project?: string;
  readonly includeGlobal?: boolean;
  readonly limit?: number;
}

export interface UpdateOptions {
  readonly id?: string;
  readonly query?: string;
  readonly content?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
}

export interface ForgetOptions {
  readonly id?: string;
  readonly query?: string;
  readonly category?: string;
  readonly project?: string;
}

export interface MemoryStoreOptions {
  readonly globalDbPath: string;
  readonly kaos: import('@moonshot-ai/kaos').Kaos;
  readonly cwd: string;
}
