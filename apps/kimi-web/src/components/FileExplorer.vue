<!-- apps/kimi-web/src/components/FileExplorer.vue -->
<!-- File explorer tree panel: lazy-loading collapsible directory tree for the
     workspace root. Clicking a file opens it in FilePreview via the open-file
     emit chain → App.vue openFilePreview. Uses a flattened visible-nodes list
     with depth-based indentation to avoid a recursive sub-component. -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FsEntry, FilePreviewRequest } from '../types';

const { t } = useI18n();

const props = defineProps<{
  /** Absolute path to the workspace root. */
  workspaceRoot?: string;
  /** Currently open file path (highlighted in the tree). */
  currentFile?: string | null;
  /** Fetch directory entries for a path. */
  listDir: (path: string) => Promise<FsEntry[]>;
}>();

const emit = defineEmits<{
  close: [];
  'open-file': [target: FilePreviewRequest];
}>();

// ---------------------------------------------------------------------------
// Tree state
// ---------------------------------------------------------------------------

interface DirState {
  children: FsEntry[] | null; // null = not yet loaded
  loading: boolean;
  error: boolean;
  expanded: boolean;
}

// Keyed by full directory path
const dirStates = reactive(new Map<string, DirState>());

const rootEntries = ref<FsEntry[] | null>(null);
const rootLoading = ref(false);
const rootError = ref(false);

// Directories that are currently expanded (ordered for ancestor traversal)
const expandedPaths = ref<Set<string>>(new Set());

// Default hidden entries (common noise at the workspace root)
const HIDDEN_PATTERNS = [
  /^\.git$/,
  /^node_modules$/,
  /^\.next$/,
  /^dist$/,
  /^\.cache$/,
  /^target$/,
  /^__pycache__$/,
  /^\.venv$/,
  /^venv$/,
  /^\.svelte-kit$/,
];

function isHidden(name: string): boolean {
  return HIDDEN_PATTERNS.some((re) => re.test(name));
}

function sortEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.kind === 'directory';
    const bDir = b.kind === 'directory';
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.name.localeCompare(b.name);
  });
}

function filterEntries(entries: FsEntry[]): FsEntry[] {
  return sortEntries(entries).filter((e) => !isHidden(e.name));
}

function getDirState(path: string): DirState {
  let s = dirStates.get(path);
  if (!s) {
    s = { children: null, loading: false, error: false, expanded: false };
    dirStates.set(path, s);
  }
  return s;
}

async function loadDir(path: string): Promise<FsEntry[]> {
  const entries = await props.listDir(path);
  return filterEntries(entries);
}

// ---------------------------------------------------------------------------
// Root load
// ---------------------------------------------------------------------------

