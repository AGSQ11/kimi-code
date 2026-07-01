<!-- apps/kimi-web/src/components/ShortcutsHelp.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const backdropRef = ref<HTMLElement | null>(null);

const shortcuts = [
  { keys: ['Ctrl/Cmd', 'K'], action: t('shortcuts.commandPalette') },
  { keys: ['Ctrl/Cmd', 'N'], action: t('shortcuts.newSession') },
  { keys: ['Ctrl/Cmd', 'L'], action: t('shortcuts.focusComposer') },
  { keys: ['Ctrl/Cmd', 'B'], action: t('shortcuts.toggleSidebar') },
  { keys: ['Ctrl', 'Shift', 'S'], action: t('shortcuts.toggleSettings') },
  { keys: ['Alt', '1-9'], action: t('shortcuts.switchSession') },
  { keys: ['Ctrl', '/'], action: t('shortcuts.showHelp') },
  { keys: ['Esc'], action: t('shortcuts.closePanel') },
];

function handleBackdropClick(e: MouseEvent): void {
  if (e.target === e.currentTarget) emit('close');
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    void nextTick(() => {
      backdropRef.value?.focus();
    });
  }
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="open" ref="backdropRef" class="backdrop" @click="handleBackdropClick" tabindex="-1">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="t('shortcuts.title')">
      <div class="dh">
        <span class="dtitle">{{ t('shortcuts.title') }}</span>
        <button class="close-btn" :title="t('shortcuts.close')" @click="emit('close')">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>
      <div class="body">
        <div v-for="(item, i) in shortcuts" :key="i" class="row">
          <span class="keys">
            <kbd v-for="(k, ki) in item.keys" :key="ki" class="key">{{ k }}</kbd>
          </span>
          <span class="action">{{ item.action }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 23, 28, 0.42);
  padding: 24px;
}
.dialog {
  width: min(420px, 100%);
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
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
}
.close-btn {
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
.close-btn:hover { background: var(--soft); color: var(--ink); }

.body { padding: 12px 16px 16px; overflow-y: auto; }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.row:last-child { border-bottom: none; }
.keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ink);
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
}
.action {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--dim);
  text-align: right;
}
</style>
