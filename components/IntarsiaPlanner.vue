<script setup lang="ts">
import { ref, computed } from 'vue'

const imageData = ref<ImageData | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showSettings = ref(false)
const colorThreshold = ref(30)
const gauge = ref(4)
const tailLength = ref(8)
const heightFeet = ref(6)
const heightInches = ref(4)

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value)
const fathom = computed(() => totalHeightInches.value)
const cubit = computed(() => (totalHeightInches.value / 4).toFixed(1))
const palm = computed(() => (totalHeightInches.value / 20).toFixed(1))

const convertToBodyMeasurements = (inches: number): string => {
  const palmInches = totalHeightInches.value / 20
  const cubitInches = totalHeightInches.value / 4
  const fathomInches = totalHeightInches.value

  const roundedToPalm = Math.ceil(inches / palmInches) * palmInches

  let remaining = roundedToPalm
  const fathoms = Math.floor(remaining / fathomInches)
  remaining -= fathoms * fathomInches

  const cubits = Math.floor(remaining / cubitInches)
  remaining -= cubits * cubitInches

  const palms = Math.round(remaining / palmInches)

  const parts = []
  if (fathoms > 0) parts.push(`${fathoms} fathom${fathoms > 1 ? 's' : ''}`)
  if (cubits > 0) parts.push(`${cubits} cubit${cubits > 1 ? 's' : ''}`)
  if (palms > 0) parts.push(`${palms} palm${palms > 1 ? 's' : ''}`)

  return parts.length > 0 ? parts.join(', ') : '0 palms'
}

const colorDistance = (color1: string, color2: string): number => {
  const match1 = color1.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const match2 = color2.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)

  if (!match1 || !match2) return Infinity

  const r1 = parseInt(match1[1])
  const g1 = parseInt(match1[2])
  const b1 = parseInt(match1[3])

  const r2 = parseInt(match2[1])
  const g2 = parseInt(match2[2])
  const b2 = parseInt(match2[3])

  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  )
}

const gridData = computed(() => {
  if (!imageData.value) return []

  const { width, height, data } = imageData.value
  const colorCounts = new Map<string, number>()
  const rawGrid: string[][] = []

  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]

      const color = `rgba(${r},${g},${b},1)`
      row.push(color)
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1)
    }
    rawGrid.push(row)
  }

  const sortedColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])

  const colorMapping = new Map<string, string>()

  for (const [color] of sortedColors) {
    let mapped = false
    for (const [mappedColor] of colorMapping) {
      if (colorDistance(color, mappedColor) < colorThreshold.value) {
        colorMapping.set(color, mappedColor)
        mapped = true
        break
      }
    }
    if (!mapped) {
      colorMapping.set(color, color)
    }
  }

  const normalizedGrid = rawGrid.map(row =>
    row.map(color => colorMapping.get(color) || color)
  )

  return normalizedGrid
})

interface ColorGroup {
  color: string
  startIndex: number
  endIndex: number
  groupNumber: number
  mergedGroupId: number
}

const colorGroups = computed(() => {
  const groups: ColorGroup[][] = []

  for (const row of gridData.value) {
    const rowGroups: ColorGroup[] = []
    let currentColor = row[0]
    let startIndex = 0
    let groupNumber = 1

    for (let i = 1; i <= row.length; i++) {
      if (i === row.length || row[i] !== currentColor) {
        rowGroups.push({
          color: currentColor,
          startIndex,
          endIndex: i - 1,
          groupNumber,
          mergedGroupId: 0
        })

        if (i < row.length) {
          currentColor = row[i]
          startIndex = i
          groupNumber++
        }
      }
    }

    groups.push(rowGroups)
  }

  return groups
})

