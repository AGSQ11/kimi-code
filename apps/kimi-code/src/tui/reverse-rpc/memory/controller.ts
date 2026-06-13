import { ReverseRpcController } from '#/tui/reverse-rpc/base-controller';
import type {
  MemoryApprovalPanelData,
  MemoryApprovalPanelResponse,
} from '#/tui/reverse-rpc/types';

export class MemoryApprovalController extends ReverseRpcController<
  MemoryApprovalPanelData,
  MemoryApprovalPanelResponse
> {
  protected createCancelResponse(_reason: string): MemoryApprovalPanelResponse {
    return { approved: [] };
  }
}
