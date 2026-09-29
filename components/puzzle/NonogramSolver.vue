<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  UNKNOWN,
  FILLED,
  EMPTY,
  type Cell,
  type Grid,
  type LineHint,
  cloneGrid,
  formatClueLine,
  getLine,
  lineHints,
  makeGrid,
  parseClues,
  propagate,
  setLine,
  solvePuzzle,
  validateClues,
} from '../../utils/nonogram';

// A small starter puzzle so the page does something on first load.
const SAMPLE_ROWS = '2\n1 1\n1 1\n5\n1 1';
const SAMPLE_COLS = '3\n1 1\n1 2\n1 1\n3';

const rows = ref(5);
const cols = ref(5);
const rowText = ref(SAMPLE_ROWS);
const colText = ref(SAMPLE_COLS);
const grid = ref<Grid>(makeGrid(5, 5));
const history = ref<Grid[]>([]);
const message = ref('');

const rowClues = computed(() => parseClues(rowText.value, rows.value));
const colClues = computed(() => parseClues(colText.value, cols.value));
const problems = computed(() =>
  validateClues(rowClues.value, colClues.value, rows.value, cols.value)
);

// Resize the grid in place so half-entered progress survives a size change.
watch([rows, cols], ([r, c]) => {
  const next = makeGrid(r, c);
  for (let i = 0; i < Math.min(r, grid.value.length); i++) {
    for (let j = 0; j < Math.min(c, grid.value[i].length); j++) {
      next[i][j] = grid.value[i][j];
    }
  }
  grid.value = next;
  history.value = [];
});

const hints = computed<LineHint[]>(() => lineHints(grid.value, rowClues.value, colClues.value));

const rowHints = computed(() => {
  const map = new Map<number, LineHint>();
  for (const h of hints.value) if (h.kind === 'row') map.set(h.index, h);
  return map;
});

const colHints = computed(() => {
  const map = new Map<number, LineHint>();
  for (const h of hints.value) if (h.kind === 'col') map.set(h.index, h);
  return map;
});

const bestGain = computed(() => Math.max(0, ...hints.value.map((h) => h.gains)));

/** The lines worth looking at next, best first. */
const nextUp = computed(() => hints.value.filter((h) => h.gains > 0).slice(0, 8));

const stuckLines = computed(() => hints.value.filter((h) => h.solved === null));

const unknownCount = computed(() =>
  grid.value.reduce((sum, row) => sum + row.filter((c) => c === UNKNOWN).length, 0)
);

const filledCount = computed(() =>
  grid.value.reduce((sum, row) => sum + row.filter((c) => c === FILLED).length, 0)
);

const clueTotal = computed(() =>
  rowClues.value.reduce((sum, clue) => sum + clue.reduce((a, b) => a + b, 0), 0)
);

const focus = ref<{ kind: 'row' | 'col'; index: number } | null>(null);

function lineClass(kind: 'row' | 'col', index: number): string[] {
  const hint = (kind === 'row' ? rowHints.value : colHints.value).get(index);
  const classes: string[] = [];
  if (!hint) return classes;
  if (hint.solved === null) classes.push('is-broken');
  else if (hint.gains > 0 && hint.gains === bestGain.value) classes.push('is-best');
  else if (hint.gains > 0) classes.push('is-hinted');
  if (hint.unknowns === 0) classes.push('is-done');
  if (focus.value && focus.value.kind === kind && focus.value.index === index)
    classes.push('is-focused');
  return classes;
}

function cellClass(r: number, c: number): string[] {
  const classes = ['cell'];
  const value = grid.value[r][c];
  classes.push(value === FILLED ? 'is-filled' : value === EMPTY ? 'is-blank' : 'is-unknown');
  if (c % 5 === 0) classes.push('edge-left');
  if (r % 5 === 0) classes.push('edge-top');
  if (focus.value) {
    const inFocus = focus.value.kind === 'row' ? focus.value.index === r : focus.value.index === c;
    if (inFocus) classes.push('in-focus');
  }
  return classes;
}

function pushHistory(): void {
  history.value.push(cloneGrid(grid.value));
  if (history.value.length > 50) history.value.shift();
}

function undo(): void {
  const prev = history.value.pop();
  if (prev) {
    grid.value = prev;
    message.value = '';
  }
}

// ── Painting ───────────────────────────────────────────────────────────────
const paintValue = ref<Cell | null>(null);

function nextValue(current: Cell, button: number): Cell {
  if (button === 2) return current === EMPTY ? UNKNOWN : EMPTY;
  return current === UNKNOWN ? FILLED : current === FILLED ? EMPTY : UNKNOWN;
}

