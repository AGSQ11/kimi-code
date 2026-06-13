import type {
  MemoryApprovalHandler,
  MemoryApprovalRequest,
  MemoryApprovalResponse,
} from '@moonshot-ai/kimi-code-sdk';

import type {
  MemoryApprovalPanelData,
  MemoryApprovalPanelResponse,
} from '#/tui/reverse-rpc/types';

import type { MemoryApprovalController } from './controller';

export function createMemoryApprovalHandler(
  controller: MemoryApprovalController,
): MemoryApprovalHandler {
  return async (event): Promise<MemoryApprovalResponse> => {
    try {
      const response = await controller.show(adaptMemoryApprovalRequest(event));
      return adaptMemoryApprovalResponse(response);
    } catch {
      return { approved: [] };
    }
  };
}

export function adaptMemoryApprovalRequest(
  event: MemoryApprovalRequest,
): MemoryApprovalPanelData {
  const id = event.turnId === undefined ? 'memory' : `memory-${String(event.turnId)}`;
  return {
    id,
    turnId: event.turnId,
    memories: event.memories.map((memory, index) => ({
      index,
      content: memory.content,
      category: memory.category,
      tags: memory.tags,
    })),
  };
}

export function adaptMemoryApprovalResponse(
  response: MemoryApprovalPanelResponse,
): MemoryApprovalResponse {
  return { approved: response.approved };
}
