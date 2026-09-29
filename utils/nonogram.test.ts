import { describe, it, expect } from 'vitest';
import {
  UNKNOWN,
  FILLED,
  EMPTY,
  type Cell,
  type Grid,
  cluesFromGrid,
  countLineArrangements,
  lineHints,
  makeGrid,
  parseClueLine,
  parseClues,
  propagate,
  solveLine,
  solvePuzzle,
  validateClues,
} from './nonogram';

// Compact line notation: '.' unknown, '#' filled, 'x' empty.
function line(s: string): Cell[] {
  return s.split('').map((ch) => (ch === '#' ? FILLED : ch === 'x' ? EMPTY : UNKNOWN));
}

function show(cells: Cell[] | null): string {
  if (!cells) return 'null';
  return cells.map((c) => (c === FILLED ? '#' : c === EMPTY ? 'x' : '.')).join('');
}

function gridOf(rows: string[]): Grid {
  return rows.map(line);
}

function showGrid(grid: Grid): string[] {
  return grid.map((row) => show(row));
}

describe('parseClueLine', () => {
  it('reads spaces, commas and mixed separators', () => {
    expect(parseClueLine('3 1 1')).toEqual([3, 1, 1]);
    expect(parseClueLine('3,1,1')).toEqual([3, 1, 1]);
    expect(parseClueLine(' 2 , 4 ')).toEqual([2, 4]);
  });

  it('treats blank and zero as an empty line', () => {
    expect(parseClueLine('')).toEqual([]);
    expect(parseClueLine('0')).toEqual([]);
  });

  it('pads missing lines out to the requested count', () => {
    expect(parseClues('3\n1 1', 4)).toEqual([[3], [1, 1], [], []]);
  });
});

describe('solveLine', () => {
  it('fills the overlap of a big run in an empty line', () => {
    expect(show(solveLine([4], line('.....')))).toBe('.###.');
  });

  it('solves a line that is exactly full', () => {
    expect(show(solveLine([2, 2], line('.....')))).toBe('##x##');
  });

  it('leaves an unconstrained line alone', () => {
    expect(show(solveLine([1], line('.....')))).toBe('.....');
  });

  it('blanks every cell for an empty clue', () => {
    expect(show(solveLine([], line('.....')))).toBe('xxxxx');
  });

  it('uses cells already known to be filled', () => {
    expect(show(solveLine([2], line('.#...')))).toBe('.#.xx');
  });

  it('uses cells already known to be blank', () => {
    expect(show(solveLine([3], line('.x....')))).toBe('xx.##.');
  });

  it('caps a completed run with blanks', () => {
    expect(show(solveLine([2], line('.##..')))).toBe('x##xx');
  });

  it('returns null when the clue cannot fit', () => {
    expect(solveLine([3], line('..'))).toBeNull();
    expect(solveLine([2], line('#x#'))).toBeNull();
    expect(solveLine([], line('.#.'))).toBeNull();
  });
});

describe('countLineArrangements', () => {
  it('counts the ways a run can slide along a line', () => {
    expect(countLineArrangements([2], line('....'))).toBe(3);
  });

  it('returns 1 for a line that is fully pinned down', () => {
    expect(countLineArrangements([2, 2], line('.....'))).toBe(1);
    expect(countLineArrangements([], line('.....'))).toBe(1);
  });

  it('returns 0 when the clue cannot fit', () => {
    expect(countLineArrangements([3], line('..'))).toBe(0);
    expect(countLineArrangements([2], line('#x#'))).toBe(0);
  });

  it('narrows as cells become known', () => {
    expect(countLineArrangements([1, 1], line('....'))).toBe(3);
    expect(countLineArrangements([1, 1], line('#...'))).toBe(2);
    expect(countLineArrangements([1, 1], line('#x#x'))).toBe(1);
  });
});

