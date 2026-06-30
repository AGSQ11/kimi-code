<!-- apps/kimi-web/src/components/Sidebar.vue -->
<!-- Unified sidebar: session groups with collapsible workspace headers.
     The old workspace rail and workspace tabs have been removed;
     workspace switching, folding and renaming all live in the group header. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Session, WorkspaceGroup, WorkspaceView } from '../types';
import type { AppMessage } from '../api/types';
import SessionRow from './SessionRow.vue';
import { serverEndpointLabel } from '../api/config';
import { getKimiWebApi } from '../api';
import { copyTextToClipboard } from '../lib/clipboard';
import {
  loadCollapsedWorkspaces,
  saveCollapsedWorkspaces,
  loadPinnedSessions,
  savePinnedSessions,
  loadSessionTags,
  saveSessionTags,
  type SessionTags,
} from '../lib/storage';

const { t } = useI18n();

// Dev-only affordance: when the page is served by the Vite dev server, the
// logo turns yellow and the backend host:port is appended to the title —
// handy for telling several dev tabs apart. In production this is all inert.
const isDev = import.meta.env.DEV;
const endpoint = isDev ? serverEndpointLabel() : '';

const props = withDefaults(
  defineProps<{
    activeWorkspace: WorkspaceView | null;
    activeWorkspaceId: string | null;
    sessions: Session[];
    groups: WorkspaceGroup[];
    activeId: string;
    attentionBySession?: Record<string, number>;
    /** Per-session pending counts split by kind, for the coloured tags. */
    pendingBySession?: Record<string, { approvals: number; questions: number }>;
    unreadBySession?: Record<string, boolean>;
    /** Width (px) of the session column, driven by the App resize handle. */
    colWidth?: number;
  }>(),
  {
    activeWorkspace: null,
    activeWorkspaceId: null,
    attentionBySession: () => ({}),
    pendingBySession: () => ({}),
    unreadBySession: () => ({}),
    colWidth: 220,
  },
);

const emit = defineEmits<{
  select: [sessionId: string];
  create: [];
  createInWorkspace: [workspaceId: string];
  selectWorkspace: [workspaceId: string];
  selectWorkspaces: [ids: string[]];
  addWorkspace: [];
  rename: [id: string, title: string];
  archive: [id: string];
  fork: [id: string];
  renameWorkspace: [id: string, name: string];
  deleteWorkspace: [id: string];
  reorderWorkspaces: [ids: string[]];
  openSettings: [];
  collapse: [];
}>();

// ---------------------------------------------------------------------------
// Pinned sessions + tags (client-side localStorage state)
// ---------------------------------------------------------------------------
const pinnedIds = ref<Set<string>>(loadPinnedSessions());
const sessionTags = ref<SessionTags>(loadSessionTags());

function isPinned(id: string): boolean {
  return pinnedIds.value.has(id);
}

function sessionTagsFor(id: string): string[] {
  return sessionTags.value[id] ?? [];
}

