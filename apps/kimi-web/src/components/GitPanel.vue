<!-- apps/kimi-web/src/components/GitPanel.vue -->
<!-- Persistent git status sidebar: shows current branch, ahead/behind counts,
     and a list of changed files with M/A/D/? status badges. Clicking a file
     opens the line-by-line diff view. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DiffViewLine } from '../types';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    changes: { path: string; status: string }[];
    gitInfo: { branch: string; ahead: number; behind: number } | null;
    /** Parsed unified-diff lines for the selected file (empty until tapped). */
    fileDiff?: DiffViewLine[];
    /** The currently-open file path, or null when showing the file list. */
    selectedDiffPath?: string | null;
    /** True while the diff for the selected file is being fetched. */
    fileDiffLoading?: boolean;
  }>(),
  {},
);

const emit = defineEmits<{
  /** Fired when the user taps a changed file → parent loads its diff. */
  open: [path: string];
  /** Fired when the user collapses the diff back to the file list. */
  back: [];
  /** Fired when the user closes the right-side panel. */
  close: [];
}>();

// ---------------------------------------------------------------------------
// Status badge helpers (mirrors DiffView)
// ---------------------------------------------------------------------------
type BadgeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'ignored' | 'clean' | 'unknown';

function badgeKind(s: string): BadgeKind {
  const lower = s.toLowerCase();
  if (lower === 'modified') return 'modified';
  if (lower === 'added' || lower === 'staged') return 'added';
  if (lower === 'deleted') return 'deleted';
  if (lower === 'renamed') return 'renamed';
  if (lower === 'untracked') return 'untracked';
  if (lower === 'conflicted') return 'conflicted';
  if (lower === 'ignored') return 'ignored';
  if (lower === 'clean') return 'clean';
  return 'unknown';
}

const BADGE_GLYPH: Record<BadgeKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  conflicted: 'C',
  ignored: 'I',
  clean: '·',
  unknown: '?',
};

function badgeGlyph(s: string): string {
  return BADGE_GLYPH[badgeKind(s)] ?? '?';
}

/** Short file name (last path segment) for the file column. */
function shortName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** Directory portion (everything except the last segment), for the dim subtitle. */
function dirName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function truncateLeft(path: string, maxLen = 60): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(path.length - maxLen + 1);
}

// ---------------------------------------------------------------------------
// Computed state
// ---------------------------------------------------------------------------
const hasGitInfo = computed(() => props.gitInfo !== null);
const hasChanges = computed(() => props.changes.length > 0);
const showingDiff = computed(() => (props.selectedDiffPath ?? null) !== null);

const diffLines = computed<DiffViewLine[]>(() => props.fileDiff ?? []);
const loading = computed(() => props.fileDiffLoading === true);

const modifiedCount = computed(() =>
  props.changes.filter((c) => badgeKind(c.status) === 'modified').length,
);
const addedCount = computed(() =>
  props.changes.filter((c) => badgeKind(c.status) === 'added').length,
);
const deletedCount = computed(() =>
  props.changes.filter((c) => badgeKind(c.status) === 'deleted').length,
);
const untrackedCount = computed(() =>
  props.changes.filter((c) => badgeKind(c.status) === 'untracked' || badgeKind(c.status) === 'unknown').length,
);

/** Gutter cell text for a diff row. */
function oldGutter(line: DiffViewLine): string {
  return line.oldNo !== undefined ? String(line.oldNo) : '';
}
function newGutter(line: DiffViewLine): string {
  return line.newNo !== undefined ? String(line.newNo) : '';
}
function rowClass(line: DiffViewLine): string {
  return `dl-${line.type}`;
}

function onOpen(path: string): void {
  emit('open', path);
}
function onBack(): void {
  emit('back');
}
function onClose(): void {
  emit('close');
}
</script>

