<script setup lang="ts">
import { ref, computed } from 'vue'
import { crochetIncInstructions } from '../utils/crochet'

const start = ref<number | null>(null)
const end = ref<number | null>(null)

const result = computed(() => {
  if (
    start.value === null ||
    end.value === null ||
    start.value <= 0 ||
    end.value <= 0
  ) {
    return ''
  }

  if (end.value < start.value) {
    return 'Result must be greater than start'
  }

  try {
    return crochetIncInstructions(start.value, end.value)
  } catch (e) {
    return (e as Error).message
  }
})
</script>

<template>
  <div class="crochet-widget">
    <div class="inputs">
      <label>
        <span>Starting stitches</span>
        <input type="number" v-model.number="start" min="1" placeholder="12" />
      </label>

      <label>
        <span>Ending stitches</span>
        <input type="number" v-model.number="end" min="1" placeholder="18" />
      </label>
    </div>

    <pre v-if="result" class="output">{{ result }}</pre>
  </div>
</template>

<style scoped>
.crochet-widget {
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-soft);
  padding: 1.25rem;
  border-radius: 12px;
  max-width: 520px;
}

.inputs {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

input {
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 140px;
}

/* Focus state using brand color */
input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 25%, transparent);
}

/* Placeholder styling */
input::placeholder {
  color: var(--vp-c-text-3);
}

.output {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  padding: 0.9rem;
  border-radius: 8px;
  white-space: pre-wrap;
  font-size: 0.95rem;
}
</style>