function startPaint(r: number, c: number, event: MouseEvent): void {
  event.preventDefault();
  pushHistory();
  const value = nextValue(grid.value[r][c], event.button);
  paintValue.value = value;
  applyCell(r, c, value);
}

function dragPaint(r: number, c: number): void {
  if (paintValue.value === null) return;
  applyCell(r, c, paintValue.value);
}

function endPaint(): void {
  paintValue.value = null;
}

function applyCell(r: number, c: number, value: Cell): void {
  if (grid.value[r][c] === value) return;
  const next = cloneGrid(grid.value);
  next[r][c] = value;
  grid.value = next;
  message.value = '';
}

// ── Solving actions ────────────────────────────────────────────────────────
function applyHint(hint: LineHint): void {
  if (!hint.solved) {
    message.value = `That ${hint.kind} contradicts its clue — no arrangement fits.`;
    return;
  }
  pushHistory();
  const next = cloneGrid(grid.value);
  setLine(next, hint.kind, hint.index, hint.solved);
  grid.value = next;
  focus.value = { kind: hint.kind, index: hint.index };
  message.value = `Filled ${hint.gains} cell${hint.gains === 1 ? '' : 's'} in ${hint.kind} ${hint.index + 1}.`;
}

/** Solves a line picked off the grid itself, by clicking its clue. */
function applyLine(kind: 'row' | 'col', index: number): void {
  const hint = (kind === 'row' ? rowHints.value : colHints.value).get(index);
  if (hint) applyHint(hint);
}

function applyBest(): void {
  const best = hints.value.find((h) => h.gains > 0);
  if (!best) {
    message.value = 'No single row or column can be advanced on its own right now.';
    return;
  }
  applyHint(best);
}

function solveLogically(): void {
  pushHistory();
  const result = propagate(grid.value, rowClues.value, colClues.value);
  grid.value = result.grid;
  if (result.status === 'contradiction') {
    message.value = 'These clues and marks contradict each other — check the grid for a mistake.';
  } else if (result.status === 'solved') {
    message.value = `Solved with line logic alone (${result.gains} cells).`;
  } else {
    message.value = `Line logic filled ${result.gains} cells, then stalled. ${unknownCount.value} cells still unknown.`;
  }
}

function solveFully(): void {
  pushHistory();
  const result = solvePuzzle(grid.value, rowClues.value, colClues.value);
  if (result.status === 'contradiction') {
    message.value = 'No solution fits these clues together with the marks already on the grid.';
    return;
  }
  grid.value = result.grid;
  message.value = 'Solved (guessing where line logic ran out).';
}

function clearGrid(): void {
  pushHistory();
  grid.value = makeGrid(rows.value, cols.value);
  message.value = '';
}

function loadSample(): void {
  rows.value = 5;
  cols.value = 5;
  rowText.value = SAMPLE_ROWS;
  colText.value = SAMPLE_COLS;
  grid.value = makeGrid(5, 5);
  history.value = [];
  message.value = '';
}

function hintLabel(hint: LineHint): string {
  const name = hint.kind === 'row' ? 'Row' : 'Col';
  return `${name} ${hint.index + 1}`;
}

function clueFor(kind: 'row' | 'col', index: number): number[] {
  return (kind === 'row' ? rowClues.value : colClues.value)[index] ?? [];
}

function lineIsFull(kind: 'row' | 'col', index: number): boolean {
  return getLine(grid.value, kind, index).every((c) => c !== UNKNOWN);
}
</script>

