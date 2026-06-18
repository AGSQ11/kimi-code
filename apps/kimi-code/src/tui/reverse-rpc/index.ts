import type { ApprovalController } from './approval/controller';
import type { MemoryApprovalController } from './memory/controller';
import { ReverseRpcModalCoordinator } from './modal-coordinator';
import type { QuestionController } from './question/controller';
import type { ApprovalPanelData, QuestionPanelData } from './types';
import type { MemoryApprovalPanelData } from './types';

export interface ReverseRPCUIHooks {
  readonly showApprovalPanel: (payload: ApprovalPanelData) => void;
  readonly hideApprovalPanel: () => void;
  readonly showQuestionDialog: (payload: QuestionPanelData) => void;
  readonly hideQuestionDialog: () => void;
  readonly showMemoryApprovalDialog: (payload: MemoryApprovalPanelData) => void;
  readonly hideMemoryApprovalDialog: () => void;
}

export function registerReverseRPCHandlers(
  approvalController: ApprovalController,
  questionController: QuestionController,
  memoryApprovalController: MemoryApprovalController,
  uiHooks: ReverseRPCUIHooks,
): Array<() => void> {
  const modalCoordinator = new ReverseRpcModalCoordinator(uiHooks);

  // Setup UI hooks for controllers
  approvalController.setUIHooks({
    showPanel: (payload) => {
      modalCoordinator.showApproval(payload);
    },
    hidePanel: () => {
      modalCoordinator.hide('approval');
    },
  });

  questionController.setUIHooks({
    showPanel: (payload) => {
      modalCoordinator.showQuestion(payload);
    },
    hidePanel: () => {
      modalCoordinator.hide('question');
    },
  });

  memoryApprovalController.setUIHooks({
    showPanel: (payload) => {
      modalCoordinator.showMemoryApproval(payload);
    },
    hidePanel: () => {
      modalCoordinator.hide('memory');
    },
  });

  return [
    () => {
      modalCoordinator.clear();
    },
  ];
}
