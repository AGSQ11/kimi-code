import { Container, Key, matchesKey } from '@earendil-works/pi-tui';
import type { Focusable } from '@earendil-works/pi-tui';
import type { ModelAlias } from '@moonshot-ai/kimi-code-sdk';

import { SELECT_POINTER } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import { SearchableList } from '#/tui/utils/searchable-list';

export interface CompareModelSelection {
  readonly modelAliases: readonly string[];
}

export interface CompareSelectorOptions {
  readonly models: Record<string, ModelAlias>;
  readonly onSelect: (selection: CompareModelSelection) => void;
  readonly onCancel: () => void;
}

interface CompareChoice {
  readonly alias: string;
  readonly label: string;
}

const MIN_SELECTION = 2;
const MAX_SELECTION = 4;

function createChoices(models: Record<string, ModelAlias>): readonly CompareChoice[] {
  return Object.entries(models).map(([alias, cfg]) => ({
    alias,
    label: `${cfg.displayName ?? cfg.model ?? alias} (${cfg.provider})`,
  }));
}

/**
 * A multi-select model picker for /compare. The user chooses 2-4 models with
 * Space and confirms with Enter. The list is searchable and paginated like the
 * other model selectors.
 */
export class CompareSelectorComponent extends Container implements Focusable {
  focused = false;
  private readonly opts: CompareSelectorOptions;
  private readonly list: SearchableList<CompareChoice>;
  private readonly selected = new Set<string>();

  constructor(opts: CompareSelectorOptions) {
    super();
    this.opts = opts;
    const choices = createChoices(opts.models);
    this.list = new SearchableList({
      items: choices,
      toSearchText: (choice) => choice.label,
      pageSize: 10,
      initialIndex: 0,
      searchable: true,
    });
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      if (this.list.clearQuery()) return;
      this.opts.onCancel();
      return;
    }

    if (matchesKey(data, Key.space)) {
      const selected = this.selectedChoice();
      if (selected !== undefined) {
        if (this.selected.has(selected.alias)) {
          this.selected.delete(selected.alias);
        } else if (this.selected.size < MAX_SELECTION) {
          this.selected.add(selected.alias);
        }
      }
      return;
    }

    if (matchesKey(data, Key.enter)) {
      if (this.selected.size >= MIN_SELECTION && this.selected.size <= MAX_SELECTION) {
        this.opts.onSelect({ modelAliases: Array.from(this.selected) });
      }
      return;
    }

    if (this.list.handleKey(data)) return;
  }

  override render(width: number): string[] {
    const view = this.list.view();
    const totalCount = Object.keys(this.opts.models).length;

    const lines: string[] = [
      currentTheme.fg('primary', '─'.repeat(width)),
      currentTheme.boldFg('primary', ' Select 2-4 models to compare') +
        (view.query.length === 0 ? currentTheme.fg('textMuted', '  (type to search)') : ''),
      currentTheme.fg(
        'textMuted',
        ` ↑↓ navigate · Space select · Enter confirm · Esc cancel  (${String(this.selected.size)} selected)`,
      ),
      '',
    ];

    if (view.query.length > 0) {
      lines.push(currentTheme.fg('primary', ' Search: ') + currentTheme.fg('text', view.query));
    }

    if (view.items.length === 0) {
      lines.push(currentTheme.fg('textMuted', '   No matches'));
    } else {
      for (let i = view.page.start; i < view.page.end; i++) {
        const choice = view.items[i];
        if (choice === undefined) continue;
        const isSelected = i === view.selectedIndex;
        const isChecked = this.selected.has(choice.alias);
        const pointer = isSelected ? SELECT_POINTER : ' ';
        const checkbox = isChecked ? '[x]' : '[ ]';
        const line =
          currentTheme.fg(isSelected ? 'primary' : 'textDim', `  ${pointer} ${checkbox} `) +
          (isSelected
            ? currentTheme.boldFg('primary', choice.label)
            : currentTheme.fg('text', choice.label));
        lines.push(line);
      }
    }

    if (view.query.length > 0) {
      lines.push('');
      lines.push(
        currentTheme.fg('textMuted', ` ${String(view.items.length)} / ${String(totalCount)}`),
      );
    }

    lines.push('');
    lines.push(currentTheme.fg('primary', '─'.repeat(width)));
    return lines;
  }

  private selectedChoice(): CompareChoice | undefined {
    return this.list.selected();
  }
}
