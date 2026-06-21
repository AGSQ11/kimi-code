<!-- apps/kimi-web/src/components/MemoryDialog.vue -->
<!-- Dialog for listing, searching, pinning/unpinning, and deleting memories. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

interface MemoryItem {
  id: string;
  content: string;
  category: string | null;
  project: string | null;
  tags: readonly string[] | null;
  pinned: boolean;
  createdAt: number;
}

const props = defineProps<{
  memories: readonly MemoryItem[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  pin: [id: string, pinned: boolean];
  delete: [id: string];
  close: [];
  refresh: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const query = ref('');

useDialogFocus(dialogRef, searchRef);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.memories;
  return props.memories.filter((m) => {
    const content = m.content.toLowerCase().includes(q);
    const tags = m.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
    const cat = (m.category ?? '').toLowerCase().includes(q);
    return content || tags || cat;
  });
});

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function togglePin(memory: MemoryItem): void {
  emit('pin', memory.id, !memory.pinned);
}

function removeMemory(id: string): void {
  emit('delete', id);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Memories">
      <div class="dh">
        <span class="dtitle">Memories</span>
        <button class="refresh-btn" title="Refresh" @click="emit('refresh')">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 8a6 6 0 1 1 1.5 4M2 12v-3h3"/>
          </svg>
        </button>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="search-wrap">
        <input
          ref="searchRef"
          v-model="query"
          class="search-input"
          type="text"
          placeholder="Search memories…"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div v-if="loading" class="loading-state">Loading memories…</div>

      <div v-else-if="filtered.length === 0" class="empty-state">
        <template v-if="query.trim()">No memories match your search.</template>
        <template v-else>No memories stored yet.</template>
      </div>

      <div v-else class="memory-list">
        <div v-for="m in filtered" :key="m.id" class="memory-row">
          <div class="memory-main">
            <div class="memory-content">{{ m.content }}</div>
            <div class="memory-meta">
              <span v-if="m.category" class="memory-cat">{{ m.category }}</span>
              <span v-if="m.project" class="memory-scope">project</span>
              <span v-else class="memory-scope global">global</span>
              <span v-if="m.tags && m.tags.length > 0" class="memory-tags">
                <span v-for="tag in m.tags" :key="tag" class="tag">#{{ tag }}</span>
              </span>
              <span class="memory-date">{{ formatDate(m.createdAt) }}</span>
            </div>
          </div>
          <div class="memory-actions">
            <button
              type="button"
              class="icon-btn"
              :class="{ pinned: m.pinned }"
              :title="m.pinned ? 'Unpin' : 'Pin'"
              @click="togglePin(m)"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                <path d="M10 2L14 6l-1.5 1.5c.5 1.5.5 3.5-1 5l-3-3C7 8 5 8 3.5 7.5L5 6l1 1L10 2z"/>
              </svg>
            </button>
            <button type="button" class="icon-btn del" title="Delete" @click="removeMemory(m.id)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 23, 28, 0.42);
  padding: 24px;
}
.dialog {
  width: min(620px, 100%);
  height: 520px;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.22);
  overflow: hidden;
}
.dh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.dtitle {
  font-family: var(--sans);
  font-size: var(--ui-font-size-lg);
  font-weight: 600;
  color: var(--ink);
  flex: 1;
}
.refresh-btn, .close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.refresh-btn:hover, .close-btn:hover { background: var(--soft); color: var(--ink); }

.search-wrap {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line2);
  flex: none;
}
.search-input {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  outline: none;
}
.search-input:focus-visible { border-color: var(--blue); }

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
}

.memory-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
  min-height: 0;
}
.memory-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line2);
}
.memory-row:last-child { border-bottom: none; }
.memory-main { flex: 1; min-width: 0; }
.memory-content {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  word-break: break-word;
  line-height: 1.45;
  margin-bottom: 5px;
}
.memory-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}
.memory-cat {
  background: var(--soft);
  padding: 1px 6px;
  border-radius: 4px;
}
.memory-scope {
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--blue) 10%, var(--bg));
  color: var(--blue);
}
.memory-scope.global {
  background: color-mix(in srgb, var(--ok) 10%, var(--bg));
  color: var(--ok);
}
.memory-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { color: var(--faint); }
.memory-date { margin-left: auto; }
.memory-actions {
  display: flex;
  flex: none;
  gap: 4px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.icon-btn:hover { background: var(--soft); color: var(--ink); }
.icon-btn.pinned { color: var(--blue); }
.icon-btn.del:hover { color: var(--err); background: color-mix(in srgb, var(--err) 8%, var(--bg)); }

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