const mergedColorGroups = computed(() => {
  const groups = colorGroups.value.map(row => row.map(g => ({ ...g })))
  let globalGroupId = 1

  for (let rowIndex = groups.length - 1; rowIndex >= 0; rowIndex--) {
    const rowNumber = groups.length - rowIndex
    const isOddRow = rowNumber % 2 === 1
    const rowGroups = groups[rowIndex]
    const claimedGroupIds = new Set<number>()

    const sortedGroups = isOddRow
      ? [...rowGroups].reverse()
      : [...rowGroups]

    for (const group of sortedGroups) {
      if (rowIndex === groups.length - 1) {
        group.mergedGroupId = globalGroupId++
        continue
      }

      const rowBelow = groups[rowIndex + 1]
      const overlappingGroups = rowBelow.filter(g =>
        g.color === group.color &&
        !(g.endIndex < group.startIndex || g.startIndex > group.endIndex)
      )

      if (overlappingGroups.length > 0) {
        let selectedGroup
        if (isOddRow) {
          selectedGroup = overlappingGroups.reduce((rightmost, current) =>
            current.startIndex > rightmost.startIndex ? current : rightmost
          )
        } else {
          selectedGroup = overlappingGroups.reduce((leftmost, current) =>
            current.startIndex < leftmost.startIndex ? current : leftmost
          )
        }

        if (claimedGroupIds.has(selectedGroup.mergedGroupId)) {
          group.mergedGroupId = globalGroupId++
        } else {
          group.mergedGroupId = selectedGroup.mergedGroupId
          claimedGroupIds.add(selectedGroup.mergedGroupId)
        }
      } else {
        group.mergedGroupId = globalGroupId++
      }
    }
  }

  return groups
})

const getCellGroupInfo = (rowIndex: number, colIndex: number) => {
  const rowGroups = mergedColorGroups.value[rowIndex]
  const group = rowGroups.find(g => colIndex >= g.startIndex && colIndex <= g.endIndex)
  return group
}

const shouldShowGroupLabel = (rowIndex: number, colIndex: number) => {
  const group = getCellGroupInfo(rowIndex, colIndex)
  if (!group) return false

  const rowNumber = gridData.value.length - rowIndex
  const isOddRow = rowNumber % 2 === 1

  for (let r = gridData.value.length - 1; r >= rowIndex; r--) {
    const currentRowNumber = gridData.value.length - r
    const currentIsOddRow = currentRowNumber % 2 === 1
    const rowGroups = mergedColorGroups.value[r]

    for (const g of rowGroups) {
      if (g.mergedGroupId === group.mergedGroupId) {
        if (r === rowIndex) {
          if (currentIsOddRow) {
            return colIndex === g.endIndex
          } else {
            return colIndex === g.startIndex
          }
        }
        return false
      }
    }
  }

  return false
}

const getCellBorders = (rowIndex: number, colIndex: number) => {
  const group = getCellGroupInfo(rowIndex, colIndex)
  if (!group) return { top: false, right: false, bottom: false, left: false }

  const borders = {
    top: false,
    right: false,
    bottom: false,
    left: false
  }

  const topGroup = rowIndex > 0 ? getCellGroupInfo(rowIndex - 1, colIndex) : null
  const bottomGroup = rowIndex < gridData.value.length - 1 ? getCellGroupInfo(rowIndex + 1, colIndex) : null
  const leftGroup = colIndex > 0 ? getCellGroupInfo(rowIndex, colIndex - 1) : null
  const rightGroup = colIndex < gridData.value[rowIndex].length - 1 ? getCellGroupInfo(rowIndex, colIndex + 1) : null

  if (!topGroup || topGroup.mergedGroupId !== group.mergedGroupId) {
    borders.top = true
  }
  if (!bottomGroup || bottomGroup.mergedGroupId !== group.mergedGroupId) {
    borders.bottom = true
  }
  if (!leftGroup || leftGroup.mergedGroupId !== group.mergedGroupId) {
    borders.left = true
  }
  if (!rightGroup || rightGroup.mergedGroupId !== group.mergedGroupId) {
    borders.right = true
  }

  return borders
}

const rgbaToHex = (rgba: string): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgba

  const r = parseInt(match[1])
  const g = parseInt(match[2])
  const b = parseInt(match[3])

  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