<template>
  <div class="nono-wrap" @mouseup="endPaint" @mouseleave="endPaint">
    <details class="config-panel" open>
      <summary>Puzzle</summary>

      <div class="config-grid">
        <div class="cfg-group">
          <label class="cfg-label">Rows</label>
          <input v-model.number="rows" type="number" min="1" max="40" />
        </div>
        <div class="cfg-group">
          <label class="cfg-label">Columns</label>
          <input v-model.number="cols" type="number" min="1" max="40" />
        </div>
        <div class="cfg-group">
          <label class="cfg-label">Row clues — one row per line, top to bottom</label>
          <textarea
            v-model="rowText"
            rows="6"
            spellcheck="false"
            placeholder="3 1&#10;1 1"
          ></textarea>
        </div>
        <div class="cfg-group">
          <label class="cfg-label">Column clues — one column per line, left to right</label>
          <textarea
            v-model="colText"
            rows="6"
            spellcheck="false"
            placeholder="2&#10;1 1 1"
          ></textarea>
        </div>
      </div>

      <div v-if="problems.length" class="problems">
        <div v-for="(p, i) in problems" :key="i">
          <template v-if="p.index >= 0">
            {{ p.kind === 'row' ? 'Row' : 'Column' }} {{ p.index + 1 }}:
          </template>
          {{ p.message }}
        </div>
      </div>

      <div class="button-row">
        <button class="small-btn" @click="loadSample">Load sample</button>
      </div>
    </details>

    <div class="button-row main-actions">
      <button class="run-btn" @click="applyBest">Solve next line</button>
      <button class="small-btn" @click="solveLogically">Solve as far as logic goes</button>
      <button class="small-btn" @click="solveFully">Full solve</button>
      <button class="small-btn" :disabled="!history.length" @click="undo">Undo</button>
      <button class="small-btn" @click="clearGrid">Clear grid</button>
    </div>

    <div class="board-and-hints">
      <div class="board-scroll">
        <table class="board" @contextmenu.prevent>
          <thead>
            <tr>
              <th class="corner"></th>
              <th
                v-for="c in cols"
                :key="'ch' + c"
                class="col-clue"
                :class="lineClass('col', c - 1)"
                @mouseenter="focus = { kind: 'col', index: c - 1 }"
                @mouseleave="focus = null"
                @click="applyLine('col', c - 1)"
              >
                <span v-for="(n, i) in clueFor('col', c - 1)" :key="i" class="clue-num">
                  {{ n }}
                </span>
                <span v-if="!clueFor('col', c - 1).length" class="clue-num zero">0</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="'r' + r">
              <th
                class="row-clue"
                :class="lineClass('row', r - 1)"
                @mouseenter="focus = { kind: 'row', index: r - 1 }"
                @mouseleave="focus = null"
                @click="applyLine('row', r - 1)"
              >
                <span class="clue-text" :class="{ faded: lineIsFull('row', r - 1) }">
                  {{ formatClueLine(clueFor('row', r - 1)) }}
                </span>
              </th>
              <td
                v-for="c in cols"
                :key="'c' + c"
                :class="cellClass(r - 1, c - 1)"
                @mousedown="startPaint(r - 1, c - 1, $event)"
                @mouseenter="dragPaint(r - 1, c - 1)"
              >
                <span v-if="grid[r - 1][c - 1] === EMPTY" class="x-mark">×</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="hints">
        <p class="message" aria-live="polite">{{ message }}</p>

        <h3>Look here next</h3>
        <p class="hint-blurb">
          Lines are ranked by how many cells they can pin down on their own right now. Click one —
          in the list or on the grid — to fill it in.
        </p>

        <div v-if="stuckLines.length" class="hint-warn">
          {{ stuckLines.length }} line{{ stuckLines.length === 1 ? '' : 's' }} can't be satisfied —
          the marks on the grid conflict with the clues.
        </div>

        <ul v-if="nextUp.length" class="hint-list">
          <li
            v-for="h in nextUp"
            :key="h.kind + h.index"
            :class="{ top: h.gains === bestGain }"
            @mouseenter="focus = { kind: h.kind, index: h.index }"
            @mouseleave="focus = null"
            @click="applyHint(h)"
          >
            <span class="hint-name">{{ hintLabel(h) }}</span>
            <span class="hint-clue">{{ formatClueLine(clueFor(h.kind, h.index)) }}</span>
            <span class="hint-gain">+{{ h.gains }}</span>
          </li>
        </ul>
        <p v-else-if="unknownCount === 0" class="hint-empty">Grid is complete.</p>
        <p v-else class="hint-empty">
          No line can be advanced on its own. You'll need to cross-reference rows against columns,
          or hit “Full solve”.
        </p>

        <dl class="stats">
          <div>
            <dt>Unknown cells</dt>
            <dd>{{ unknownCount }}</dd>
          </div>
          <div>
            <dt>Filled</dt>
            <dd>{{ filledCount }} / {{ clueTotal }}</dd>
          </div>
        </dl>

        <p class="legend">
          Left click cycles fill → blank → unknown. Right click marks blank. Drag to paint.
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.nono-wrap {
  font-family: var(--vp-font-family-base, sans-serif);
  max-width: 100%;
  user-select: none;
}

/* Config panel */
.config-panel {
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 8px;
  padding: 0;
  margin-bottom: 1.25rem;
}