function togglePinned(id: string): void {
  const next = new Set(pinnedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  pinnedIds.value = next;
  savePinnedSessions(next);
}

function addSessionTag(id: string, tag: string): void {
  const current = sessionTags.value[id] ?? [];
  if (current.includes(tag)) return;
  const next: SessionTags = { ...sessionTags.value, [id]: [...current, tag] };
  sessionTags.value = next;
  saveSessionTags(next);
}

function removeSessionTag(id: string, tag: string): void {
  const current = sessionTags.value[id] ?? [];
  const filtered = current.filter((t) => t !== tag);
  const next: SessionTags = { ...sessionTags.value };
  if (filtered.length === 0) delete next[id];
  else next[id] = filtered;
  sessionTags.value = next;
  saveSessionTags(next);
}

// ---------------------------------------------------------------------------
// Tag filter
// ---------------------------------------------------------------------------
const tagFilter = ref('');
const trimmedTagFilter = computed(() => tagFilter.value.trim().toLowerCase());
const isTagFiltering = computed(() => trimmedTagFilter.value.length > 0);

function clearTagFilter(): void {
  tagFilter.value = '';
}

/** All distinct tags across sessions, sorted alphabetically. */
const allTags = computed<string[]>(() => {
  const set = new Set<string>();
  for (const tags of Object.values(sessionTags.value)) {
    for (const tag of tags) set.add(tag);
  }
  return Array.from(set).sort();
});

// ---------------------------------------------------------------------------
// Session search (title instant filter + optional full-text content search)
// ---------------------------------------------------------------------------
type SearchMode = 'title' | 'content';

const searchMode = ref<SearchMode>('title');
const searchQuery = ref('');
const contentSearching = ref(false);
const contentError = ref(false);
const contentSearchedCount = ref(0);

interface ContentSearchResult {
  session: Session;
  /** HTML-safe snippet with <mark> tags around matched text. */
  snippet: string;
}

const contentResults = ref<ContentSearchResult[]>([]);
let contentSearchToken = 0;

/** Simple message-text cache keyed by session id so repeat searches don't
 *  re-fetch.  Maps sessionId → array of text segments extracted from messages. */
const messageTextCache = new Map<string, string[]>();

const trimmedQuery = computed(() => searchQuery.value.trim());
const isSearching = computed(() => trimmedQuery.value.length > 0 || isTagFiltering.value);

/** Title-mode results — instant client-side filter. */
const searchResults = computed<Session[]>(() => {
  const q = trimmedQuery.value.toLowerCase();
  const tag = trimmedTagFilter.value;
  if (!q && !tag) return [];
  return props.sessions.filter((s) => {
    const title = (s.title ?? '').toLowerCase();
    const last = (s.lastPrompt ?? '').toLowerCase();
    const matchesText = !q || title.includes(q) || last.includes(q);
    const matchesTag = !tag || (sessionTags.value[s.id] ?? []).some((t) => t.includes(tag));
    return matchesText && matchesTag;
  });
});

/** Content search results filtered by the active tag query. */
const filteredContentResults = computed<ContentSearchResult[]>(() => {
  const tag = trimmedTagFilter.value;
  if (!tag) return contentResults.value;
  return contentResults.value.filter((r) =>
    (sessionTags.value[r.session.id] ?? []).some((t) => t.includes(tag)),
  );
});

/** Extract readable text segments from an AppMessage's content blocks. */
function extractMessageTexts(msg: AppMessage): string[] {
  const out: string[] = [];
  for (const block of msg.content) {
    if (block.type === 'text' && block.text) {
      out.push(block.text);
    }
  }
  return out;
}

/** Build an HTML-safe snippet (≈120 chars) around the first match, wrapping
 *  the matched substring in <mark> for highlighting. Returns '' if no match. */
function buildSnippet(text: string, queryLower: string): string {
  const idx = text.toLowerCase().indexOf(queryLower);
  if (idx === -1) return '';
  const matchLen = queryLower.length;
  const radius = 60;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + matchLen + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const before = escHtml(text.slice(start, idx));
  const match = escHtml(text.slice(idx, idx + matchLen));
  const after = escHtml(text.slice(idx + matchLen, end));
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Fetch message texts for a session (cached). Returns [] on error. */
async function fetchMessageTexts(sessionId: string): Promise<string[]> {
  const cached = messageTextCache.get(sessionId);
  if (cached) return cached;
  try {
    const page = await getKimiWebApi().listMessages(sessionId, { pageSize: 50 });
    const texts: string[] = [];
    for (const msg of page.items) {
      texts.push(...extractMessageTexts(msg));
    }
    messageTextCache.set(sessionId, texts);
    return texts;
  } catch {
    return [];
  }
}

/** Run the full-text content search across the most recent sessions. */
async function runContentSearch(query: string): Promise<void> {
  const token = ++contentSearchToken;
  const queryLower = query.toLowerCase();
  contentSearching.value = true;
  contentError.value = false;
  contentResults.value = [];
  contentSearchedCount.value = 0;

  const sessionsToSearch = props.sessions.slice(0, 50);

  // Fetch all session texts concurrently, processing matches as they arrive.
  const results: ContentSearchResult[] = [];
  let searched = 0;

  // Process in batches of 8 to avoid overwhelming the server.
  const batchSize = 8;
  for (let i = 0; i < sessionsToSearch.length; i += batchSize) {
    if (token !== contentSearchToken) return; // superseded
    const batch = sessionsToSearch.slice(i, i + batchSize);
    const textsPerSession = await Promise.all(
      batch.map((s) => fetchMessageTexts(s.id)),
    );
    if (token !== contentSearchToken) return; // superseded

    for (let j = 0; j < batch.length; j++) {
      const session = batch[j]!;
      const texts = textsPerSession[j]!;
      searched++;
      // Find the best snippet across all text segments.
      let bestSnippet = '';
      for (const text of texts) {
        const snippet = buildSnippet(text, queryLower);
        if (snippet && !bestSnippet) {
          bestSnippet = snippet;
          break; // first match is enough
        }
      }
      if (bestSnippet) {
        results.push({ session, snippet: bestSnippet });
      }
    }
    contentSearchedCount.value = searched;
    // Update results incrementally so users see matches appear.
    contentResults.value = [...results];
  }

  contentSearching.value = false;
}

// Debounce wrapper for content search.
let contentSearchTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleContentSearch(query: string): void {
  clearTimeout(contentSearchTimer);
  contentSearchTimer = setTimeout(() => {
    void runContentSearch(query);
  }, 300);
}

// Watch query changes in content mode.
watch(
  () => trimmedQuery.value,
  (q) => {
    if (searchMode.value !== 'content') return;
    if (!q) {
      contentResults.value = [];
      contentSearching.value = false;
      contentError.value = false;
      return;
    }
    scheduleContentSearch(q);
  },
);

// When switching to content mode with an active query, trigger search.
watch(searchMode, (mode) => {
  if (mode === 'content' && trimmedQuery.value) {
    scheduleContentSearch(trimmedQuery.value);
  } else if (mode === 'title') {
    contentResults.value = [];
    contentSearching.value = false;
    contentError.value = false;
  }
});

function clearSearch(): void {
  searchQuery.value = '';
  tagFilter.value = '';
  contentResults.value = [];
  contentSearching.value = false;
  contentError.value = false;
}

function onSelectResult(sessionId: string): void {
  clearSearch();
  onSelectSession(sessionId);
}

// ---------------------------------------------------------------------------
// Collapse groups
// ---------------------------------------------------------------------------
const collapsedIds = ref<Set<string>>(new Set(loadCollapsedWorkspaces()));

function isCollapsed(id: string): boolean {
  return collapsedIds.value.has(id);
}

function toggleCollapse(id: string): void {
  const next = new Set(collapsedIds.value);
  if (next.has(id)) {
    next.delete(id);
    // Reset session expansion when workspace is expanded
    const expandedNext = new Set(expandedWsIds.value);
    expandedNext.delete(id);
    expandedWsIds.value = expandedNext;
  } else {
    next.add(id);
  }
  collapsedIds.value = next;
  saveCollapsedWorkspaces(next);
}

// ---------------------------------------------------------------------------
// Session list truncation per workspace
// ---------------------------------------------------------------------------
const DEFAULT_VISIBLE_COUNT = 10;

/** workspace id → true = show all sessions */
const expandedWsIds = ref<Set<string>>(new Set());

function isExpanded(wsId: string): boolean {
  return expandedWsIds.value.has(wsId);
}

function toggleExpand(wsId: string): void {
  const next = new Set(expandedWsIds.value);
  if (next.has(wsId)) next.delete(wsId);
  else next.add(wsId);
  expandedWsIds.value = next;
}

/** Sort sessions so pinned ones appear first while preserving recency within
    each pinned/unpinned block. */
function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aPinned = isPinned(a.id) ? 1 : 0;
    const bPinned = isPinned(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });
}

