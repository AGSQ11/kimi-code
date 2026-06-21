<!-- apps/kimi-web/src/components/PluginsDialog.vue -->
<!-- Dialog to manage plugins with enable/disable toggles. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

export interface PluginEntry {
  id: string;
  displayName: string;
  version?: string;
  enabled: boolean;
  skillCount: number;
  mcpServerCount: number;
  hasErrors: boolean;
  source: string;
}

const props = defineProps<{
  plugins: readonly PluginEntry[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  toggle: [id: string, enabled: boolean];
  close: [];
  refresh: [];
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
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Plugins">
      <div class="dh">
        <span class="dtitle">Plugins</span>
        <button class="refresh-btn" title="Refresh" @click="emit('refresh')">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 8a6 6 0 1 1 1.5 4M2 12v-3h3"/>
          </svg>
        </button>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div v-if="loading" class="loading-state">Loading plugins…</div>

      <div v-else-if="plugins.length === 0" class="empty-state">No plugins installed.</div>

      <div v-else class="plugin-list">
        <div v-for="p in plugins" :key="p.id" class="plugin-row" :class="{ errored: p.hasErrors }">
          <div class="plugin-info">
            <div class="plugin-head">
              <span class="plugin-name">{{ p.displayName }}</span>
              <span v-if="p.version" class="plugin-version">{{ p.version }}</span>
              <span v-if="p.hasErrors" class="plugin-error-badge">Error</span>
            </div>
            <div class="plugin-meta">
              <span class="plugin-source">{{ p.source }}</span>
              <span v-if="p.skillCount > 0" class="plugin-stat">{{ p.skillCount }} skills</span>
              <span v-if="p.mcpServerCount > 0" class="plugin-stat">{{ p.mcpServerCount }} MCP servers</span>
            </div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            :class="{ on: p.enabled }"
            :aria-checked="p.enabled"
            @click="emit('toggle', p.id, !p.enabled)"
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
  width: min(560px, 100%);
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

.loading-state, .empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
}

.plugin-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
  min-height: 0;
}
.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line2);
}
.plugin-row:last-child { border-bottom: none; }
.plugin-row.errored { background: color-mix(in srgb, var(--err) 4%, var(--bg)); }
.plugin-info { flex: 1; min-width: 0; }
.plugin-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.plugin-name {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  font-weight: 500;
}
.plugin-version {
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}
.plugin-error-badge {
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--err);
  border: 1px solid var(--err);
  border-radius: 4px;
  padding: 0 5px;
}
.plugin-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-family: var(--mono);
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
