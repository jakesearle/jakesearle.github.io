// Nonogram (picross) solving helpers.
//
// A puzzle is a grid of cells that are FILLED, EMPTY (known blank) or UNKNOWN,
// plus a clue list per row and column. Everything here works on a partially
// solved grid, so the same code drives both "solve it for me" and "what should
// I look at next?".

export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;

export type Cell = typeof UNKNOWN | typeof FILLED | typeof EMPTY;
export type Grid = Cell[][];
export type Clues = number[][];

export type LineKind = 'row' | 'col';

export interface LineHint {
  kind: LineKind;
  index: number;
  /** How many UNKNOWN cells this line alone can pin down right now. */
  gains: number;
  /** UNKNOWN cells left in the line, before solving. */
  unknowns: number;
  /** The line as it would look after solving it, or null if it contradicts. */
  solved: Cell[] | null;
}

/**
 * Parses one line of clue text ("3 1 1", "3,1,1", "0" or blank) into numbers.
 * An empty line means a line with no filled cells.
 */
export function parseClueLine(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Parses a block of clue text, one line per row/column. */
export function parseClues(text: string, count: number): Clues {
  const lines = text.replace(/\r/g, '').split('\n');
  const clues: Clues = [];
  for (let i = 0; i < count; i++) {
    clues.push(parseClueLine(lines[i] ?? ''));
  }
  return clues;
}

export function formatClueLine(clue: number[]): string {
  return clue.length === 0 ? '0' : clue.join(' ');
}

/** The shortest line these clues can possibly fit in. */
export function clueSpan(clue: number[]): number {
  if (clue.length === 0) return 0;
  return clue.reduce((a, b) => a + b, 0) + clue.length - 1;
}

export function makeGrid(rows: number, cols: number, fill: Cell = UNKNOWN): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function getLine(grid: Grid, kind: LineKind, index: number): Cell[] {
  if (kind === 'row') return grid[index].slice();
  return grid.map((row) => row[index]);
}

export function setLine(grid: Grid, kind: LineKind, index: number, line: Cell[]): void {
  if (kind === 'row') {
    grid[index] = line.slice();
    return;
  }
  for (let r = 0; r < grid.length; r++) {
    grid[r][index] = line[r];
  }
}

/**
 * Solves a single line as far as logic allows: any cell that is the same in
 * every arrangement consistent with the current line becomes known.
 * Returns null when no arrangement fits (the line contradicts its clues).
 */
export function solveLine(clue: number[], line: Cell[]): Cell[] | null {
  const n = line.length;
  const k = clue.length;

  // possible[pos][clueIdx]: can clues clueIdx.. be placed in cells pos..n-1?
  const memo: (boolean | undefined)[][] = Array.from({ length: n + 2 }, () =>
    Array.from({ length: k + 1 }, () => undefined)
  );

  const fits = (pos: number, len: number): boolean => {
    if (pos + len > n) return false;
    for (let i = pos; i < pos + len; i++) {
      if (line[i] === EMPTY) return false;
    }
    // The run must be followed by a gap (or the end of the line).
    if (pos + len < n && line[pos + len] === FILLED) return false;
    return true;
  };

  const possible = (pos: number, clueIdx: number): boolean => {
    if (pos >= n) {
      return clueIdx === k;
    }
    const cached = memo[pos][clueIdx];
    if (cached !== undefined) return cached;
    let result = false;
    // Leave this cell blank.
    if (line[pos] !== FILLED && possible(pos + 1, clueIdx)) {
      result = true;
    }
    // Start the next run here.
    if (!result && clueIdx < k && fits(pos, clue[clueIdx])) {
      result = possible(pos + clue[clueIdx] + 1, clueIdx + 1);
    }
    memo[pos][clueIdx] = result;
    return result;
  };

  if (!possible(0, 0)) return null;

  const canFill = new Array<boolean>(n).fill(false);
  const canBlank = new Array<boolean>(n).fill(false);
  const seen = new Set<number>();

  // Walk only the states that lead to a valid arrangement, marking which
  // values each cell takes along the way.
  const mark = (pos: number, clueIdx: number): void => {
    if (pos >= n) return;
    const key = pos * (k + 1) + clueIdx;
    if (seen.has(key)) return;
    seen.add(key);

    if (line[pos] !== FILLED && possible(pos + 1, clueIdx)) {
      canBlank[pos] = true;
      mark(pos + 1, clueIdx);
    }
    if (clueIdx < k) {
      const len = clue[clueIdx];
      if (fits(pos, len) && possible(pos + len + 1, clueIdx + 1)) {
        for (let i = pos; i < pos + len; i++) canFill[i] = true;
        if (pos + len < n) canBlank[pos + len] = true;
        mark(pos + len + 1, clueIdx + 1);
      }
    }
  };
  mark(0, 0);

  const out: Cell[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (canFill[i] && !canBlank[i]) out[i] = FILLED;
    else if (canBlank[i] && !canFill[i]) out[i] = EMPTY;
    else out[i] = UNKNOWN;
  }
  return out;
}

/**
 * How many ways the clue can still be arranged in this line. 0 means the line
 * contradicts its clue; 1 means the line is fully determined even if some
 * cells are not marked yet.
 */
export function countLineArrangements(clue: number[], line: Cell[]): number {
  const n = line.length;
  const k = clue.length;
  const memo: (number | undefined)[][] = Array.from({ length: n + 2 }, () =>
    Array.from({ length: k + 1 }, () => undefined)
  );

  const fits = (pos: number, len: number): boolean => {
    if (pos + len > n) return false;
    for (let i = pos; i < pos + len; i++) {
      if (line[i] === EMPTY) return false;
    }
    if (pos + len < n && line[pos + len] === FILLED) return false;
    return true;
  };

  const count = (pos: number, clueIdx: number): number => {
    if (pos >= n) return clueIdx === k ? 1 : 0;
    const cached = memo[pos][clueIdx];
    if (cached !== undefined) return cached;
    let total = 0;
    if (line[pos] !== FILLED) total += count(pos + 1, clueIdx);
    if (clueIdx < k && fits(pos, clue[clueIdx])) {
      total += count(pos + clue[clueIdx] + 1, clueIdx + 1);
    }
    memo[pos][clueIdx] = total;
    return total;
  };

  return count(0, 0);
}

export interface SolveResult {
  grid: Grid;
  /** 'solved' = no unknowns left, 'partial' = logic ran out, 'contradiction' = unsolvable. */
  status: 'solved' | 'partial' | 'contradiction';
  /** Cells newly determined by this call. */
  gains: number;
  /** How many line passes ran. */
  passes: number;
}

/**
 * Repeatedly solves every row and column until nothing new comes out. This is
 * plain line logic — no guessing — which is how a person solves a nonogram.
 */
export function propagate(grid: Grid, rowClues: Clues, colClues: Clues): SolveResult {
  const work = cloneGrid(grid);
  const rows = work.length;
  const cols = rows === 0 ? 0 : work[0].length;
  let gains = 0;
  let passes = 0;

  for (;;) {
    let changed = false;
    passes++;
    for (let kindIdx = 0; kindIdx < 2; kindIdx++) {
      const kind: LineKind = kindIdx === 0 ? 'row' : 'col';
      const clues = kind === 'row' ? rowClues : colClues;
      const count = kind === 'row' ? rows : cols;
      for (let i = 0; i < count; i++) {
        const line = getLine(work, kind, i);
        const solved = solveLine(clues[i] ?? [], line);
        if (solved === null) {
          return { grid: work, status: 'contradiction', gains, passes };
        }
        for (let j = 0; j < line.length; j++) {
          if (line[j] === UNKNOWN && solved[j] !== UNKNOWN) {
            gains++;
            changed = true;
          }
        }
        setLine(work, kind, i, solved);
      }
    }
    if (!changed) break;
  }

  const solved = work.every((row) => row.every((c) => c !== UNKNOWN));
  return { grid: work, status: solved ? 'solved' : 'partial', gains, passes };
}

/**
 * Full solve: line logic first, then guessing with backtracking on the most
 * constrained cell for puzzles that line logic alone cannot finish.
 */
export function solvePuzzle(grid: Grid, rowClues: Clues, colClues: Clues): SolveResult {
  let totalGains = 0;
  let totalPasses = 0;

  const search = (current: Grid): Grid | null => {
    const result = propagate(current, rowClues, colClues);
    totalGains += result.gains;
    totalPasses += result.passes;
    if (result.status === 'contradiction') return null;
    if (result.status === 'solved') return result.grid;

    let target: [number, number] | null = null;
    outer: for (let r = 0; r < result.grid.length; r++) {
      for (let c = 0; c < result.grid[r].length; c++) {
        if (result.grid[r][c] === UNKNOWN) {
          target = [r, c];
          break outer;
        }
      }
    }
    if (!target) return result.grid;

    for (const guess of [FILLED, EMPTY] as Cell[]) {
      const next = cloneGrid(result.grid);
      next[target[0]][target[1]] = guess;
      const found = search(next);
      if (found) return found;
    }
    return null;
  };

  const solved = search(cloneGrid(grid));
  if (!solved) {
    return { grid: cloneGrid(grid), status: 'contradiction', gains: 0, passes: totalPasses };
  }
  return { grid: solved, status: 'solved', gains: totalGains, passes: totalPasses };
}

/**
 * Ranks every row and column by how many cells it can pin down right now,
 * best first. This is the "what should I look at next?" list.
 */
export function lineHints(grid: Grid, rowClues: Clues, colClues: Clues): LineHint[] {
  const rows = grid.length;
  const cols = rows === 0 ? 0 : grid[0].length;
  const hints: LineHint[] = [];

  for (const kind of ['row', 'col'] as LineKind[]) {
    const clues = kind === 'row' ? rowClues : colClues;
    const count = kind === 'row' ? rows : cols;
    for (let i = 0; i < count; i++) {
      const line = getLine(grid, kind, i);
      const solved = solveLine(clues[i] ?? [], line);
      const unknowns = line.filter((c) => c === UNKNOWN).length;
      let gains = 0;
      if (solved) {
        for (let j = 0; j < line.length; j++) {
          if (line[j] === UNKNOWN && solved[j] !== UNKNOWN) gains++;
        }
      }
      hints.push({ kind, index: i, gains, unknowns, solved });
    }
  }

  // Most productive first; break ties toward lines that are nearly finished.
  hints.sort((a, b) => b.gains - a.gains || a.unknowns - b.unknowns);
  return hints;
}

export interface ClueProblem {
  kind: LineKind;
  index: number;
  message: string;
}

/** Sanity checks on the clues themselves, before any solving. */
export function validateClues(
  rowClues: Clues,
  colClues: Clues,
  rows: number,
  cols: number
): ClueProblem[] {
  const problems: ClueProblem[] = [];
  for (let i = 0; i < rows; i++) {
    const span = clueSpan(rowClues[i] ?? []);
    if (span > cols) {
      problems.push({
        kind: 'row',
        index: i,
        message: `needs ${span} cells but the row is ${cols} wide`,
      });
    }
  }
  for (let i = 0; i < cols; i++) {
    const span = clueSpan(colClues[i] ?? []);
    if (span > rows) {
      problems.push({
        kind: 'col',
        index: i,
        message: `needs ${span} cells but the column is ${rows} tall`,
      });
    }
  }
  const rowTotal = rowClues.slice(0, rows).reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);
  const colTotal = colClues.slice(0, cols).reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0);
  if (rowTotal !== colTotal) {
    problems.push({
      kind: 'row',
      index: -1,
      message: `row clues total ${rowTotal} filled cells but column clues total ${colTotal}`,
    });
  }
  return problems;
}

/** Derives the clues a finished grid would have. Handy for building puzzles. */
export function cluesFromGrid(grid: Grid): { rowClues: Clues; colClues: Clues } {
  const runs = (line: Cell[]): number[] => {
    const out: number[] = [];
    let run = 0;
    for (const cell of line) {
      if (cell === FILLED) run++;
      else if (run > 0) {
        out.push(run);
        run = 0;
      }
    }
    if (run > 0) out.push(run);
    return out;
  };
  const rows = grid.length;
  const cols = rows === 0 ? 0 : grid[0].length;
  return {
    rowClues: grid.map((row) => runs(row)),
    colClues: Array.from({ length: cols }, (_, c) => runs(grid.map((row) => row[c]))),
  };
}
