<!-- apps/kimi-web/src/components/NotesPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Markdown from './Markdown.vue';
import { copyTextToClipboard } from '../lib/clipboard';

const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  insert: [text: string];
}>();

const NOTES_STORAGE_KEY = 'kimi-web:notes';
const ACTIVE_NOTE_KEY = 'kimi-web:active-note';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

const notes = ref<Note[]>([]);
const activeNoteId = ref<string | null>(null);
const searchQuery = ref('');
const previewMode = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const copied = ref(false);

const activeNote = computed<Note | undefined>(() =>
  notes.value.find((n) => n.id === activeNoteId.value),
);

const filteredNotes = computed<Note[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return notes.value;
  return notes.value.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q),
  );
});

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadNotes(): void {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (raw) {
      notes.value = JSON.parse(raw);
    }
  } catch {
    notes.value = [];
  }
  try {
    const active = localStorage.getItem(ACTIVE_NOTE_KEY);
    if (active) activeNoteId.value = active;
  } catch {
    activeNoteId.value = null;
  }
  if (notes.value.length === 0) {
    createNote();
  } else if (!activeNoteId.value || !notes.value.find((n) => n.id === activeNoteId.value)) {
    activeNoteId.value = notes.value[0]!.id;
  }
}

function saveNotes(): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes.value));
  } catch {
    // ignore
  }
}

function saveActiveNote(): void {
  try {
    if (activeNoteId.value) {
      localStorage.setItem(ACTIVE_NOTE_KEY, activeNoteId.value);
    }
  } catch {
    // ignore
  }
}

function createNote(): void {
  const note: Note = {
    id: generateId(),
    title: t('notes.untitled'),
    content: '',
    updatedAt: Date.now(),
  };
  notes.value.unshift(note);
  activeNoteId.value = note.id;
  saveNotes();
  saveActiveNote();
  nextTick(() => textareaRef.value?.focus());
}

function deleteNote(id: string): void {
  const idx = notes.value.findIndex((n) => n.id === id);
  if (idx === -1) return;
  notes.value.splice(idx, 1);
  if (activeNoteId.value === id) {
    activeNoteId.value = notes.value[0]?.id ?? null;
  }
  if (notes.value.length === 0) {
    createNote();
  } else {
    saveNotes();
  }
}

function selectNote(id: string): void {
  activeNoteId.value = id;
  saveActiveNote();
  previewMode.value = false;
}

function updateNoteContent(content: string): void {
  const note = notes.value.find((n) => n.id === activeNoteId.value);
  if (!note) return;
  note.content = content;
  note.updatedAt = Date.now();
  // Auto-title from first line if not manually set
  const firstLine = content.trim().split('\n')[0]?.trim() ?? '';
  if (firstLine && note.title === t('notes.untitled')) {
    note.title = firstLine.slice(0, 40) || t('notes.untitled');
  }
  saveNotes();
}

function insertIntoChat(): void {
  const content = activeNote.value?.content ?? '';
  if (!content.trim()) return;
  emit('insert', content);
}

function copyNote(): void {
  const content = activeNote.value?.content ?? '';
  if (!content.trim()) return;
  void copyTextToClipboard(content).then((ok) => {
    if (!ok) return;
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1400);
  });
}

function insertMarkdown(prefix: string, suffix: string): void {
  const ta = textareaRef.value;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const content = activeNote.value?.content ?? '';
  const before = content.slice(0, start);
  const selected = content.slice(start, end);
  const after = content.slice(end);
  const newContent = before + prefix + selected + suffix + after;
  updateNoteContent(newContent);
  nextTick(() => {
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd = end + prefix.length;
    ta.focus();
  });
}

function toolbarAction(action: 'bold' | 'italic' | 'code' | 'link'): void {
  switch (action) {
    case 'bold': insertMarkdown('**', '**'); break;
    case 'italic': insertMarkdown('*', '*'); break;
    case 'code': insertMarkdown('`', '`'); break;
    case 'link': insertMarkdown('[', '](url)'); break;
  }
}

function noteTitle(note: Note): string {
  if (note.title && note.title !== t('notes.untitled')) return note.title;
  const firstLine = note.content.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 40) || t('notes.untitled');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

onMounted(() => {
  loadNotes();
  nextTick(() => textareaRef.value?.focus());
});

watch(activeNoteId, () => {
  saveActiveNote();
  nextTick(() => textareaRef.value?.focus());
});
</script>

