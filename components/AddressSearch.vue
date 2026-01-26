<template>
  <div class="address-search">
    <input
      v-model="query"
      @input="onInput"
      @keydown.down="highlightNext"
      @keydown.up="highlightPrev"
      @keydown.enter.prevent="selectHighlighted"
      type="text"
      class="input-box"
      placeholder="Enter address..."
    />

    <ul
      v-if="suggestions.length && showSuggestions"
      class="suggestions"
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :key="suggestion.place_id"
        @click="selectSuggestion(suggestion)"
        :class="{ highlighted: index === highlightedIndex }"
      >
        {{ suggestion.display_name }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const query = ref('')
const suggestions = ref([])
const showSuggestions = ref(false)
const highlightedIndex = ref(-1)
let controller = null
let debounceTimeout = null

const emit = defineEmits(['select'])

const onInput = () => {
  if (debounceTimeout) clearTimeout(debounceTimeout)

  debounceTimeout = setTimeout(() => {
    fetchSuggestions()
  }, 500)
}

const fetchSuggestions = async () => {
  if (query.value.length < 3) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  if (controller) controller.abort()
  controller = new AbortController()

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query.value
      )}&addressdetails=1&limit=5`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      }
    )

    if (!res.ok) throw new Error('Failed to fetch suggestions')

    const data = await res.json()
    suggestions.value = data
    showSuggestions.value = true
    highlightedIndex.value = -1
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Search error:', err)
  }
}

const selectSuggestion = (suggestion) => {
  query.value = suggestion.display_name
  suggestions.value = []
  showSuggestions.value = false
  highlightedIndex.value = -1
  emit('select', suggestion)
}

const highlightNext = () => {
  if (highlightedIndex.value < suggestions.value.length - 1) {
    highlightedIndex.value++
  }
}

const highlightPrev = () => {
  if (highlightedIndex.value > 0) {
    highlightedIndex.value--
  }
}

const selectHighlighted = () => {
  if (highlightedIndex.value >= 0) {
    selectSuggestion(suggestions.value[highlightedIndex.value])
  }
}

watch(query, () => {
  showSuggestions.value = true
})
</script>

<style scoped>
.address-search {
  position: relative;
  width: 100%;
  max-width: 600px;
}

.input-box {
  width: 100%;
  padding: 8px;
  font-size: 16px;
  color: var(--vp-c-text);
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  box-sizing: border-box;
}

.input-box:focus {
  outline: none;
  border-color: var(--vp-c-brand);
  box-shadow: 0 0 0 2px var(--vp-c-brand-light);
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  max-height: 240px;
  overflow-y: auto;
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  margin-top: 2px;
  padding: 0;
  list-style: none;
}

.suggestions li {
  padding: 8px;
  cursor: pointer;
  color: var(--vp-c-text);
}

.suggestions li:hover,
.suggestions li.highlighted {
  background-color: var(--vp-c-bg-alt);
  color: var(--vp-c-text);
}
</style>

