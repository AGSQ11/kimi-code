import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '#/memory/store';
import { testKaos } from '../fixtures/test-kaos';

describe('MemoryStore', () => {
  let tempDir: string;
  let globalDbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kimi-memory-'));
    mkdirSync(join(tempDir, '.git'));
    globalDbPath = join(tempDir, 'global-memory.db');
    store = new MemoryStore({
      globalDbPath,
      kaos: testKaos.withCwd(tempDir),
      cwd: tempDir,
    });
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('remembers and recalls global memories', async () => {
    await store.remember({ content: 'I prefer pnpm', category: 'user-preference' });

    const results = await store.recall({ query: 'prefer pnpm' });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('I prefer pnpm');
    expect(results[0]?.category).toBe('user-preference');
    expect(results[0]?.project).toBeNull();
    expect(results[0]?.pinned).toBe(false);
  });

  it('remembers project-scoped memories', async () => {
    await store.remember({
      content: 'Use strict TypeScript',
      category: 'project-fact',
      project: tempDir,
    });

    const results = await store.recall({ query: 'typescript', project: tempDir });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('Use strict TypeScript');
    expect(results[0]?.project).toBe(tempDir);
  });

  it('ranks project memories before global memories when a project is active', async () => {
    await store.remember({ content: 'Global testing rule', category: 'learning' });
    await store.remember({
      content: 'Project testing rule',
      category: 'project-fact',
      project: tempDir,
    });

    const results = await store.recall({ query: 'testing rule', project: tempDir });
    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe('Project testing rule');
  });

  it('filters by category', async () => {
    await store.remember({ content: 'A', category: 'user-preference' });
    await store.remember({ content: 'B', category: 'project-fact' });

    const results = await store.recall({ query: '.', category: 'user-preference' });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('A');
  });

  it('updates a memory by id', async () => {
    const memory = await store.remember({ content: 'Old fact' });
    const updated = await store.update({ id: memory.id, content: 'New fact' });

    expect(updated?.content).toBe('New fact');
    const recalled = await store.recall({ query: 'New fact' });
    expect(recalled).toHaveLength(1);
  });

  it('updates the best matching memory by query', async () => {
    await store.remember({ content: 'Update me' });
    await store.remember({ content: 'Leave me alone' });

    const updated = await store.update({ query: 'Update me', content: 'Updated' });
    expect(updated?.content).toBe('Updated');

    const recalled = await store.recall({ query: 'Updated' });
    expect(recalled).toHaveLength(1);
  });

  it('forgets a memory by id', async () => {
    const memory = await store.remember({ content: 'Forget me' });
    const deleted = await store.forget({ id: memory.id });

    expect(deleted).toBe(1);
    const recalled = await store.recall({ query: 'Forget me' });
    expect(recalled).toHaveLength(0);
  });

  it('ranks memories by BM25 relevance, not just recency', async () => {
    const oldRelevant = await store.remember({
      content: 'Deploy the app to production using the production deploy script',
      category: 'learning',
    });
    // Less relevant but more recent: contains one query term and many unrelated words.
    const newVague = await store.remember({
      content: 'We once talked about kubernetes clusters and briefly mentioned a deploy in passing',
      category: 'learning',
    });

    // Bump the relevant memory's timestamp so it is not more recent than the vague one.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await store.update({ id: oldRelevant.id, content: oldRelevant.content });

    const results = await store.recall({ query: 'deploy production' });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]?.content).toBe(oldRelevant.content);
    expect(results[1]?.content).toBe(newVague.content);
  });

  it('falls back to recency when the query is empty', async () => {
    await store.remember({ content: 'Older memory' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await store.remember({ content: 'Newer memory' });

    const results = await store.recall({ query: '' });
    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe('Newer memory');
  });

  it('lists all memories ordered by pinned then updated_at', async () => {
    const a = await store.remember({ content: 'A' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const b = await store.remember({ content: 'B' });
    await store.pin(a.id, true);

    const listed = await store.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe(a.id);
    expect(listed[0]?.pinned).toBe(true);
    expect(listed[1]?.id).toBe(b.id);
    expect(listed[1]?.pinned).toBe(false);
  });

  it('pins and unpins a memory', async () => {
    const memory = await store.remember({ content: 'Pin me' });

    const pinned = await store.pin(memory.id, true);
    expect(pinned?.pinned).toBe(true);
    expect((await store.list())[0]?.pinned).toBe(true);

    const unpinned = await store.pin(memory.id, false);
    expect(unpinned?.pinned).toBe(false);
    expect((await store.list())[0]?.pinned).toBe(false);
  });

  it('returns undefined when pinning an unknown id', async () => {
    const result = await store.pin('mem--global--unknown', true);
    expect(result).toBeUndefined();
  });

  it('ranks pinned memories first regardless of query relevance', async () => {
    await store.remember({ content: 'Use pnpm for package management', category: 'user-preference' });
    const pinned = await store.remember({ content: 'Use vitest for tests', category: 'user-preference' });
    await store.pin(pinned.id, true);

    const results = await store.recall({ query: 'pnpm package management' });
    expect(results[0]?.content).toBe('Use vitest for tests');
    expect(results[0]?.pinned).toBe(true);
  });
});
