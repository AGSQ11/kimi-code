/**
 * Version REST schema.
 *
 *   GET /version  → { version, git_hash? }
 */
import { z } from 'zod';

export const versionResponseSchema = z.object({
  version: z.string().min(1),
  git_hash: z.string().optional(),
});
