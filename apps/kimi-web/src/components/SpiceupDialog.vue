<!-- apps/kimi-web/src/components/SpiceupDialog.vue -->
<!-- Dialog to adjust model sampling parameters (temperature, top_p, etc.). -->
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

export interface SpiceupValues {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

const props = defineProps<{
  current?: SpiceupValues;
}>();

const emit = defineEmits<{
  apply: [values: SpiceupValues];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);

const defaults: SpiceupValues = {
  temperature: undefined,
  topP: undefined,
  topK: undefined,
  frequencyPenalty: undefined,
  presencePenalty: undefined,
};

const values = reactive<SpiceupValues>({ ...defaults, ...props.current });

interface SliderField {
  key: keyof SpiceupValues;
  label: string;
  min: number;
  max: number;
  step: number;
}

const fields: SliderField[] = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.05 },
  { key: 'topP', label: 'Top P', min: 0, max: 1, step: 0.05 },
  { key: 'topK', label: 'Top K', min: 1, max: 100, step: 1 },
  { key: 'frequencyPenalty', label: 'Frequency Penalty', min: -2, max: 2, step: 0.1 },
  { key: 'presencePenalty', label: 'Presence Penalty', min: -2, max: 2, step: 0.1 },
];

useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function resetDefaults(): void {
  for (const key of Object.keys(defaults) as (keyof SpiceupValues)[]) {
    values[key] = undefined;
  }
}

function applyValues(): void {
  const clean: SpiceupValues = {};
  for (const field of fields) {
    const v = values[field.key];
    if (v !== undefined && v !== null && !Number.isNaN(v)) {
      clean[field.key] = v;
    }
  }
  emit('apply', clean);
}

function formatValue(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return String(v);
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Spice Up Sampling">
      <div class="dh">
        <span class="dtitle">Spice Up Sampling</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="desc">Set session-level generation parameter overrides. Leave a slider at its default to clear the override.</p>

        <div v-for="field in fields" :key="field.key" class="slider-row">
          <div class="slider-head">
            <span class="slider-label">{{ field.label }}</span>
            <span class="slider-value">{{ formatValue(values[field.key]) }}</span>
          </div>
          <div class="slider-controls">
            <input
              type="range"
              class="slider"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :value="values[field.key] ?? field.min"
              @input="values[field.key] = parseFloat(($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="clear-btn"
              title="Clear override"
              :disabled="values[field.key] === undefined"
              @click="values[field.key] = undefined"
            >✕</button>
          </div>
          <div class="slider-range">
            <span>{{ field.min }}</span>
            <span>{{ field.max }}</span>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="act" @click="resetDefaults">Reset to Defaults</button>
          <button type="button" class="act primary" @click="applyValues">Apply</button>
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
  width: min(460px, 100%);
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

.slider-row {
  margin-bottom: 16px;
}
.slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.slider-label {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  font-weight: 500;
}
.slider-value {
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  color: var(--muted);
  min-width: 28px;
  text-align: right;
}
.slider-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--line);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--blue);
  border: 2px solid var(--bg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  cursor: pointer;
}
.clear-btn {
  flex: none;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--faint);
  cursor: pointer;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.clear-btn:hover:not(:disabled) { color: var(--ink); background: var(--soft); }
.clear-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.slider-range {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--faint);
  margin-top: 2px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}
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

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
