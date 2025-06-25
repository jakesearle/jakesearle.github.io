<script setup>
import { reactive } from "vue";

const characters = reactive([
  { type: "fire", name: "Forsburn", level: 0, editing: false },
  { type: "fire", name: "Loxodont", level: 0, editing: false },
  { type: "fire", name: "Clairen", level: 0, editing: false },
  { type: "fire", name: "Zetterburn", level: 0, editing: false },
  { type: "earth", name: "Olympia", level: 0, editing: false },
  { type: "earth", name: "Maypul", level: 0, editing: false },
  { type: "earth", name: "Kragg", level: 0, editing: false },
  { type: "air", name: "Wrastor", level: 0, editing: false },
  { type: "air", name: "Fleet", level: 0, editing: false },
  { type: "water", name: "Ranno", level: 0, editing: false },
  { type: "water", name: "Orcane", level: 0, editing: false },
  { type: "water", name: "Etalus", level: 0, editing: false },
]);

function increment(char) {
  char.level++;
}
function decrement() {
  char.level--;
}
</script>

<template>
  <div class="character-list">
    <div
      v-for="char in characters"
      :key="char.name"
      class="parallelogram"
      :class="`${char.type}`"
    >
      <div
        class="char-background"
        :style="{
          backgroundImage: `url(/images/${char.name}-2D.png)`,
        }"
      ></div>
      <div class="card-items">
        <div class="name">
          {{ char.name }}
        </div>
        <div class="controls-container">
          <div class="controls">
            <button @click="decrement(char)">−</button>

            <span v-if="!char.editing" @click="char.editing = true">
              {{ char.level }}
            </span>
            <input
              v-else
              v-model.number="char.level"
              @blur="char.editing = false"
              @keyup.enter="char.editing = false"
              type="number"
            />

            <button @click="increment(char)">+</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-list {
  display: flex;
  flex-direction: column;
  align-items: center;
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
  transform: skew(20deg); /* undo skew */
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  color: white;
  padding-bottom: 0.5rem;
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
  border: 2px solid white;
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
