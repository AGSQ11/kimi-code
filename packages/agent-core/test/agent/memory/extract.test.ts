import { describe, expect, it } from 'vitest';

import { extractMemories, parseExtractedMemories } from '../../../src/agent/memory/extract';

describe('extractMemories', () => {
  it('returns an empty list when there is no text', () => {
    expect(extractMemories({ userText: '', assistantText: '' })).toEqual([]);
  });

  it('extracts user preferences', () => {
    const result = extractMemories({
      userText: 'I prefer to use pnpm for this project.',
      assistantText: 'Got it.',
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({
      category: 'user-preference',
      content: expect.stringContaining('pnpm'),
    });
  });

  it('extracts project facts', () => {
    const result = extractMemories({
      userText: 'Where are the tests?',
      assistantText: 'The backend is in apps/api and tests live in packages/agent-core/test.',
    });
    const fact = result.find((m) => m.category === 'project-fact');
    expect(fact).toBeDefined();
    expect(fact?.content).toMatch(/apps\/api|packages\/agent-core\/test/);
  });

  it('caps results at 3 memories', () => {
    const result = extractMemories({
      userText:
        'I prefer 2-space indentation. I always use pnpm. I like dark themes. This project uses vitest. Backend is in apps/api.',
      assistantText: 'Noted.',
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe('parseExtractedMemories', () => {
  it('parses valid LLM extraction JSON', () => {
    const raw = JSON.stringify({
      memories: [
        { content: 'Use pnpm', category: 'user-preference', tags: ['package-manager'] },
        { content: 'Backend in apps/api', category: 'project-fact' },
      ],
    });
    const result = parseExtractedMemories(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      content: 'Use pnpm',
      category: 'user-preference',
      tags: ['package-manager'],
    });
  });

  it('ignores invalid categories and malformed entries', () => {
    const raw = JSON.stringify({
      memories: [
        { content: 'Valid memory', category: 'decision' },
        { content: 'Invalid category', category: 'unknown-category' },
        { content: '' },
      ],
    });
    const result = parseExtractedMemories(raw);
    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe('decision');
    expect(result[1]?.category).toBeUndefined();
  });

  it('returns an empty list on invalid JSON', () => {
    expect(parseExtractedMemories('not json')).toEqual([]);
  });
});
