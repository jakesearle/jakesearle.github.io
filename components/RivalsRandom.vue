<script setup>
import { reactive, watch, ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { computeScaledWeights, pickWeighted, sortForDisplay } from "../utils/rivals";

function getDefault() {
  return [
    { type: "fire", name: "Zetterburn", level: 0, editing: false, enabled: true },
    { type: "fire", name: "Clairen", level: 0, editing: false, enabled: true },
    { type: "fire", name: "Loxodont", level: 0, editing: false, enabled: true },
    { type: "fire", name: "Forsburn", level: 0, editing: false, enabled: true },
    { type: "earth", name: "Kragg", level: 0, editing: false, enabled: true },
    { type: "earth", name: "Maypul", level: 0, editing: false, enabled: true },
    { type: "earth", name: "Olympia", level: 0, editing: false, enabled: true },
    { type: "earth", name: "Galvan", level: 0, editing: false, enabled: true },
    { type: "earth", name: "La Reina", level: 0, editing: false, enabled: true },
    { type: "air", name: "Wrastor", level: 0, editing: false, enabled: true },
    { type: "air", name: "Fleet", level: 0, editing: false, enabled: true },
    { type: "air", name: "Absa", level: 0, editing: false, enabled: true },
    { type: "water", name: "Ranno", level: 0, editing: false, enabled: true },
    { type: "water", name: "Orcane", level: 0, editing: false, enabled: true },
    { type: "water", name: "Etalus", level: 0, editing: false, enabled: true },
    { type: "water", name: "Slade", level: 0, editing: false, enabled: true },
    { type: "water", name: "Gouie", level: 0, editing: false, enabled: true },
  ];
}

const characters = reactive(getDefault());

// localStorage doesn't exist during SSR, so hydrate on the client instead of
// at setup time.
onMounted(() => {
  const saved = localStorage.getItem("characters");
  if (!saved) return;

  let savedChars;
  try {
    savedChars = JSON.parse(saved);
  } catch {
    return; // corrupt save — keep defaults
  }

  if (!Array.isArray(savedChars) || savedChars.length !== characters.length) return;

  characters.splice(
    0,
    characters.length,
    // Backfill `enabled` for saves that predate this feature
    ...savedChars.map((c) => ({ editing: false, enabled: true, ...c }))
  );
});

function increment(char) {
  char.level++;
}

function decrement(char) {
  if (char.level > 0) {
    char.level--;
  }
}

function toggleEnabled(char) {
  char.enabled = !char.enabled;
}

watch(
  characters,
  (newVal) => {
    const toSave = newVal.map(({ type, name, level, enabled }) => ({
      type,
      name,
      level,
      enabled,
    }));
    localStorage.setItem("characters", JSON.stringify(toSave));
  },
  { deep: true }
);

const invertRatio = ref(false);
const selectedCharacter = ref(null);
let flashingInterval = null;

const isShuffling = ref(false);

function weightsFor(eligibleChars) {
  return computeScaledWeights(
    eligibleChars.map((c) => c.level),
    invertRatio.value
  );
}

function pickRandomCharacter() {
  if (isShuffling.value) return;

  const eligibleChars = characters.filter((c) => c.enabled);
  const scaledWeights = weightsFor(eligibleChars);

  if (eligibleChars.length === 0) {
    selectedCharacter.value = null;
    return;
  }

  // Shuffle the eligible chars once for the animation loop
  const shuffled = [...eligibleChars].sort(() => Math.random() - 0.5);

  isShuffling.value = true;
  let flashCount = 0;
  let loopIndex = 0;
  clearInterval(flashingInterval);
  flashingInterval = setInterval(() => {
    selectedCharacter.value = shuffled[loopIndex % shuffled.length];
    loopIndex++;
    flashCount++;

    if (flashCount > 5) {
      clearInterval(flashingInterval);
      selectedCharacter.value = pickWeighted(eligibleChars, scaledWeights);
      isShuffling.value = false;
    }
  }, 75);
}

const characterProbabilities = computed(() => {
  const eligibleChars = characters.filter((c) => c.enabled);
  const scaledWeights = weightsFor(eligibleChars);

  const weightMap = Object.fromEntries(
    eligibleChars.map((char, i) => [char.name, scaledWeights[i]])
  );
  const total = scaledWeights.reduce((a, b) => a + b, 0);

  return characters.map((char) => {
    const w = weightMap[char.name] ?? 0;
    return {
      name: char.name,
      percent: total > 0 ? +((w / total) * 100).toFixed(1) : 0,
    };
  });
});

function getCharPercent(name) {
  const found = characterProbabilities.value.find((c) => c.name === name);
  return found ? found.percent : "0";
}

function selectAll() {
  characters.forEach((c) => (c.enabled = true));
}

function deselectAll() {
  characters.forEach((c) => (c.enabled = false));
}

// Unlock milestones — selecting a preset targets the characters still short of it
const LEVEL_PRESETS = [
  { level: 20, reward: "Steam achievement" },
  { level: 50, reward: "Animal skin" },
  { level: 100, reward: "Abyss skin" },
];

const levelPresets = computed(() =>
  LEVEL_PRESETS.map((preset) => ({
    ...preset,
    remaining: characters.filter((c) => c.level < preset.level).length,
  }))
);

function selectUnderLevel(threshold) {
  characters.forEach((c) => (c.enabled = c.level < threshold));
}

function resetData() {
  // Now one click away inside the modal, so guard the wipe
  if (!confirm("Reset every character's level and re-enable them all?")) return;
  const defaults = getDefault();
  characters.splice(0, characters.length, ...defaults);
  // The banner holds a reference to a spliced-out object, so drop it
  selectedCharacter.value = null;
}

// Sorting is display-only — `characters` keeps its canonical order so saves and
// "Reset all data" stay stable.
const sortMode = ref("default"); // see SortMode in utils/rivals
const unselectedLast = ref(true);

const displayedCharacters = computed(() =>
  sortForDisplay(
    characters,
    sortMode.value,
    unselectedLast.value,
    // characterProbabilities is built in `characters` order, so it lines up
    characterProbabilities.value.map((p) => p.percent)
  )
);

const SORT_OPTIONS = [
  { value: "default", label: "Character Select Screen" },
  { value: "desc", label: "Level (high → low)" },
  { value: "asc", label: "Level (low → high)" },
  { value: "prob-desc", label: "Probability (high → low)" },
  { value: "prob-asc", label: "Probability (low → high)" },
];

const showSettings = ref(false);
const settingsCloseBtn = ref(null);
let previouslyFocused = null;

function onKeydown(e) {
  if (e.key === "Escape" && showSettings.value) showSettings.value = false;
}

// Move focus into the dialog on open, hand it back on close, and stop the page
// behind the overlay from scrolling.
watch(showSettings, async (open) => {
  if (open) {
    previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    await nextTick();
    settingsCloseBtn.value?.focus();
  } else {
    document.body.style.overflow = "";
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }
});

onMounted(() => window.addEventListener("keydown", onKeydown));

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearInterval(flashingInterval);
  document.body.style.overflow = "";
});

