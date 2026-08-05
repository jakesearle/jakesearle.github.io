<template>
  <div class="spiral-wrap">

    <!-- ── Config panel ─────────────────────────────────────── -->
    <details class="config-panel" :open="!hasResult">
      <summary>Configuration</summary>

      <div class="config-grid">

        <!-- Piece type -->
        <div class="cfg-group">
          <label class="cfg-label">Piece type</label>
          <select v-model="cfg.pieceKey">
            <option v-for="(p, k) in PIECE_DEFS" :key="k" :value="k">{{ p.label }}</option>
          </select>
        </div>

        <!-- Grid size -->
        <div class="cfg-group">
          <label class="cfg-label">Grid size (N × N)</label>
          <div class="row-inline">
            <input type="number" v-model.number="cfg.gridSize" min="10" max="2000" step="10" />
            <span class="hint">{{ fmtNum(cfg.gridSize * cfg.gridSize) }} cells</span>
          </div>
        </div>

        <!-- Armies -->
        <div class="cfg-group full-width">
          <label class="cfg-label">Armies</label>
          <div class="army-list">
            <div class="army-row" v-for="(a, i) in cfg.armies" :key="i">
              <input type="text" v-model="a.name" class="army-name" placeholder="Name" />
              <input type="color" v-model="a.color" class="army-color" :title="a.name + ' color'" />
              <button class="icon-btn" @click="removeArmy(i)" :disabled="cfg.armies.length <= 2"
                title="Remove army">×</button>
            </div>
          </div>
          <button class="small-btn" @click="addArmy">+ Add army</button>
        </div>

      </div><!-- /config-grid -->

      <button class="run-btn" @click="startSimulation" :disabled="running">
        {{ running ? 'Running…' : hasResult ? 'Re-run' : 'Run simulation' }}
      </button>
    </details>

    <!-- ── Progress ─────────────────────────────────────────── -->
    <div v-if="running" class="progress-bar-wrap">
      <div class="progress-bar" :style="{ width: progressPct + '%' }"></div>
      <span class="progress-label">{{ progressPct }}% — {{ fmtNum(progress.placed) }} / {{ fmtNum(cfg.totalCells) }}
        cells placed</span>
    </div>

    <!-- ── View controls (shown once result is ready) ────────── -->
    <template v-if="hasResult">
      <div class="view-controls">

        <div class="ctrl-row">
          <!-- Army filter -->
          <div class="ctrl-group">
            <span class="ctrl-label">Show</span>
            <button v-for="opt in viewOptions" :key="opt.value"
              :class="['filter-btn', { active: viewMode === opt.value }]"
              @click="viewMode = opt.value; scheduleRender()">{{ opt.label }}</button>
          </div>

          <!-- Cell size -->
          <div class="ctrl-group">
            <label class="ctrl-label">Cell px</label>
            <input type="range" v-model.number="cellPx" min="1" max="8" step="1" @input="scheduleRender()" />
            <span class="ctrl-val">{{ cellPx }}px</span>
          </div>

          <!-- Download -->
          <button class="small-btn" @click="downloadCanvas">⬇ Save PNG</button>
        </div>

        <!-- Stats -->
        <div class="stat-row">
          <div class="stat-card">
            <div class="stat-label">Total cells</div>
            <div class="stat-val">{{ fmtNum(result.totalCells) }}</div>
          </div>
          <div class="stat-card" v-for="(a, i) in result.armies" :key="i">
            <div class="stat-label" :style="{ color: a.color }">{{ a.name }}</div>
            <div class="stat-val" :style="{ color: a.color }">{{ fmtNum(armyCounts[i] ?? 0) }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Empty</div>
            <div class="stat-val">{{ fmtNum(emptyCells) }}</div>
          </div>
        </div>

      </div><!-- /view-controls -->

      <!-- ── Canvas ─────────────────────────────────────────── -->
      <div class="canvas-outer" ref="canvasOuter">
        <canvas ref="canvas" class="spiral-canvas" @mousemove="onMouseMove" @mouseleave="hoverInfo = null" />
      </div>
      <div class="hover-info" v-if="hoverInfo">
        Cell {{ hoverInfo.idx }} &nbsp;|&nbsp; ({{ hoverInfo.x }}, {{ hoverInfo.y }}) &nbsp;|&nbsp; {{ hoverInfo.label
        }}
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

// ---------------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------------
const KNIGHT_MOVES = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
]
const ROOK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_RAYS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const QUEEN_RAYS = [...ROOK_RAYS, ...BISHOP_RAYS]
const KING_MOVES = [...ROOK_RAYS, ...BISHOP_RAYS]
const WAZIR_MOVES = ROOK_RAYS   // orthogonal 1-step
const FERZ_MOVES = BISHOP_RAYS // diagonal 1-step
const CAMEL_MOVES = [
  [3, 1], [3, -1], [-3, 1], [-3, -1],
  [1, 3], [1, -3], [-1, 3], [-1, -3],
]

