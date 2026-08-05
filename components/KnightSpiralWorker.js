/**
 * KnightSpiralWorker.js
 * Runs the Red/Black Knights spiral simulation (OEIS A392177) off the main thread.
 *
 * Piece types:
 *   Each piece is defined by its attack pattern. Two kinds are supported:
 *     - leaper:  fixed set of [dx, dy] offsets (knight, king/wazir/ferz variants)
 *     - slider:  array of ray directions [dx, dy], extended until out of spiral bounds
 *                (rook, bishop, queen)
 *
 * Army config (received via postMessage 'start'):
 *   armies: [
 *     { name: 'Black', color: '#1a1a1a' },
 *     { name: 'Red',   color: '#c0392b' },
 *     ...
 *   ]
 *   piece: {
 *     type: 'leaper' | 'slider',
 *     moves: [[dx,dy], ...]   // offsets for leaper; ray directions for slider
 *   }
 *   totalCells: number   // how many spiral cells to generate & simulate
 *
 * Messages sent back to main thread:
 *   { type: 'progress', placed, totalCells }   -- periodic updates while running
 *   { type: 'done', cellState, spiralX, spiralY, totalCells, armies }
 *     cellState: Uint8Array, 0=empty, 1=army[0], 2=army[1], ...
 *     spiralX / spiralY: Int32Array of spiral coordinates
 */

// ---------------------------------------------------------------------------
// Spiral coordinate generation
// Counterclockwise square spiral starting at (0,0), cell 0 at center.
// Direction sequence: up → left → down → right (matching A274641 / A308884).
// ---------------------------------------------------------------------------
function buildSpiral(total) {
  const sx = new Int32Array(total);
  const sy = new Int32Array(total);
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < total; i++) {
    sx[i] = x;
    sy[i] = y;
    // Turn condition for a square spiral
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const t = dx; dx = -dy; dy = t;
    }
    x += dx;
    y += dy;
  }
  return { sx, sy };
}

// ---------------------------------------------------------------------------
// Build a lookup: (x, y) → cell index.  Key = y * PRIME + x using a Map.
// We use BigInt-free encoding: pack into a single number with an offset so
// coords stay positive.  Max coord for N=1_000_000 is ~500, so offset 1024 is safe.
// ---------------------------------------------------------------------------
function buildCoordMap(sx, sy, total) {
  const OFFSET = 4096; // safe for spirals up to ~16M cells
  const map = new Map();
  for (let i = 0; i < total; i++) {
    map.set((sy[i] + OFFSET) * 65536 + (sx[i] + OFFSET), i);
  }
  return { map, OFFSET };
}

// ---------------------------------------------------------------------------
// Compute all cells attacked by a piece placed at spiral index `idx`.
// Returns an array of attacked cell indices (within the spiral).
// ---------------------------------------------------------------------------
function computeAttacks(idx, sx, sy, coordMap, OFFSET, piece) {
  const kx = sx[idx], ky = sy[idx];
  const attacked = [];

  if (piece.type === 'leaper') {
    for (const [ddx, ddy] of piece.moves) {
      const key = (ky + ddy + OFFSET) * 65536 + (kx + ddx + OFFSET);
      const target = coordMap.get(key);
      if (target !== undefined) attacked.push(target);
    }
  } else if (piece.type === 'slider') {
    for (const [ddx, ddy] of piece.moves) {
      let nx = kx + ddx, ny = ky + ddy;
      while (true) {
        const key = (ny + OFFSET) * 65536 + (nx + OFFSET);
        const target = coordMap.get(key);
        if (target === undefined) break;
        attacked.push(target);
        nx += ddx;
        ny += ddy;
      }
    }
  }
  return attacked;
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------
function simulate(config) {
  const { armies, piece, totalCells } = config;
  const numArmies = armies.length;

  const { sx, sy } = buildSpiral(totalCells);
  const { map: coordMap, OFFSET } = buildCoordMap(sx, sy, totalCells);

  // cellState[i]: 0=empty, 1=army0, 2=army1, ...
  const cellState = new Uint8Array(totalCells);

  // attacked[a][i]: true if cell i is attacked by army a
  // Using Uint8Array as a bitset (1 bit per cell, stored as bytes for simplicity)
  const attacked = Array.from({ length: numArmies }, () => new Uint8Array(totalCells));

  // Each army maintains a "search cursor" — the smallest index we haven't
  // successfully placed at yet.  Since we always pick the smallest valid cell,
  // we never need to look before the cursor.
  const cursors = new Int32Array(numArmies);

  let turn = 0;       // which army's turn it is
  let placed = 0;     // total knights placed so far
  let stalled = 0;    // armies that can't place (should never happen in practice)

  const PROGRESS_INTERVAL = Math.max(1000, Math.floor(totalCells / 100));
  let nextProgress = PROGRESS_INTERVAL;

  while (placed < totalCells) {
    const a = turn % numArmies;

    // Find the smallest unoccupied cell not attacked by any OTHER army.
    // We combine all other-army attack masks with OR on the fly.
    let found = -1;
    for (let i = cursors[a]; i < totalCells; i++) {
      if (cellState[i] !== 0) continue;  // occupied

      // Check attacks from all other armies
      let blocked = false;
      for (let b = 0; b < numArmies; b++) {
        if (b !== a && attacked[b][i]) { blocked = true; break; }
      }
      if (!blocked) { found = i; cursors[a] = i + 1; break; }
    }

    if (found === -1) {
      // This army is stuck — skip it (shouldn't happen in a well-formed puzzle)
      stalled++;
      if (stalled >= numArmies) break; // all armies stuck, terminate
      turn++;
      continue;
    }
    stalled = 0;

    // Place the knight
    cellState[found] = a + 1; // 1-indexed
    placed++;

    // Mark cells attacked by this new knight for army `a`
    const attacks = computeAttacks(found, sx, sy, coordMap, OFFSET, piece);
    for (const t of attacks) {
      attacked[a][t] = 1;
    }

    turn++;

    // Progress update
    if (placed >= nextProgress) {
      self.postMessage({ type: 'progress', placed, totalCells });
      nextProgress += PROGRESS_INTERVAL;
    }
  }

  // Transfer large buffers to avoid copying
  self.postMessage(
    {
      type: 'done',
      cellState,
      spiralX: sx,
      spiralY: sy,
      totalCells,
      armies,
      piece,
    },
    [cellState.buffer, sx.buffer, sy.buffer]
  );
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.onmessage = (e) => {
  if (e.data.type === 'start') {
    simulate(e.data.config);
  }
};