<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  UNKNOWN,
  FILLED,
  EMPTY,
  type Cell,
  countLineArrangements,
  parseClueLine,
  solveLine,
} from '../../utils/nonogram';

const length = ref(10);
const clueText = ref('3 2');
const cells = ref<Cell[]>(Array.from({ length: 10 }, () => UNKNOWN));

const clue = computed(() => parseClueLine(clueText.value));

// Keep the marks when the line is resized, so a re-count doesn't wipe work.
watch(length, (n) => {
  const next: Cell[] = Array.from({ length: n }, (_, i) => cells.value[i] ?? UNKNOWN);
  cells.value = next;
});

/** Text form of the line, so a state can be pasted in or copied out. */
const lineText = computed({
  get: () => cells.value.map((c) => (c === FILLED ? '#' : c === EMPTY ? 'x' : '.')).join(''),
  set: (text: string) => {
    const parsed = text
      .split('')
      .filter((ch) => !/\s/.test(ch))
      .map<Cell>((ch) => {
        if (ch === '#' || ch === '1' || ch === '*' || ch === 'o' || ch === 'O') return FILLED;
        if (ch === 'x' || ch === 'X' || ch === '0' || ch === '-') return EMPTY;
        return UNKNOWN;
      });
    if (parsed.length !== length.value) length.value = parsed.length;
    cells.value = Array.from({ length: parsed.length }, (_, i) => parsed[i] ?? UNKNOWN);
  },
});

const solved = computed(() => solveLine(clue.value, cells.value));

const arrangements = computed(() => countLineArrangements(clue.value, cells.value));

/** Which positions the solver can newly pin down. */
const gains = computed(() => {
  const out: number[] = [];
  const result = solved.value;
  if (!result) return out;
  for (let i = 0; i < cells.value.length; i++) {
    if (cells.value[i] === UNKNOWN && result[i] !== UNKNOWN) out.push(i);
  }
  return out;
});

const unknowns = computed(() => cells.value.filter((c) => c === UNKNOWN).length);

type Verdict = 'broken' | 'complete' | 'work' | 'determined' | 'stuck';

const verdict = computed<Verdict>(() => {
  if (!solved.value) return 'broken';
  if (unknowns.value === 0) return 'complete';
  if (gains.value.length > 0) return 'work';
  if (arrangements.value === 1) return 'determined';
  return 'stuck';
});

const headline = computed(() => {
  switch (verdict.value) {
    case 'broken':
      return 'No arrangement fits';
    case 'complete':
      return 'Line is finished';
    case 'work':
      return `There's work to do — ${gains.value.length} cell${gains.value.length === 1 ? '' : 's'}`;
    case 'determined':
      return 'Only one arrangement fits';
    default:
      return 'Nothing more from this line alone';
  }
});

const detail = computed(() => {
  switch (verdict.value) {
    case 'broken':
      return 'The clue cannot be placed in the line as marked — something earlier is wrong.';
    case 'complete':
      return 'Every cell is decided and the clue is satisfied.';
    case 'work':
      return `The cells below in blue follow from the clue alone. ${arrangements.value} arrangement${
        arrangements.value === 1 ? '' : 's'
      } still fit.`;
    case 'determined':
      return 'Everything left is already implied by the marks — apply the deductions to finish it.';
    default:
      return `${arrangements.value} arrangements still fit, and no single cell is the same in all of them. You need a crossing line to make progress.`;
  }
});

function cellClass(i: number): string[] {
  const classes = ['cell'];
  const value = cells.value[i];
  classes.push(value === FILLED ? 'is-filled' : value === EMPTY ? 'is-blank' : 'is-unknown');
  if (i % 5 === 0) classes.push('edge-left');
  return classes;
}

function resultClass(i: number): string[] {
  const value = solved.value ? solved.value[i] : UNKNOWN;
  const classes = ['cell', 'result'];
  classes.push(value === FILLED ? 'is-filled' : value === EMPTY ? 'is-blank' : 'is-unknown');
  if (i % 5 === 0) classes.push('edge-left');
  if (gains.value.includes(i)) classes.push('is-new');
  return classes;
}

// ── Painting ───────────────────────────────────────────────────────────────
const paintValue = ref<Cell | null>(null);

function nextValue(current: Cell, button: number): Cell {
  if (button === 2) return current === EMPTY ? UNKNOWN : EMPTY;
  return current === UNKNOWN ? FILLED : current === FILLED ? EMPTY : UNKNOWN;
}

function startPaint(i: number, event: MouseEvent): void {
  event.preventDefault();
  const value = nextValue(cells.value[i], event.button);
  paintValue.value = value;
  applyCell(i, value);
}

function dragPaint(i: number): void {
  if (paintValue.value === null) return;
  applyCell(i, paintValue.value);
}

function endPaint(): void {
  paintValue.value = null;
}

function applyCell(i: number, value: Cell): void {
  if (cells.value[i] === value) return;
  const next = cells.value.slice();
  next[i] = value;
  cells.value = next;
}