const getColorName = (rgba: string): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return 'Unknown'

  const r = parseInt(match[1]) / 255
  const g = parseInt(match[2]) / 255
  const b = parseInt(match[3]) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  let h = 0
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6
    } else {
      h = ((r - g) / delta + 4) / 6
    }
  }

  let colorName = ''

  if (l < 0.15) return 'Black'
  if (l > 0.95) return 'White'

  if (s < 0.1) {
    if (l < 0.4) return 'Dark Gray'
    if (l > 0.7) return 'Light Gray'
    return 'Gray'
  }

  const hue = h * 360

  if (hue < 15 || hue >= 345) colorName = 'Red'
  else if (hue < 45) colorName = 'Orange'
  else if (hue < 70) colorName = 'Yellow'
  else if (hue < 150) colorName = 'Green'
  else if (hue < 190) colorName = 'Cyan'
  else if (hue < 260) colorName = 'Blue'
  else if (hue < 290) colorName = 'Purple'
  else if (hue < 345) colorName = 'Pink'

  if (hue >= 15 && hue < 70 && l < 0.5 && s > 0.2) {
    if (l < 0.35) return 'Dark Brown'
    return 'Brown'
  }

  if (l < 0.3) colorName = 'Dark ' + colorName
  else if (l > 0.8) colorName = 'Light ' + colorName
  else if (s < 0.3) colorName = 'Dull ' + colorName

  return colorName
}

const darkenColor = (rgba: string, amount: number = 0.3): string => {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgba

  const r = parseInt(match[1])
  const g = parseInt(match[2])
  const b = parseInt(match[3])

  const brightness = (r + g + b) / 3

  if (brightness < 100) {
    const newR = Math.min(255, r + 80)
    const newG = Math.min(255, g + 80)
    const newB = Math.min(255, b + 80)
    return `rgb(${newR},${newG},${newB})`
  } else {
    const newR = Math.max(0, Math.floor(r * (1 - amount)))
    const newG = Math.max(0, Math.floor(g * (1 - amount)))
    const newB = Math.max(0, Math.floor(b * (1 - amount)))
    return `rgb(${newR},${newG},${newB})`
  }
}

const colorPalette = computed(() => {
  const colors = new Set<string>()
  for (const row of gridData.value) {
    for (const color of row) {
      colors.add(color)
    }
  }
  return Array.from(colors)
})

const maxBobbinsInRow = computed(() => {
  let maxCount = 0

  for (const row of mergedColorGroups.value) {
    const uniqueGroups = new Set(row.map(g => g.mergedGroupId))
    maxCount = Math.max(maxCount, uniqueGroups.size)
  }

  return maxCount
})

const bobbinInfo = computed(() => {
  const groupStitches = new Map<number, { color: string, count: number }>()

  for (const row of mergedColorGroups.value) {
    for (const group of row) {
      const stitchCount = group.endIndex - group.startIndex + 1
      const existing = groupStitches.get(group.mergedGroupId)
      if (existing) {
        existing.count += stitchCount
      } else {
        groupStitches.set(group.mergedGroupId, {
          color: group.color,
          count: stitchCount
        })
      }
    }
  }

  return Array.from(groupStitches.entries())
    .map(([groupId, info]) => {
      const yarnLength = (3 * info.count / gauge.value) + (2 * tailLength.value)
      const yarnLengthInches = Math.ceil(yarnLength)
      return {
        id: groupId,
        color: info.color,
        name: getColorName(info.color),
        stitches: info.count,
        yarnLength: yarnLengthInches,
        bodyMeasurements: convertToBodyMeasurements(yarnLengthInches)
      }
    })
    .sort((a, b) => a.id - b.id)
})