/** Show the most recent N sessions. If the active session is older than N,
    replace the last slot with it so the highlight never disappears. */
function visibleSessions(sessions: Session[], expanded: boolean, activeId?: string): Session[] {
  const sorted = sortSessions(sessions);
  if (expanded || sorted.length <= DEFAULT_VISIBLE_COUNT) return sorted;
  const visible = sorted.slice(0, DEFAULT_VISIBLE_COUNT);
  if (activeId && !visible.some((s) => s.id === activeId)) {
    const active = sorted.find((s) => s.id === activeId);
    if (active) visible[DEFAULT_VISIBLE_COUNT - 1] = active;
  }
  return visible;
}

// ---------------------------------------------------------------------------
// Shift-multi-select workspaces
// ---------------------------------------------------------------------------
const selectedIds = ref<Set<string>>(new Set());

function handleGhClick(wsId: string, e: MouseEvent): void {
  if (e.shiftKey) {
    e.stopPropagation();
    const next = new Set(selectedIds.value);
    if (next.has(wsId)) next.delete(wsId);
    else next.add(wsId);
    selectedIds.value = next;
    emit('selectWorkspaces', Array.from(next));
    return;
  }
  // Normal click: clear multi-selection then toggle collapse
  selectedIds.value = new Set();
  emit('selectWorkspaces', []);
  toggleCollapse(wsId);
}

function onSelectSession(sessionId: string): void {
  selectedIds.value = new Set();
  emit('selectWorkspaces', []);
  emit('select', sessionId);
}

// ---------------------------------------------------------------------------
// Rename workspace (inline, like SessionRow)
// ---------------------------------------------------------------------------
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function startRenameWorkspace(id: string, name: string): void {
  renamingId.value = id;
  renameValue.value = name;
  void nextTick().then(() => renameInputRef.value?.focus());
}

function confirmRenameWorkspace(): void {
  const id = renamingId.value;
  const name = renameValue.value.trim();
  if (id && name) {
    emit('renameWorkspace', id, name);
  }
  renamingId.value = null;
}

function cancelRenameWorkspace(): void {
  renamingId.value = null;
}

// ---------------------------------------------------------------------------
// Workspace right-click menu (copy path, rename)
// ---------------------------------------------------------------------------
const ghMenuOpen = ref(false);
const ghMenuTarget = ref<WorkspaceView | null>(null);
const ghMenuStyle = ref<Record<string, string>>({});
const ghMenuRef = ref<HTMLElement | null>(null);

function onGhMenuDocClick(e: MouseEvent): void {
  if (ghMenuRef.value && !ghMenuRef.value.contains(e.target as Node)) {
    closeGhMenu();
  }
}

