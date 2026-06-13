/**
 * Proactive memory extraction from a completed assistant turn.
 *
 * The current implementation uses a fast, deterministic heuristic. In the
 * future this can be swapped for a lightweight LLM call using the prompt in
 * `./extract.md`.
 */

export interface ProposedMemory {
  readonly content: string;
  readonly category?: 'user-preference' | 'project-fact' | 'decision' | 'learning';
  readonly tags?: string[];
}

export interface MemoryExtractionContext {
  /** Text of the user prompt that started the turn. */
  readonly userText: string;
  /** Text of the assistant's response, excluding tool internals. */
  readonly assistantText: string;
}

interface ExtractionResult {
  readonly memories: ProposedMemory[];
}

const MAX_PROPOSED_MEMORIES = 3;

/**
 * Extract durable facts from the last turn. Returns 0-3 proposed memories.
 */
export function extractMemories(context: MemoryExtractionContext): ProposedMemory[] {
  const combined = `${context.userText}\n${context.assistantText}`;
  const normalized = combined
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  if (normalized.length === 0) return [];

  const findings: ProposedMemory[] = [];

  // Preference patterns: "I prefer X", "I like X", "always use X", etc.
  const preferencePatterns = [
    /(?:i(?:'m)?\s+(?:prefer|like|want|need|use)\s+(?:to\s+)?)([^.\n]{3,120})/gi,
    /(?:always|usually|generally)\s+(?:use|prefer|run|set)\s+([^.,\n]{3,120})/gi,
    /(?:don't|do not|never)\s+(?:use|run|set)\s+([^.,\n]{3,120})/gi,
    /(?:we|this\s+project|this\s+repo)\s+(?:use|uses|run|runs)\s+([^.,\n]{3,120})/gi,
  ];

  for (const pattern of preferencePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const content = (match[1] ?? '').trim();
      if (content.length > 0 && !findings.some((m) => m.content.includes(content))) {
        findings.push({
          content: `Preference: ${content}.`,
          category: 'user-preference',
          tags: ['preference'],
        });
      }
    }
  }

  // Project-fact patterns: "this repo uses X", "backend is in Y", etc.
  const projectPatterns = [
    /(?:this\s+(?:repo|project|codebase)|we)\s+(?:use|uses)\s+([^.\n]{3,120})/gi,
    /(?:backend|frontend|api|web|app|tests?)\s+(?:is\s+in|live\s+in|located\s+in)\s+([^.\n]{3,120})/gi,
  ];

  for (const pattern of projectPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const content = (match[1] ?? '').trim();
      if (content.length > 0 && !findings.some((m) => m.content.includes(content))) {
        findings.push({
          content: `Project fact: ${content}.`,
          category: 'project-fact',
          tags: ['project'],
        });
      }
    }
  }

  // Decision patterns: "let's go with X", "decided on X", etc.
  const decisionPatterns = [
    /(?:let['’]?s\s+(?:go\s+with|use|pick|choose))\s+([^.\n]{3,120})/gi,
    /(?:decided?\s+(?:on|to)\s+)([^.\n]{3,120})/gi,
  ];

  for (const pattern of decisionPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const content = (match[1] ?? '').trim();
      if (content.length > 0 && !findings.some((m) => m.content.includes(content))) {
        findings.push({
          content: `Decision: ${content}.`,
          category: 'decision',
          tags: ['decision'],
        });
      }
    }
  }

  return deduplicateAndLimit(findings);
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