<template>
  <div class="git-panel">
    <!-- ===================== LINE-BY-LINE DIFF VIEW ===================== -->
    <template v-if="showingDiff">
      <div class="gp-panel-head">
        <button type="button" class="gp-back" :title="t('gitPanel.back')" @click="onBack">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="10,3 5,8 10,13"/></svg>
          <span>{{ t('gitPanel.back') }}</span>
        </button>
        <span class="gp-diff-path" :title="selectedDiffPath ?? ''">{{ truncateLeft(selectedDiffPath ?? '', 45) }}</span>
        <button type="button" class="gp-close" :title="t('gitPanel.close')" :aria-label="t('gitPanel.close')" @click="onClose">
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
        </button>
      </div>

      <div v-if="loading" class="gp-empty">{{ t('gitPanel.loading') }}</div>

      <div v-else-if="diffLines.length > 0" class="gp-diff-lines">
        <div
          v-for="(line, i) in diffLines"
          :key="i"
          class="dl"
          :class="rowClass(line)"
        >
          <template v-if="line.type === 'hunk'">
            <span class="hunk-text">{{ line.text }}</span>
          </template>
          <template v-else>
            <span class="dl-gutter old">{{ oldGutter(line) }}</span>
            <span class="dl-gutter new">{{ newGutter(line) }}</span>
            <span class="dl-sign">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}</span>
            <span class="dl-text">{{ line.text }}</span>
          </template>
        </div>
      </div>

      <div v-else class="gp-empty">{{ t('gitPanel.noDiff') }}</div>
    </template>

    <!-- ======================== GIT STATUS LIST ======================= -->
    <template v-else>
      <!-- Panel header -->
      <div class="gp-panel-head">
        <span class="gp-title">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/>
            <path d="M4 4.5v7"/><path d="M4 8a4 4 0 0 0 4-4V4.5"/><path d="M12 6.5v3"/>
          </svg>
          {{ t('gitPanel.title') }}
        </span>
        <span v-if="hasChanges" class="gp-change-count">{{ changes.length }}</span>
        <button type="button" class="gp-close" :title="t('gitPanel.close')" :aria-label="t('gitPanel.close')" @click="onClose">
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
        </button>
      </div>

      <!-- Branch + ahead/behind -->
      <div v-if="hasGitInfo" class="gp-branch-row">
        <svg class="gp-branch-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/>
          <path d="M4 4.5v7"/><path d="M4 8a4 4 0 0 0 4-4V4.5"/><path d="M12 6.5v3"/>
        </svg>
        <span class="gp-branch-name">{{ gitInfo!.branch || t('gitPanel.detached') }}</span>
        <span v-if="gitInfo!.ahead > 0 || gitInfo!.behind > 0" class="gp-sync">
          <span v-if="gitInfo!.ahead > 0" class="gp-ahead" :title="t('gitPanel.aheadTitle')">&#8593;{{ gitInfo!.ahead }}</span>
          <span v-if="gitInfo!.behind > 0" class="gp-behind" :title="t('gitPanel.behindTitle')">&#8595;{{ gitInfo!.behind }}</span>
        </span>
      </div>

      <!-- Summary badges -->
      <div v-if="hasChanges" class="gp-summary">
        <span v-if="modifiedCount > 0" class="gp-sum gp-sum-mod">{{ modifiedCount }} {{ t('gitPanel.modified') }}</span>
        <span v-if="addedCount > 0" class="gp-sum gp-sum-add">{{ addedCount }} {{ t('gitPanel.added') }}</span>
        <span v-if="deletedCount > 0" class="gp-sum gp-sum-del">{{ deletedCount }} {{ t('gitPanel.deleted') }}</span>
        <span v-if="untrackedCount > 0" class="gp-sum gp-sum-unt">{{ untrackedCount }} {{ t('gitPanel.untracked') }}</span>
      </div>

      <!-- File list -->
      <div v-if="hasChanges" class="gp-list">
        <button
          v-for="entry in changes"
          :key="entry.path"
          type="button"
          class="gp-row"
          :title="entry.path"
          @click="onOpen(entry.path)"
        >
          <span class="badge" :class="badgeKind(entry.status)">{{ badgeGlyph(entry.status) }}</span>
          <span class="gp-file-info">
            <span class="gp-fname">{{ shortName(entry.path) }}</span>
            <span class="gp-fdir">{{ dirName(entry.path) }}</span>
          </span>
        </button>
      </div>

      <!-- Empty states -->
      <div v-else-if="hasGitInfo" class="gp-empty">
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="8" cy="6" r="2"/><circle cx="8" cy="26" r="2"/><circle cx="24" cy="16" r="2"/>
          <path d="M8 8v16"/><path d="M8 16a8 8 0 0 0 8-8V8"/><path d="M24 14v4"/>
        </svg>
        <span>{{ t('gitPanel.clean') }}</span>
      </div>

      <div v-else class="gp-empty">
        <span>{{ t('gitPanel.empty') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  font-family: var(--mono);
  min-width: 0;
}

/* ---- Panel header ---- */
.gp-panel-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--panel-head-h, 48px);
  padding: 0 6px 0 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.gp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.gp-title svg { color: var(--accent); }
.gp-change-count {
  flex: 1;
  min-width: 0;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  color: var(--muted);
}
.gp-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--muted);
  cursor: pointer;
}
.gp-close:hover {
  background: var(--hover);
  color: var(--ink);
}
.gp-close:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}