function openGhMenu(ws: WorkspaceView, e: MouseEvent): void {
  if (e.shiftKey) {
    // shift+right-click = multi-select (same as shift+click)
    e.stopPropagation();
    const next = new Set(selectedIds.value);
    if (next.has(ws.id)) next.delete(ws.id);
    else next.add(ws.id);
    selectedIds.value = next;
    emit('selectWorkspaces', Array.from(next));
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  ghMenuTarget.value = ws;
  ghMenuStyle.value = {
    top: `${e.clientY}px`,
    left: `${e.clientX}px`,
  };
  ghMenuOpen.value = true;
  document.addEventListener('mousedown', onGhMenuDocClick, true);
}

function closeGhMenu(): void {
  ghMenuOpen.value = false;
  document.removeEventListener('mousedown', onGhMenuDocClick, true);
  ghMenuTarget.value = null;
  disarmDeleteWs();
}

function copyPathFromMenu(): void {
  if (ghMenuTarget.value) {
    void copyTextToClipboard(ghMenuTarget.value.root);
  }
  closeGhMenu();
}

function startRenameFromMenu(): void {
  if (ghMenuTarget.value) {
    startRenameWorkspace(ghMenuTarget.value.id, ghMenuTarget.value.name);
  }
  closeGhMenu();
}

function deleteFromMenu(): void {
  const ws = ghMenuTarget.value;
  if (!ws) return;
  if (!armDeleteWs(ws.id)) return; // first click arms ("confirm?"), keep menu open
  emit('deleteWorkspace', ws.id);
  closeGhMenu();
}

// ---------------------------------------------------------------------------
// Two-step workspace delete (shared by the kebab menu and the context menu):
// the first click arms the item — it turns into a "confirm" label — and a
// second click within 2.5s actually deletes; otherwise the item reverts.
// ---------------------------------------------------------------------------
const deleteArmedWsId = ref<string | null>(null);
let deleteArmTimer: ReturnType<typeof setTimeout> | undefined;

function disarmDeleteWs(): void {
  clearTimeout(deleteArmTimer);
  deleteArmedWsId.value = null;
}

/** Returns true when the delete is confirmed (second click while armed). */
function armDeleteWs(id: string): boolean {
  if (deleteArmedWsId.value === id) {
    disarmDeleteWs();
    return true;
  }
  clearTimeout(deleteArmTimer);
  deleteArmedWsId.value = id;
  deleteArmTimer = setTimeout(() => {
    deleteArmedWsId.value = null;
  }, 2500);
  return false;
}

// ---------------------------------------------------------------------------
// Workspace inline more-menu (kebab, hover-triggered). Rendered position:fixed
// and anchored to the ⋯ button so the scrolling session list can't clip it;
// it doesn't follow the anchor, so scroll/resize simply close it.
// ---------------------------------------------------------------------------
const wsMenuOpenId = ref<string | null>(null);
const wsMenuTarget = ref<WorkspaceView | null>(null);
const wsMenuStyle = ref<Record<string, string>>({});
const wsMenuRef = ref<HTMLElement | null>(null);

function onWsMenuDocClick(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.closest('.gh-more') || target.closest('.ws-menu')) return;
  closeWsMenu();
}

async function toggleWsMenu(ws: WorkspaceView, e: MouseEvent): Promise<void> {
  if (wsMenuOpenId.value === ws.id) {
    closeWsMenu();
    return;
  }
  const btn = e.currentTarget as HTMLElement;
  wsMenuTarget.value = ws;
  wsMenuOpenId.value = ws.id;
  document.addEventListener('mousedown', onWsMenuDocClick);
  document.addEventListener('scroll', closeWsMenu, true);
  window.addEventListener('resize', closeWsMenu);
  await nextTick();
  const menu = wsMenuRef.value;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuH = menu?.offsetHeight ?? 0;
  const menuW = menu?.offsetWidth ?? 0;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  let left = r.right - menuW;
  if (left < margin) left = margin;
  wsMenuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function closeWsMenu(): void {
  wsMenuOpenId.value = null;
  wsMenuTarget.value = null;
  disarmDeleteWs();
  document.removeEventListener('mousedown', onWsMenuDocClick);
  document.removeEventListener('scroll', closeWsMenu, true);
  window.removeEventListener('resize', closeWsMenu);
}

function copyWsPath(ws: WorkspaceView): void {
  void copyTextToClipboard(ws.root);
  closeWsMenu();
}

function startRenameWs(ws: WorkspaceView): void {
  startRenameWorkspace(ws.id, ws.name);
  closeWsMenu();
}

function deleteWs(ws: WorkspaceView): void {
  if (!armDeleteWs(ws.id)) return; // first click arms ("confirm?"), keep menu open
  emit('deleteWorkspace', ws.id);
  closeWsMenu();
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGhMenuDocClick, true);
  document.removeEventListener('mousedown', onWsMenuDocClick);
  document.removeEventListener('scroll', closeWsMenu, true);
  window.removeEventListener('resize', closeWsMenu);
  clearTimeout(deleteArmTimer);
  clearTimeout(contentSearchTimer);
  contentSearchToken++; // invalidate any in-flight search
});

// Logo easter-egg: clicking the Kimi mark plays one quick blink. It's a one-shot
// animation — force a reflow so rapid clicks restart it, then drop the class so
// the idle look/blink loop resumes.
const logoRef = ref<SVGSVGElement | null>(null);
let blinkTimer: ReturnType<typeof setTimeout> | undefined;

// Temporarily hide the new-workspace button while we evaluate the entry point.
const showNewWorkspaceButton = false;

function blinkOnce(): void {
  const el = logoRef.value;
  if (!el) return;
  el.classList.remove('blink-now');
  void el.getBoundingClientRect();
  el.classList.add('blink-now');
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => el.classList.remove('blink-now'), 300);
}
</script>

