<!-- apps/kimi-web/src/components/LoadingSkeleton.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    lines?: number;
    avatar?: boolean;
  }>(),
  {
    lines: 3,
    avatar: false,
  },
);
</script>

<template>
  <div class="skeleton-wrap" role="status" aria-label="Loading">
    <div v-if="avatar" class="sk-avatar"></div>
    <div class="sk-lines">
      <div
        v-for="n in lines"
        :key="n"
        class="sk-line"
        :style="{ width: n === lines ? '60%' : '100%' }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-wrap {
  display: flex;
  gap: 12px;
  padding: 16px 0;
}
.sk-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--line2);
  flex-shrink: 0;
  animation: shimmer 1.5s infinite;
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-line {
  height: 14px;
  border-radius: 6px;
  background: var(--line2);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
}
</style>
