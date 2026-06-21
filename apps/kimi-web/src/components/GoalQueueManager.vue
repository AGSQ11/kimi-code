<!-- apps/kimi-web/src/components/GoalQueueManager.vue -->
<!-- Dialog to manage the goal queue: pause/resume/cancel current goal, queue next goals. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

export interface GoalItem {
  goalId: string;
  objective: string;
  status: 'active' | 'paused' | 'blocked' | 'complete';
  turnsUsed?: number;
  tokensUsed?: number;
}

const props = defineProps<{
  currentGoal?: GoalItem | null;
  queuedGoals?: readonly GoalItem[];
  replacing?: boolean;
}>();

const emit = defineEmits<{
  pause: [];
  resume: [];
  cancel: [];
  replace: [objective: string];
  queue: [objective: string];
  unqueue: [goalId: string];
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const replaceText = ref('');
const queueText = ref('');

useDialogFocus(dialogRef);

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));

function doReplace(): void {
  const t = replaceText.value.trim();
  if (!t) return;
  emit('replace', t);
  replaceText.value = '';
}

function doQueue(): void {
  const t = queueText.value.trim();
  if (!t) return;
  emit('queue', t);
  queueText.value = '';
}

function isActive(s: string): boolean { return s === 'active'; }
function isPaused(s: string): boolean { return s === 'paused'; }
function isTerminal(s: string): boolean { return s === 'complete'; }

function statusColor(s: string): string {
  switch (s) {
    case 'active': return 'var(--ok)';
    case 'paused': return 'var(--warn)';
    case 'blocked': return 'var(--err)';
    case 'complete': return 'var(--muted)';
    default: return 'var(--muted)';
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1" aria-label="Goal Queue">
      <div class="dh">
        <span class="dtitle">Goal Queue</span>
        <button class="close-btn" title="Close" @click="emit('close')">✕</button>
      </div>

      <div class="body">
        <!-- Current goal -->
        <section class="sec">
          <h3 class="sec-title">Current Goal</h3>
          <div v-if="currentGoal" class="current-goal">
            <div class="goal-header">
              <span class="goal-badge" :style="{ '--badge': statusColor(currentGoal.status) }">{{ currentGoal.status }}</span>
              <span class="goal-objective">{{ currentGoal.objective }}</span>
            </div>
            <div v-if="currentGoal.turnsUsed !== undefined || currentGoal.tokensUsed !== undefined" class="goal-usage">
              <span v-if="currentGoal.turnsUsed !== undefined">{{ currentGoal.turnsUsed }} turns</span>
              <span v-if="currentGoal.tokensUsed !== undefined">{{ currentGoal.tokensUsed }} tokens</span>
            </div>
            <div class="goal-actions">
              <button
                v-if="isActive(currentGoal.status)"
                type="button"
                class="act"
                @click="emit('pause')"
              >Pause</button>
              <button
                v-if="isPaused(currentGoal.status)"
                type="button"
                class="act"
                @click="emit('resume')"
              >Resume</button>
              <button
                v-if="!isTerminal(currentGoal.status)"
                type="button"
                class="act danger"
                @click="emit('cancel')"
              >Cancel</button>
            </div>
          </div>
          <div v-else class="empty">No active goal.</div>
        </section>

        <!-- Replace Goal -->
        <section class="sec">
          <h3 class="sec-title">Replace Goal</h3>
          <div class="textarea-row">
            <textarea
              v-model="replaceText"
              class="textarea-field"
              placeholder="Describe the new goal…"
              rows="3"
              @keydown.ctrl.enter="doReplace"
            />
          </div>
          <div class="actions">
            <button type="button" class="act primary" :disabled="!replaceText.trim() || replacing" @click="doReplace">
              Replace Goal
            </button>
          </div>
        </section>

        <!-- Queue Next Goal -->
        <section class="sec">
          <h3 class="sec-title">Queue Next Goal</h3>
          <div class="textarea-row">
            <textarea
              v-model="queueText"
              class="textarea-field"
              placeholder="Describe the next goal…"
              rows="3"
              @keydown.ctrl.enter="doQueue"
            />
          </div>
          <div class="actions">
            <button type="button" class="act" :disabled="!queueText.trim()" @click="doQueue">Queue Goal</button>
          </div>
        </section>

        <!-- Queued goals list -->
        <section class="sec">
          <h3 class="sec-title">Queued Goals</h3>
          <div v-if="queuedGoals && queuedGoals.length > 0" class="queue-list">
            <div v-for="goal in queuedGoals" :key="goal.goalId" class="queue-item">
              <span class="queue-objective">{{ goal.objective }}</span>
              <button type="button" class="icon-btn" title="Remove from queue" @click="emit('unqueue', goal.goalId)">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5">
                  <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
                </svg>
              </button>
            </div>
          </div>
          <div v-else class="empty">No queued goals.</div>
        </section>
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

.body { padding: 12px 16px 16px; overflow-y: auto; }

.sec { padding: 12px 0; border-bottom: 1px solid var(--line); }
.sec:last-child { border-bottom: none; }
.sec-title {
  font-family: var(--mono);
  font-size: calc(var(--ui-font-size) - 3px);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 10px;
}

.current-goal { margin-bottom: 4px; }
.goal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.goal-badge {
  flex: none;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--badge);
  color: var(--badge);
  text-transform: capitalize;
}
.goal-objective {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  word-break: break-word;
}
.goal-usage {
  display: flex;
  gap: 12px;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
  color: var(--muted);
  margin-bottom: 8px;
}
.goal-actions { display: flex; gap: 6px; }
.empty {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--muted);
}

.textarea-row { margin-bottom: 8px; }
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

.actions { display: flex; gap: 6px; }
.act {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  padding: 6px 12px;
  cursor: pointer;
}
.act:hover { background: var(--soft); }
.act.primary {
  background: var(--blue);
  color: var(--bg);
  border-color: var(--blue);
}
.act.primary:hover { background: var(--blue2); }
.act.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 30%, var(--line)); }
.act.danger:hover { background: color-mix(in srgb, var(--err) 8%, var(--bg)); }
.act:disabled { opacity: 0.5; cursor: not-allowed; }

.queue-list { display: flex; flex-direction: column; gap: 6px; }
.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.queue-objective {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.icon-btn:hover { color: var(--err); background: color-mix(in srgb, var(--err) 8%, var(--bg)); }

@media (max-width: 640px) {
  .backdrop { padding: 12px; }
  .dialog { max-height: calc(100dvh - 24px); }
}
</style>
