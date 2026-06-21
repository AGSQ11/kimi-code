/**
 * Plugin REST schemas.
 *
 *   GET  /plugins              → { items: PluginItem[] }
 *   POST /plugins/:id:toggle   → { enabled: boolean }
 */
import { z } from 'zod';

export const pluginItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  enabled: z.boolean(),
  state: z.string(),
  description: z.string().nullable(),
});

export type PluginItem = z.infer<typeof pluginItemSchema>;

export const listPluginsResponseSchema = z.object({
  items: z.array(pluginItemSchema),
});

export const pluginIdParamSchema = z.object({
  plugin_id: z.string().min(1),
});

export const togglePluginResultSchema = z.object({
  enabled: z.boolean(),
});