const colorPaletteWithNames = computed(() => {
  const colors = colorPalette.value
  const colorStitchCount = new Map<string, number>()

  for (const row of gridData.value) {
    for (const color of row) {
      colorStitchCount.set(color, (colorStitchCount.get(color) || 0) + 1)
    }
  }

  const nameCount = new Map<string, number>()
  const nameUsage = new Map<string, number>()

  for (const color of colors) {
    const name = getColorName(color)
    nameCount.set(name, (nameCount.get(name) || 0) + 1)
  }

  const result = colors.map(color => {
    const baseName = getColorName(color)
    const count = nameCount.get(baseName) || 1

    if (count > 1) {
      const usage = (nameUsage.get(baseName) || 0) + 1
      nameUsage.set(baseName, usage)
      return {
        color,
        name: `${baseName} ${usage}`,
        hex: rgbaToHex(color),
        stitches: colorStitchCount.get(color) || 0
      }
    }

    return {
      color,
      name: baseName,
      hex: rgbaToHex(color),
      stitches: colorStitchCount.get(color) || 0
    }
  })

  return result.sort((a, b) => b.stitches - a.stitches)
})

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      if (!canvas.value) return

      canvas.value.width = img.width
      canvas.value.height = img.height

      const ctx = canvas.value.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0)
      imageData.value = ctx.getImageData(0, 0, img.width, img.height)
    }
    img.src = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const printPage = () => {
  if (typeof window !== 'undefined') {
    window.print()
  }
}
</script>