.config-panel summary {
  padding: 0.6rem 1rem;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  color: var(--vp-c-text-1, #213547);
  list-style: none;
}

.config-panel summary::before {
  content: '▶ ';
  font-size: 10px;
  opacity: 0.6;
}

.config-panel[open] summary::before {
  content: '▼ ';
}

.config-panel[open] summary {
  border-bottom: 1px solid var(--vp-c-divider, #e2e2e2);
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
}

.cfg-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cfg-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2, #666);
}

input,
textarea {
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  background: var(--vp-c-bg, #fff);
  color: var(--vp-c-text-1, #213547);
  font-size: 14px;
}

textarea {
  font-family: var(--vp-font-family-mono, monospace);
  resize: vertical;
}

.problems {
  margin: 0 1rem 1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  font-size: 13px;
  background: var(--vp-c-warning-soft, #fff6e5);
  color: var(--vp-c-text-1, #213547);
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 1rem 1rem;
}

.main-actions {
  padding: 0 0 1rem;
  align-items: center;
}

.run-btn,
.small-btn {
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-size: 13px;
  cursor: pointer;
  background: var(--vp-c-bg-soft, #f6f6f7);
  color: var(--vp-c-text-1, #213547);
}

.run-btn {
  background: var(--vp-c-brand-1, #3451b2);
  border-color: var(--vp-c-brand-1, #3451b2);
  color: #fff;
  font-weight: 500;
}

.small-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.message {
  /* Fixed height: the board must not move when a status line appears. */
  min-height: 2.6em;
  margin: 0 0 0.5rem;
  font-size: 13px;
  line-height: 1.3;
  color: var(--vp-c-text-2, #666);
}

/* Board */
.board-and-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-start;
}

.board-scroll {
  overflow-x: auto;
}

.board {
  border-collapse: collapse;
  margin: 0;
}

.board :deep(tr) {
  border: none;
  background: transparent;
}

.board th,
.board td {
  border: 1px solid var(--vp-c-divider, #d8d8d8);
  padding: 0;
}

.corner {
  border: none;
}

.board .col-clue {
  vertical-align: bottom;
  text-align: center;
  min-width: 26px;
  padding: 4px 9px 4px 9px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.15;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid var(--vp-c-divider, #d8d8d8);
}

.board .col-clue .clue-num {
  display: block;
}

.board .row-clue {
  text-align: right;
  white-space: nowrap;
  padding: 3px 9px 3px 9px;
  font-size: 11px;
  font-weight: 500;
  font-family: var(--vp-font-family-mono, monospace);
  cursor: pointer;
  border: none;
  border-right: 2px solid var(--vp-c-divider, #d8d8d8);
}

.clue-num.zero,
.clue-text.faded {
  opacity: 0.35;
}

/* Hint highlighting on clue headers */
.is-hinted {
  background: var(--vp-c-brand-soft, #e8ecf8);
}

.is-best {
  background: var(--vp-c-brand-soft, #dbe3f7);
  outline: 2px solid var(--vp-c-brand-1, #3451b2);
  outline-offset: -2px;
  border-radius: 3px;
}

.is-broken {
  background: var(--vp-c-danger-soft, #fdd8d8);
}

.is-done {
  opacity: 0.55;
}

.is-focused {
  background: var(--vp-c-brand-soft, #dbe3f7);
}

/* Cells */
.cell {
  width: 26px;
  height: 26px;
  text-align: center;
  cursor: pointer;
  background: var(--vp-c-bg, #fff);
}

.cell.edge-left {
  border-left: 2px solid var(--vp-c-text-3, #999);
}

.cell.edge-top {
  border-top: 2px solid var(--vp-c-text-3, #999);
}

.cell.is-filled {
  background: var(--vp-c-text-1, #213547);
}

.cell.is-blank {
  color: var(--vp-c-text-3, #999);
}

.cell.in-focus:not(.is-filled) {
  background: var(--vp-c-brand-soft, #eef1fa);
}

.x-mark {
  font-size: 15px;
  line-height: 26px;
}

/* Hints panel */
.hints {
  flex: 1 1 260px;
  min-width: 240px;
  max-width: 360px;
}

.hints h3 {
  margin: 0 0 0.4rem;
  font-size: 15px;
}

.hint-blurb,
.hint-empty,
.legend {
  font-size: 12px;
  color: var(--vp-c-text-2, #666);
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.hint-warn {
  font-size: 12px;
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  margin-bottom: 0.75rem;
  background: var(--vp-c-danger-soft, #fdd8d8);
}

.hint-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}

.hint-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 13px;
  cursor: pointer;
}

.hint-list li.top {
  border-color: var(--vp-c-brand-1, #3451b2);
  background: var(--vp-c-brand-soft, #eef1fa);
}

.hint-name {
  font-weight: 600;
  min-width: 56px;
}

.hint-clue {
  flex: 1;
  font-family: var(--vp-font-family-mono, monospace);
  color: var(--vp-c-text-2, #666);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint-gain {
  font-weight: 600;
  color: var(--vp-c-brand-1, #3451b2);
}

.stats {
  display: flex;
  gap: 1.25rem;
  margin: 0 0 0.75rem;
  font-size: 12px;
}

.stats dt {
  color: var(--vp-c-text-2, #666);
}

.stats dd {
  margin: 0;
  font-weight: 600;
}

@media (max-width: 640px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
