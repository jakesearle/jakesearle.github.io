<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { rowInstruction } from '../utils/crochet'

const minStitchesAround = 4

const imageUrl = ref<string | null>(null)
const container = ref<HTMLDivElement | null>(null)
const debugMode = ref(false)

// Spine endpoints
const points = reactive([
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.7 }
])

const stitchHeight = ref(0.58)
const spineLengthCm = ref(6)

const segments = computed(() => {
    if (stitchHeight.value <= 0) return 1
    return Math.max(1, Math.ceil(spineLengthCm.value / stitchHeight.value))
})
const arcOffsets = reactive<number[]>(Array(segments.value + 1).fill(0))
const draggingSpineIndex = ref<number | null>(null)
const draggingArcIndex = ref<number | null>(null)

const minRibDist = computed(() => {
    if (!container.value) return 0
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const length = Math.hypot(dx, dy)
    const minDistanceCm = (minStitchesAround * stitchHeight.value) / (2 * Math.PI)
    return (minDistanceCm / spineLengthCm.value) * length
})

initArcOffsets()

// Initialize arc offsets with small bulge: ends 0.05, middle 0.1
function initArcOffsets() {
    const n = segments.value
    for (let i = 0; i <= n; i++) {
        const t = i / n
        // Parabolic profile: y = 1 - (2t - 1)^2
        const profile = 1 - Math.pow(2 * t - 1, 2)
        // Scale to 0.05 at ends, 0.1 at middle
        arcOffsets[i] = Math.max(minRibDist.value, 0.05) + 0.05 * profile
    }
}

watch(segments, (newVal) => {
    while (arcOffsets.length < newVal + 1) arcOffsets.push(0)
    while (arcOffsets.length > newVal + 1) arcOffsets.pop()
    initArcOffsets()
})

// Upload image
function handleUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => (imageUrl.value = reader.result as string)
    reader.readAsDataURL(file)
}

// Spine drag
function startSpineDrag(index: number, e: PointerEvent) {
    e.preventDefault()
    draggingSpineIndex.value = index
}

function stopDrag() {
    draggingSpineIndex.value = null
    draggingArcIndex.value = null
}

// Arc drag
function startArcDrag(index: number, e: PointerEvent) {
    e.preventDefault()
    draggingArcIndex.value = index
}
function handlePointerMove(e: PointerEvent) {
    if (!container.value) return
    const rect = container.value.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / rect.width
    const mouseY = (e.clientY - rect.top) / rect.height

    // Spine vector
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const length = Math.hypot(dx, dy)
    if (length === 0) return
    const nx = -dy / length
    const ny = dx / length

    // Move spine point
    if (draggingSpineIndex.value !== null) {
        const i = draggingSpineIndex.value
        points[i].x = Math.min(Math.max(mouseX, 0), 1)
        points[i].y = Math.min(Math.max(mouseY, 0), 1)
    }

    // Move arc point perpendicular to spine
    if (draggingArcIndex.value !== null) {
        const i = draggingArcIndex.value
        const t = i / segments.value
        const baseX = points[0].x + dx * t
        const baseY = points[0].y + dy * t
        let offset = (mouseX - baseX) * nx + (mouseY - baseY) * ny

        offset = Math.max(offset, minRibDist.value)
        arcOffsets[i] = offset
    }
}

// Compute arc points in normalized coordinates
const arcPoints = computed(() => {
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const length = Math.hypot(dx, dy)
    if (length === 0) return []
    const nx = -dy / length
    const ny = dx / length

    return Array.from({ length: segments.value + 1 }, (_, i) => {
        const t = i / segments.value
        const baseX = points[0].x + dx * t
        const baseY = points[0].y + dy * t
        const offset = arcOffsets[i] ?? 0
        return { x: baseX + nx * offset, y: baseY + ny * offset }
    })
})

function getArcDistancesCm(): number[] {
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const spineLengthNormalized = Math.hypot(dx, dy)

    if (spineLengthNormalized === 0) return []

    const scale = spineLengthCm.value / spineLengthNormalized

    return arcOffsets.map(o => Math.abs(o) * scale)
}

function generateStitchCounts(): number[] {
    const distances = getArcDistancesCm()
    if (distances.length === 0) return []

    return distances.map(r => Math.max(1, Math.round((2 * Math.PI * r) / stitchHeight.value)))
}

const crochetRows = computed(() => {
    const stitchCounts = generateStitchCounts()
    const rows: string[] = []
    const max: number = Math.max(...stitchCounts)

    for (let i = 1; i < stitchCounts.length; i++) {
        const prev = stitchCounts[i - 1]
        const curr = stitchCounts[i]
        if (prev >= (max / 2) && curr <= (max / 2)) {
            rows.push("  Stuff object")
        }
        rows.push(`${i}: ${rowInstruction(prev, curr)} (${curr})`)
    }

    return rows
})

const debugTable = computed(() => {
    const distances = arcOffsets // normalized/perpendicular offsets
    const distancesCm = getArcDistancesCm() // real distances in cm
    const stitches = generateStitchCounts()

    return distances.map((unit, i) => ({
        rib: i + 1,
        unitDistance: unit.toFixed(3),
        realDistanceCm: distancesCm[i].toFixed(2),
        stitches: stitches[i],
    }))
})
</script>

