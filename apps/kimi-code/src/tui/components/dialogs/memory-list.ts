/**
 * MemoryListDialog — scrollable list of remembered memories.
 *
 * Shows global and project-scoped memories with id, content, category, tags,
 * and pinned status. Supports pinning/unpinning and deleting individual
 * memories.
 */

import {
  Container,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import type { Component, Focusable } from '@earendil-works/pi-tui';
import type { MemoryData } from '@moonshot-ai/kimi-code-sdk';
import chalk from 'chalk';

import { SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';

export interface MemoryListSelection {
  readonly action: 'pin' | 'unpin' | 'delete';
  readonly memoryId: string;
}

export interface MemoryListDialogOptions {
  readonly memories: readonly MemoryData[];
  readonly onSelect: (selection: MemoryListSelection) => void;
  readonly onClose: () => void;
}

const MIN_BODY_LINES = 8;

export class MemoryListDialogComponent extends Container implements Focusable, Component {
  focused = false;
  private readonly opts: MemoryListDialogOptions;
  private scrollTop = 0;
  private cursorIndex = 0;
  private bodyLines: string[] = [];

  constructor(opts: MemoryListDialogOptions) {
    super();
    this.opts = opts;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q' || data === 'Q') {
      this.opts.onClose();
      return;
    }

    const memories = this.opts.memories;

    if (matchesKey(data, Key.up)) {
      this.cursorIndex = Math.max(0, this.cursorIndex - 1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.cursorIndex = Math.min(memories.length - 1, this.cursorIndex + 1);
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.cursorIndex = Math.max(0, this.cursorIndex - this.viewportLines());
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.cursorIndex = Math.min(memories.length - 1, this.cursorIndex + this.viewportLines());
      return;
    }

    if (data === 'p' || data === 'P') {
      const memory = memories[this.cursorIndex];
      if (memory !== undefined) {
        this.opts.onSelect({ action: memory.pinned ? 'unpin' : 'pin', memoryId: memory.id });
      }
      return;
    }
    if (data === 'd' || data === 'D') {
      const memory = memories[this.cursorIndex];
      if (memory !== undefined) {
        this.opts.onSelect({ action: 'delete', memoryId: memory.id });
      }
      return;
    }
  }

  override render(width: number): string[] {
    const safeWidth = Math.max(4, width);
    const contentWidth = Math.max(1, safeWidth - 4);

    this.bodyLines = this.renderBody(contentWidth);
    const bodyLimit = this.viewportLines();
    const target = Math.max(MIN_BODY_LINES, Math.min(bodyLimit, this.bodyLines.length));
    const maxScrollTop = Math.max(0, this.bodyLines.length - target);
    this.scrollTop = Math.min(this.scrollTop, maxScrollTop);
    this.cursorIndex = Math.min(this.cursorIndex, Math.max(0, this.opts.memories.length - 1));

    const visibleLines = this.bodyLines.slice(this.scrollTop, this.scrollTop + target);
    const padded = [...visibleLines];
    while (padded.length < target) {
      padded.push('');
    }

    const lines = [this.renderTopBorder(safeWidth)];
    for (const line of padded) {
      lines.push(this.renderBodyLine(line, safeWidth));
    }
    lines.push(this.renderBottomBorder(safeWidth));
    return lines;
  }

  private renderTopBorder(width: number): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    const title =
      chalk.hex(currentTheme.palette.accent).bold(' Memories ') +
      paint('─ ') +
      chalk.hex(currentTheme.palette.textMuted)('Esc close · ↑↓ navigate · P pin/unpin · D delete');
    const innerWidth = Math.max(1, width - 2);
    const clippedTitle =
      visibleWidth(title) > innerWidth ? truncateToWidth(title, innerWidth, '') : title;
    const dashCount = Math.max(0, innerWidth - visibleWidth(clippedTitle));
    return paint('╭') + clippedTitle + paint('─'.repeat(dashCount)) + paint('╮');
  }

  private renderBottomBorder(width: number): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    return paint('╰' + '─'.repeat(Math.max(1, width - 2)) + '╯');
  }

  private renderBodyLine(line: string, width: number): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    const contentWidth = Math.max(1, width - 4);
    const clipped =
      visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth, '…') : line;
    const padding = Math.max(0, contentWidth - visibleWidth(clipped));
    return paint('│') + ' ' + clipped + ' '.repeat(padding) + ' ' + paint('│');
  }

  private renderBody(width: number): string[] {
    const lines: string[] = [];
    const memories = this.opts.memories;

    if (memories.length === 0) {
      lines.push(chalk.hex(currentTheme.palette.textDim)('No memories stored yet.'));
      return lines;
    }

    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      if (memory === undefined) continue;

      const isCursor = i === this.cursorIndex;
      const pointer = isCursor ? SELECT_POINTER : ' ';
      const pinMarker = memory.pinned ? ' 📌' : '';
      const scopeMarker = memory.project !== null ? ' [project]' : ' [global]';
      const category = memory.category !== null ? ` ${memory.category}` : '';
      const tags = memory.tags !== null && memory.tags.length > 0 ? ` #${memory.tags.join(' #')}` : '';

      const header = `${pointer} ${memory.id}${scopeMarker}${pinMarker}`;
      const meta = `    ${category}${tags}`;
      const content = `    ${memory.content}`;

      const headerColor = isCursor ? currentTheme.palette.accent : currentTheme.palette.text;
      lines.push(chalk.hex(headerColor)(truncateToWidth(header, width)));
      if (meta.trim().length > 0) {
        lines.push(chalk.hex(currentTheme.palette.textDim)(truncateToWidth(meta, width)));
      }
      lines.push(chalk.hex(currentTheme.palette.text)(truncateToWidth(content, width)));
      lines.push('');
    }

    return lines;
  }

  private viewportLines(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(MIN_BODY_LINES, Math.floor(rows * 0.5));
  }
}
