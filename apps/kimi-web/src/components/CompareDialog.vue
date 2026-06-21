<!-- apps/kimi-web/src/components/CompareDialog.vue -->
<!-- Dialog to configure and run A/B model comparison. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import type { AppModel } from '../api/types';

export interface CompareResult {
  modelAlias: string;
  result?: string;
  error?: string;
}

const props = defineProps<{
  models: readonly AppModel[];
  results?: readonly CompareResult[];
  running?: boolean;
}>();

const emit = defineEmits<{
  start: [modelIds: string[]];
  promote: [index: number];
  synthesize: [];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const modelA = ref('');
const modelB = ref('');
const modelC = ref('');
const modelD = ref('');

useDialogFocus(dialogRef);

const selectedModels = [modelA, modelB, modelC, modelD];

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function canStart(): boolean {
  return modelA.value !== '' && modelB.value !== '' && modelA.value !== modelB.value;
}

function startComparison(): void {
  if (!canStart()) return;
  const ids = [modelA.value, modelB.value];
  if (modelC.value && modelC.value !== modelA.value && modelC.value !== modelB.value) ids.push(modelC.value);
  if (modelD.value && modelD.value !== modelA.value && modelD.value !== modelB.value && modelD.value !== modelC.value) ids.push(modelD.value);
  emit('start', ids);
}

function labelFor(id: string): string {
  const m = props.models.find((m) => m.id === id);
  return m ? (m.displayName ?? m.model) : id;
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Model Comparison">
      <div class="dh">
        <span class="dtitle">Model Comparison</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="desc">Select up to 4 models to compare. Your next message will be sent to each model and results shown side-by-side.</p>

        <div class="model-grid">
          <div v-for="(model, idx) in selectedModels" :key="idx" class="field">
            <label class="field-label">Model {{ ['A', 'B', 'C', 'D'][idx] }}</label>
            <select v-model="model.value" class="select-field">
              <option value="" disabled>Select model…</option>
              <option v-for="m in models" :key="m.id" :value="m.id" :disabled="selectedModels.some((r, i) => i !== idx && r.value === m.id)">
                {{ m.displayName ?? m.model }} ({{ m.provider }})
              </option>
            </select>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="act primary" :disabled="!canStart() || running" @click="startComparison">
            {{ running ? 'Running…' : 'Start Comparison' }}
          </button>
        </div>

        <div v-if="results && results.length > 0" class="results-section">
          <h3 class="sec-title">Results</h3>

          <div v-for="(r, i) in results" :key="i" class="result-card">
            <div class="result-header">
              <span class="result-model">{{ r.modelAlias }}</span>
              <button
                v-if="r.result && !r.error"
                type="button"
                class="act small"
                title="Use this result as the response"
                @click="emit('promote', i)"
              >
                Promote
              </button>
            </div>
            <div v-if="r.error" class="result-error">{{ r.error }}</div>
            <div v-else-if="r.result" class="result-text">{{ r.result }}</div>
            <div v-else class="result-pending">Waiting for response…</div>
          </div>

          <div class="actions">
            <button type="button" class="act" @click="emit('synthesize')">Synthesize</button>
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
  width: min(640px, 100%);
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

.model-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.field { }
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
  font-size: calc(var(--ui-font-size) - 1.5px);
  padding: 0 10px;
}

.actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
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
.act.small { padding: 4px 10px; font-size: max(10px, calc(var(--ui-font-size) - 3px)); }
.act.primary {
  background: var(--blue);
  color: var(--bg);
  border-color: var(--blue);
}
.act.primary:hover { background: var(--blue2); }
.act:disabled { opacity: 0.5; cursor: not-allowed; }

.sec-title {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 3px);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 16px 0 10px;
}

.results-section { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 4px; }
.result-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--soft);
  border-bottom: 1px solid var(--line);
}
.result-model {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--ink);
  font-weight: 600;
}
.result-error {
  padding: 10px 12px;
  color: var(--err);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
}
.result-text {
  padding: 10px 12px;
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--ink);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}
.result-pending {
  padding: 10px 12px;
  color: var(--muted);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
}

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
  .model-grid { grid-template-columns: 1fr; }
}
</style>