<template>
  <div class="crochet-pattern-importer">
    <div class="controls">
      <input
        ref="fileInput"
        type="file"
        accept="image/png"
        @change="handleFileUpload"
        style="display: none"
      />
      <button @click="triggerFileInput" class="upload-btn">
        Import PNG Pattern
      </button>
      <button v-if="gridData.length > 0" @click="printPage" class="print-btn">
        Print / Save as PDF
      </button>
      <button @click="showSettings = !showSettings" class="settings-btn" title="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    </div>

    <div v-if="showSettings" class="settings-popup">
      <div class="settings-content">
        <div class="settings-header">
          <h3>Settings</h3>
          <button @click="showSettings = false" class="close-btn">×</button>
        </div>
        <div class="settings-body">
          <div class="setting-item">
            <label for="color-threshold">Similar Color Margin</label>
            <div class="setting-control">
              <input
                id="color-threshold"
                type="range"
                min="0"
                max="100"
                v-model.number="colorThreshold"
              />
              <input
                type="number"
                min="0"
                max="100"
                v-model.number="colorThreshold"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">
              Colors within this RGB distance will be merged into one (0 = exact match, 100 = very loose matching)
            </p>
          </div>
          <div class="setting-item">
            <label for="gauge">Gauge (st./in.)</label>
            <div class="setting-control">
              <input
                id="gauge"
                type="number"
                min="1"
                max="20"
                step="0.5"
                v-model.number="gauge"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">
              Number of stitches per inch for yarn estimation
            </p>
          </div>
          <div class="setting-item">
            <label for="tail-length">Tail Length (in.)</label>
            <div class="setting-control">
              <input
                id="tail-length"
                type="number"
                min="0"
                max="50"
                step="0.5"
                v-model.number="tailLength"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">
              Leftover yarn on each side of color changes
            </p>
          </div>
          <div class="setting-item">
            <label>User Height</label>
            <div class="setting-control">
              <input
                type="number"
                min="0"
                max="8"
                v-model.number="heightFeet"
                class="threshold-input"
                style="width: 3rem"
              />
              <span style="margin: 0 0.25rem">ft.</span>
              <input
                type="number"
                min="0"
                max="11"
                v-model.number="heightInches"
                class="threshold-input"
                style="width: 3rem"
              />
              <span style="margin: 0 0.25rem">in.</span>
            </div>
            <p class="setting-description">
              Your height for body-based measurements
            </p>
          </div>
          <div class="setting-item body-measurements">
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Fathom" target="_blank" rel="noopener">Fathom (Wingspan)</a>
              <span>{{ fathom }} in.</span>
            </div>
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Cubit" target="_blank" rel="noopener">Cubit</a>
              <span>{{ cubit }} in.</span>
            </div>
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Hand_(unit)" target="_blank" rel="noopener">Palm</a>
              <span>{{ palm }} in.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <canvas ref="canvas" style="display: none"></canvas>

    <div v-if="gridData.length > 0" class="pattern-grid-container">
      <div class="pattern-grid">
        <div
          v-for="(row, rowIndex) in gridData"
          :key="rowIndex"
          class="pattern-row"
        >
          <div
            v-if="(gridData.length - rowIndex) % 2 === 0"
            class="row-counter row-counter-left"
          >
            {{ gridData.length - rowIndex }}
          </div>
          <div
            v-for="(color, colIndex) in row"
            :key="colIndex"
            class="pattern-cell"
            :class="{
              'grid-left': colIndex % 10 === 0 && colIndex !== 0,
              'grid-top': rowIndex % 10 === 0 && rowIndex !== 0
            }"
            :style="{
              backgroundColor: color,
              boxShadow: [
                getCellBorders(rowIndex, colIndex).top ? `inset 0 2px 0 0 ${darkenColor(color)}` : null,
                getCellBorders(rowIndex, colIndex).right ? `inset -2px 0 0 0 ${darkenColor(color)}` : null,
                getCellBorders(rowIndex, colIndex).bottom ? `inset 0 -2px 0 0 ${darkenColor(color)}` : null,
                getCellBorders(rowIndex, colIndex).left ? `inset 2px 0 0 0 ${darkenColor(color)}` : null
              ].filter(Boolean).join(', ') || 'none'
            }"
          >
            <span
              v-if="shouldShowGroupLabel(rowIndex, colIndex)"
              class="group-label"
              :class="{
                'group-label-right': (gridData.length - rowIndex) % 2 === 1,
                'group-label-left': (gridData.length - rowIndex) % 2 === 0
              }"
            >
              {{ getCellGroupInfo(rowIndex, colIndex)?.mergedGroupId }}
            </span>
          </div>
          <div
            v-if="(gridData.length - rowIndex) % 2 === 1"
            class="row-counter row-counter-right"
          >
            {{ gridData.length - rowIndex }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>Import a PNG image to see your crochet pattern grid</p>
      <p class="hint">Each pixel will represent one stitch</p>
    </div>

    <div v-if="gridData.length > 0" class="bobbins-section">
      <h3>Color Groups ({{ bobbinInfo.length }} total)</h3>
      <p class="bobbins-subheading">Max bobbins needed: {{ maxBobbinsInRow }}</p>
      <div class="bobbins-list">
        <div
          v-for="bobbin in bobbinInfo"
          :key="bobbin.id"
          class="bobbin-item"
        >
          <div class="bobbin-id" :style="{ backgroundColor: bobbin.color }">
            #{{ bobbin.id }}
          </div>
          <div class="bobbin-details">
            <div class="bobbin-name">{{ bobbin.name }}</div>
            <div class="bobbin-body-measurements">
              {{ bobbin.bodyMeasurements }}
            </div>
            <div class="bobbin-stats">
              <span class="stat">{{ bobbin.stitches }} st.</span>
              <span class="stat-separator">•</span>
              <span class="stat">{{ bobbin.yarnLength }} in.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="gridData.length > 0" class="palette-section">
      <h3>Color Palette</h3>
      <div class="palette-grid">
        <div
          v-for="(item, index) in colorPaletteWithNames"
          :key="index"
          class="palette-item"
        >
          <div class="palette-swatch" :style="{ backgroundColor: item.color }" />
          <div class="palette-info">
            <div class="palette-name">{{ item.name }}</div>
            <div class="palette-color">{{ item.hex }}</div>
            <div class="palette-stitches">{{ item.stitches }} stitches</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crochet-pattern-importer {
  width: 100%;
  padding: 1.25rem 0;
}

.controls {
  margin-bottom: 1.25rem;
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.upload-btn {
  background-color: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  border: 1px solid var(--vp-button-brand-border);
  padding: 0.625rem 1.25rem;
  border-radius: 1.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.25s, border-color 0.25s;
}

.upload-btn:hover {
  background-color: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-border);
}

.settings-btn {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-border);
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.25s, border-color 0.25s;
}

.settings-btn:hover {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.print-btn {
  background-color: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  border: 1px solid var(--vp-button-brand-border);
  padding: 0.625rem 1.25rem;
  border-radius: 1.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.25s, border-color 0.25s;
}

.print-btn:hover {
  background-color: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-border);
}

@media print {
  .controls {
    display: none;
  }

  .settings-popup {
    display: none;
  }
}

.settings-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-content {
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.75rem;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-border);
}