const PIECE_DEFS = {
  knight: { label: 'Knight', type: 'leaper', moves: KNIGHT_MOVES },
  rook: { label: 'Rook', type: 'slider', moves: ROOK_RAYS },
  bishop: { label: 'Bishop', type: 'slider', moves: BISHOP_RAYS },
  queen: { label: 'Queen', type: 'slider', moves: QUEEN_RAYS },
  king: { label: 'King', type: 'leaper', moves: KING_MOVES },
  wazir: { label: 'Wazir', type: 'leaper', moves: WAZIR_MOVES },
  ferz: { label: 'Ferz', type: 'leaper', moves: FERZ_MOVES },
  camel: { label: 'Camel', type: 'leaper', moves: CAMEL_MOVES },
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------
const DEFAULT_ARMIES = [
  { name: 'Red', color: '#c0392b' },
  { name: 'Blue', color: '#1a6fba' },
]

const cfg = ref({
  pieceKey: 'knight',
  gridSize: 100,
  armies: DEFAULT_ARMIES.map(a => ({ ...a })),
})

const running = ref(false)
const hasResult = ref(false)
const progress = ref({ placed: 0 })
const result = ref(null)   // { cellState, spiralX, spiralY, totalCells, armies }
const viewMode = ref('all')  // 'all' | 'army:0' | 'army:1' | ... | 'empty'
const cellPx = ref(1)
const hoverInfo = ref(null)

const canvas = ref(null)
const canvasOuter = ref(null)

let worker = null
let renderScheduled = false

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------
const progressPct = computed(() =>
  result.value
    ? 100
    : Math.round((progress.value.placed / cfg.value.gridSize ** 2) * 100)
)

const armyCounts = computed(() => {
  if (!result.value) return []
  const counts = new Array(result.value.armies.length).fill(0)
  const cs = result.value.cellState
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] > 0) counts[cs[i] - 1]++
  }
  return counts
})

const emptyCells = computed(() => {
  if (!result.value) return 0
  let e = 0
  const cs = result.value.cellState
  for (let i = 0; i < cs.length; i++) if (cs[i] === 0) e++
  return e
})

const viewOptions = computed(() => {
  if (!result.value) return []
  const opts = [{ value: 'all', label: 'All' }]
  result.value.armies.forEach((a, i) => opts.push({ value: `army:${i}`, label: a.name }))
  opts.push({ value: 'empty', label: 'Empty' })
  return opts
})

