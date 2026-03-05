<script setup>
import { reactive, watch, ref, computed } from "vue";

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
  ];
}

const saved = localStorage.getItem("characters");
var savedChars = saved ? JSON.parse(saved) : getDefault();
if (savedChars.length !== getDefault().length) {
  savedChars = getDefault();
}
// Backfill `enabled` for saves that predate this feature
savedChars = savedChars.map((c) => ({ enabled: true, ...c }));

const characters = reactive(savedChars);

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

// Returns scaled integer weights for eligible chars.
// Normal:   weight = level (level-0 excluded unless all are 0)
// Inverted: weight = 1 / (level + 1), scaled up to integers so ratios
//           mirror normal mode in reverse.
function computeScaledWeights(eligibleChars) {
  const rawWeights = eligibleChars.map((char) => {
    if (char.level === 0 && !invertRatio.value) return 0;
    return invertRatio.value ? 1 / (char.level + 1) : char.level;
  });

  const positiveWeights = rawWeights.filter((w) => w > 0);
  if (positiveWeights.length === 0) return rawWeights.map(() => 0);

  const minWeight = Math.min(...positiveWeights);
  return rawWeights.map((w) => (w === 0 ? 0 : Math.round(w / minWeight)));
}

function pickRandomCharacter() {
  const eligibleChars = characters.filter((c) => c.enabled);
  const scaledWeights = computeScaledWeights(eligibleChars);

  const weightedPool = eligibleChars.flatMap((char, i) =>
    Array(scaledWeights[i]).fill(char)
  );

  if (weightedPool.length === 0) {
    selectedCharacter.value = null;
    return;
  }

  let flashCount = 0;
  let previousChar = null;
  clearInterval(flashingInterval);
  flashingInterval = setInterval(() => {
    let randomChar;
    do {
      randomChar = eligibleChars[Math.floor(Math.random() * eligibleChars.length)];
    } while (randomChar === previousChar && eligibleChars.length > 1);

    selectedCharacter.value = randomChar;
    previousChar = randomChar;
    flashCount++;

    if (flashCount > 5) {
      clearInterval(flashingInterval);
      selectedCharacter.value = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    }
  }, 75);
}

const characterProbabilities = computed(() => {
  const eligibleChars = characters.filter((c) => c.enabled);
  const scaledWeights = computeScaledWeights(eligibleChars);

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

function resetCharacters() {
  const defaults = getDefault();
  characters.splice(0, characters.length, ...defaults);
}

const cardRefs = ref({});

function scrollToCharacter(char) {
  const el = cardRefs.value[char.name];
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
</script>

<template>
  <div class="random-row">
    <div class="parallelogram-right" @click="pickRandomCharacter">
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
    <label>
      <input type="checkbox" v-model="invertRatio" />
      Invert probabilities
    </label>
  </div>

  <div class="character-list">
    <div v-for="char in characters" :key="char.name" :ref="el => { if (el) cardRefs[char.name] = el }"
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

            <span v-if="!char.editing" @click="char.editing = true">
              {{ char.level }}
            </span>
            <input v-else v-model.number="char.level" @blur="char.editing = false" @keyup.enter="char.editing = false"
              type="number" />

            <button @click="increment(char)" :disabled="!char.enabled">+</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="reset-chars" @click="resetCharacters">
    <a href="">Reset levels</a>
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
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.9);
  font-size: 1.2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* width: 192px; */
  gap: 4px;
}

.char-name {
  flex: 1;
}

.char-percent {
  text-align: right;
  opacity: 0.8;
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

/* Toggle button */
.toggle-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 0.7rem;
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

.reset-chars {
  text-align: center;
  margin-top: 4rem;
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
</style>
