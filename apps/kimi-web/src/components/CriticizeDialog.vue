<!-- apps/kimi-web/src/components/CriticizeDialog.vue -->
<!-- Dialog to configure and trigger the critic subagent. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import type { AppModel } from '../api/types';

const props = defineProps<{
  models: readonly AppModel[];
  currentModel?: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  run: [modelId: string, instructions: string];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const selectedModel = ref(props.currentModel ?? props.models[0]?.id ?? '');
const instructions = ref('');

useDialogFocus(dialogRef);

const modelOptions = ref(
  props.models.map((m) => ({
    id: m.id,
    label: m.displayName ?? m.model ?? m.id,
    provider: m.provider,
  })),
);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function runCritique(): void {
  if (!selectedModel.value) return;
  emit('run', selectedModel.value, instructions.value.trim());
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Criticize">
      <div class="dh">
        <span class="dtitle">Criticize</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="desc">Run a dedicated critic agent to review the current conversation and provide feedback.</p>

        <div class="field">
          <label class="field-label">Critic Model</label>
          <select v-if="modelOptions.length > 0" v-model="selectedModel" class="select-field">
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.label }} ({{ m.provider }})</option>
          </select>
          <span v-else class="rvalue mono">No models available</span>
        </div>

        <div class="field">
          <label class="field-label" for="critic-instructions">Custom Instructions (optional)</label>
          <textarea
            id="critic-instructions"
            v-model="instructions"
            class="textarea-field"
            placeholder="Optional: specify what the critic should focus on, e.g. 'Check for security issues'"
            rows="4"
          />
        </div>

        <div class="actions">
          <button type="button" class="act primary" :disabled="!selectedModel" @click="runCritique">
            Run Criticize
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
  width: min(480px, 100%);
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

.field { margin-bottom: 14px; }
.field-label {
  display: block;
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}
.select-field {
  width: 100%;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  padding: 0 10px;
}
.textarea-field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  padding: 8px 10px;
  resize: vertical;
  outline: none;
}
.textarea-field:focus-visible { border-color: var(--blue); }

.rvalue.mono {
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  color: var(--muted);
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