/* ---- Back button (diff view) ---- */
.gp-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
  color: var(--dim);
  font-family: inherit;
  font-size: calc(var(--ui-font-size) - 3px);
  flex: none;
}
.gp-back:hover {
  background: var(--panel2, #f5f6f8);
  color: var(--ink);
}
.gp-back:focus-visible {
  outline: 2px solid var(--blue, #1783ff);
  outline-offset: 1px;
}
.gp-diff-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size-xs);
  color: var(--muted);
}

/* ---- Branch row ---- */
.gp-branch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  font-size: var(--ui-font-size-xs);
  flex: none;
}
.gp-branch-icon {
  flex: none;
  color: var(--accent);
}
.gp-branch-name {
  color: var(--blue);
  font-weight: 700;
  font-size: var(--ui-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gp-sync {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.gp-ahead {
  color: var(--blue);
  font-size: calc(var(--ui-font-size) - 3px);
}
.gp-behind {
  color: var(--warn);
  font-size: calc(var(--ui-font-size) - 3px);
}

/* ---- Summary badges ---- */
.gp-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.gp-sum {
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  white-space: nowrap;
}
.gp-sum-mod { color: var(--blue); }
.gp-sum-add { color: var(--ok); }
.gp-sum-del { color: var(--err); }
.gp-sum-unt { color: var(--muted); }

/* ---- File list ---- */
.gp-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.gp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  cursor: pointer;
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.gp-row:hover {
  background: var(--panel2, #f5f6f8);
}
.gp-row:focus-visible {
  outline: 2px solid var(--blue, #1783ff);
  outline-offset: -2px;
}
.gp-file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.gp-fname {
  color: var(--ink);
  font-size: var(--ui-font-size);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gp-fdir {
  color: var(--muted);
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Status badge (shared with DiffView) ---- */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 2px;
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  font-weight: 700;
  flex: none;
  user-select: none;
}
.badge.modified  { background: color-mix(in srgb, var(--blue) 12%, var(--bg)); color: var(--blue); }
.badge.added     { background: color-mix(in srgb, var(--ok) 10%, var(--bg)); color: var(--ok); }
.badge.deleted   { background: color-mix(in srgb, var(--err) 10%, var(--bg)); color: var(--err); }
.badge.renamed   { background: color-mix(in srgb, var(--warn) 12%, var(--bg)); color: var(--warn); }
.badge.untracked { background: var(--soft, #f0f0f5); color: var(--muted, #9098a0); }
.badge.conflicted{ background: color-mix(in srgb, var(--err) 10%, var(--bg)); color: var(--err); }
.badge.ignored   { background: var(--soft, #f0f0f5); color: var(--faint, #c0c5cc); }
.badge.clean     { background: transparent; color: var(--faint, #c0c5cc); }
.badge.unknown   { background: var(--soft, #f0f0f5); color: var(--muted, #9098a0); }

/* ---- Empty state ---- */
.gp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  color: var(--muted, #9098a0);
  font-size: var(--ui-font-size);
  text-align: center;
}

/* ===================== Diff line-by-line view ===================== */
.gp-diff-lines {
  flex: 1;
  overflow: auto;
  padding: 4px 0 12px;
  font-size: var(--ui-font-size);
  line-height: 1.5;
  -webkit-overflow-scrolling: touch;
}
.dl {
  display: flex;
  align-items: flex-start;
  min-height: 18px;
  white-space: pre;
}
.dl-gutter {
  flex: none;
  width: 40px;
  padding: 0 6px;
  text-align: right;
  color: var(--faint, #aeb4bc);
  background: var(--panel, #fafbfc);
  user-select: none;
  border-right: 1px solid var(--line2, #eef1f4);
  font-variant-numeric: tabular-nums;
}
.dl-gutter.new { border-right: 1px solid var(--line, #e7eaee); }
.dl-sign {
  flex: none;
  width: 16px;
  text-align: center;
  color: var(--muted);
  user-select: none;
}
.dl-text {
  flex: 1;
  padding-right: 14px;
  white-space: pre;
  color: var(--text);
  min-width: 0;
}
.dl-add {
  background: color-mix(in srgb, var(--ok) 7%, var(--bg));
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--ok) 55%, transparent);
}
.dl-add .dl-sign { color: var(--ok, #0e7a38); }
.dl-del {
  background: color-mix(in srgb, var(--err) 7%, var(--bg));
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--err) 55%, transparent);
}
.dl-del .dl-sign { color: var(--err, #b91c1c); }
.dl-hunk { background: var(--panel2, #f3f5f8); }
.dl-hunk .hunk-text {
  flex: 1;
  padding: 1px 12px;
  color: var(--muted, #8b929b);
}
</style>
