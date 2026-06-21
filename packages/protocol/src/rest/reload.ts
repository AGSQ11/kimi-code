/**
 * Reload REST schemas.
 *
 *   POST /reload/session       → { reloaded: true }
 *   POST /reload/tui-config    → { reloaded: true }
 *   POST /reload/system-prompt → { reloaded: true }
 *
 * Global endpoints that trigger the core process to reload config from disk.
 */
import { z } from 'zod';

export const reloadResultSchema = z.object({
  reloaded: z.literal(true),
});

export type ReloadResult = z.infer<typeof reloadResultSchema>;