<template>
  <aside class="side">
    <!-- Session column -->
    <div class="col" :style="{ width: colWidth + 'px' }">
      <!-- Header: logo + settings (no hard border — flows into workspace list) -->
      <div class="ch">
        <div class="ch-brand">
          <svg ref="logoRef" class="ch-logo" :class="{ 'is-dev': isDev }" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kimi Code" @click="blinkOnce">
            <defs>
              <mask id="kimiEyes" maskUnits="userSpaceOnUse">
                <rect x="0" y="0" width="32" height="22" fill="#fff" />
                <g class="ch-eyes" fill="#000">
                  <rect class="ch-eye" x="11.8" y="7" width="2.8" height="8" rx="1.4" />
                  <rect class="ch-eye" x="17.4" y="7" width="2.8" height="8" rx="1.4" />
                </g>
              </mask>
            </defs>
            <rect x="1" y="1" width="30" height="20" rx="6" fill="var(--logo)" mask="url(#kimiEyes)" />
          </svg>
          <span class="ch-name">Kimi Code<span v-if="isDev" class="ch-endpoint"> · {{ endpoint }}</span></span>
        </div>
        <button
          type="button"
          class="collapse-btn"
          :title="t('sidebar.collapseSidebar')"
          :aria-label="t('sidebar.collapseSidebar')"
          @click.stop="emit('collapse')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 6h9" />
            <path d="M11 12h9" />
            <path d="M11 18h9" />
            <path d="M7 9l-3 3 3 3" />
          </svg>
        </button>
        <button
          type="button"
          class="settings-btn"
          :title="t('settings.title')"
          :aria-label="t('settings.title')"
          @click.stop="emit('openSettings')"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
          </svg>
        </button>
      </div>

      <!-- Session search -->
      <div class="search">
        <svg class="search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          v-model="searchQuery"
          class="search-input"
          type="text"
          :placeholder="t('sidebar.searchPlaceholder')"
          :aria-label="t('sidebar.searchPlaceholder')"
          @keydown.esc.stop="clearSearch"
        />
        <!-- Search mode toggle: Title ↔ Content -->
        <div class="search-mode-toggle" role="group" :aria-label="t('sidebar.searchModeTitle') + ' / ' + t('sidebar.searchModeContent')">
          <button
            type="button"
            class="mode-btn"
            :class="{ active: searchMode === 'title' }"
            :title="t('sidebar.searchModeTitleHint')"
            @click.stop="searchMode = 'title'"
          >{{ t('sidebar.searchModeTitle') }}</button>
          <button
            type="button"
            class="mode-btn"
            :class="{ active: searchMode === 'content' }"
            :title="t('sidebar.searchModeContentHint')"
            @click.stop="searchMode = 'content'"
          >{{ t('sidebar.searchModeContent') }}</button>
        </div>
        <button
          v-if="isSearching"
          type="button"
          class="search-clear"
          :title="t('sidebar.searchClear')"
          :aria-label="t('sidebar.searchClear')"
          @click.stop="clearSearch"
        >
          <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>

      <!-- Tag filter -->
      <div class="tag-filter">
        <svg class="tag-filter-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 2l3 6v6l4-3V8l3-6H2z"/>
        </svg>
        <input
          v-model="tagFilter"
          class="tag-filter-input"
          type="text"
          list="session-tag-suggestions"
          :placeholder="t('sidebar.tagFilterPlaceholder')"
          :aria-label="t('sidebar.tagFilterPlaceholder')"
          @keydown.esc.stop="clearTagFilter"
        />
        <datalist v-if="allTags.length > 0" id="session-tag-suggestions">
          <option v-for="tag in allTags" :key="tag" :value="tag" />
        </datalist>
        <button
          v-if="isTagFiltering"
          type="button"
          class="tag-filter-clear"
          :title="t('sidebar.tagFilterClear')"
          :aria-label="t('sidebar.tagFilterClear')"
          @click.stop="clearTagFilter"
        >
          <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>

      <!-- New chat + new workspace buttons -->
      <div class="btn-wrap">
        <button class="btn-new-chat" @click.stop="emit('create')">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 2.5h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8.5l-2.5 2V11.5H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
          </svg>
          <span>{{ t('sidebar.newChat') }}</span>
        </button>
        <button
          v-if="showNewWorkspaceButton"
          type="button"
          class="btn-new-ws"
          :title="t('sidebar.newWorkspace')"
          :aria-label="t('sidebar.newWorkspace')"
          @click.stop="emit('addWorkspace')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M1 3.5V2.5A1 1 0 0 1 2 1.5h3.5l1.3 2h5.2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/>
            <path d="M1 5.5h12"/>
          </svg>
        </button>
      </div>

      <!-- Search results (flat, across all workspaces) -->
      <div v-if="isSearching" class="sessions">
        <!-- Title mode: standard SessionRow list -->
        <template v-if="searchMode === 'title'">
          <template v-if="searchResults.length > 0">
            <SessionRow
              v-for="s in searchResults"
              :key="s.id"
              :session="s"
              :active="s.id === activeId"
              :approval-count="pendingBySession[s.id]?.approvals ?? 0"
              :question-count="pendingBySession[s.id]?.questions ?? 0"
              :unread="unreadBySession[s.id] ?? false"
              :pinned="isPinned(s.id)"
              :tags="sessionTagsFor(s.id)"
              @select="onSelectResult($event)"
              @rename="(id, title) => emit('rename', id, title)"
              @archive="emit('archive', $event)"
              @fork="emit('fork', $event)"
              @pin-toggle="togglePinned($event)"
              @add-tag="addSessionTag"
              @remove-tag="removeSessionTag"
            />
          </template>
          <div v-else class="empty">
            {{ t('sidebar.searchNoResults') }}
          </div>
        </template>

        <!-- Content mode: full-text search results with snippets -->
        <template v-else>
          <div v-if="contentSearching && filteredContentResults.length === 0" class="empty">
            {{ t('sidebar.contentSearching') }}
          </div>
          <template v-else>
            <div
              v-for="r in filteredContentResults"
              :key="r.session.id"
              class="content-result"
              :class="{ on: r.session.id === activeId }"
              @click="onSelectResult(r.session.id)"
            >
              <div class="content-result-title">{{ r.session.title }}</div>
              <div class="content-result-snippet" v-html="r.snippet"></div>
            </div>
            <div v-if="filteredContentResults.length === 0 && !contentSearching" class="empty">
              {{ contentError ? t('sidebar.contentSearchError') : t('sidebar.searchNoResults') }}
            </div>
            <div
              v-if="filteredContentResults.length > 0 || contentSearching"
              class="content-search-info"
            >
              {{ t('sidebar.contentSearchLimit', { searched: contentSearchedCount, total: Math.min(sessions.length, 50) }) }}
            </div>
          </template>
        </template>
      </div>

      <!-- Session list — grouped by workspace -->
      <div v-else class="sessions">
        <!-- Empty state — only when no workspace is registered at all; empty
             workspaces still render their group header (with the + button). -->
        <div v-if="groups.length === 0" class="empty">
          {{ t('workspace.noWorkspace') }}
        </div>

        <template v-else>
          <div v-for="g in groups" :key="g.workspace.id" class="group">
            <div
              class="gh"
              :class="{ on: g.workspace.id === activeWorkspaceId, sel: selectedIds.has(g.workspace.id) }"
              @click.stop="handleGhClick(g.workspace.id, $event)"
              @contextmenu="openGhMenu(g.workspace, $event)"
            >
              <div class="gh-top">
                <!-- Folder icon -->
                <svg
                  class="gh-folder"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  aria-hidden="true"
                >
                  <template v-if="isCollapsed(g.workspace.id)">
                    <rect x="1" y="3.5" width="12" height="8.5" rx="1"/>
                    <path d="M1 5V3.5A1 1 0 0 1 2 2.5h3.5l1.3 2"/>
                  </template>
                  <template v-else>
                    <path d="M1 3.5V2.5A1 1 0 0 1 2 1.5h3.5l1.3 2h5.2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/>
                    <path d="M1 5.5h12"/>
                  </template>
                </svg>

                <!-- Workspace name -->
                <span
                  v-if="renamingId !== g.workspace.id"
                  class="gh-name"
                >{{ g.workspace.name }}</span>
                <input
                  v-else
                  ref="renameInputRef"
                  v-model="renameValue"
                  class="gh-rename"
                  type="text"
                  @keydown.enter="confirmRenameWorkspace"
                  @keydown.esc="cancelRenameWorkspace"
                  @blur="cancelRenameWorkspace"
                  @click.stop
                />

                <button
                  type="button"
                  class="gh-more"
                  :class="{ open: wsMenuOpenId === g.workspace.id }"
                  :title="t('sidebar.options')"
                  :aria-label="t('sidebar.options')"
                  aria-haspopup="menu"
                  :aria-expanded="wsMenuOpenId === g.workspace.id"
                  @click.stop="toggleWsMenu(g.workspace, $event)"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.3" />
                    <circle cx="8" cy="8" r="1.3" />
                    <circle cx="8" cy="13" r="1.3" />
                  </svg>
                </button>

                <button
                  type="button"
                  class="gh-add"
                  :title="t('workspace.newInGroup')"
                  :aria-label="t('workspace.newInGroup')"
                  @click.stop="emit('createInWorkspace', g.workspace.id)"
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M8 3v10M3 8h10"/>
                  </svg>
                </button>
              </div>

              <div class="gh-path" :title="g.workspace.root">{{ g.workspace.shortPath || g.workspace.root }}</div>
            </div>
            <div v-show="!isCollapsed(g.workspace.id)" class="group-sessions">
              <SessionRow
                v-for="s in visibleSessions(g.sessions, isExpanded(g.workspace.id), activeId)"
                :key="s.id"
                :session="s"
                :active="s.id === activeId"
                :approval-count="pendingBySession[s.id]?.approvals ?? 0"
                :question-count="pendingBySession[s.id]?.questions ?? 0"
                :unread="unreadBySession[s.id] ?? false"
                :pinned="isPinned(s.id)"
                :tags="sessionTagsFor(s.id)"
                @select="onSelectSession($event)"
                @rename="(id, title) => emit('rename', id, title)"
                @archive="emit('archive', $event)"
                @fork="emit('fork', $event)"
                @pin-toggle="togglePinned($event)"
                @add-tag="addSessionTag"
                @remove-tag="removeSessionTag"
              />
              <button
                v-if="!isExpanded(g.workspace.id) && visibleSessions(g.sessions, false, activeId).length < g.sessions.length"
                class="show-more"
                @click.stop="toggleExpand(g.workspace.id)"
              >
                {{ t('sidebar.showMore', { count: g.sessions.length - visibleSessions(g.sessions, false, activeId).length }) }}
              </button>
              <div v-if="g.sessions.length === 0" class="group-empty">{{ t('sidebar.noSessions') }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Workspace right-click menu (position:fixed) -->
    <div
      v-if="ghMenuOpen"
      ref="ghMenuRef"
      class="gh-menu"
      :style="ghMenuStyle"
      @click.stop
    >
      <button type="button" class="ghm-item" @click="copyPathFromMenu">
        {{ t('sidebar.copyPath') }}
      </button>
      <button type="button" class="ghm-item" @click="startRenameFromMenu">
        {{ t('sidebar.rename') }}
      </button>
      <button type="button" class="ghm-item del" @click="deleteFromMenu">
        {{ ghMenuTarget && deleteArmedWsId === ghMenuTarget.id ? t('sidebar.confirm') : t('sidebar.removeWorkspace') }}
      </button>
    </div>

    <!-- Workspace kebab menu (position:fixed, anchored to the ⋯ button so the
         scrolling session list cannot clip it) -->
    <div
      v-if="wsMenuOpenId !== null && wsMenuTarget"
      ref="wsMenuRef"
      class="ws-menu"
      :style="wsMenuStyle"
      @click.stop
    >
      <button class="ws-menu-item" @click.stop="copyWsPath(wsMenuTarget)">
        {{ t('sidebar.copyPath') }}
      </button>
      <div class="ws-menu-divider" />
      <button class="ws-menu-item" @click.stop="startRenameWs(wsMenuTarget)">
        {{ t('sidebar.rename') }}
      </button>
      <div class="ws-menu-divider" />
      <button class="ws-menu-item del" @click.stop="deleteWs(wsMenuTarget)">
        {{ deleteArmedWsId === wsMenuTarget.id ? t('sidebar.confirm') : t('sidebar.removeWorkspace') }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.side {
  border-right: 1px solid var(--line);
  background: var(--panel);
  display: flex;
  flex-direction: row;
  min-width: 0;
  height: 100%;
  /* Alignment contract, inherited by SessionRow and the theme overrides in
     style.css: text in the workspace header, the path line and session rows
     all starts at --sb-pad-x + --sb-gutter + --sb-gap from the sidebar edge. */
  --sb-pad-x: 16px;  /* row horizontal padding */
  --sb-gutter: 20px; /* leading icon slot (14px folder icon + 6px margin) */
  --sb-gap: 6px;     /* gap between the icon slot and the text */
}

/* Session column. Width is set inline from the App resize handle. */
.col {
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  container-type: inline-size;
  container-name: sidebar-col;
}

/* Header: logo + settings (no border — flows into the workspace list). */
.ch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  box-sizing: border-box;
}
.ch-logo {
  height: 22px;
  width: 32px;
  flex: none;
  display: block;
  cursor: pointer;
  user-select: none;
  transition: transform 0.18s ease;
}
.ch-logo:hover {
  transform: scale(1.08);
}
/* Dev-only: tint the mark yellow so a `pnpm dev:web` tab is obvious at a
   glance. `--logo` is read by the mark's `fill`; overriding it on the svg
   recolors just this instance. */
.ch-logo.is-dev {
  --logo: #f5b301;
}
.ch-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* Take the row's slack so the action buttons group together on the right. */
  flex: 1;
}
.ch-name {
  font-size: var(--ui-font-size);
  font-weight: 500;
  line-height: 22px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Dev-only: backend host:port appended to the title. Kept secondary so the
   product name still leads. */
.ch-endpoint {
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 400;
  font-size: calc(var(--ui-font-size) - 1px);
}

/* In narrow sidebars the product name drops out so the logo keeps its fixed
   size and the action buttons remain reachable. */
@container sidebar-col (max-width: 250px) {
  .ch-name { display: none; }
}
.settings-btn,
.collapse-btn {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: none;
  border: none;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.settings-btn:hover,
.collapse-btn:hover { background: var(--soft); color: var(--ink); }
.settings-btn:focus-visible,
.collapse-btn:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}

/* Action buttons */
 .btn-wrap {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
}
.btn-wrap button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 10px;
  font-family: var(--mono);
  font-size: var(--ui-font-size);
  font-weight: 400;
  line-height: 1;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.btn-wrap button svg { flex: none; }
.btn-wrap button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
.btn-wrap button span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-new-chat {
  flex: 1;
  gap: 10px;
  color: var(--dim);
  background: transparent;
  border: 1px solid var(--line);
}
.btn-new-chat:hover {
  background: var(--panel);
  border-color: var(--bd);
  color: var(--ink);
}
.btn-new-ws {
  flex: none;
  justify-content: center;
  aspect-ratio: 1;
  padding: 9px 10px;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--line);
}
.btn-new-ws:hover {
  background: var(--panel);
  border-color: var(--bd);
  color: var(--dim);
}