// ---------------------------------------------------------------------------
// Army management
// ---------------------------------------------------------------------------
const ARMY_COLORS = ['#c0392b', '#1a6fba', '#27ae60', '#8e44ad', '#e67e22']
function addArmy() {
  const idx = cfg.value.armies.length
  cfg.value.armies.push({
    name: `Army ${idx + 1}`,
    color: ARMY_COLORS[idx % ARMY_COLORS.length],
  })
}
function removeArmy(i) {
  if (cfg.value.armies.length > 2) cfg.value.armies.splice(i, 1)
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function startSimulation() {
  if (worker) { worker.terminate(); worker = null }
  hasResult.value = false
  result.value = null
  running.value = true
  progress.value = { placed: 0 }
  hoverInfo.value = null

  const piece = { ...PIECE_DEFS[cfg.value.pieceKey] }

  worker = new Worker(new URL('./KnightSpiralWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    if (e.data.type === 'progress') {
      progress.value = { placed: e.data.placed }
    } else if (e.data.type === 'done') {
      running.value = false
      hasResult.value = true
      result.value = e.data
      viewMode.value = 'all'
      // Auto-size cell pixels based on spiral dimensions
      nextTick(() => autoSizeCells())
    }
  }
  worker.onerror = (err) => {
    console.error('Worker error:', err)
    running.value = false
  }

  worker.postMessage({
    type: 'start',
    config: {
      armies: cfg.value.armies.map(a => ({ ...a })),
      piece,
      totalCells: cfg.value.gridSize ** 2,
    },
  })
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function scheduleRender() {
  if (renderScheduled) return
  renderScheduled = true
  requestAnimationFrame(() => {
    renderScheduled = false
    renderCanvas()
  })
}

function autoSizeCells() {
  if (!result.value || !canvasOuter.value) return
  const { spiralX, spiralY, totalCells } = result.value
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < totalCells; i++) {
    if (spiralX[i] < minX) minX = spiralX[i]
    if (spiralX[i] > maxX) maxX = spiralX[i]
    if (spiralY[i] < minY) minY = spiralY[i]
    if (spiralY[i] > maxY) maxY = spiralY[i]
  }
  const gw = maxX - minX + 1
  const containerW = canvasOuter.value.clientWidth || 800
  // Pick largest cellPx where the canvas still fits in the container
  let px = 1
  for (let p = 8; p >= 1; p--) {
    if (gw * p <= containerW * 1.5) { px = p; break }
  }
  cellPx.value = px
  scheduleRender()
}

function renderCanvas() {
  if (!result.value || !canvas.value) return
  const { cellState, spiralX, spiralY, totalCells, armies } = result.value
  const cs = cellPx.value

  // Bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < totalCells; i++) {
    if (spiralX[i] < minX) minX = spiralX[i]
    if (spiralX[i] > maxX) maxX = spiralX[i]
    if (spiralY[i] < minY) minY = spiralY[i]
    if (spiralY[i] > maxY) maxY = spiralY[i]
  }
  const gw = maxX - minX + 1
  const gh = maxY - minY + 1
  const cw = gw * cs
  const ch = gh * cs

  const el = canvas.value
  el.width = cw
  el.height = ch

  const ctx = el.getContext('2d')

  // Background (empty cell color)
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const emptyColor = isDark ? '#2a2a28' : '#deded6'
  ctx.fillStyle = emptyColor
  ctx.fillRect(0, 0, cw, ch)

  // Precompute army colors as hex for fast assignment
  const armyColors = armies.map(a => a.color)

  // Figure out which filter is active
  let filterArmy = -1   // -1 = show all
  let showEmpty = true
  if (viewMode.value.startsWith('army:')) {
    filterArmy = parseInt(viewMode.value.split(':')[1])
    showEmpty = false
  } else if (viewMode.value === 'empty') {
    filterArmy = -2   // show ONLY empty
    showEmpty = true
  }

  const offColor = isDark ? '#1a1a18' : '#efefeb'

  // Build an ImageData for speed at small cell sizes (1-2px)
  if (cs <= 2) {
    const imgData = ctx.createImageData(cw, ch)
    const buf = imgData.data

    // Parse colors to [r,g,b]
    function hexToRgb(hex) {
      const n = parseInt(hex.replace('#', ''), 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    const rgbArmy = armyColors.map(hexToRgb)
    const rgbEmpty = hexToRgb(emptyColor)
    const rgbOff = hexToRgb(offColor)

    const ox = -minX
    const oy = -minY

    for (let i = 0; i < totalCells; i++) {
      const state = cellState[i]
      let rgb
      if (state === 0) {
        // empty
        if (filterArmy === -2) rgb = rgbEmpty
        else if (filterArmy === -1) rgb = rgbEmpty
        else rgb = rgbOff
      } else {
        const a = state - 1
        if (filterArmy === -2) rgb = rgbOff
        else if (filterArmy === -1 || filterArmy === a) rgb = rgbArmy[a]
        else rgb = rgbOff
      }

      const px = (spiralX[i] + ox) * cs
      const py = (spiralY[i] + oy) * cs
      // Fill cs×cs block
      for (let dy = 0; dy < cs; dy++) {
        for (let dx = 0; dx < cs; dx++) {
          const off = ((py + dy) * cw + (px + dx)) * 4
          buf[off] = rgb[0]
          buf[off + 1] = rgb[1]
          buf[off + 2] = rgb[2]
          buf[off + 3] = 255
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)

  } else {
    // Larger cells — use fillRect (supports gap between cells)
    const gap = cs >= 4 ? 1 : 0
    const size = cs - gap * 2
    const ox = -minX * cs
    const oy = -minY * cs

    for (let i = 0; i < totalCells; i++) {
      const state = cellState[i]
      let color
      if (state === 0) {
        if (filterArmy === -2) color = emptyColor
        else if (filterArmy === -1) color = emptyColor
        else color = offColor
      } else {
        const a = state - 1
        if (filterArmy === -2) color = offColor
        else if (filterArmy === -1 || filterArmy === a) color = armyColors[a]
        else color = offColor
      }
      ctx.fillStyle = color
      ctx.fillRect(spiralX[i] * cs + ox + gap, spiralY[i] * cs + oy + gap, size, size)

      // Cell index label when zoomed in enough
      if (cs >= 20) {
        ctx.fillStyle = state === 0
          ? (isDark ? '#888' : '#888')
          : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)')
        ctx.font = `${Math.max(7, cs / 4)}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(i, spiralX[i] * cs + ox + cs / 2, spiralY[i] * cs + oy + cs / 2)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mouse hover inspection
// ---------------------------------------------------------------------------
function onMouseMove(e) {
  if (!result.value || !canvas.value) return
  const { cellState, spiralX, spiralY, totalCells, armies } = result.value
  const cs = cellPx.value

  const rect = canvas.value.getBoundingClientRect()
  const scaleX = canvas.value.width / rect.width
  const scaleY = canvas.value.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY

  let minX = Infinity, minY = Infinity
  for (let i = 0; i < totalCells; i++) {
    if (spiralX[i] < minX) minX = spiralX[i]
    if (spiralY[i] < minY) minY = spiralY[i]
  }

  // Convert pixel → grid coord
  const gx = Math.floor(mx / cs) + minX
  const gy = Math.floor(my / cs) + minY

  // Find which cell index lives at (gx, gy)
  // Build a quick reverse map lazily (cached on result)
  if (!result.value._reverseMap) {
    const m = new Map()
    for (let i = 0; i < totalCells; i++) {
      m.set(spiralY[i] * 65536 + spiralX[i], i)
    }
    result.value._reverseMap = m
  }
  const idx = result.value._reverseMap.get(gy * 65536 + gx)
  if (idx === undefined) { hoverInfo.value = null; return }

  const state = cellState[idx]
  const label = state === 0 ? 'Empty' : armies[state - 1].name
  hoverInfo.value = { idx, x: spiralX[idx], y: spiralY[idx], label }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------
function downloadCanvas() {
  if (!canvas.value) return
  const link = document.createElement('a')
  link.download = `knight-spiral-${cfg.value.gridSize}x${cfg.value.gridSize}.png`
  link.href = canvas.value.toDataURL('image/png')
  link.click()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtNum(n) {
  return (n ?? 0).toLocaleString()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onUnmounted(() => { if (worker) worker.terminate() })
</script>

<style scoped>
.spiral-wrap {
  font-family: var(--vp-font-family-base, sans-serif);
  max-width: 100%;
}

/* Config panel */
.config-panel {
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 8px;
  padding: 0;
  margin-bottom: 1.25rem;
}

.config-panel summary {
  padding: .6rem 1rem;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  color: var(--vp-c-text-1, #213547);
  list-style: none;
  user-select: none;
}

.config-panel summary::before {
  content: '▶ ';
  font-size: 10px;
  opacity: .6;
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

.cfg-group.full-width {
  grid-column: 1 / -1;
}

.cfg-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2, #666);
}

select,
input[type="number"],
input[type="text"] {
  border: 1px solid var(--vp-c-divider, #ddd);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  background: var(--vp-c-bg, #fff);
  color: var(--vp-c-text-1, #213547);
  width: 100%;
}

.row-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-inline input {
  flex: 1;
}

.hint {
  font-size: 11px;
  color: var(--vp-c-text-3, #aaa);
  white-space: nowrap;
}

/* Army rows */
.army-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.army-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.army-name {
  flex: 1;
}

.army-color {
  width: 36px;
  height: 30px;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider, #ddd);
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  color: var(--vp-c-text-2, #666);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:disabled {
  opacity: .3;
  cursor: default;
}

.small-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider, #ddd);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--vp-c-text-1, #213547);
}

.small-btn:hover {
  background: var(--vp-c-bg-soft, #f6f6f6);
}

.run-btn {
  margin: 0 1rem 1rem;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  background: var(--vp-c-indigo-3, #3451b2);
  color: #fff;
  cursor: pointer;
}

.run-btn:hover {
  opacity: .9;
  background: var(--vp-c-indigo-2, #3451b2);
}

.run-btn:disabled {
  opacity: .5;
  cursor: default;
}

/* Progress */
.progress-bar-wrap {
  position: relative;
  height: 28px;
  border-radius: 6px;
  background: var(--vp-c-bg-soft, #f0f0f0);
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-bar {
  height: 100%;
  background: var(--vp-c-brand, #3451b2);
  transition: width .2s;
}

.progress-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-1, #213547);
  mix-blend-mode: difference;
}

/* View controls */
.view-controls {
  margin-bottom: .75rem;
}

.ctrl-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: .75rem;
}

.ctrl-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-label {
  font-size: 12px;
  color: var(--vp-c-text-2, #666);
  white-space: nowrap;
}

.ctrl-val {
  font-size: 12px;
  font-weight: 500;
  min-width: 24px;
}

.filter-btn {
  font-size: 12px;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-divider, #ddd);
  border-radius: 20px;
  background: transparent;
  cursor: pointer;
  color: var(--vp-c-text-1, #213547);
}

.filter-btn.active {
  background: var(--vp-c-indigo-3, #3451b2);
  color: #fff;
}

/* Stats */
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: .75rem;
}

.stat-card {
  flex: 1;
  min-width: 80px;
  background: var(--vp-c-bg-soft, #f6f6f6);
  border-radius: 8px;
  padding: .5rem .75rem;
}

.stat-label {
  font-size: 11px;
  color: var(--vp-c-text-2, #666);
  margin-bottom: 2px;
}

.stat-val {
  font-size: 16px;
  font-weight: 500;
  color: var(--vp-c-text-1, #213547);
}

/* Canvas */
.canvas-outer {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--vp-c-divider, #e2e2e2);
  border-radius: 8px;
  background: var(--vp-c-bg-soft, #f0f0f0);
}

.spiral-canvas {
  display: block;
  image-rendering: pixelated;
  cursor: crosshair;
  max-width: none;
  /* allow canvas to be wider than container — outer scrolls */
}

/* Hover info bar */
.hover-info {
  margin-top: .4rem;
  font-size: 12px;
  color: var(--vp-c-text-2, #666);
  font-family: var(--vp-font-family-mono, monospace);
  min-height: 1.4em;
}

@media (max-width: 600px) {
  .config-grid {
    grid-template-columns: 1fr;
  }

  .ctrl-row {
    gap: 10px;
  }
}
</style>
