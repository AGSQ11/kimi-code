/**
 * Proactive memory extraction from a completed assistant turn.
 *
 * Uses the agent's current LLM with the prompt in `./extract.md` to propose
 * up to 3 durable facts from the most recent user/assistant exchange.
 */

import type { Message } from '@moonshot-ai/kosong';

import type { LLM } from '../../loop';
import EXTRACTION_PROMPT from './extract.md?raw';

export interface ProposedMemory {
  readonly content: string;
  readonly category?:
    | 'user-preference'
    | 'project-fact'
    | 'decision'
    | 'learning'
    | 'critique-finding'
    | 'comparison'
    | 'eval';
  readonly tags?: string[];
}

export interface MemoryExtractionContext {
  /** Text of the user prompt that started the turn. */
  readonly userText: string;
  /** Text of the assistant's response, excluding tool internals. */
  readonly assistantText: string;
  /** Abort signal for the extraction LLM call. */
  readonly signal?: AbortSignal | undefined;
}

interface ExtractionResult {
  readonly memories: ProposedMemory[];
}

const MAX_PROPOSED_MEMORIES = 3;

/**
 * Extract durable facts from the last turn using the agent's current LLM.
 * Returns 0-3 proposed memories. If the LLM call fails or returns no memories,
 * returns an empty list silently.
 */
export async function extractMemories(
  llm: LLM,
  context: MemoryExtractionContext,
): Promise<ProposedMemory[]> {
  if (context.signal?.aborted) return [];

  const userMessage = buildExtractionUserMessage(context.userText, context.assistantText);
  if (userMessage.content.length === 0) return [];

  try {
    const collected: string[] = [];
    await llm.chat({
      messages: [userMessage],
      tools: [],
      signal: context.signal ?? new AbortController().signal,
      systemPrompt: EXTRACTION_PROMPT,
      onTextPart: (part) => {
        collected.push(part.text);
      },
    });

    const raw = collected.join(' ').trim();
    return parseExtractedMemories(raw);
  } catch {
    return [];
  }
}

function buildExtractionUserMessage(userText: string, assistantText: string): Message {
  const parts: string[] = [];
  if (userText.length > 0) {
    parts.push(`User:\n${userText}`);
  }
  if (assistantText.length > 0) {
    parts.push(`Assistant:\n${assistantText}`);
  }
  return {
    role: 'user',
    content: [{ type: 'text', text: parts.join('\n\n') }],
    toolCalls: [],
  };
}

/**
 * Parse the JSON output of an LLM-based extractor. Falls back to an empty
 * list if the payload is malformed.
 */
export function parseExtractedMemories(raw: string): ProposedMemory[] {
  try {
    const parsed = JSON.parse(raw) as Partial<ExtractionResult>;
    const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
    return deduplicateAndLimit(
      memories
        .filter((m): m is ProposedMemory & { content: string } => typeof m.content === 'string' && m.content.length > 0)
        .map((m) => ({
          content: m.content,
          category: normalizeCategory(m.category),
          tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === 'string') : undefined,
        })),
    );
  } catch {
    return [];
  }
}

function normalizeCategory(
  category: string | undefined,
): ProposedMemory['category'] | undefined {
  switch (category) {
    case 'user-preference':
    case 'project-fact':
    case 'decision':
    case 'learning':
    case 'critique-finding':
    case 'comparison':
    case 'eval':
      return category;
    default:
      return undefined;
  }
}

function deduplicateAndLimit(memories: ProposedMemory[]): ProposedMemory[] {
  const seen = new Set<string>();
  const result: ProposedMemory[] = [];
  for (const memory of memories) {
    const key = memory.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(memory);
    if (result.length >= MAX_PROPOSED_MEMORIES) break;
  }
  return result;
}