/* Session search */
.search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 8px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.search:focus-within {
  border-color: var(--bd);
  color: var(--ink);
}
.search-icon {
  flex: none;
}
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink);
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 1px);
}
.search-input::placeholder {
  color: var(--faint);
}
.search-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.search-clear:hover {
  background: var(--soft);
  color: var(--ink);
}

/* Search mode toggle — two small pill buttons inside the search box */
.search-mode-toggle {
  display: inline-flex;
  flex: none;
  gap: 1px;
  background: var(--line);
  border-radius: 4px;
  overflow: hidden;
}
.mode-btn {
  border: none;
  background: transparent;
  color: var(--faint);
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 4px);
  padding: 2px 6px;
  cursor: pointer;
  line-height: 1.4;
  border-radius: 3px;
  white-space: nowrap;
}
.mode-btn:hover {
  color: var(--dim);
}
.mode-btn.active {
  background: var(--bg);
  color: var(--ink);
}

/* Tag filter */
.tag-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -4px 12px 8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
}
.tag-filter:focus-within {
  border-color: var(--bd);
  color: var(--ink);
}
.tag-filter-icon {
  flex: none;
}
.tag-filter-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink);
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 1.5px);
}
.tag-filter-input::placeholder {
  color: var(--faint);
}
.tag-filter-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.tag-filter-clear:hover {
  background: var(--soft);
  color: var(--ink);
}

