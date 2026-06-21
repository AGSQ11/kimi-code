<!-- apps/kimi-web/src/components/ExportDialog.vue -->
<!-- Dialog to export the current session in various formats. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

export interface ExportPreview {
  format: string;
  content?: string;
  size?: number;
}

const props = defineProps<{
  preview?: ExportPreview | null;
  exporting?: boolean;
}>();

const emit = defineEmits<{
  export: [format: string];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const selectedFormat = ref('markdown');

const formats = [
  { id: 'markdown', label: 'Markdown (.md)' },
  { id: 'debug-zip', label: 'Debug ZIP (.zip)' },
];

useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function doExport(): void {
  emit('export', selectedFormat.value);
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Export Session">
      <div class="dh">
        <span class="dtitle">Export Session</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="desc">Export the current session to share or debug.</p>

        <div class="field">
          <label class="field-label">Format</label>
          <div class="format-options">
            <button
              v-for="fmt in formats"
              :key="fmt.id"
              type="button"
              class="format-btn"
              :class="{ on: selectedFormat === fmt.id }"
              @click="selectedFormat = fmt.id"
            >
              {{ fmt.label }}
            </button>
          </div>
        </div>

        <div v-if="preview" class="preview-section">
          <h3 class="sec-title">Preview</h3>
          <div class="preview-box">
            <pre v-if="preview.content" class="preview-text">{{ preview.content }}</pre>
            <div v-else class="preview-empty">Select a format and click Export to generate.</div>
          </div>
          <div v-if="preview.size !== undefined" class="preview-size">{{ (preview.size / 1024).toFixed(1) }} KB</div>
        </div>

        <div class="actions">
          <button type="button" class="act primary" :disabled="exporting" @click="doExport">
            {{ exporting ? 'Exporting…' : 'Export' }}
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
  width: min(540px, 100%);
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

.body { padding: 16px; overflow-y: auto; }
.desc {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--muted);
  margin: 0 0 16px;
  line-height: 1.45;
}

.field { margin-bottom: 16px; }
.field-label {
  display: block;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}
.format-options {
  display: flex;
  gap: 8px;
}
.format-btn {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.format-btn:hover { background: var(--soft); color: var(--ink); }
.format-btn.on { background: var(--blue); color: var(--bg); border-color: var(--blue); }

.sec-title {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 3px);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 8px;
}
.preview-section { margin-bottom: 12px; }
.preview-box {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  max-height: 200px;
  overflow: auto;
}
.preview-text {
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  color: var(--ink);
  padding: 10px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.preview-empty {
  padding: 20px 10px;
  text-align: center;
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
}
.preview-size {
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--faint);
  margin-top: 4px;
  text-align: right;
}

.actions { margin-top: 8px; }
.act {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  padding: 7px 14px;
  cursor: pointer;
}
.act:hover { background: var(--soft); }
.act.primary {
  background: var(--blue);
  color: var(--bg);
  border-color: var(--blue);
}
.act.primary:hover { background: var(--blue2); }
.act:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
