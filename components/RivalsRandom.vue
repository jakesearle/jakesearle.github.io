<script setup>
import { reactive, watch, ref } from "vue";

// Load saved characters from localStorage if available
const saved = localStorage.getItem("characters");
const characters = reactive(
  saved
    ? JSON.parse(saved)
    : [
      { type: "fire", name: "Forsburn", level: 0, editing: false },
      { type: "fire", name: "Loxodont", level: 0, editing: false },
      { type: "fire", name: "Clairen", level: 0, editing: false },
      { type: "fire", name: "Zetterburn", level: 0, editing: false },
      { type: "earth", name: "Olympia", level: 0, editing: false },
      { type: "earth", name: "Maypul", level: 0, editing: false },
      { type: "earth", name: "Kragg", level: 0, editing: false },
      { type: "air", name: "Wrastor", level: 0, editing: false },
      { type: "air", name: "Fleet", level: 0, editing: false },
      { type: "air", name: "Absa", level: 0, editing: false },
      { type: "water", name: "Ranno", level: 0, editing: false },
      { type: "water", name: "Orcane", level: 0, editing: false },
      { type: "water", name: "Etalus", level: 0, editing: false },
    ]
);

function increment(char) {
  char.level++;
}
function decrement(char) {
  if (char.level > 0) {
    char.level--;
  }
}

watch(
  characters,
  (newVal) => {
    // Strip reactive proxy and exclude "editing" from saved state if you want
    const toSave = newVal.map(({ type, name, level }) => ({
      type,
      name,
      level,
    }));
    localStorage.setItem("characters", JSON.stringify(toSave));
  },
  { deep: true }
);

const selectedCharacter = ref(null);
let flashingInterval = null;

function pickRandomCharacter() {
  const maxLevel = Math.max(...characters.map((c) => c.level));

  const weightedPool = characters.flatMap((char) => {
    if (char.level === 0 && !invertRatio.value) return [];

    let weight = char.level;
    if (invertRatio.value) {
      weight = maxLevel - char.level + 1; // lower levels = higher weight
    }

    return Array(Math.max(1, weight)).fill(char);
  });

  if (weightedPool.length === 0) {
    selectedCharacter.value = null;
    return;
  }

  let flashCount = 0;
  flashingInterval = setInterval(() => {
    const randomChar =
      characters[Math.floor(Math.random() * characters.length)];
    selectedCharacter.value = randomChar;
    flashCount++;

    if (flashCount > 5) {
      clearInterval(flashingInterval);
      const finalChar =
        weightedPool[Math.floor(Math.random() * weightedPool.length)];
      selectedCharacter.value = finalChar;
    }
  }, 75);
}

const invertRatio = ref(false); // checkbox state
</script>

<template>
  <div class="random-row">
    <div class="parallelogram-right" @click="pickRandomCharacter">
      <div class="question">?</div>
    </div>
    <div v-if="selectedCharacter" class="parallelogram-left" :class="`${selectedCharacter.type}`">
      <div class="selected-char-background" :style="{
        backgroundImage: `url(/images/${selectedCharacter.name}-2D.png)`,
      }"></div>
      <div class="card-items">
        <div class="name">
          {{ selectedCharacter.name }}
        </div>
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
    <div v-for="char in characters" :key="char.name" class="parallelogram" :class="`${char.type}`">
      <div class="char-background" :style="{
        backgroundImage: `url(/images/${char.name}-2D.png)`,
      }"></div>
      <div class="card-items">
        <div class="name">
          {{ char.name }}
        </div>
        <div class="controls-container">
          <div class="controls">
            <button :style="{ visibility: char.level > 0 ? 'visible' : 'hidden' }" @click="decrement(char)">
              −
            </button>

            <span v-if="!char.editing" @click="char.editing = true">
              {{ char.level }}
            </span>
            <input v-else v-model.number="char.level" @blur="char.editing = false" @keyup.enter="char.editing = false"
              type="number" />

            <button @click="increment(char)">+</button>
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
  /* justify-content: space-between; */
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
}

.parallelogram-left .name {
  text-align: right;
  margin-right: 8px;
}

.character-list {
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-left: 64px;
}

.parallelogram {
  transform: skew(-20deg);
  width: 200px;
  height: 200px;
  margin-bottom: 4px;
  border-radius: 5px;
  overflow: hidden;
}

.char-background {
  transform: skew(20deg);
  /* undo skew */
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  color: white;
  /* padding-bottom: 0.5rem; */
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
}

.controls-container {
  width: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
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
  /* transform: skew(20deg); Undo skew for inner content */
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 1rem;
  margin-top: 4px;
  margin-bottom: 4px;
}

.controls button {
  font-size: 1.5rem;
  padding: 0.5rem 1rem;
  border: 2px solid var(--vp-c-text-1);
  border-radius: 4px;
  cursor: pointer;
}

.controls span,
.controls input {
  font-size: 1.25rem;
  margin: 0 1rem;
  min-width: 40px;
  text-align: center;
  background: none;
  border: none;
}

.controls input {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.25rem;
}
</style>
