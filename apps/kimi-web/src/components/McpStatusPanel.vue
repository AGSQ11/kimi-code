<!-- apps/kimi-web/src/components/McpStatusPanel.vue -->
<!-- Panel showing MCP server status with expandable tool lists. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

interface McpToolInfo {
  name: string;
  description?: string;
}

interface McpServerEntry {
  name: string;
  transport: string;
  status: 'pending' | 'connected' | 'failed' | 'disabled' | 'needs-auth';
  toolCount: number;
  error?: string;
  tools?: readonly McpToolInfo[];
}

const props = defineProps<{
  servers: readonly McpServerEntry[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const expanded = ref<Set<string>>(new Set());

useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function toggleExpand(name: string): void {
  const s = new Set(expanded.value);
  if (s.has(name)) s.delete(name);
  else s.add(name);
  expanded.value = s;
}

function statusColor(status: string): string {
  switch (status) {
    case 'connected': return 'var(--ok)';
    case 'pending': return 'var(--warn)';
    case 'failed':
    case 'disabled': return 'var(--err)';
    case 'needs-auth': return 'var(--warn)';
    default: return 'var(--muted)';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected': return 'Connected';
    case 'pending': return 'Pending';
    case 'failed': return 'Failed';
    case 'disabled': return 'Disabled';
    case 'needs-auth': return 'Needs Auth';
    default: return status;
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="MCP Servers">
      <div class="dh">
        <span class="dtitle">MCP Server Status</span>
        <button class="refresh-btn" title="Refresh" @click="emit('refresh')">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 8a6 6 0 1 1 1.5 4M2 12v-3h3"/>
          </svg>
        </button>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div v-if="loading" class="loading-state">Loading MCP status…</div>

      <div v-else-if="servers.length === 0" class="empty-state">No MCP servers configured.</div>

      <div v-else class="server-list">
        <div v-for="server in servers" :key="server.name" class="server-row">
          <div class="server-header" @click="toggleExpand(server.name)">
            <span class="status-dot" :style="{ background: statusColor(server.status) }" />
            <span class="server-name">{{ server.name }}</span>
            <span class="server-meta">
              <span class="server-transport">{{ server.transport }}</span>
              <span class="server-count">{{ server.toolCount }} tools</span>
            </span>
            <span class="status-badge" :style="{ '--badge': statusColor(server.status) }">{{ statusLabel(server.status) }}</span>
            <svg
              class="chevron"
              :class="{ open: expanded.has(server.name) }"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M4 6l4 4 4-4"/>
            </svg>
          </div>

          <div v-if="server.error" class="server-error">{{ server.error }}</div>

          <div v-if="expanded.has(server.name)" class="server-tools">
            <div v-if="server.tools && server.tools.length > 0">
              <div v-for="tool in server.tools" :key="tool.name" class="tool-row">
                <span class="tool-name">{{ tool.name }}</span>
                <span v-if="tool.description" class="tool-desc">{{ tool.description }}</span>
              </div>
            </div>
            <div v-else class="tool-empty">No tool details available.</div>
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
  width: min(580px, 100%);
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

.server-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
  min-height: 0;
}
.server-row {
  border-bottom: 1px solid var(--line2);
}
.server-row:last-child { border-bottom: none; }
.server-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}
.server-header:hover { background: var(--soft); }
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.server-name {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.server-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.server-transport, .server-count {
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}
.status-badge {
  flex: none;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--badge);
  color: var(--badge);
}
.chevron {
  flex: none;
  color: var(--faint);
  transition: transform 0.15s;
}
.chevron.open { transform: rotate(180deg); }

.server-error {
  padding: 4px 14px 8px 30px;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  color: var(--err);
}

.server-tools {
  padding: 0 14px 8px 30px;
}
.tool-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line2);
}
.tool-row:last-child { border-bottom: none; }
.tool-name {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--ink);
  font-weight: 500;
}
.tool-desc {
  font-family: var(--sans);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}
.tool-empty {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--muted);
  padding: 6px 0;
}

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
