<!-- apps/kimi-web/src/components/FeedbackDialog.vue -->
<!-- Simple feedback dialog with text area and optional email input. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

const props = defineProps<{
  sending?: boolean;
}>();

const emit = defineEmits<{
  send: [feedback: string, email: string];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const feedbackRef = ref<HTMLTextAreaElement | null>(null);
const feedbackText = ref('');
const email = ref('');

useDialogFocus(dialogRef, feedbackRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function canSend(): boolean {
  return feedbackText.value.trim().length > 0;
}

function sendFeedback(): void {
  if (!canSend()) return;
  emit('send', feedbackText.value.trim(), email.value.trim());
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Send Feedback">
      <div class="dh">
        <span class="dtitle">Send Feedback</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <p class="desc">Help us improve! Share your thoughts, report bugs, or suggest features.</p>

        <div class="field">
          <label class="field-label" for="feedback-text">Feedback</label>
          <textarea
            id="feedback-text"
            ref="feedbackRef"
            v-model="feedbackText"
            class="textarea-field"
            placeholder="Tell us what you think…"
            rows="5"
          />
        </div>

        <div class="field">
          <label class="field-label" for="feedback-email">Email (optional)</label>
          <input
            id="feedback-email"
            v-model="email"
            class="input-field"
            type="email"
            placeholder="your@email.com"
            autocomplete="email"
          />
        </div>

        <div class="actions">
          <button type="button" class="act primary" :disabled="!canSend() || sending" @click="sendFeedback">
            {{ sending ? 'Sending…' : 'Send Feedback' }}
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
.input-field {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  padding: 0 10px;
  outline: none;
}
.input-field:focus-visible { border-color: var(--blue); }

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
.act.primary:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