const cardRefs = ref({});

function scrollToCharacter(char) {
  const el = cardRefs.value[char.name];
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function startEditing(char) {
  char.editing = true;
  await nextTick();
  const input = document.querySelector(`input[data-name="${char.name}"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

async function handleTab(char, index, event) {
  event.preventDefault();
  char.editing = false;
  // Tab follows what's on screen, so walk the sorted list rather than `characters`
  const list = displayedCharacters.value;
  const next = event.shiftKey ? list[index - 1] : list[index + 1];
  if (next) startEditing(next);
}
</script>

<template>
  <div class="random-row">
    <div class="parallelogram-right" @click="pickRandomCharacter" :class="{ shuffling: isShuffling }">
      <div class="question">?</div>
    </div>
    <div v-if="selectedCharacter" class="parallelogram-left" :class="`${selectedCharacter.type}`">
      <div class="selected-char-background" :style="{
        backgroundImage: `url(/images/${selectedCharacter.name.replace(/ /g, '')}-2D.png)`,
      }"></div>
      <div class="card-items">
        <div class="name">
          {{ selectedCharacter.name }} ({{ selectedCharacter.level }})
        </div>
        <button class="scroll-to-btn" @click="scrollToCharacter(selectedCharacter)"
          title="Scroll to character">↓</button>
      </div>
    </div>
  </div>

  <div class="randomizer-controls">
    <div class="control-stack">
      <label class="control-row">
        Sort by
        <select v-model="sortMode">
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="control-row">
        <input type="checkbox" v-model="invertRatio" />
        Invert probabilities
      </label>
    </div>

    <button class="settings-btn" @click="showSettings = true" title="Settings" aria-label="Settings">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path
          d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z">
        </path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </button>
  </div>

  <div v-if="showSettings" class="settings-popup" @click.self="showSettings = false">
    <div class="settings-content" role="dialog" aria-modal="true" aria-labelledby="rivals-settings-title">
      <div class="settings-header">
        <h3 id="rivals-settings-title">Settings</h3>
        <button ref="settingsCloseBtn" @click="showSettings = false" class="close-btn"
          aria-label="Close settings">×</button>
      </div>
      <div class="settings-body">
        <div class="setting-item">
          <span class="setting-label">Presets</span>
          <div class="setting-control setting-control--column">
            <button class="action-btn preset-btn" @click="selectAll">
              <span class="preset-title">Select all characters</span>
            </button>

            <button v-for="preset in levelPresets" :key="preset.level" class="action-btn preset-btn"
              :disabled="preset.remaining === 0" @click="selectUnderLevel(preset.level)">
              <span class="preset-title">Select all under level {{ preset.level }}</span>
              <span class="preset-reward">{{ preset.reward }}</span>
              <span class="preset-count">{{ preset.remaining }} left</span>
            </button>

            <button class="action-btn preset-btn" @click="deselectAll">
              <span class="preset-title">Deselect all characters</span>
            </button>
          </div>
          <p class="setting-description">
            Each preset replaces your current selection. The level presets pick only the
            characters still below that level, so the randomizer draws from the ones you
            haven't unlocked yet.
          </p>
        </div>

        <div class="setting-item">
          <label class="control-row">
            <input type="checkbox" v-model="unselectedLast" />
            Show unselected last
          </label>
          <p class="setting-description">
            Move characters you've excluded to the end of the list instead of leaving them in place
          </p>
        </div>

        <div class="setting-item">
          <span class="setting-label">Reset</span>
          <div class="setting-control">
            <button class="action-btn action-btn--danger" @click="resetData">Reset all data</button>
          </div>
          <p class="setting-description">
            Set every level back to 0 and re-enable all characters. This can't be undone.
          </p>
        </div>

        <button @click="showSettings = false" class="save-btn">Done</button>
      </div>
    </div>
  </div>

  <div class="character-list">
    <div v-for="(char, index) in displayedCharacters" :key="char.name" :ref="el => { if (el) cardRefs[char.name] = el }"
      class="parallelogram" :class="[`${char.type}`, { disabled: !char.enabled }]">
      <div class="char-background" :style="{
        backgroundImage: `url(/images/${char.name.replace(/ /g, '')}-2D.png)`,
      }"></div>
      <div class="card-items">
        <div class="name">
          <span class="char-name">{{ char.name }}</span>
          <span class="char-percent">{{ char.enabled ? `${getCharPercent(char.name)}%` : '—' }}</span>
          <button class="toggle-btn" :class="{ 'toggle-btn--off': !char.enabled }" @click="toggleEnabled(char)"
            :title="char.enabled ? 'Exclude from randomizer' : 'Include in randomizer'">{{ char.enabled ? '✓' : '✗'
            }}</button>
        </div>
        <div class="controls-container">
          <div class="controls">
            <button :style="{ visibility: char.level > 0 ? 'visible' : 'hidden' }" @click="decrement(char)"
              :disabled="!char.enabled">−</button>

            <div class="level-display" @click="startEditing(char)">
              <span v-if="!char.editing">{{ char.level }}</span>
              <input v-model.number="char.level" :data-name="char.name" @focus="startEditing(char)"
                @blur="char.editing = false" @keyup.enter="char.editing = false"
                @keydown.tab="handleTab(char, index, $event)" @keydown.esc="char.editing = false" inputmode="numeric"
                enterkeyhint="next" type="number" />
            </div>

            <button @click="increment(char)" :disabled="!char.enabled">+</button>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<style scoped>
.random-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 8px;
  height: 200px;
}

.randomizer-controls {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 8px;
}

.control-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}

.control-row select {
  border: 1px solid var(--vp-c-border, #ccc);
  border-radius: 4px;
  background-color: var(--vp-c-bg-soft, transparent);
  color: inherit;
  padding: 2px 6px;
  cursor: pointer;
}

.settings-btn {
  flex-shrink: 0;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-border);
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.25s, border-color 0.25s;
}

.settings-btn:hover {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.settings-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-content {
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.75rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-border);
}

.settings-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-2);
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  transition: background-color 0.25s, color 0.25s;
}

.close-btn:hover {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.settings-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.setting-item {
  margin-bottom: 1.25rem;
}

.setting-description {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

.save-btn {
  width: 100%;
  padding: 0.625rem 1rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.25s, border-color 0.25s;
}

.save-btn:hover {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.parallelogram-right {
  width: 60%;
  height: 200px;
  background: #2e346e;
  clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
  color: white;
  display: flex;
  border-radius: 5px;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.parallelogram-right.shuffling {
  cursor: not-allowed;
  opacity: 0.7;
}

.question {
  font-size: 128px;
  padding-right: 20%;
  color: #d4d4dc;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  display: flex;
}

.parallelogram-left {
  width: 60%;
  height: 200px;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  position: relative;
  clip-path: polygon(20% 0, 100% 0, 100% 100%, 0% 100%);
  margin-left: -8%;
}

.parallelogram-left.fire {
  background-color: #4e0415;
}

.parallelogram-left.earth {
  background-color: #68b55d;
}

.parallelogram-left.air {
  background-color: #fd9dfc;
}

.parallelogram-left.water {
  background-color: #6473ce;
}

.selected-char-background {
  width: 90%;
  height: 100%;
  background-size: cover;
  background-position-x: right;
  background-position-y: top;
  display: flex;
  color: white;
  transform: scaleX(-1);
  position: absolute;
  right: 0;
}

.parallelogram-left .card-items {
  position: absolute;
  bottom: 0;
  right: 0;
  display: flex;
  justify-content: flex-end;
}

.parallelogram-left .name {
  text-align: right;
  /* margin-right: 8px; */
  color: var(--vp-c-white);
}

.character-list {
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  width: 80vw;
  margin-left: calc(50% - (80vw/2));
}

.parallelogram {
  transform: skew(-20deg);
  width: 200px;
  height: 200px;
  margin-bottom: 4px;
  border-radius: 5px;
  overflow: hidden;
  color: var(--vp-c-white);
  border-color: var(--vp-c-white);
  position: relative;
  transition: opacity 0.2s ease, filter 0.2s ease;
}

/* Disabled state: dim and desaturate the whole card */
.parallelogram.disabled {
  opacity: 0.4;
  filter: grayscale(80%);
}

.char-background {
  transform: skew(20deg);
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  color: white;
  position: absolute;
}

.parallelogram.fire {
  background-color: #4e0415;
}

.parallelogram.earth {
  background-color: #68b55d;
}

.parallelogram.air {
  background-color: #fd9dfc;
}

.parallelogram.water {
  background-color: #6473ce;
}

.card-items {
  position: absolute;
  bottom: 0;
  left: 0;
}

.name {
  margin-left: 8px;
  margin-right: 8px;
  margin-bottom: 4px;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  font-size: 1.2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

.char-name {
  flex: 1;
}

.char-percent {
  text-align: right;
  font-size: 0.9rem;
}

.controls-container {
  width: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
  box-sizing: border-box;
}

.fire .controls-container {
  background-color: #b72046;
}

.earth .controls-container {
  background-color: #2a5325;
}

.air .controls-container {
  background-color: #b174ba;
}

.water .controls-container {
  background-color: #3a457b;
}

.controls {
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  flex: 1;
  margin-top: 4px;
  margin-bottom: 4px;
}

.controls button {
  font-size: 1.5rem;
  padding: 0.5rem 1rem;
  border-width: 2px;
  border-style: solid;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.controls span,
.controls input {
  font-size: 1.25rem;
  width: 4ch;
  text-align: center;
  background: none;
  border: none;
}

.controls input {
  border: 1px solid #ccc;
  border-radius: 4px;
}

.level-display {
  position: relative;
  width: 4ch;
  text-align: center;
}

.level-display span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.level-display input {
  width: 100%;
  opacity: 0;
  font-size: 1.25rem;
  background: none;
  border: none;
}

.level-display input:focus {
  opacity: 1;
}

/* Toggle button */
.toggle-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
  line-height: 1;
  padding: 0;
  margin-right: 2px;
  margin-bottom: 2px;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.4);
}

.toggle-btn--off {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.5);
}

.setting-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.5rem;
}

.action-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.25s, border-color 0.25s, color 0.25s;
}

.action-btn:hover {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-btn:disabled:hover {
  background-color: var(--vp-c-bg-soft);
  border-color: var(--vp-c-border);
}

.setting-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.setting-control--column {
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}

.preset-btn {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  text-align: left;
}

.preset-title {
  font-weight: 600;
}

.preset-reward {
  color: var(--vp-c-text-2);
}

.preset-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.action-btn--danger:hover {
  border-color: var(--vp-c-danger-1, #d64040);
  color: var(--vp-c-danger-1, #d64040);
}

.scroll-to-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: background 0.15s ease, transform 0.15s ease;
  margin: 4px;
}

.scroll-to-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: translateY(2px);
}

.visually-hidden {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
}
</style>