.settings-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-2);
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  transition: background-color 0.25s, color 0.25s;
}

.close-btn:hover {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.settings-body {
  padding: 1.25rem;
}

.setting-item {
  margin-bottom: 1.25rem;
}

.setting-item label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.5rem;
}

.setting-control {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.setting-control input[type="range"] {
  flex: 1;
}

.threshold-input {
  width: 4.375rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 0.875rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.threshold-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 25%, transparent);
}

.setting-description {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  line-height: 1.4;
}

.body-measurements {
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.measurement-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  font-size: 0.875rem;
}

.measurement-row:not(:last-child) {
  border-bottom: 1px solid var(--vp-c-divider);
}

.measurement-row a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  transition: color 0.25s;
}

.measurement-row a:hover {
  color: var(--vp-c-brand-2);
  text-decoration: underline;
}

.measurement-row span {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.pattern-grid-container {
  width: 100%;
  overflow-x: auto;
}

.pattern-grid {
  display: inline-block;
  border: 1px solid var(--vp-c-border);
  width: 100%;
  padding: 1.25rem 3.125rem;
  border-radius: 0.75rem;
}

.pattern-row {
  display: flex;
  width: 100%;
  position: relative;
}

.pattern-cell {
  flex: 1;
  aspect-ratio: 1;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  position: relative;
  /*box-sizing: border-box;*/
}

.pattern-cell.grid-left {
  border-left: 2px solid rgba(0, 0, 0, 0.5);
}

.pattern-cell.grid-top {
  border-top: 2px solid rgba(0, 0, 0, 0.5);
}

.group-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.625rem;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
  color: white;
  line-height: 1;
  z-index: 2;
  text-shadow:
    -0.0625rem -0.0625rem 0 #000,
    0.0625rem -0.0625rem 0 #000,
    -0.0625rem 0.0625rem 0 #000,
    0.0625rem 0.0625rem 0 #000,
    -0.0625rem 0 0 #000,
    0.0625rem 0 0 #000,
    0 -0.0625rem 0 #000,
    0 0.0625rem 0 #000;
}

.group-label-left {
  left: 0.125rem;
}

.group-label-right {
  right: 0.125rem;
}

.row-counter {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid var(--vp-c-border);
  z-index: 1;
}

.row-counter-left {
  left: -2.5rem;
}

.row-counter-right {
  right: -2.5rem;
}

.empty-state {
  text-align: center;
  padding: 2.5rem;
  color: var(--vp-c-text-2);
}

.empty-state .hint {
  font-size: 0.875rem;
  margin-top: 0.5rem;
  color: var(--vp-c-text-3);
}

.bobbins-section {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--vp-c-border);
}

.bobbins-section h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.bobbins-subheading {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.bobbins-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.bobbin-item {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  transition: background-color 0.15s ease;
}

.bobbin-item:hover {
  background-color: var(--vp-c-bg-mute);
}

.bobbin-id {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  width: 3rem;
  height: 3rem;
  font-family: var(--vp-font-family-mono);
  font-size: 1rem;
  font-weight: 700;
  color: white;
  border: 2px solid var(--vp-c-border);
  border-radius: 0.375rem;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-shadow:
    -0.0625rem -0.0625rem 0 #000,
    0.0625rem -0.0625rem 0 #000,
    -0.0625rem 0.0625rem 0 #000,
    0.0625rem 0.0625rem 0 #000,
    -0.0625rem 0 0 #000,
    0.0625rem 0 0 #000,
    0 -0.0625rem 0 #000,
    0 0.0625rem 0 #000;
}

.bobbin-details {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
  justify-content: center;
}

.bobbin-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.bobbin-body-measurements {
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  font-weight: 500;
}

.bobbin-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  font-style: italic;
}

.stat {
  font-weight: 400;
}

.stat-separator {
  color: var(--vp-c-text-3);
}

.palette-section {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--vp-c-border);
}

.palette-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
  gap: 0.75rem;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
}

.palette-swatch {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.palette-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.palette-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.palette-color {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  word-break: break-all;
}

.palette-stitches {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}
</style>
