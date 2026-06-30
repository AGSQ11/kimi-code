<!-- apps/kimi-web/src/components/CommandPalette.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { SLASH_COMMANDS, buildSlashItems } from '../lib/slashCommands';

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  category: 'command' | 'session' | 'model' | 'ui';
  action: () => void;
  icon?: string;
}

const props = defineProps<{
  open: boolean;
  skills?: { name: string; description: string }[];
}>();

const emit = defineEmits<{
  close: [];
  command: [cmd: string];
  newSession: [];
  searchSessions: [];
  switchModel: [];
  probeModels: [];
  toggleTheme: [];
  togglePlan: [];
  toggleSidebar: [];
  openSettings: [];
  openMemory: [];
  openCompare: [];
  openNotes: [];
  clearSession: [];
}>();

const { t } = useI18n();
const query = ref('');
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const items = computed<PaletteItem[]>(() => {
  const out: PaletteItem[] = [];

  // Slash commands + skills
  const slashItems = buildSlashItems(props.skills);
  for (const cmd of slashItems) {
    out.push({
      id: `cmd-${cmd.name}`,
      label: cmd.name,
      description: cmd.isSkill ? cmd.desc : t(cmd.desc as unknown as string),
      category: 'command',
      action: () => emit('command', cmd.name),
    });
  }

  // Session actions
  out.push({
    id: 'session-new',
    label: t('palette.newSession'),
    category: 'session',
    action: () => emit('newSession'),
  });
  out.push({
    id: 'session-search',
    label: t('palette.searchSessions'),
    category: 'session',
    action: () => emit('searchSessions'),
  });

  // Model actions
  out.push({
    id: 'model-switch',
    label: t('palette.switchModel'),
    category: 'model',
    action: () => emit('switchModel'),
  });
  out.push({
    id: 'model-probe',
    label: t('palette.probeModels'),
    category: 'model',
    action: () => emit('probeModels'),
  });

  // UI toggles
  out.push({
    id: 'ui-theme',
    label: t('palette.toggleTheme'),
    category: 'ui',
    action: () => emit('toggleTheme'),
  });
  out.push({
    id: 'ui-plan',
    label: t('palette.togglePlanMode'),
    category: 'ui',
    action: () => emit('togglePlan'),
  });
  out.push({
    id: 'ui-sidebar',
    label: t('palette.toggleSidebar'),
    category: 'ui',
    action: () => emit('toggleSidebar'),
  });
  out.push({
    id: 'ui-settings',
    label: t('palette.openSettings'),
    category: 'ui',
    action: () => emit('openSettings'),
  });
  out.push({
    id: 'ui-memory',
    label: t('palette.openMemory'),
    category: 'ui',
    action: () => emit('openMemory'),
  });
  out.push({
    id: 'ui-compare',
    label: t('palette.openCompare'),
    category: 'ui',
    action: () => emit('openCompare'),
  });
  out.push({
    id: 'ui-notes',
    label: t('palette.openNotes'),
    category: 'ui',
    action: () => emit('openNotes'),
  });
  out.push({
    id: 'session-clear',
    label: t('palette.clearSession'),
    category: 'session',
    action: () => emit('clearSession'),
  });

  return out;
});

const filtered = computed<PaletteItem[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((item) => {
    const label = item.label.toLowerCase();
    const desc = (item.description ?? '').toLowerCase();
    return label.includes(q) || desc.includes(q);
  });
});

watch(filtered, () => {
  activeIndex.value = 0;
});

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    query.value = '';
    activeIndex.value = 0;
    void nextTick(() => inputRef.value?.focus());
  }
});

function selectItem(item: PaletteItem): void {
  item.action();
  emit('close');
}

function handleKeydown(e: KeyboardEvent): void {
  if (!props.open) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % Math.max(1, filtered.value.length);
    scrollActiveIntoView();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + Math.max(1, filtered.value.length)) % Math.max(1, filtered.value.length);
    scrollActiveIntoView();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = filtered.value[activeIndex.value];
    if (item) selectItem(item);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
}

function scrollActiveIntoView(): void {
  void nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('.palette-item.active');
    if (!active) return;
    active.scrollIntoView({ block: 'nearest' });
  });
}

function categoryLabel(cat: PaletteItem['category']): string {
  switch (cat) {
    case 'command': return t('palette.categoryCommand');
    case 'session': return t('palette.categorySession');
    case 'model': return t('palette.categoryModel');
    case 'ui': return t('palette.categoryUI');
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="open" class="palette-backdrop" @click.self="emit('close')">
    <div class="palette-dialog" role="dialog" aria-modal="true" aria-label="Command Palette">
      <div class="palette-input-wrap">
        <svg class="palette-search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          type="text"
          :placeholder="t('palette.placeholder')"
          @keydown.stop
        />
      </div>
      <div ref="listRef" class="palette-list">
        <div v-if="filtered.length === 0" class="palette-empty">
          {{ t('palette.noResults') }}
        </div>
        <button
          v-for="(item, idx) in filtered"
          :key="item.id"
          type="button"
          class="palette-item"
          :class="{ active: idx === activeIndex }"
          @click="selectItem(item)"
          @mouseenter="activeIndex = idx"
        >
          <span class="palette-item-label">{{ item.label }}</span>
          <span v-if="item.description" class="palette-item-desc">{{ item.description }}</span>
          <span class="palette-item-cat">{{ categoryLabel(item.category) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0, 0, 0, 0.35);
}

.palette-dialog {
  width: min(560px, 90vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  flex: none;
}

.palette-search-icon {
  flex: none;
  color: var(--muted);
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  color: var(--ink);
  font-family: var(--sans);
  font-size: var(--ui-font-size);
  outline: none;
  padding: 0;
}

.palette-input::placeholder {
  color: var(--muted);
}

.palette-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.palette-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: calc(var(--ui-font-size) - 1px);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  cursor: pointer;
  box-sizing: border-box;
}

.palette-item:hover,
.palette-item.active {
  background: var(--soft);
}

.palette-item-label {
  flex: none;
  font-weight: 500;
}

.palette-item-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: calc(var(--ui-font-size) - 1.5px);
}

.palette-item-cat {
  flex: none;
  font-family: var(--mono);
  font-size: max(9px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--panel2);
  padding: 1px 6px;
  border-radius: 3px;
}
</style>