function applyDeductions(): void {
  if (!solved.value) return;
  cells.value = solved.value.slice();
}

function clearLine(): void {
  cells.value = Array.from({ length: length.value }, () => UNKNOWN);
}
</script>

<template>
  <div class="line-wrap" @mouseup="endPaint" @mouseleave="endPaint">
    <div class="inputs">
      <div class="cfg-group">
        <label class="cfg-label">Clue</label>
        <input v-model="clueText" type="text" spellcheck="false" placeholder="3 2" />
      </div>
      <div class="cfg-group narrow">
        <label class="cfg-label">Length</label>
        <input v-model.number="length" type="number" min="1" max="60" />
      </div>
      <div class="cfg-group">
        <label class="cfg-label">
          State —
          <code>#</code>
          filled,
          <code>x</code>
          blank,
          <code>.</code>
          unknown
        </label>
        <input v-model="lineText" type="text" spellcheck="false" class="mono" />
      </div>
    </div>

    <div class="strip-block">
      <span class="strip-label">Your line</span>
      <div class="strip" @contextmenu.prevent>
        <div
          v-for="(_, i) in cells"
          :key="'in' + i"
          :class="cellClass(i)"
          @mousedown="startPaint(i, $event)"
          @mouseenter="dragPaint(i)"
        >
          <span v-if="cells[i] === EMPTY" class="x-mark">×</span>
        </div>
      </div>
    </div>

    <div class="verdict" :class="'v-' + verdict">
      <strong>{{ headline }}</strong>
      <span>{{ detail }}</span>
    </div>

    <div v-if="solved" class="strip-block">
      <span class="strip-label">After logic</span>
      <div class="strip">
        <div v-for="(_, i) in cells" :key="'out' + i" :class="resultClass(i)">
          <span v-if="solved[i] === EMPTY" class="x-mark">×</span>
        </div>
      </div>
    </div>

    <div class="button-row">
      <button class="run-btn" :disabled="!gains.length" @click="applyDeductions">
        Apply deductions
      </button>
      <button class="small-btn" @click="clearLine">Clear line</button>
    </div>

    <p class="legend">
      Left click cycles fill → blank → unknown. Right click marks blank. Drag to paint. Solving the
      whole grid at once is over on the
      <a href="/puzzle/nonogram/">nonogram solver</a>
      .
    </p>
  </div>
</template>

<style scoped>
.line-wrap {
  font-family: var(--vp-font-family-base, sans-serif);
  max-width: 100%;
  user-select: none;
}

.inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.cfg-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 220px;
}

.cfg-group.narrow {
  flex: 0 0 90px;
}

.cfg-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2, #666);
}

.cfg-label code {
  font-size: 11px;
}

input {
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  background: var(--vp-c-bg, #fff);
  color: var(--vp-c-text-1, #213547);
  font-size: 14px;
}

input.mono {
  font-family: var(--vp-font-family-mono, monospace);
  letter-spacing: 0.15em;
}

/* Cell strips */
.strip-block {
  margin-bottom: 1rem;
  overflow-x: auto;
}

.strip-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2, #666);
  margin-bottom: 4px;
}

.strip {
  display: flex;
  border: 1px solid var(--vp-c-divider, #d8d8d8);
  width: max-content;
}

.cell {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  text-align: center;
  cursor: pointer;
  background: var(--vp-c-bg, #fff);
  border-right: 1px solid var(--vp-c-divider, #d8d8d8);
}

.cell:last-child {
  border-right: none;
}

.cell.edge-left:not(:first-child) {
  border-left: 2px solid var(--vp-c-text-3, #999);
}

.cell.is-filled {
  background: var(--vp-c-text-1, #213547);
}

.cell.is-blank {
  color: var(--vp-c-text-3, #999);
}

.cell.result {
  cursor: default;
}

.cell.result.is-new {
  background: var(--vp-c-brand-soft, #dbe3f7);
  outline: 2px solid var(--vp-c-brand-1, #3451b2);
  outline-offset: -2px;
}

.cell.result.is-new.is-filled {
  background: var(--vp-c-brand-1, #3451b2);
}

.cell.result.is-new.is-blank {
  color: var(--vp-c-brand-1, #3451b2);
  font-weight: 700;
}

.x-mark {
  font-size: 16px;
  line-height: 28px;
}

/* Verdict */
.verdict {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 1rem;
  font-size: 13px;
  line-height: 1.5;
  background: var(--vp-c-bg-soft, #f6f6f7);
}

.verdict strong {
  font-size: 14px;
}

.verdict.v-work {
  background: var(--vp-c-brand-soft, #e8ecf8);
}

.verdict.v-broken {
  background: var(--vp-c-danger-soft, #fdd8d8);
}

.verdict.v-complete,
.verdict.v-determined {
  background: var(--vp-c-tip-soft, var(--vp-c-bg-soft, #e6f6ec));
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
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

.run-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.legend {
  font-size: 12px;
  line-height: 1.5;
  color: var(--vp-c-text-2, #666);
  margin: 0;
}
</style>
