<!-- apps/kimi-web/src/components/TourOverlay.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const TOUR_COMPLETED_KEY = 'kimi-web:tour-completed';

const visible = ref(false);
const step = ref(0);

const steps = [
  { title: t('tour.step1Title'), body: t('tour.step1Body') },
  { title: t('tour.step2Title'), body: t('tour.step2Body') },
  { title: t('tour.step3Title'), body: t('tour.step3Body') },
  { title: t('tour.step4Title'), body: t('tour.step4Body') },
  { title: t('tour.step5Title'), body: t('tour.step5Body') },
  { title: t('tour.step6Title'), body: t('tour.step6Body') },
];

onMounted(() => {
  try {
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    if (!completed) {
      visible.value = true;
    }
  } catch {
    // localStorage unavailable
    visible.value = true;
  }
});

function complete(): void {
  visible.value = false;
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  } catch {
    // ignore
  }
}

function next(): void {
  if (step.value < steps.length - 1) {
    step.value++;
  } else {
    complete();
  }
}

function prev(): void {
  if (step.value > 0) step.value--;
}

function skip(): void {
  complete();
}
</script>

<template>
  <div v-if="visible" class="backdrop" @click.self="skip">
    <div class="card" role="dialog" aria-modal="true" :aria-label="t('tour.title')">
      <div class="dots">
        <span
          v-for="(_, i) in steps"
          :key="i"
          class="dot"
          :class="{ on: i === step }"
          :aria-current="i === step ? 'step' : undefined"
        />
      </div>
      <h3 class="title">{{ steps[step]?.title }}</h3>
      <p class="body">{{ steps[step]?.body }}</p>
      <div class="actions">
        <button v-if="step > 0" type="button" class="btn secondary" @click="prev">
          {{ t('tour.previous') }}
        </button>
        <button type="button" class="btn secondary" @click="skip">
          {{ t('tour.skip') }}
        </button>
        <button v-if="step < steps.length - 1" type="button" class="btn primary" @click="next">
          {{ t('tour.next') }}
        </button>
        <button v-else type="button" class="btn primary" @click="complete">
          {{ t('tour.getStarted') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 23, 28, 0.52);
  padding: 24px;
}
.card {
  width: min(400px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  padding: 28px 24px 24px;
  text-align: center;
}
.dots {
  display: inline-flex;
  gap: 8px;
  margin-bottom: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line);
  transition: background 0.2s;
}
.dot.on { background: var(--blue); }
.title {
  margin: 0;
  font-family: var(--sans);
  font-size: var(--ui-font-size-lg);
  font-weight: 650;
  color: var(--ink);
}
.body {
  margin: 0;
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 0.5px);
  line-height: 1.55;
  color: var(--dim);
  max-width: 320px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.btn {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: calc(var(--ui-font-size) - 1px);
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.btn:hover { background: var(--soft); }
.btn.primary {
  background: var(--blue);
  color: var(--bg);
  border-color: var(--blue);
}
.btn.primary:hover { background: var(--blue2); border-color: var(--blue2); }
</style>
