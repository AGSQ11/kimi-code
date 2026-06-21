/**
 * Export REST schemas.
 *
 *   GET /sessions/:id/export?format=markdown   → markdown text
 *   GET /sessions/:id/export?format=debug-zip  → zip binary
 */
import { z } from 'zod';

export const exportQuerySchema = z.object({
  format: z.enum(['markdown', 'debug-zip']),
});

export const exportMarkdownResultSchema = z.object({
  content: z.string(),
  session_id: z.string(),
  format: z.literal('markdown'),
});
