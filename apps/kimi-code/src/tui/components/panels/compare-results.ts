import type { Focusable, MarkdownTheme } from '@earendil-works/pi-tui';
import {
  Container,
  Key,
  Markdown,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { currentTheme } from '../../theme';
import { createMarkdownTheme } from '../../theme/pi-tui-theme';
import { printableChar } from '../../utils/printable-key';

export interface ModelComparisonEntry {
  readonly modelAlias: string;
  readonly result?: string;
  readonly error?: string;
}

export interface CompareResultsPanelOptions {
  readonly prompt: string;
  readonly results: readonly ModelComparisonEntry[];
  readonly onPromote: (index: number) => void;
  readonly onSynthesize: () => void;
  readonly onClose: () => void;
}

const MIN_BODY_LINES = 8;

export class CompareResultsPanelComponent extends Container implements Focusable {
  focused = false;
  private readonly opts: CompareResultsPanelOptions;
  private readonly markdownTheme: MarkdownTheme;
  private scrollTop = 0;
  private bodyLines: string[] = [];

  constructor(opts: CompareResultsPanelOptions) {
    super();
    this.opts = opts;
    this.markdownTheme = createMarkdownTheme();
  }

  handleInput(data: string): void {
    const ch = printableChar(data);
    if (matchesKey(data, Key.escape) || ch === 'q' || ch === 'Q') {
      this.opts.onClose();
      return;
    }

    if (ch === 's' || ch === 'S') {
      this.opts.onSynthesize();
      return;
    }

    const index = Number(ch) - 1;
    if (Number.isInteger(index) && index >= 0 && index < this.opts.results.length) {
      this.opts.onPromote(index);
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.scrollTop = Math.max(0, this.scrollTop - 1);
    } else if (matchesKey(data, Key.down)) {
      this.scrollTop = Math.min(
        Math.max(0, this.bodyLines.length - this.viewportLines()),
        this.scrollTop + 1,
      );
    } else if (matchesKey(data, Key.pageUp)) {
      this.scrollTop = Math.max(0, this.scrollTop - this.viewportLines());
    } else if (matchesKey(data, Key.pageDown)) {
      this.scrollTop = Math.min(
        Math.max(0, this.bodyLines.length - this.viewportLines()),
        this.scrollTop + this.viewportLines(),
      );
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
      chalk.hex(currentTheme.palette.accent).bold(' Compare ') +
      paint('─ ') +
      chalk.hex(currentTheme.palette.textMuted)('Esc close · ↑↓ scroll · 1-4 promote · S synthesize');
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

    const promptLine = `Prompt: ${this.opts.prompt}`;
    lines.push(
      ...new Text(chalk.hex(currentTheme.palette.textDim)(promptLine), 0, 0).render(width),
    );
    lines.push('');

    for (const [index, entry] of this.opts.results.entries()) {
      const header = `${String(index + 1)}. ${entry.modelAlias}`;
      lines.push(chalk.hex(currentTheme.palette.accent).bold(header));

      if (entry.error !== undefined) {
        lines.push(
          ...new Text(chalk.hex(currentTheme.palette.error)(entry.error), 0, 0).render(width),
        );
      } else if (entry.result !== undefined && entry.result.trim().length > 0) {
        lines.push(...new Markdown(entry.result, 0, 0, this.markdownTheme).render(width));
      } else {
        lines.push(chalk.hex(currentTheme.palette.textDim)('No response'));
      }

      lines.push('');
    }

    lines.push(
      chalk.hex(currentTheme.palette.textMuted)(
        'Press 1-4 to promote a response, S to synthesize, Esc/Q to close.',
      ),
    );

    return lines;
  }

  private viewportLines(): number {
    // The editor replacement is rendered into a constrained area; cap the body
    // so the panel does not dominate the screen.
    const rows = process.stdout.rows ?? 24;
    return Math.max(MIN_BODY_LINES, Math.floor(rows * 0.4));
  }
}
