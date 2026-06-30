<!-- apps/kimi-web/src/components/CompareCard.vue -->
<!-- Inline multi-model comparison results rendered in the chat transcript. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CompareResultView } from '../types';
import Markdown from './chat/Markdown.vue';
import { formatDuration, formatTokens } from './chatTurnRendering';
import { copyTextToClipboard } from '../lib/clipboard';

const props = defineProps<{
  results: CompareResultView[];
}>();

const { t } = useI18n();

const copiedIndex = ref<number | null>(null);

function copyResult(text: string, index: number): void {
  void copyTextToClipboard(text).then((ok) => {
    if (!ok) return;
    copiedIndex.value = index;
    setTimeout(() => {
      if (copiedIndex.value === index) copiedIndex.value = null;
    }, 1400);
  });
}
</script>

<template>
  <div class="compare-card">
    <div class="compare-header">
      <span class="compare-title">{{ t('conversation.compareTitle') }}</span>
      <span class="compare-count">{{ results.length }} {{ t('conversation.compareModels') }}</span>
    </div>
    <div class="compare-grid" :style="{ '--cols': results.length }">
      <div
        v-for="(result, i) in results"
        :key="result.modelId"
        class="compare-panel"
      >
        <div class="compare-panel-head">
          <span class="compare-model">{{ result.modelAlias }}</span>
          <button
            type="button"
            class="compare-copy"
            :title="t('conversation.compareCopy')"
            @click="copyResult(result.text, i)"
          >
            <svg
              v-if="copiedIndex !== i"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="9" height="9" rx="1.5" />
              <path d="M6 1h7a1 1 0 0 1 1 1v7" />
            </svg>
            <svg
              v-else
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="3,8 6.5,11.5 13,5" />
            </svg>
            <span class="compare-copy-text">{{ copiedIndex === i ? t('filePreview.copied') : t('filePreview.copy') }}</span>
          </button>
        </div>
        <div class="compare-panel-body">
          <Markdown :text="result.text" />
        </div>
        <div v-if="result.durationMs !== undefined || result.tokenCount !== undefined" class="compare-panel-ft">
          <span v-if="result.durationMs !== undefined" class="compare-meta">{{ formatDuration(result.durationMs) }}</span>
          <span v-if="result.tokenCount !== undefined" class="compare-meta">{{ formatTokens(result.tokenCount) }} tokens</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  overflow: hidden;
  margin: var(--chat-block-gap) 0;
}
.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--panel2);
  border-bottom: 1px solid var(--line);
}
.compare-title {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 2px);
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.04em;
}
.compare-count {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 3px);
  color: var(--muted);
}
.compare-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 1px;
  background: var(--line);
}
.compare-panel {
  background: var(--panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.compare-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.compare-model {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 2px);
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--faint);
  font-size: var(--ui-font-size-sm);
  font-family: var(--mono);
  padding: 2px 4px;
  border-radius: 4px;
  flex: none;
}
.compare-copy:hover {
  color: var(--blue);
  background: var(--soft);
}
.compare-copy-text {
  font-size: max(9px, calc(var(--ui-font-size) - 3px));
}
.compare-panel-body {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  overflow-y: auto;
  max-height: 400px;
}
.compare-panel-ft {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
  border-top: 1px solid var(--line);
  background: var(--bg);
}
.compare-meta {
  font-family: var(--mono);
  font-size: max(9px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
}

@media (max-width: 640px) {
  .compare-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
