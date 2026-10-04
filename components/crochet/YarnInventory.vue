<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { impeccableYarns, sortYarnsByColor } from '../../utils/impeccable-yarns';

// Yarns are keyed by name, not hex: the hex codes get refreshed when better
// swatch photos come along, but the color names are what's printed on the
// label, so they're what a saved inventory should survive.
const STORAGE_KEY = 'yarn-inventory';

const owned = ref(new Set<string>());
const search = ref('');
const filter = ref<'all' | 'have' | 'need'>('all');
const sortBy = ref<'name' | 'color'>('name');

// localStorage doesn't exist during SSR, so hydrate on the client instead of
// at setup time.
onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      // Drop names that are no longer in the yarn list (discontinued colors)
      // so a stale save can't inflate the "have" count.
      const known = new Set(impeccableYarns.map((y) => y.name));
      owned.value = new Set(parsed.filter((name) => known.has(name)));
    }
  } catch {
    // Unreadable or unavailable storage — start from an empty inventory.
  }
});

watch(
  owned,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...value]));
    } catch {
      // ignore write failures (e.g. private browsing)
    }
  },
  { deep: true }
);

const toggle = (name: string) => {
  const next = new Set(owned.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  owned.value = next;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

// Relative luminance, used to decide whether a swatch needs light or dark
// text drawn over it.
const isDark = (hex: string): boolean => {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance < 0.4;
};

const sortedYarns = computed(() => {
  const yarns = [...impeccableYarns];
  if (sortBy.value === 'name') {
    return yarns.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sortYarnsByColor(yarns);
});

const visibleYarns = computed(() => {
  const query = search.value.trim().toLowerCase();
  return sortedYarns.value.filter((yarn) => {
    if (query && !yarn.name.toLowerCase().includes(query)) return false;
    if (filter.value === 'have') return owned.value.has(yarn.name);
    if (filter.value === 'need') return !owned.value.has(yarn.name);
    return true;
  });
});

const ownedCount = computed(() => owned.value.size);
const totalCount = computed(() => impeccableYarns.length);

// Guards the only destructive control on the page — a mis-click here would
// wipe an inventory that took a while to tick through.
const confirmingReset = ref(false);

const resetAll = () => {
  owned.value = new Set();
  confirmingReset.value = false;
};

// The owned list as text, for pasting into a shopping list or a phone note.
const copied = ref(false);

const copyOwned = async () => {
  const names = sortedYarns.value
    .filter((yarn) => owned.value.has(yarn.name))
    .map((yarn) => yarn.name)
    .join('\n');
  try {
    await navigator.clipboard.writeText(names);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard blocked — nothing useful to fall back to here.
  }
};
</script>

<template>
  <div class="yarn-inventory">
    <div class="toolbar">
      <input v-model="search" type="search" class="search" placeholder="Search colors…" />

      <div class="segmented">
        <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
        <button :class="{ active: filter === 'have' }" @click="filter = 'have'">Have</button>
        <button :class="{ active: filter === 'need' }" @click="filter = 'need'">Need</button>
      </div>

      <div class="segmented">
        <button :class="{ active: sortBy === 'name' }" @click="sortBy = 'name'">A–Z</button>
        <button :class="{ active: sortBy === 'color' }" @click="sortBy = 'color'">Color</button>
      </div>

      <div class="count">
        <strong>{{ ownedCount }}</strong>
        of {{ totalCount }}
      </div>
    </div>

    <div class="bulk-actions">
      <button :disabled="ownedCount === 0" @click="copyOwned">
        {{ copied ? 'Copied!' : 'Copy my list' }}
      </button>
      <template v-if="confirmingReset">
        <span class="confirm-text">Clear all {{ ownedCount }}?</span>
        <button class="danger" @click="resetAll">Yes, clear</button>
        <button @click="confirmingReset = false">Cancel</button>
      </template>
      <button v-else :disabled="ownedCount === 0" @click="confirmingReset = true">Reset</button>
    </div>

    <p v-if="visibleYarns.length === 0" class="empty">No colors match that filter.</p>

    <div v-else class="swatch-grid">
      <button
        v-for="yarn in visibleYarns"
        :key="yarn.name"
        class="swatch"
        :class="{ owned: owned.has(yarn.name), dark: isDark(yarn.hex) }"
        :style="{ backgroundColor: yarn.hex }"
        :aria-pressed="owned.has(yarn.name)"
        :title="`${yarn.name} ${yarn.hex}`"
        @click="toggle(yarn.name)"
      >
        <span class="check" aria-hidden="true">✓</span>
        <span class="swatch-name">{{ yarn.name }}</span>
        <span class="swatch-hex">{{ yarn.hex }}</span>
      </button>
    </div>

    <p class="note">
      Saved in this browser only — a different device or a cleared cache starts over.
    </p>
  </div>
</template>

<style scoped>
.yarn-inventory {
  margin: 1.5rem 0;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.search {
  flex: 1 1 12rem;
  min-width: 0;
  padding: 0.45rem 0.65rem;
  font-size: 0.95rem;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
}

.segmented {
  display: flex;
  overflow: hidden;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
}

.segmented button {
  padding: 0.45rem 0.8rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg-soft);
  border: none;
  border-right: 1px solid var(--vp-c-border);
  cursor: pointer;
}

.segmented button:last-child {
  border-right: none;
}

.segmented button.active {
  color: var(--vp-c-white);
  background-color: var(--vp-c-brand-1);
}

.count {
  margin-left: auto;
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.count strong {
  font-size: 1.15rem;
  color: var(--vp-c-text-1);
}

.bulk-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.bulk-actions button {
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;
}

.bulk-actions button:hover:not(:disabled) {
  background-color: var(--vp-c-bg-mute);
}

.bulk-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.bulk-actions button.danger {
  color: var(--vp-c-white);
  background-color: var(--vp-c-danger-1, #d64545);
  border-color: transparent;
}

.confirm-text {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: 0.6rem;
}

.swatch {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 2.4rem 0.6rem 0.6rem;
  font-family: inherit;
  text-align: left;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  cursor: pointer;
  /* Unowned swatches read as washed-out so the ones you have pop out. */
  opacity: 0.45;
  filter: saturate(0.4);
  transition:
    opacity 0.15s,
    filter 0.15s,
    box-shadow 0.15s;
}

.swatch:hover {
  opacity: 0.8;
}

.swatch.owned {
  opacity: 1;
  filter: none;
  box-shadow: 0 0 0 2px var(--vp-c-brand-1);
}

.swatch-name,
.swatch-hex {
  color: #1b1b1f;
}

.swatch.dark .swatch-name,
.swatch.dark .swatch-hex {
  color: #ffffff;
}

.swatch-name {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.2;
}

.swatch-hex {
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  opacity: 0.75;
}

.check {
  position: absolute;
  top: 0.5rem;
  left: 0.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  font-size: 0.9rem;
  color: transparent;
  background-color: rgba(255, 255, 255, 0.35);
  border: 1.5px solid currentColor;
  border-radius: 4px;
}

.swatch .check {
  color: rgba(27, 27, 31, 0.5);
}

.swatch.dark .check {
  color: rgba(255, 255, 255, 0.6);
  background-color: rgba(0, 0, 0, 0.25);
}

.swatch.owned .check {
  color: #1b1b1f;
  background-color: #ffffff;
  border-color: #ffffff;
}

.empty {
  padding: 2rem 0;
  color: var(--vp-c-text-2);
  text-align: center;
}

.note {
  margin-top: 1.25rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

@media (max-width: 480px) {
  .count {
    margin-left: 0;
  }

  .swatch-grid {
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  }
}
</style>
