/**
 * MemoryApprovalDialog — transient approval prompt for auto-extracted memories.
 *
 * Shows up to three proposed memories. The user toggles each item, then
 * approves the selection or skips the whole batch.
 */

import {
  Container,
  matchesKey,
  Key,
  truncateToWidth,
  type Focusable,
} from '@earendil-works/pi-tui';

import { SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import type {
  MemoryApprovalPanelData,
  MemoryApprovalPanelMemory,
  MemoryApprovalPanelResponse,
} from '#/tui/reverse-rpc/types';

export interface MemoryApprovalDialogOptions {
  readonly request: MemoryApprovalPanelData;
  readonly onResponse: (response: MemoryApprovalPanelResponse) => void;
  readonly onCancel: () => void;
}

export class MemoryApprovalDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly opts: MemoryApprovalDialogOptions;
  private readonly approved: Set<number> = new Set();
  private cursorIndex = 0;
  private actionIndex = 0;

  constructor(opts: MemoryApprovalDialogOptions) {
    super();
    this.opts = opts;
    // Default all proposed memories to approved; the user can uncheck any.
    for (const memory of opts.request.memories) {
      this.approved.add(memory.index);
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.opts.onCancel();
      return;
    }

    const memories = this.opts.request.memories;
    const totalActions = 2;

    if (matchesKey(data, Key.up)) {
      if (this.cursorIndex > -1) {
        this.cursorIndex = Math.max(0, this.cursorIndex - 1);
      } else {
        this.actionIndex = Math.max(0, this.actionIndex - 1);
      }
      return;
    }

    if (matchesKey(data, Key.down)) {
      if (this.cursorIndex >= 0 && this.cursorIndex < memories.length - 1) {
        this.cursorIndex += 1;
      } else if (this.cursorIndex === memories.length - 1) {
        this.cursorIndex = -1;
        this.actionIndex = 0;
      } else {
        this.actionIndex = Math.min(totalActions - 1, this.actionIndex + 1);
      }
      return;
    }

    if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
      if (this.cursorIndex >= 0) {
        this.toggleMemory(memories[this.cursorIndex]);
        return;
      }
      this.executeAction(this.actionIndex);
      return;
    }

    const printable = data.length === 1 ? data : undefined;
    if (printable === '1' && memories[0] !== undefined) {
      this.cursorIndex = 0;
      this.toggleMemory(memories[0]);
      return;
    }
    if (printable === '2' && memories[1] !== undefined) {
      this.cursorIndex = 1;
      this.toggleMemory(memories[1]);
      return;
    }
    if (printable === '3' && memories[2] !== undefined) {
      this.cursorIndex = 2;
      this.toggleMemory(memories[2]);
      return;
    }
    if (printable === 'a' || printable === 'A') {
      this.approveAll();
      return;
    }
    if (printable === 's' || printable === 'S') {
      this.opts.onCancel();
      return;
    }
  }

  private toggleMemory(memory: MemoryApprovalPanelMemory | undefined): void {
    if (memory === undefined) return;
    if (this.approved.has(memory.index)) {
      this.approved.delete(memory.index);
    } else {
      this.approved.add(memory.index);
    }
  }

  private approveAll(): void {
    for (const memory of this.opts.request.memories) {
      this.approved.add(memory.index);
    }
    this.emitResponse();
  }

  private executeAction(index: number): void {
    if (index === 0) {
      this.emitResponse();
      return;
    }
    this.opts.onCancel();
  }

  private emitResponse(): void {
    this.opts.onResponse({ approved: [...this.approved].sort((a, b) => a - b) });
  }

  override render(width: number): string[] {
    const accent = (text: string) => currentTheme.fg('primary', text);
    const dim = (text: string) => currentTheme.fg('textDim', text);
    const success = (t: string) => currentTheme.fg('success', t);

    const lines: string[] = [
      accent('─'.repeat(width)),
      currentTheme.boldFg('primary', ' Remember these facts?'),
      dim(' Toggle each item, then approve or skip.'),
      '',
    ];

    const memories = this.opts.request.memories;
    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      if (memory === undefined) continue;
      const isCursor = this.cursorIndex === i;
      const checked = this.approved.has(memory.index);
      const num = i + 1;
      const prefix = isCursor ? `  → [${checked ? '✓' : ' '}] ` : `    [${checked ? '✓' : ' '}] `;
      const tone = isCursor ? accent : checked ? success : dim;
      const category = memory.category !== undefined ? ` [${memory.category}]` : '';
      const label = `${prefix}${num}. ${memory.content}${category}`;
      lines.push(tone(truncateToWidth(label, width)));
      if (memory.tags !== undefined && memory.tags.length > 0) {
        const tagLine = `       ${memory.tags.map((t) => `#${t}`).join(' ')}`;
        lines.push(dim(truncateToWidth(tagLine, width)));
      }
    }

    if (memories.length === 0) {
      lines.push(dim('   No memories proposed.'));
    }

    lines.push('');

    const actions = [
      { label: 'Approve selected', key: 'Enter' },
      { label: 'Skip all', key: 'S' },
    ];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action === undefined) continue;
      const isCursor = this.cursorIndex === -1 && this.actionIndex === i;
      const pointer = isCursor ? SELECT_POINTER : ' ';
      const line = `  ${pointer} ${action.key}: ${action.label}`;
      lines.push((isCursor ? accent : dim)(truncateToWidth(line, width)));
    }

    lines.push('');
    lines.push(dim(truncateToWidth('  ↑↓ navigate · Space/1-3 toggle · A approve all · Esc cancel', width)));
    lines.push(accent('─'.repeat(width)));

    return lines.map((line) => truncateToWidth(line, width));
  }
}