<template>
    <div class="spine-widget">
        <input type="file" accept="image/*" @change="handleUpload" />
        <div class="controls">
            <div class="text-boxes">
                <label class="text-box">
                    Stitch height (cm)
                    <input type="number" step="0.01" v-model.number="stitchHeight" placeholder="0.58" />
                </label>

                <label class="text-box">
                    Spine length (cm)
                    <input type="number" step="0.1" v-model.number="spineLengthCm" placeholder="6" />
                </label>
            </div>
            <label class="checkbox">
                <input type="checkbox" v-model="debugMode" /> Debug Mode
            </label>
        </div>

        <div v-if="imageUrl" ref="container" class="image-container" @pointermove="handlePointerMove"
            @pointerup="stopDrag" @pointerleave="stopDrag">
            <img :src="imageUrl" />

            <svg class="overlay" viewBox="0 0 1 1">

                <!-- Ribs -->
                <line v-for="(p, i) in arcPoints" :key="'ref-' + i"
                    :x1="points[0].x + (points[1].x - points[0].x) * (i / segments)"
                    :y1="points[0].y + (points[1].y - points[0].y) * (i / segments)" :x2="p.x" :y2="p.y" stroke="orange"
                    stroke-width="0.005" />

                <!-- Spine -->
                <line :x1="points[0].x" :y1="points[0].y" :x2="points[1].x" :y2="points[1].y"
                    stroke="var(--vp-c-brand-1)" stroke-width="0.01" />

                <!-- Spine points -->
                <circle v-for="(p, i) in points" :key="'spine-' + i" :cx="p.x" :cy="p.y" r="0.02" fill="white"
                    stroke="var(--vp-c-brand-1)" stroke-width="0.01" @pointerdown="startSpineDrag(i, $event)"
                    style="cursor: grab" />

                <!-- Arc -->
                <polyline v-if="arcPoints.length" :points="arcPoints.map(p => `${p.x},${p.y}`).join(' ')" fill="none"
                    stroke="orange" stroke-width="0.005" />

                <!-- Arc points -->
                <circle v-for="(p, i) in arcPoints" :key="'arc-' + i" :cx="p.x" :cy="p.y" r="0.01" stroke="orange"
                    stroke-width="0.005" @pointerdown="startArcDrag(i, $event)" style="cursor: ew-resize"
                    :fill="arcOffsets[i] <= minRibDist ? 'red' : 'white'" />


            </svg>
        </div>
        <div v-if="imageUrl && crochetRows.length" class="instructions">
            <h3>Crochet Instructions</h3>
            <pre>
{{ crochetRows.join('\n') }}</pre>
        </div>
        <div v-if="debugMode" class="debug-table">
            <h3>Arc Point Debug Info</h3>
            <table>
                <thead>
                    <tr>
                        <th>Rib</th>
                        <th>Unit Dist.</th>
                        <th>Distance (cm)</th>
                        <th>st.</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in debugTable" :key="row.rib">
                        <td>{{ row.rib }}</td>
                        <td>{{ row.unitDistance }}</td>
                        <td>{{ row.realDistanceCm }}</td>
                        <td>{{ row.stitches }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.controls .text-boxes {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
}

.controls .text-box {
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
}

.controls .text-box input {
    margin-top: 0.25rem;
    width: 100px;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    border: 1px solid var(--vp-c-border);
    background: var(--vp-c-bg);
}

.controls input:focus {
    outline: none;
    border-color: var(--vp-c-brand-1);
    box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.computed {
    font-weight: 600;
    color: var(--vp-c-brand-1);
}

.spine-widget {
    margin-top: 1rem;
}

input[type="file"] {
    margin-bottom: 1rem;
}

.image-container {
    position: relative;
    width: 100%;

}

.image-container img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 12px;
    border: 1px solid var(--vp-c-border);
}

.overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

circle {
    pointer-events: all;
}

.controls {
    margin-bottom: 1rem;
}

.controls input {
    /* margin-left: 0.5rem; */
    /* width: 70px; */
    padding: 0.3rem;
    padding-left: 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--vp-c-border);
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
}

.instructions {
    margin-top: 1.5rem;
}

.instructions h3 {
    margin-bottom: 0.5rem;
    color: var(--vp-c-text-1);
}

.instructions pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace;
    background: var(--vp-c-bg-soft);
    border: 1px solid var(--vp-c-border);
    border-radius: 12px;
    padding: 1rem;
    overflow-x: auto;
    line-height: 1.4;
    color: var(--vp-c-text-1);
}

.debug-table {
    margin-top: 1rem;
}

.debug-table table {
    border-collapse: collapse;
    width: 100%;
    font-family: ui-monospace, monospace;
}

.debug-table th,
.debug-table td {
    border: 1px solid var(--vp-c-border);
    padding: 0.4rem 0.6rem;
    text-align: center;
}

.debug-table th {
    background-color: var(--vp-c-bg-soft);
    color: var(--vp-c-text-2);
}
</style>