async function loadRoot(): Promise<void> {
  const root = props.workspaceRoot;
  if (!root) {
    rootEntries.value = null;
    return;
  }
  rootLoading.value = true;
  rootError.value = false;
  dirStates.clear();
  expandedPaths.value.clear();
  try {
    rootEntries.value = await loadDir(root);
  } catch {
    rootEntries.value = [];
    rootError.value = true;
  } finally {
    rootLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Expand / collapse
// ---------------------------------------------------------------------------

async function toggleDir(path: string): Promise<void> {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
    return;
  }

  expandedPaths.value.add(path);

  // Lazy-load children if not yet loaded
  const state = getDirState(path);
  if (state.children === null && !state.loading) {
    state.loading = true;
    state.error = false;
    try {
      state.children = await loadDir(path);
    } catch {
      state.children = [];
      state.error = true;
    } finally {
      state.loading = false;
    }
  }
}

function isExpanded(path: string): boolean {
  return expandedPaths.value.has(path);
}

// ---------------------------------------------------------------------------
// Flattened visible nodes (depth-first, only expanded dirs are descended into)
// ---------------------------------------------------------------------------

interface FlatNode {
  entry: FsEntry;
  depth: number;
  path: string;
}

function flattenChildren(entries: FsEntry[] | null, depth: number, out: FlatNode[]): void {
  if (!entries) return;
  for (const entry of entries) {
    out.push({ entry, depth, path: entry.path });
    if (entry.kind === 'directory' && isExpanded(entry.path)) {
      const state = getDirState(entry.path);
      flattenChildren(state.children, depth + 1, out);
    }
  }
}

const flatNodes = computed<FlatNode[]>(() => {
  const out: FlatNode[] = [];
  if (!rootEntries.value) return out;
  flattenChildren(rootEntries.value, 0, out);
  return out;
});

function isCurrentFile(path: string): boolean {
  return props.currentFile === path;
}

// ---------------------------------------------------------------------------
// File extension → colored badge
// ---------------------------------------------------------------------------

interface ExtInfo {
  label: string;
  cls: string;
}

const EXT_MAP: Record<string, ExtInfo> = {
  ts: { label: 'TS', cls: 'fe-blue' },
  tsx: { label: 'TS', cls: 'fe-blue' },
  js: { label: 'JS', cls: 'fe-yellow' },
  jsx: { label: 'JS', cls: 'fe-yellow' },
  mjs: { label: 'JS', cls: 'fe-yellow' },
  cjs: { label: 'JS', cls: 'fe-yellow' },
  vue: { label: 'VU', cls: 'fe-green' },
  json: { label: '{}', cls: 'fe-yellow' },
  css: { label: '#', cls: 'fe-blue' },
  scss: { label: '#', cls: 'fe-pink' },
  html: { label: '<>', cls: 'fe-orange' },
  md: { label: 'M↓', cls: 'fe-blue' },
  mdx: { label: 'M↓', cls: 'fe-blue' },
  py: { label: 'PY', cls: 'fe-blue' },
  go: { label: 'GO', cls: 'fe-teal' },
  rs: { label: 'RS', cls: 'fe-orange' },
  java: { label: 'J', cls: 'fe-orange' },
  c: { label: 'C', cls: 'fe-blue' },
  cpp: { label: 'C+', cls: 'fe-blue' },
  h: { label: 'H', cls: 'fe-blue' },
  sh: { label: '$', cls: 'fe-green' },
  yml: { label: 'Y', cls: 'fe-purple' },
  yaml: { label: 'Y', cls: 'fe-purple' },
  toml: { label: 'T', cls: 'fe-orange' },
  env: { label: 'E', cls: 'fe-green' },
};

const DEFAULT_EXT: ExtInfo = { label: '·', cls: 'fe-muted' };

function extInfo(name: string): ExtInfo {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return DEFAULT_EXT;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? DEFAULT_EXT;
}

// ---------------------------------------------------------------------------
// Click handlers
// ---------------------------------------------------------------------------

function onRowClick(node: FlatNode): void {
  if (node.entry.kind === 'directory') {
    void toggleDir(node.path);
  } else {
    emit('open-file', { path: node.path });
  }
}

function onClose(): void {
  emit('close');
}

// ---------------------------------------------------------------------------
// Auto-expand parent directories of the currently open file
// ---------------------------------------------------------------------------

/** Extract ancestor directory paths for a file path, from root → immediate parent. */
function ancestorDirs(filePath: string, root: string): string[] {
  const norm = filePath.replace(/\\/g, '/');
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const dirs: string[] = [];
  let dir = norm.slice(0, norm.lastIndexOf('/'));
  while (dir.length > normRoot.length) {
    dirs.push(dir);
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === dir) break;
    dir = parent;
  }
  return dirs.reverse(); // root first
}

async function expandToCurrentFile(): Promise<void> {
  const root = props.workspaceRoot;
  const file = props.currentFile;
  if (!root || !file || rootEntries.value === null) return;

  const ancestors = ancestorDirs(file, root);
  for (const dirPath of ancestors) {
    if (!expandedPaths.value.has(dirPath)) {
      expandedPaths.value.add(dirPath);
    }
    // Lazy-load children if not yet loaded
    const state = getDirState(dirPath);
    if (state.children === null && !state.loading) {
      state.loading = true;
      try {
        state.children = await loadDir(dirPath);
      } catch {
        state.children = [];
      } finally {
        state.loading = false;
      }
    }
  }
}

// Reload when workspace root changes
watch(
  () => props.workspaceRoot,
  () => void loadRoot(),
);

// Auto-expand when current file changes
watch(
  () => props.currentFile,
  () => void expandToCurrentFile(),
);

onMounted(() => {
  void loadRoot();
});
</script>