<template>
  <div class="notes-panel">
    <!-- Left sidebar: note list + search -->
    <div class="notes-sidebar">
      <div class="notes-sidebar-head">
        <span class="notes-title">{{ t('notes.title') }}</span>
        <button
          type="button"
          class="notes-icon-btn"
          :title="t('notes.newNote')"
          @click="createNote"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10"/>
          </svg>
        </button>
      </div>
      <div class="notes-search">
        <input
          v-model="searchQuery"
          type="search"
          class="notes-search-input"
          :placeholder="t('notes.search')"
        />
      </div>
      <div class="notes-list">
        <button
          v-for="note in filteredNotes"
          :key="note.id"
          type="button"
          class="notes-list-item"
          :class="{ active: note.id === activeNoteId }"
          @click="selectNote(note.id)"
        >
          <span class="notes-list-title">{{ noteTitle(note) }}</span>
          <span class="notes-list-meta">{{ formatTime(note.updatedAt) }}</span>
        </button>
        <div v-if="filteredNotes.length === 0" class="notes-empty">
          {{ t('notes.noResults') }}
        </div>
      </div>
    </div>

    <!-- Right: editor -->
    <div class="notes-editor">
      <div class="notes-editor-head">
        <div class="notes-toolbar">
          <button
            type="button"
            class="notes-tool-btn"
            :title="t('notes.bold')"
            @click="toolbarAction('bold')"
          >
            <b>B</b>
          </button>
          <button
            type="button"
            class="notes-tool-btn"
            :title="t('notes.italic')"
            @click="toolbarAction('italic')"
          >
            <i>I</i>
          </button>
          <button
            type="button"
            class="notes-tool-btn"
            :title="t('notes.code')"
            @click="toolbarAction('code')"
          >
            <code>&lt;/&gt;</code>
          </button>
          <button
            type="button"
            class="notes-tool-btn"
            :title="t('notes.link')"
            @click="toolbarAction('link')"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M6.5 9.5a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.2l-1 1"/>
              <path d="M9.5 6.5a3 3 0 0 0-4.2-.3l-2 2a3 3 0 0 0 4.2 4.2l1-1"/>
            </svg>
          </button>
        </div>
        <div class="notes-editor-actions">
          <button
            type="button"
            class="notes-action-btn"
            :class="{ on: previewMode }"
            @click="previewMode = !previewMode"
          >
            {{ previewMode ? t('notes.edit') : t('notes.preview') }}
          </button>
          <button
            type="button"
            class="notes-action-btn"
            :class="{ copied }"
            @click="copyNote"
          >
            {{ copied ? t('notes.copied') : t('notes.copy') }}
          </button>
          <button
            type="button"
            class="notes-action-btn notes-primary"
            @click="insertIntoChat"
          >
            {{ t('notes.insertIntoChat') }}
          </button>
          <button
            v-if="activeNote"
            type="button"
            class="notes-icon-btn notes-danger"
            :title="t('notes.deleteNote')"
            @click="deleteNote(activeNote.id)"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 5h10"/>
              <path d="M5.5 5v8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V5"/>
              <path d="M6 3h4"/>
            </svg>
          </button>
          <button
            type="button"
            class="notes-close"
            :title="t('notes.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>

      <div class="notes-editor-body">
        <textarea
          v-if="!previewMode"
          ref="textareaRef"
          class="notes-textarea"
          :value="activeNote?.content ?? ''"
          @input="updateNoteContent(($event.target as HTMLTextAreaElement).value)"
          :placeholder="t('notes.placeholder')"
        />
        <div v-else class="notes-preview">
          <Markdown :text="activeNote?.content ?? ''" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-panel {
  display: flex;
  height: 100%;
  background: var(--bg);
  font-family: var(--mono);
  min-width: 0;
}

/* ---- Sidebar ---- */
.notes-sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  min-width: 0;
  border-right: 1px solid var(--line);
  background: var(--panel);
}

.notes-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  flex: none;
}

.notes-title {
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ink);
  text-transform: uppercase;
}

.notes-search {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  flex: none;
}

.notes-search-input {
  width: 100%;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 2px 7px;
  background: var(--bg);
  color: var(--ink);
  font: 11px var(--mono);
  box-sizing: border-box;
}
.notes-search-input:focus {
  outline: 2px solid var(--blue);
  outline-offset: -1px;
}

.notes-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}

.notes-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--dim);
  font: 11px var(--mono);
  cursor: pointer;
  box-sizing: border-box;
}
.notes-list-item:hover {
  background: var(--soft);
  color: var(--ink);
}
.notes-list-item.active {
  background: var(--soft);
  color: var(--blue2);
}

.notes-list-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.notes-list-meta {
  font-size: 10px;
  color: var(--muted);
}

.notes-empty {
  padding: 16px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 11px;
}

/* ---- Editor ---- */
.notes-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.notes-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-height: var(--panel-head-h, 32px);
  padding: 3px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  flex: none;
}

.notes-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
}

.notes-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--panel2);
  color: var(--dim);
  font-size: 11px;
  cursor: pointer;
}
.notes-tool-btn:hover {
  background: var(--soft);
  color: var(--blue2);
  border-color: var(--bd);
}
.notes-tool-btn:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -1px;
}

.notes-editor-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.notes-action-btn {
  padding: 3px 10px;
  font-size: calc(var(--ui-font-size) - 3px);
  font-family: var(--mono);
  background: var(--panel2);
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--dim);
  cursor: pointer;
  white-space: nowrap;
}
.notes-action-btn:hover {
  background: var(--soft);
  color: var(--blue2);
  border-color: var(--bd);
}
.notes-action-btn:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -1px;
}
.notes-action-btn.on {
  background: var(--soft);
  color: var(--blue2);
  border-color: var(--bd);
}
.notes-action-btn.copied {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 35%, var(--bg));
}
.notes-action-btn.notes-primary {
  background: var(--blue);
  color: var(--bg);
  border-color: var(--blue);
}
.notes-action-btn.notes-primary:hover {
  background: var(--blue2);
  border-color: var(--blue2);
}

.notes-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--panel2);
  color: var(--dim);
  cursor: pointer;
}
.notes-icon-btn:hover {
  background: var(--soft);
  color: var(--blue2);
  border-color: var(--bd);
}
.notes-icon-btn.notes-danger:hover {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 35%, var(--bg));
}

.notes-close {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.notes-close:hover {
  background: var(--soft);
  color: var(--ink);
}

/* ---- Body ---- */
.notes-editor-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.notes-textarea {
  width: 100%;
  height: 100%;
  border: none;
  padding: 16px 20px;
  background: var(--bg);
  color: var(--ink);
  font: var(--ui-font-size) / 1.6 var(--mono);
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.notes-preview {
  padding: 16px 20px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

/* Narrow panel: collapse sidebar */
@media (max-width: 480px) {
  .notes-sidebar {
    width: 140px;
  }
}
</style>