describe('propagate', () => {
  it('solves a puzzle that plain line logic can finish', () => {
    // A 5x5 plus sign.
    const rowClues = [[1], [1], [5], [1], [1]];
    const colClues = [[1], [1], [5], [1], [1]];
    const result = propagate(makeGrid(5, 5), rowClues, colClues);
    expect(result.status).toBe('solved');
    expect(showGrid(result.grid)).toEqual(['xx#xx', 'xx#xx', '#####', 'xx#xx', 'xx#xx']);
  });

  it('picks up where a half-finished grid left off', () => {
    const rowClues = [[1], [1], [5], [1], [1]];
    const colClues = [[1], [1], [5], [1], [1]];
    const start = gridOf(['..#..', '.....', '#####', '.....', '.....']);
    const result = propagate(start, rowClues, colClues);
    expect(result.status).toBe('solved');
    expect(result.gains).toBeGreaterThan(0);
  });

  it('reports a contradiction', () => {
    const result = propagate(gridOf(['##.']), [[1]], [[1], [0], [0]]);
    expect(result.status).toBe('contradiction');
  });

  it('stops at partial when logic runs out', () => {
    // The classic ambiguous 2x2 checkerboard: two valid solutions.
    const result = propagate(makeGrid(2, 2), [[1], [1]], [[1], [1]]);
    expect(result.status).toBe('partial');
    expect(showGrid(result.grid)).toEqual(['..', '..']);
  });
});

describe('solvePuzzle', () => {
  it('guesses past the point where line logic stalls', () => {
    const result = solvePuzzle(makeGrid(2, 2), [[1], [1]], [[1], [1]]);
    expect(result.status).toBe('solved');
    expect(showGrid(result.grid).join('')).toMatch(/^(#xx#|x##x)$/);
  });

  it('round-trips a random-ish grid through its own clues', () => {
    const target = gridOf(['#x#x#', '##xx#', 'x###x', '#xx##', '##x#x']);
    const { rowClues, colClues } = cluesFromGrid(target);
    const result = solvePuzzle(makeGrid(5, 5), rowClues, colClues);
    expect(result.status).toBe('solved');
    expect(cluesFromGrid(result.grid)).toEqual({ rowClues, colClues });
  });

  it('reports a contradiction for impossible clues', () => {
    expect(solvePuzzle(makeGrid(2, 2), [[2], [2]], [[1], [1]]).status).toBe('contradiction');
  });
});

describe('lineHints', () => {
  it('ranks the most productive line first', () => {
    const rowClues = [[3], [1], [1]];
    const colClues = [[1, 1], [1], [1]];
    const hints = lineHints(makeGrid(3, 3), rowClues, colClues);
    expect(hints[0]).toMatchObject({ kind: 'row', index: 0, gains: 3 });
  });

  it('gives zero gains to lines that are already done', () => {
    const grid = gridOf(['###', 'xxx', 'xxx']);
    const hints = lineHints(grid, [[3], [], []], [[1], [1], [1]]);
    expect(hints.every((h) => h.gains === 0)).toBe(true);
    expect(hints.every((h) => h.unknowns === 0)).toBe(true);
  });

  it('flags a contradicting line with a null solution', () => {
    const grid = gridOf(['##.']);
    const hints = lineHints(grid, [[1]], [[1], [1], [1]]);
    expect(hints.find((h) => h.kind === 'row' && h.index === 0)?.solved).toBeNull();
  });

  it('covers every row and column exactly once', () => {
    const hints = lineHints(makeGrid(3, 4), [[1], [1], [1]], [[1], [1], [1], [0]]);
    expect(hints.filter((h) => h.kind === 'row')).toHaveLength(3);
    expect(hints.filter((h) => h.kind === 'col')).toHaveLength(4);
  });
});

describe('validateClues', () => {
  it('accepts consistent clues', () => {
    expect(validateClues([[1], [1]], [[2], []], 2, 2)).toEqual([]);
  });

  it('catches a clue too long for its line', () => {
    const problems = validateClues([[3]], [[1], [1], [1]], 1, 2);
    expect(problems.some((p) => p.kind === 'row' && p.index === 0)).toBe(true);
  });

  it('catches mismatched totals', () => {
    const problems = validateClues([[1]], [[1], [1]], 1, 2);
    expect(problems.some((p) => p.message.includes('total'))).toBe(true);
  });
});

describe('cluesFromGrid', () => {
  it('reads runs off a finished grid', () => {
    const { rowClues, colClues } = cluesFromGrid(gridOf(['#x#', '###', 'xx#']));
    expect(rowClues).toEqual([[1, 1], [3], [1]]);
    expect(colClues).toEqual([[2], [1], [3]]);
  });
});
