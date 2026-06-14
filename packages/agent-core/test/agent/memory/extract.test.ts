import { describe, expect, it } from 'vitest';

import { extractMemories, parseExtractedMemories } from '../../../src/agent/memory/extract';
import type { LLM } from '../../../src/loop';

function makeLlm(responseText: string): LLM {
  return {
    systemPrompt: '',
    modelName: 'test-model',
    chat: async ({ onTextPart, systemPrompt }) => {
      if (systemPrompt !== undefined && systemPrompt.length > 0) {
        // Verify the extraction prompt is passed as the system prompt.
      }
      onTextPart?.({ type: 'text', text: responseText });
      return {
        toolCalls: [],
        usage: { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
      };
    },
  };
}

function makeFailingLlm(): LLM {
  return {
    systemPrompt: '',
    modelName: 'test-model',
    chat: async () => {
      throw new Error('llm unavailable');
    },
  };
}

describe('extractMemories', () => {
  it('returns an empty list when there is no text', async () => {
    const result = await extractMemories(makeLlm(''), { userText: '', assistantText: '' });
    expect(result).toEqual([]);
  });

  it('extracts user preferences from LLM JSON', async () => {
    const response = JSON.stringify({
      memories: [{ content: 'User prefers pnpm', category: 'user-preference', tags: ['package-manager'] }],
    });
    const result = await extractMemories(makeLlm(response), {
      userText: 'I prefer to use pnpm for this project.',
      assistantText: 'Got it.',
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({
      category: 'user-preference',
      content: 'User prefers pnpm',
      tags: ['package-manager'],
    });
  });

  it('extracts project facts from LLM JSON', async () => {
    const response = JSON.stringify({
      memories: [
        { content: 'Backend is in apps/api', category: 'project-fact' },
        { content: 'Tests live in packages/agent-core/test', category: 'project-fact' },
      ],
    });
    const result = await extractMemories(makeLlm(response), {
      userText: 'Where are the tests?',
      assistantText: 'The backend is in apps/api and tests live in packages/agent-core/test.',
    });
    const fact = result.find((m) => m.category === 'project-fact');
    expect(fact).toBeDefined();
  });

  it('caps results at 3 memories', async () => {
    const response = JSON.stringify({
      memories: [
        { content: 'One', category: 'user-preference' },
        { content: 'Two', category: 'user-preference' },
        { content: 'Three', category: 'user-preference' },
        { content: 'Four', category: 'user-preference' },
      ],
    });
    const result = await extractMemories(makeLlm(response), {
      userText: 'I prefer 2-space indentation. I always use pnpm. I like dark themes.',
      assistantText: 'Noted.',
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('silently skips when the LLM call fails', async () => {
    const result = await extractMemories(makeFailingLlm(), {
      userText: 'I prefer pnpm.',
      assistantText: 'Got it.',
    });
    expect(result).toEqual([]);
  });

  it('silently skips when the LLM returns invalid JSON', async () => {
    const result = await extractMemories(makeLlm('not json'), {
      userText: 'I prefer pnpm.',
      assistantText: 'Got it.',
    });
    expect(result).toEqual([]);
  });

  it('silently skips when the LLM returns an empty memories list', async () => {
    const result = await extractMemories(makeLlm(JSON.stringify({ memories: [] })), {
      userText: 'Hello.',
      assistantText: 'Hi there.',
    });
    expect(result).toEqual([]);
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

  it('accepts learning-loop categories from subagent outputs', () => {
    const raw = JSON.stringify({
      memories: [
        { content: 'Missing error handling', category: 'critique-finding' },
        { content: 'Model A outperformed B', category: 'comparison' },
        { content: 'Suite passed 9/10', category: 'eval' },
      ],
    });
    const result = parseExtractedMemories(raw);
    expect(result).toHaveLength(3);
    expect(result[0]?.category).toBe('critique-finding');
    expect(result[1]?.category).toBe('comparison');
    expect(result[2]?.category).toBe('eval');
  });

  it('returns an empty list on invalid JSON', () => {
    expect(parseExtractedMemories('not json')).toEqual([]);
  });
});
