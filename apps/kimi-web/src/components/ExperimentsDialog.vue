<!-- apps/kimi-web/src/components/ExperimentsDialog.vue -->
<!-- Dialog to toggle experimental feature flags. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

export interface ExperimentFlag {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const props = defineProps<{
  flags: readonly ExperimentFlag[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  toggle: [id: string, enabled: boolean];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Experimental Features">
      <div class="dh">
        <span class="dtitle">Experimental Features</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div v-if="loading" class="loading-state">Loading…</div>

      <div v-else-if="flags.length === 0" class="empty-state">No experimental flags available.</div>

      <div v-else class="flag-list">
        <div v-for="flag in flags" :key="flag.id" class="flag-row">
          <div class="flag-info">
            <span class="flag-label">{{ flag.label }}</span>
            <span class="flag-desc">{{ flag.description }}</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            :class="{ on: flag.enabled }"
            :aria-checked="flag.enabled"
            @click="emit('toggle', flag.id, !flag.enabled)"
          >
            <span class="knob" />
          </button>
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
  width: min(520px, 100%);
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

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
}

.flag-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
  min-height: 0;
}
.flag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line2);
}
.flag-row:last-child { border-bottom: none; }
.flag-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.flag-label {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  font-weight: 500;
}
.flag-desc {
  font-family: var(--sans);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}
.switch {
  flex: none;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--panel2);
  position: relative;
  cursor: pointer;
  transition: background 0.16s;
  padding: 0;
}
.switch.on { background: var(--blue); border-color: var(--blue); }
.knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg);
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform 0.16s;
}
.switch.on .knob { transform: translateX(18px); }

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