/* Sessions */
.sessions {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.sessions::-webkit-scrollbar { width: 4px; }
.sessions::-webkit-scrollbar-track { background: transparent; }
.sessions::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 2px;
}
.sessions::-webkit-scrollbar-thumb:hover { background: var(--bd); }

.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--faint);
  font-size: calc(var(--ui-font-size) - 3px);
  line-height: 1.6;
}

/* Full-text content search result card */
.content-result {
  padding: 8px var(--sb-pad-x);
  cursor: pointer;
  border-bottom: 1px solid var(--line);
}
.content-result:hover { background: var(--panel2); }
.content-result.on { background: color-mix(in srgb, var(--blue) 7%, transparent); }
.content-result-title {
  color: var(--ink);
  font-size: var(--ui-font-size);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 3px;
}
.content-result-snippet {
  color: var(--dim);
  font-size: calc(var(--ui-font-size) - 3px);
  font-family: var(--mono);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.content-result-snippet :deep(mark) {
  background: color-mix(in srgb, var(--blue) 22%, transparent);
  color: var(--ink);
  border-radius: 2px;
  padding: 0 1px;
}
.content-search-info {
  padding: 6px 12px;
  color: var(--faint);
  font-size: calc(var(--ui-font-size) - 4px);
  font-family: var(--mono);
  text-align: center;
}

/* Workspace group */
.group { padding-bottom: 6px; }
.gh {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 var(--sb-pad-x) 4px;
  font-size: max(9px, calc(var(--ui-font-size) - 3.5px));
  user-select: none;
  position: relative;
}
.gh-top {
  display: flex;
  align-items: center;
  gap: var(--sb-gap);
}
.gh.sel {
  background: var(--soft);
  border-radius: 4px;
}

.gh-folder {
  flex: none;
  color: var(--muted);
  /* 14px icon + 2px margin fills the --sb-gutter icon slot */
  margin-right: calc(var(--sb-gutter) - 14px);
}

.gh-name {
  font-size: var(--ui-font-size);
  font-weight: 500;
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.gh-path {
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: calc(var(--sb-gutter) + var(--sb-gap));
  font-size: var(--ui-font-size-xs);
}
.gh-add {
  background: transparent;
  border: none;
  color: var(--faint);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Keep the icon small but give the button a ≥24px tap target. Extra padding
     is vertical only so the right-rail alignment below is preserved. */
  padding: 5px 6px;
  border-radius: 4px;
  flex: none;
  /* Pull the glyph onto the right rail: its right edge lands at --sb-pad-x
     from the sidebar edge, mirroring the folder icon's left gap and lining
     up with the session timestamps below. */
  margin-right: -6px;
}
.gh-add:hover { color: var(--dim); }
.gh-add:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}

/* More button — hidden until hover */
.gh-more {
  display: none;
  flex: none;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--muted);
  border-radius: 4px;
}
.gh:hover .gh-more,
.gh-more.open {
  display: inline-flex;
}
.gh-more:hover,
.gh-more.open { color: var(--ink); background: var(--line2); }
.gh-more:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
  /* Keyboard users can't hover, so the focused kebab must be visible. */
  display: inline-flex;
}