<template>
  <div class="file-explorer">
    <!-- Panel header -->
    <div class="fe-panel-head">
      <span class="fe-title">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3l1.3 1.5h6.7a1 1 0 0 1 1 1V12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1.5 12z"/>
        </svg>
        {{ t('fileExplorer.title') }}
      </span>
      <button type="button" class="fe-close" :title="t('fileExplorer.close')" :aria-label="t('fileExplorer.close')" @click="onClose">
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
      </button>
    </div>

    <!-- Root loading -->
    <div v-if="rootLoading" class="fe-empty">{{ t('fileExplorer.loading') }}</div>

    <!-- Root error -->
    <div v-else-if="rootError" class="fe-empty fe-error">{{ t('fileExplorer.error') }}</div>

    <!-- No workspace -->
    <div v-else-if="!workspaceRoot" class="fe-empty">{{ t('fileExplorer.empty') }}</div>

    <!-- No entries -->
    <div v-else-if="rootEntries && rootEntries.length === 0" class="fe-empty">{{ t('fileExplorer.noChildren') }}</div>

    <!-- Tree -->
    <div v-else class="fe-tree">
      <button
        v-for="node in flatNodes"
        :key="node.path"
        type="button"
        class="fe-row"
        :class="{ 'fe-current': isCurrentFile(node.path) }"
        :style="{ '--fe-depth': node.depth }"
        :title="node.path"
        @click="onRowClick(node)"
      >
        <!-- Indentation -->
        <span class="fe-indent" />

        <!-- Expand/collapse chevron (directories only) -->
        <span class="fe-chev" :class="{ expanded: isExpanded(node.path), 'fe-hidden': node.entry.kind !== 'directory' }">
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4,3 8,6 4,9" /></svg>
        </span>

        <!-- Folder icon or file extension badge -->
        <svg v-if="node.entry.kind === 'directory'" class="fe-folder-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.5 4A1 1 0 0 1 2.5 3h3l1.2 1.5h6.8a1 1 0 0 1 1 1V12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1.5 12z" />
        </svg>
        <span v-else class="fe-badge" :class="extInfo(node.entry.name).cls">{{ extInfo(node.entry.name).label }}</span>

        <!-- Name -->
        <span class="fe-name">{{ node.entry.name }}</span>

        <!-- Loading indicator -->
        <span v-if="node.entry.kind === 'directory' && getDirState(node.path).loading" class="fe-row-loading">{{ t('fileExplorer.loading') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  font-family: var(--mono);
  min-width: 0;
}

/* ---- Panel header ---- */
.fe-panel-head {
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
.fe-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.fe-title svg { color: var(--accent); }
.fe-close {
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
.fe-close:hover { background: var(--hover); color: var(--ink); }
.fe-close:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }

/* ---- Tree ---- */
.fe-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 12px;
  -webkit-overflow-scrolling: touch;
}
.fe-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 4px;
  cursor: pointer;
  border: none;
  background: none;
  text-align: left;
  font-family: inherit;
  color: var(--ink);
  font-size: var(--ui-font-size);
  width: 100%;
  white-space: nowrap;
  user-select: none;
}
.fe-row:hover { background: var(--hover); }
.fe-row:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.fe-row.fe-current {
  background: var(--soft);
  color: var(--blue);
}

/* Indentation spacer: width scales with depth */
.fe-indent {
  flex: none;
  width: calc(var(--fe-depth, 0) * 14px);
}

/* Expand/collapse chevron */
.fe-chev {
  flex: none;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  transition: transform 0.12s ease;
}
.fe-chev.expanded { transform: rotate(90deg); }
.fe-chev.fe-hidden { visibility: hidden; }

/* Folder icon */
.fe-folder-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--accent);
}

/* File extension badge */
.fe-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: max(8px, calc(var(--ui-font-size) - 5px));
  font-weight: 700;
  letter-spacing: -0.02em;
}
.fe-blue   { background: color-mix(in srgb, var(--blue) 14%, var(--bg)); color: var(--blue); }
.fe-green  { background: color-mix(in srgb, var(--ok) 12%, var(--bg)); color: var(--ok); }
.fe-yellow { background: color-mix(in srgb, var(--warn) 14%, var(--bg)); color: var(--warn); }
.fe-orange { background: color-mix(in srgb, #d97706 12%, var(--bg)); color: #d97706; }
.fe-pink   { background: color-mix(in srgb, #db2777 12%, var(--bg)); color: #db2777; }
.fe-purple { background: color-mix(in srgb, #9333ea 12%, var(--bg)); color: #9333ea; }
.fe-teal   { background: color-mix(in srgb, #0d9488 12%, var(--bg)); color: #0d9488; }
.fe-muted  { background: var(--panel); color: var(--muted); }

/* File name */
.fe-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Loading indicator in tree row */
.fe-row-loading {
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  color: var(--muted);
  margin-left: 4px;
  flex: none;
}

/* ---- Empty/error state ---- */
.fe-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  color: var(--muted);
  font-size: var(--ui-font-size);
  text-align: center;
}
.fe-empty.fe-error { color: var(--err); }
</style>
