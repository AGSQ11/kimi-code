<!-- apps/kimi-web/src/components/MemoryApprovalCard.vue -->
<!-- Card component for approving/rejecting proposed memories. -->
<script setup lang="ts">
import { computed, ref } from 'vue';

export interface ProposedMemory {
  index: number;
  content: string;
  category?: string;
  tags?: readonly string[];
  scope?: string;
}

const props = defineProps<{
  memories: readonly ProposedMemory[];
  agentName?: string;
}>();

const emit = defineEmits<{
  approve: [indices: number[]];
  reject: [];
}>();

const approved = ref<Set<number>>(new Set(props.memories.map((m) => m.index)));

const allSelected = computed(() => {
  return props.memories.length > 0 && props.memories.every((m) => approved.value.has(m.index));
});

function toggleMemory(index: number): void {
  const s = new Set(approved.value);
  if (s.has(index)) s.delete(index);
  else s.add(index);
  approved.value = s;
}

function toggleAll(): void {
  if (allSelected.value) {
    approved.value = new Set();
  } else {
    approved.value = new Set(props.memories.map((m) => m.index));
  }
}

function approveSelected(): void {
  const indices = [...approved.value].sort((a, b) => a - b);
  emit('approve', indices);
}

function rejectAll(): void {
  emit('reject');
}
</script>

<template>
  <div class="mem-appr">
    <div class="mah">
      <span class="matitle">Remember these facts?</span>
      <span v-if="agentName" class="mabadge">{{ agentName }}</span>
      <span class="mareq">Requires approval</span>
    </div>

    <div class="mabody">
      <div class="ma-select-row">
        <label class="ma-select-all">
          <input
            type="checkbox"
            :checked="allSelected"
            :indeterminate="!allSelected && approved.size > 0"
            @change="toggleAll"
          />
          <span>{{ allSelected ? 'Deselect all' : 'Select all' }}</span>
        </label>
      </div>

      <div v-for="memory in memories" :key="memory.index" class="ma-row">
        <label class="ma-item" :class="{ checked: approved.has(memory.index) }">
          <input
            type="checkbox"
            :checked="approved.has(memory.index)"
            @change="toggleMemory(memory.index)"
          />
          <div class="ma-content">
            <span class="ma-text">{{ memory.content }}</span>
            <div class="ma-meta">
              <span v-if="memory.category" class="ma-cat">{{ memory.category }}</span>
              <span v-if="memory.tags && memory.tags.length > 0" class="ma-tags">
                <span v-for="tag in memory.tags" :key="tag" class="ma-tag">#{{ tag }}</span>
              </span>
              <span v-if="memory.scope" class="ma-scope">{{ memory.scope }}</span>
            </div>
          </div>
        </label>
      </div>

      <div v-if="memories.length === 0" class="ma-empty">No memories proposed.</div>
    </div>

    <div class="ma-actions">
      <div class="ma-btn pri" @click="approveSelected">Approve Selected ({{ approved.size }})</div>
      <div class="ma-btn" @click="rejectAll">Skip All</div>
    </div>
  </div>
</template>

<style scoped>
.mem-appr {
  border: 1px solid var(--bd);
  margin: 10px 0;
  background: var(--bg);
  border-radius: 3px;
}

.mah {
  padding: 7px 10px;
  background: var(--soft);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ui-font-size);
  border-bottom: 1px solid var(--bd);
  border-radius: 3px 3px 0 0;
  flex-wrap: wrap;
}
.matitle { color: var(--blue2); font-weight: 700; white-space: nowrap; }
.mabadge {
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  color: var(--muted);
  border: 1px solid var(--line);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.mareq {
  margin-left: auto;
  color: var(--blue2);
  border: 1px solid var(--bd);
  padding: 1px 7px;
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  font-weight: 600;
  border-radius: 3px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mabody { padding: 8px 10px; }

.ma-select-row {
  margin-bottom: 8px;
}
.ma-select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--ui-font-size) - 1.5px);
  color: var(--muted);
  cursor: pointer;
}
.ma-select-all input { accent-color: var(--blue); }

.ma-row { margin-bottom: 6px; }
.ma-row:last-child { margin-bottom: 0; }

.ma-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 3px;
  border: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.1s;
}
.ma-item:hover { background: var(--soft); }
.ma-item.checked { border-color: var(--blue); background: color-mix(in srgb, var(--blue) 4%, var(--bg)); }
.ma-item input {
  margin-top: 3px;
  accent-color: var(--blue);
  flex: none;
}
.ma-content { flex: 1; min-width: 0; }
.ma-text {
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  color: var(--ink);
  word-break: break-word;
  line-height: 1.4;
  display: block;
  margin-bottom: 4px;
}
.ma-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: max(10px, calc(var(--ui-font-size) - 3.5px));
}
.ma-cat {
  background: var(--soft);
  color: var(--muted);
  padding: 1px 6px;
  border-radius: 4px;
}
.ma-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.ma-tag { color: var(--faint); }
.ma-scope {
  color: var(--blue);
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--blue) 8%, var(--bg));
}
.ma-empty {
  padding: 12px 0;
  text-align: center;
  color: var(--muted);
  font-size: calc(var(--ui-font-size) - 1.5px);
}

.ma-actions { display: flex; border-top: 1px solid var(--line); }
.ma-btn {
  padding: 8px 14px;
  font-size: calc(var(--ui-font-size) - 2.5px);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  border-right: 1px solid var(--line);
  font-family: var(--mono);
  white-space: nowrap;
  user-select: none;
}
.ma-btn:last-child { border-right: none; }
.ma-btn:hover { background: var(--panel2); }
.ma-btn.pri { background: var(--blue); color: var(--bg); }
.ma-btn.pri:hover { background: var(--blue2); }

@media (max-width: 640px) {
  .mem-appr { margin: 8px 0; border-radius: 10px; }
  .mah { padding: 9px 12px; }
  .mabody { padding: 10px 12px; }
  .ma-item { padding: 10px 12px; }
  .ma-actions { flex-direction: column; }
  .ma-btn {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
  .ma-btn:last-child { border-bottom: none; }
}
</style>
