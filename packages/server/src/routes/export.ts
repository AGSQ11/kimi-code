/**
 * `/sessions/{session_id}/export` REST route.
 *
 *   GET /export type CompareRequest = z.infer<typeof compareRequestSchema>;
 *
 *   GET /sessions/{session_id}/export?format=markdown   → markdown text
 *   GET /sessions/{session_id}/export?format=debug-zip  → zip binary
 *
 * Exports a session as markdown or a debug ZIP. The format is determined by the
 * `format` query parameter.
 */

import {
  ErrorCode,
  exportMarkdownResultSchema,
} from '@moonshot-ai/protocol';
import { IMessageService, ISessionService, SessionNotFoundError, type IInstantiationService } from '@moonshot-ai/agent-core';
import { z } from 'zod';

import { errEnvelope, okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';

interface ExportRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> } | undefined,
    handler: (
      req: { id: string; query: unknown; params: unknown },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

const sessionIdParamSchema = z.object({
  session_id: z.string().min(1),
});

const exportQuerySchema = z.object({
  format: z.enum(['markdown', 'debug-zip']),
});

const detailsSchema = z.array(z.object({ path: z.string(), message: z.string() }));

export function registerExportRoute(
  app: ExportRouteHost,
  ix: IInstantiationService,
): void {
  const route = defineRoute(
    {
      method: 'GET',
      path: '/sessions/{session_id}/export',
      params: sessionIdParamSchema,
      querystring: exportQuerySchema,
      success: { data: z.union([
        exportMarkdownResultSchema,
        z.object({
          session_id: z.string(),
          format: z.literal('debug-zip'),
          message: z.string(),
        }),
      ]) },
      errors: {
        [ErrorCode.VALIDATION_FAILED]: { detailsSchema },
        [ErrorCode.SESSION_NOT_FOUND]: {},
      },
      description: 'Export a session as markdown or debug ZIP',
      tags: ['export'],
      operationId: 'exportSession',
    },
    async (req, reply) => {
      try {
        const { session_id } = req.params as { session_id: string };
        const { format } = req.query as { format: string };

        if (format === 'markdown') {
          const content = await exportSessionAsMarkdown(ix, session_id);
          if (content === null) {
            reply.send(
              errEnvelope(ErrorCode.SESSION_NOT_FOUND, 'session not found', req.id),
            );
            return;
          }
          reply.send(okEnvelope({
            content: content.markdown,
            session_id: content.sessionId,
            format: 'markdown' as const,
          }, req.id));
          return;
        }

        // debug-zip: return a placeholder message for now
        reply.send(okEnvelope({
          session_id,
          format: 'debug-zip' as const,
          message: 'debug-zip export not yet implemented',
        }, req.id));
      } catch (err) {
        if (err instanceof SessionNotFoundError) {
          reply.send(errEnvelope(ErrorCode.SESSION_NOT_FOUND, err.message, req.id));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        reply.send(errEnvelope(ErrorCode.INTERNAL_ERROR, message, req.id));
      }
    },
  );
  app.get(
    route.path,
    route.options,
    route.handler as Parameters<ExportRouteHost['get']>[2],
  );
}

async function exportSessionAsMarkdown(
  ix: IInstantiationService,
  sessionId: string,
): Promise<{ markdown: string; sessionId: string } | null> {
  const session = await ix.invokeFunction((a) =>
    a.get(ISessionService).get(sessionId),
  );

  const messagePage = await ix.invokeFunction((a) =>
    a.get(IMessageService).list(sessionId, { page_size: 1000 }),
  );

  // Build markdown from messages
  const lines: string[] = [];
  lines.push(`# ${session.title || 'Untitled Session'}`);
  lines.push('');
  lines.push(`> Session ID: ${session.id}`);
  lines.push(`> Created: ${session.created_at}`);
  lines.push(`> Model: ${session.agent_config.model || 'default'}`);
  lines.push('');

  for (const msg of messagePage.items) {
    if (msg.role === 'system') continue;
    const roleLabel = msg.role === 'user' ? '**User**' : msg.role === 'assistant' ? '**Assistant**' : `*${msg.role}*`;
    lines.push(`### ${roleLabel}`);
    lines.push('');

    for (const part of msg.content) {
      if (part.type === 'text') {
        lines.push(part.text);
      } else if (part.type === 'thinking') {
        lines.push('<details><summary>Thinking</summary>');
        lines.push('');
        lines.push(part.thinking);
        lines.push('');
        lines.push('</details>');
      } else if (part.type === 'tool_use') {
        lines.push(`\`Tool: ${part.tool_name}\``);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return { markdown: lines.join('\n'), sessionId };
}