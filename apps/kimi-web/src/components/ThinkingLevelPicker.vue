<!-- apps/kimi-web/src/components/ThinkingLevelPicker.vue -->
<!-- Horizontal button group for selecting a thinking level (off, low, medium, high, xhigh, max). -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ThinkingLevel } from '../api/types';

const { t } = useI18n();

const props = defineProps<{
  modelValue: ThinkingLevel;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [level: ThinkingLevel];
}>();

const levels: { value: ThinkingLevel; labelKey: string }[] = [
  { value: 'off',    labelKey: 'status.thinkingOff' },
  { value: 'low',    labelKey: 'status.thinkingLow' },
  { value: 'medium', labelKey: 'status.thinkingMedium' },
  { value: 'high',   labelKey: 'status.thinkingHigh' },
  { value: 'xhigh',  labelKey: 'status.thinkingXhigh' },
  { value: 'max',    labelKey: 'status.thinkingMax' },
];

function select(level: ThinkingLevel): void {
  if (props.disabled) return;
  emit('update:modelValue', level);
}
</script>

<template>
  <div class="thinking-levels" role="group" :aria-label="t('composer.thinkingSuffix')">
    <button
      v-for="lvl in levels"
      :key="lvl.value"
      type="button"
      class="tl-opt"
      :class="{ on: modelValue === lvl.value }"
      :aria-pressed="modelValue === lvl.value"
      :disabled="disabled"
      @click="select(lvl.value)"
    >
      {{ t(lvl.labelKey) }}
    </button>
  </div>
</template>

<style scoped>
.thinking-levels {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.tl-opt {
  border: none;
  background: var(--bg);
  color: var(--muted);
  font-family: var(--mono);
  font-size: var(--ui-font-size-xs);
  padding: 5px 8px;
  cursor: pointer;
  border-left: 1px solid var(--line);
  transition: background 0.12s, color 0.12s;
}
.tl-opt:first-child { border-left: none; }
.tl-opt:hover:not(:disabled) { color: var(--ink); background: var(--soft); }
.tl-opt.on { background: var(--soft); color: var(--blue2); font-weight: 600; }
.tl-opt:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
