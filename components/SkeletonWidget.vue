<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'

const imageUrl = ref<string | null>(null)
const container = ref<HTMLDivElement | null>(null)
const overlayOpacity = ref(0.6)
const lines = reactive([
    [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 }]
])
const spineLengthCm = ref(6)
const draggingSpinePoint = ref<{
    lineIndex: number
    pointIndex: number
} | null>(null)

const STORAGE_KEY = "skeleton-tool-save"

watch(
    () => ({
        lines,
        spineLengthCm: spineLengthCm.value,
    }),
    (data) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    { deep: true }
)

onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (!saved) return

    try {
        const parsed = JSON.parse(saved)

        if (parsed.lines) {
            lines.splice(0, lines.length, ...parsed.lines)
        }

        if (parsed.spineLengthCm) {
            spineLengthCm.value = parsed.spineLengthCm
        }

    } catch (e) {
        console.warn("Failed to load skeleton save")
    }
})

function handleUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => (imageUrl.value = reader.result as string)
    reader.readAsDataURL(file)
}

function startSpineDrag(
    lineIndex: number,
    pointIndex: number,
    e: PointerEvent
) {
    e.preventDefault()
    draggingSpinePoint.value = { lineIndex, pointIndex }
}

function stopDrag() {
    draggingSpinePoint.value = null
}

function handlePointerMove(e: PointerEvent) {
    if (!container.value) return

    const rect = container.value.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / rect.width
    const mouseY = (e.clientY - rect.top) / rect.height

    if (draggingSpinePoint.value !== null) {
        const { lineIndex, pointIndex } = draggingSpinePoint.value

        lines[lineIndex][pointIndex].x = Math.min(Math.max(mouseX, 0), 1)
        lines[lineIndex][pointIndex].y = Math.min(Math.max(mouseY, 0), 1)
    }
}

const mainSpine = computed(() => {
    return line2String(lines[0])
})

function line2String(line: any) {
    return JSON.stringify(
        line,
        (key, value) => {
            if (typeof value === 'number') {
                return Number(value.toFixed(3))
            }
            return value
        }
    )
}

function addSpine() {
    // Default new spine slightly offset so it doesn't overlap
    const offset = lines.length * 0.05

    lines.push([
        { x: 0.2, y: 0.5 + offset },
        { x: 0.8, y: 0.5 + offset }
    ])
}

function getNormalizedLength(line: { x: number; y: number }[]) {
    const dx = line[1].x - line[0].x
    const dy = line[1].y - line[0].y
    return Math.hypot(dx, dy)
}


function getLengthCm(index: number) {
    const baseLength = getNormalizedLength(lines[0])
    const thisLength = getNormalizedLength(lines[index])

    if (baseLength === 0) return 0

    return (thisLength / baseLength) * spineLengthCm.value
}
</script>

<template>
    <div class="spine-widget">
        <input type="file" accept="image/*" @change="handleUpload" />
        <div class="controls">
            <div class="line-output">
                <label class="text-box">
                    x1
                    <input type="number" step="0.001" min="0" max="1" v-model.number="lines[0][0].x" />
                </label>
                <label class="text-box">
                    y1
                    <input type="number" step="0.001" min="0" max="1" v-model.number="lines[0][0].y" />
                </label>
                <label class="text-box">
                    x2
                    <input type="number" step="0.001" min="0" max="1" v-model.number="lines[0][1].x" />
                </label>
                <label class="text-box">
                    y2
                    <input type="number" step="0.001" min="0" max="1" v-model.number="lines[0][1].y" />
                </label>
                <label class="text-box">
                    Spine length (cm)
                    <input type="number" step="0.1" v-model.number="spineLengthCm" placeholder="6" />
                </label>
            </div>
            <div v-for="(line, index) in lines.slice(1)" :key="index" class="line-output">
                <div class="text-boxes">
                    <label class="text-box">
                        x1
                        <input type="number" step="0.001" min="0" max="1" v-model.number="line[0].x" />
                    </label>
                    <label class="text-box">
                        y1
                        <input type="number" step="0.001" min="0" max="1" v-model.number="line[0].y" />
                    </label>
                    <label class="text-box">
                        x2
                        <input type="number" step="0.001" min="0" max="1" v-model.number="line[1].x" />
                    </label>
                    <label class="text-box">
                        y2
                        <input type="number" step="0.001" min="0" max="1" v-model.number="line[1].y" />
                    </label>
                    <label class="text-box">
                        Spine length (cm)
                        <input type="number" :value="getLengthCm(index + 1).toFixed(1)" readonly />
                    </label>
                </div>
            </div>
            <div class="spine-controls">
                <button @click="addSpine">
                    Add Spine
                </button>
            </div>
            <div class="slider">
                <label>
                    Overlay Opacity: {{ overlayOpacity.toFixed(2) }}
                </label>
                <input type="range" min="0" max="1" step="0.01" v-model.number="overlayOpacity" />
            </div>
        </div>

        <div v-if="imageUrl" ref="container" class="image-container" @pointermove="handlePointerMove"
            @pointerup="stopDrag" @pointerleave="stopDrag">
            <img :src="imageUrl" />

            <svg class="overlay" viewBox="0 0 1 1" :style="{ opacity: overlayOpacity }">


                <!-- Spine -->
                <line v-for="(points, i) in lines" :x1="points[0].x" :y1="points[0].y" :x2="points[1].x"
                    :y2="points[1].y" stroke="var(--vp-c-brand-1)" stroke-width="0.01" />

                <g v-for="(line, lineIndex) in lines" :key="lineIndex">
                    <circle v-for="(point, pointIndex) in line" :key="pointIndex" :cx="point.x" :cy="point.y" r="0.01"
                        @pointerdown="startSpineDrag(lineIndex, pointIndex, $event)" />
                </g>
            </svg>
        </div>
    </div>
</template>

<style scoped>
.controls .line-output {
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

.text-box .json-output {
    padding: 0.5rem;
    width: 400px;
    height: 40px;
}

.controls .text-boxes {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
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

.slider {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
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
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    /* Safari */
    -moz-user-select: none;
    /* Firefox */
    -ms-user-select: none;
    /* old Edge */
}

.overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    transition: opacity 0.15s ease;
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

.spine-controls {
    margin-top: 0.75rem;
}

.spine-controls button {
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--vp-c-border);
}

@media print {
    .instructions {
        break-before: page;
    }
}
</style>