/* Workspace kebab dropdown menu — fixed so the scroll container can't clip it;
   anchored to the ⋯ trigger from toggleWsMenu(). */
.ws-menu {
  position: fixed;
  top: 0;
  left: 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
  z-index: 200;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  min-width: 88px;
}
.ws-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 3px);
  color: var(--ink);
  padding: 6px 12px;
}
.ws-menu-item:hover { background: var(--panel2); }

/* Danger items (delete workspace) — red in both light and dark schemes. */
.ws-menu-item.del,
.ghm-item.del { color: var(--err); }
.ws-menu-item.del:hover,
.ghm-item.del:hover {
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.ws-menu-divider {
  height: 1px;
  background: var(--line);
  margin: 2px 0;
}

.group-empty {
  padding: 8px 10px 8px calc(var(--sb-pad-x) + var(--sb-gutter) + var(--sb-gap));
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--faint);
  font-family: var(--mono);
}
.show-more {
  display: block;
  width: 100%;
  padding: 6px 10px 6px calc(var(--sb-pad-x) + var(--sb-gutter) + var(--sb-gap));
  background: none;
  border: none;
  color: var(--dim);
  font-size: calc(var(--ui-font-size) - 1.5px);
  font-family: var(--mono);
  cursor: pointer;
  text-align: left;
}
.show-more:hover {
  color: var(--blue2);
  background: var(--soft);
}

/* Inline workspace rename input */
.gh-rename {
  flex: 1;
  min-width: 0;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 400;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--blue);
  border-radius: 3px;
  padding: 2px 5px;
  outline: none;
}



/* ---------------------------------------------------------------------------
   Workspace right-click menu (position:fixed)
   --------------------------------------------------------------------------- */
.gh-menu {
  position: fixed;
  top: 0;
  left: 0;
  min-width: 140px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  padding: 4px;
  z-index: 200;
}
.ghm-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: var(--ui-font-size-xs);
  color: var(--text);
  background: transparent;
  border: none;
  cursor: pointer;
}
.ghm-item:hover {
  background: var(--soft);
}

</style>
