<script setup lang="ts">
import { ref, computed } from 'vue'

const imageData = ref<ImageData | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showSettings = ref(false)
const colorThreshold = ref(15)
const gauge = ref(2.1)
const errorMargin = ref(1.05)
const headLength = ref(5)
const tailLength = ref(10)
const heightFeet = ref(6)
const heightInches = ref(4)

const woundBobbins = ref(new Set<number>())
const currentRow = ref<number | null>(null)

const impeccableYarns = [
  { "name": "Amethyst", "hex": "#783971" },
  { "name": "Aqua", "hex": "#18c0cc" },
  { "name": "Aran", "hex": "#eae1d3" },
  { "name": "Arbor Rose", "hex": "#eb1651" },
  { "name": "Aruba Blue", "hex": "#7be0db" },
  { "name": "Barley", "hex": "#8b7d78" },
  { "name": "Black", "hex": "#2b2427" },
  { "name": "Blue Haze", "hex": "#d5e7e9" },
  { "name": "Blue Moon", "hex": "#526d87" },
  { "name": "Brite Sky Blue", "hex": "#0074a3" },
  { "name": "Burgundy", "hex": "#860633" },
  { "name": "Butterscotch", "hex": "#fdd082" },
  { "name": "Cherry", "hex": "#c90126" },
  { "name": "Chocolate Brown", "hex": "#633e32" },
  { "name": "Citron", "hex": "#e3e69e" },
  { "name": "Claret", "hex": "#b9031c" },
  { "name": "Classic Gray", "hex": "#dbd9da" },
  { "name": "Clear Blue", "hex": "#0092d3" },
  { "name": "Coral", "hex": "#ffb7bb" },
  { "name": "Dark Charcoal", "hex": "#443e40" },
  { "name": "Deep Forest", "hex": "#74684b" },
  { "name": "Eggplant", "hex": "#a192d8" },
  { "name": "Fern", "hex": "#c9c373" },
  { "name": "Forest", "hex": "#626C42" },
  { "name": "Gold", "hex": "#C17F0F" },
  { "name": "Golden Beige", "hex": "#f0eee8" },
  { "name": "Grape Punch", "hex": "#320057" },
  { "name": "Grass", "hex": "#CFC670" },
  { "name": "Green Lagoon", "hex": "#b8d0c4" },
  { "name": "Heather", "hex": "#f3d4af" },
  { "name": "Jade", "hex": "#a3deba" },
  { "name": "Kelly Green", "hex": "#06906a" },
  { "name": "Lavender", "hex": "#b297ca" },
  { "name": "Lippy", "hex": "#e60078" },
  { "name": "Misty Blue", "hex": "#9db8c3" },
  { "name": "Navy Blue", "hex": "#3e2f43" },
  { "name": "Orange Crush", "hex": "#fa340a" },
  { "name": "Pale Gray", "hex": "#9d9e9e" },
  { "name": "Petunia", "hex": "#cbd3e2" },
  { "name": "Plum", "hex": "#bd9cb2" },
  { "name": "Pumpkin", "hex": "#e84805" },
  { "name": "Putty", "hex": "#dad8d1" },
  { "name": "Red Hot", "hex": "#bf000a" },
  { "name": "Rich Orchid", "hex": "#d70361" },
  { "name": "Royal", "hex": "#011e70" },
  { "name": "Sapphire", "hex": "#103858" },
  { "name": "Sea Green", "hex": "#abdfe5" },
  { "name": "Skylight", "hex": "#c5e3df" },
  { "name": "Smoke", "hex": "#cfd9db" },
  { "name": "Soft Rose", "hex": "#f1b8b9" },
  { "name": "Soft Taupe", "hex": "#daa77d" },
  { "name": "Sunny Day", "hex": "#ffad07" },
  { "name": "Teal", "hex": "#027f89" },
  { "name": "Thunder", "hex": "#898584" },
  { "name": "True Grey", "hex": "#84787a" },
  { "name": "Violet", "hex": "#caa1be" },
  { "name": "White", "hex": "#e6e4e8" },

  { "name": "Almond", "hex": "#B19D8F" },
  { "name": "Apricot", "hex": "#DDAA8F" },
  { "name": "Baked Clay", "hex": "#AD6152" },
  { "name": "Barely Pink", "hex": "#DECBC8" },
  { "name": "Cloud", "hex": "#DCD1C6" },
  { "name": "Dark Emerald", "hex": "#0D5D57" },
  { "name": "Fuchsia Blooms", "hex": "#C0124E" },
  { "name": "Glacier", "hex": "#93B9C4" },
  { "name": "Guacamole", "hex": "#5C8446" },
  { "name": "Jasmine Green", "hex": "#96CD70" },
  { "name": "Laurel", "hex": "#A0A293" },
  { "name": "Lemon", "hex": "#F8C868" },
  { "name": "Orchid", "hex": "#D09CA8" },
  { "name": "Orchid Bloom", "hex": "#C1B0CC" },
  { "name": "Peach Pink", "hex": "#EF8969" },
  { "name": "Sphagnum", "hex": "#56583D" },
  { "name": "Walnut", "hex": "#503928" },
  { "name": "White Smoke", "hex": "#B4B7B9" }
]

const toggleWound = (id: number) => {
  const next = new Set(woundBobbins.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  woundBobbins.value = next
}

const moveUp = () => {
  if (currentRow.value === null) currentRow.value = gridData.value.length - 1
  else if (currentRow.value > 0) currentRow.value--
}

const moveDown = () => {
  if (currentRow.value === null) currentRow.value = 0
  else if (currentRow.value < gridData.value.length - 1) currentRow.value++
}

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

  const oklab1 = rgbToOklab(r1, g1, b1)
  const oklab2 = rgbToOklab(r2, g2, b2)

  const dL = oklab1.L - oklab2.L
  const da = oklab1.a - oklab2.a
  const db = oklab1.b - oklab2.b

  return Math.sqrt(dL * dL + da * da + db * db) * 333
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
        !(g.endIndex < group.startIndex - 1 || g.startIndex > group.endIndex + 1)
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
  const mapping = yarnMapping.value

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
      const yarnLength = (info.count * gauge.value * errorMargin.value) + headLength.value + tailLength.value
      const yarnLengthInches = Math.ceil(yarnLength)
      const yarn = mapping.get(info.color) || { name: 'Unknown', hex: '#000000' }

      return {
        id: groupId,
        color: yarn.hex,
        name: yarn.name,
        stitches: info.count,
        yarnLength: yarnLengthInches,
        bodyMeasurements: convertToBodyMeasurements(yarnLengthInches)
      }
    })
    .sort((a, b) => a.id - b.id)
})

const sortedBobbinInfo = computed(() => {
  return [...bobbinInfo.value].sort((a, b) => {
    const aWound = woundBobbins.value.has(a.id) ? 1 : 0
    const bWound = woundBobbins.value.has(b.id) ? 1 : 0
    return aWound - bWound || a.id - b.id
  })
})

const scrollToColor = (color: string) => {
  const element = document.getElementById(`palette-${color}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Briefly highlight the element
    element.style.outline = '3px solid var(--vp-c-brand-1)'
    element.style.outlineOffset = '4px'
    setTimeout(() => {
      element.style.outline = ''
      element.style.outlineOffset = ''
    }, 2000)
  }
}

const scrollToBobbin = (groupId: number) => {
  const element = document.getElementById(`bobbin-${groupId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Briefly highlight the element
    element.style.outline = '3px solid var(--vp-c-brand-1)'
    element.style.outlineOffset = '4px'
    setTimeout(() => {
      element.style.outline = ''
      element.style.outlineOffset = ''
    }, 2000)
  }
}

const rgbToOklab = (r: number, g: number, b: number): { L: number, a: number, b: number } => {
  // Convert to linear RGB
  const toLinear = (c: number) => {
    c = c / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)

  // Convert to Oklab
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  }
}

const oklabColorDistance = (hex1: string, hex2: string): number => {
  const rgb1 = hexToRgb(hex1)
  const rgb2 = hexToRgb(hex2)

  const oklab1 = rgbToOklab(rgb1.r, rgb1.g, rgb1.b)
  const oklab2 = rgbToOklab(rgb2.r, rgb2.g, rgb2.b)

  // Simple Euclidean distance in Oklab space
  const dL = oklab1.L - oklab2.L
  const da = oklab1.a - oklab2.a
  const db = oklab1.b - oklab2.b

  return Math.sqrt(dL * dL + da * da + db * db)
}

// Hungarian Algorithm for optimal assignment
const hungarianAlgorithm = (costMatrix: number[][]): number[] => {
  const n = costMatrix.length
  const m = costMatrix[0].length

  // Pad matrix to be square if needed
  const size = Math.max(n, m)
  const matrix = Array(size).fill(0).map(() => Array(size).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      matrix[i][j] = costMatrix[i][j]
    }
  }

  // Step 1: Row reduction
  for (let i = 0; i < size; i++) {
    const minVal = Math.min(...matrix[i])
    for (let j = 0; j < size; j++) {
      matrix[i][j] -= minVal
    }
  }

  // Step 2: Column reduction
  for (let j = 0; j < size; j++) {
    let minVal = Infinity
    for (let i = 0; i < size; i++) {
      minVal = Math.min(minVal, matrix[i][j])
    }
    for (let i = 0; i < size; i++) {
      matrix[i][j] -= minVal
    }
  }

  // Find optimal assignment using simple greedy on reduced matrix
  const rowAssignment = Array(size).fill(-1)
  const colUsed = Array(size).fill(false)

  // Assign zeros greedily
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (matrix[i][j] === 0 && !colUsed[j]) {
        rowAssignment[i] = j
        colUsed[j] = true
        break
      }
    }
  }

  // For any unassigned rows, find minimum cost
  for (let i = 0; i < n; i++) {
    if (rowAssignment[i] === -1) {
      let minJ = -1
      let minCost = Infinity
      for (let j = 0; j < m; j++) {
        if (!colUsed[j] && matrix[i][j] < minCost) {
          minCost = matrix[i][j]
          minJ = j
        }
      }
      if (minJ !== -1) {
        rowAssignment[i] = minJ
        colUsed[minJ] = true
      }
    }
  }

  return rowAssignment
}

const getOptimalYarnMapping = (patternColors: string[]): Map<string, typeof impeccableYarns[0]> => {
  const mapping = new Map<string, typeof impeccableYarns[0]>()

  // Build cost matrix: rows = pattern colors, columns = yarns
  const costMatrix: number[][] = []

  for (const patternColor of patternColors) {
    const patternHex = rgbaToHex(patternColor)
    const row: number[] = []
    for (const yarn of impeccableYarns) {
      const distance = oklabColorDistance(patternHex, yarn.hex)
      row.push(distance)
    }
    costMatrix.push(row)
  }

  // Run Hungarian algorithm
  const assignment = hungarianAlgorithm(costMatrix)

  // Build mapping from assignment
  for (let i = 0; i < patternColors.length; i++) {
    const yarnIndex = assignment[i]
    if (yarnIndex !== -1 && yarnIndex < impeccableYarns.length) {
      mapping.set(patternColors[i], impeccableYarns[yarnIndex])
    }
  }

  return mapping
}

const yarnMapping = computed(() => {
  return getOptimalYarnMapping(colorPalette.value)
})

const gridDataWithYarnColors = computed(() => {
  const mapping = yarnMapping.value
  return gridData.value.map(row =>
    row.map(patternColor => {
      const yarn = mapping.get(patternColor)
      return yarn ? yarn.hex : patternColor
    })
  )
})

const colorPaletteWithNames = computed(() => {
  const colors = colorPalette.value
  const colorStitchCount = new Map<string, number>()

  for (const row of gridData.value) {
    for (const color of row) {
      colorStitchCount.set(color, (colorStitchCount.get(color) || 0) + 1)
    }
  }

  const mapping = yarnMapping.value

  const result = colors.map(color => {
    const yarn = mapping.get(color) || { name: 'Unknown', hex: '#000000' }
    const stitches = colorStitchCount.get(color) || 0
    const yarnLengthInches = (stitches * gauge.value * errorMargin.value) + headLength.value + tailLength.value
    const yarnLengthYards = (yarnLengthInches / 36).toFixed(1)

    return {
      color,
      name: yarn.name,
      yarn: yarn,
      hex: rgbaToHex(color),
      stitches,
      yardage: yarnLengthYards
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
      currentRow.value = null
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

const hexToRgb = (hex: string): { r: number, g: number, b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

const rgbToHsv = (r: number, g: number, b: number): { h: number, s: number, v: number } => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : delta / max
  const v = max

  return { h, s, v }
}

const hsvColorDistance = (hex1: string, hex2: string): number => {
  const rgb1 = hexToRgb(hex1)
  const rgb2 = hexToRgb(hex2)
  const hsv1 = rgbToHsv(rgb1.r, rgb1.g, rgb1.b)
  const hsv2 = rgbToHsv(rgb2.r, rgb2.g, rgb2.b)

  // Handle hue circularity (0° = 360°)
  let dh = Math.abs(hsv1.h - hsv2.h)
  if (dh > 180) dh = 360 - dh

  // Normalize and weight: hue is most important, then saturation, then value
  const hueDist = dh / 180  // normalize to 0-1
  const satDist = Math.abs(hsv1.s - hsv2.s)
  const valDist = Math.abs(hsv1.v - hsv2.v)

  // Weight hue heavily to keep colors in same family
  return Math.sqrt(hueDist * hueDist * 5 + satDist * satDist + valDist * valDist)
}

const getNearestYarn = (rgba: string) => {
  const patternHex = rgbaToHex(rgba)
  if (!patternHex) return { name: 'Unknown', hex: '#000000' }

  return impeccableYarns.reduce((nearest, yarn) => {
    const dist = hsvColorDistance(patternHex, yarn.hex)
    const nearestDist = hsvColorDistance(patternHex, nearest.hex)
    return dist < nearestDist ? yarn : nearest
  })
}

const yarnToRgba = (yarn: { hex: string }) => {
  const rgb = hexToRgb(yarn.hex)
  return `rgba(${rgb.r},${rgb.g},${rgb.b},1)`
}
</script>

<template>
  <div class="crochet-pattern-importer">
    <div class="controls">
      <input ref="fileInput" type="file" accept="image/png" @change="handleFileUpload" style="display: none" />
      <button @click="triggerFileInput" class="upload-btn">
        Import PNG Pattern
      </button>
      <button v-if="gridData.length > 0" @click="printPage" class="print-btn">
        Print / Save as PDF
      </button>
      <div v-if="gridData.length > 0" class="row-nav">
        <button @click="moveUp" class="nav-btn" title="Previous row">▲</button>
        <span class="row-nav-label">
          {{ currentRow !== null ? `Row ${gridData.length - currentRow}` : '—' }}
        </span>
        <button @click="moveDown" class="nav-btn" title="Next row">▼</button>
      </div>
      <button @click="showSettings = !showSettings" class="settings-btn" title="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z">
          </path>
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
              <input id="color-threshold" type="range" min="0" max="100" v-model.number="colorThreshold" />
              <input type="number" min="0" max="100" v-model.number="colorThreshold" class="threshold-input" />
            </div>
            <p class="setting-description">
              Colors within this distance will be merged into one (0 = exact match, 100 = very loose matching)
            </p>
            <p class="setting-stat">
              Number of colors: <strong>{{ colorPalette.length }}</strong>
            </p>
          </div>
          <div class="setting-item">
            <label for="gauge">Gauge (in./st.)</label>
            <div class="setting-control">
              <input id="gauge" type="number" min="0.1" max="10" step="0.1" v-model.number="gauge"
                class="threshold-input" />
            </div>
            <p class="setting-description">
              Inches of yarn consumed per stitch
            </p>
          </div>
          <div class="setting-item">
            <label for="error-margin">Error Margin (multiplier)</label>
            <div class="setting-control">
              <input id="error-margin" type="number" min="1" max="2" step="0.05" v-model.number="errorMargin"
                class="threshold-input" />
            </div>
            <p class="setting-description">
              Multiplier applied to stitch yarn estimate to account for tension variation (e.g. 1.1 = 10% extra)
            </p>
          </div>
          <div class="setting-item">
            <label for="head-length">Head Length (in.)</label>
            <div class="setting-control">
              <input id="head-length" type="number" min="0" max="50" step="0.5" v-model.number="headLength"
                class="threshold-input" />
            </div>
            <p class="setting-description">
              Yarn left at the start of the bobbin
            </p>
          </div>
          <div class="setting-item">
            <label for="tail-length">Tail Length (in.)</label>
            <div class="setting-control">
              <input id="tail-length" type="number" min="0" max="50" step="0.5" v-model.number="tailLength"
                class="threshold-input" />
            </div>
            <p class="setting-description">
              Yarn left at the end of the bobbin
            </p>
          </div>
          <div class="setting-item">
            <label>User Height</label>
            <div class="setting-control">
              <input type="number" min="0" max="8" v-model.number="heightFeet" class="threshold-input"
                style="width: 3rem" />
              <span style="margin: 0 0.25rem">ft.</span>
              <input type="number" min="0" max="11" v-model.number="heightInches" class="threshold-input"
                style="width: 3rem" />
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
          <div class="setting-item">
            <label>Available Yarn Colors</label>
            <div class="yarn-palette">
              <div
                v-for="yarn in impeccableYarns"
                :key="yarn.name"
                class="yarn-chip"
                :title="yarn.name"
              >
                <div
                  class="yarn-chip-swatch"
                  :style="{ backgroundColor: yarn.hex }"
                />
                <span class="yarn-chip-name">{{ yarn.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <canvas ref="canvas" style="display: none"></canvas>

    <div v-if="gridData.length > 0" class="pattern-grid-container">
      <div class="pattern-grid">
        <div v-for="(row, rowIndex) in gridDataWithYarnColors" :key="rowIndex" class="pattern-row"
          :class="{ 'pattern-row-active': currentRow === rowIndex }" @click="currentRow = rowIndex">
          <div v-if="(gridDataWithYarnColors.length - rowIndex) % 2 === 0" class="row-counter row-counter-left">
            {{ gridDataWithYarnColors.length - rowIndex }}
          </div>
          <div v-for="(color, colIndex) in row" :key="colIndex" class="pattern-cell" :class="{
            'grid-left': colIndex % 10 === 0 && colIndex !== 0,
            'grid-top': rowIndex % 10 === 0 && rowIndex !== 0
          }" :style="{
            backgroundColor: color,
            boxShadow: [
              getCellBorders(rowIndex, colIndex).top ? `inset 0 2px 0 0 ${darkenColor(color)}` : null,
              getCellBorders(rowIndex, colIndex).right ? `inset -2px 0 0 0 ${darkenColor(color)}` : null,
              getCellBorders(rowIndex, colIndex).bottom ? `inset 0 -2px 0 0 ${darkenColor(color)}` : null,
              getCellBorders(rowIndex, colIndex).left ? `inset 2px 0 0 0 ${darkenColor(color)}` : null
            ].filter(Boolean).join(', ') || 'none'
          }">
            <span v-if="shouldShowGroupLabel(rowIndex, colIndex)" class="group-label group-label-link" :class="{
              'group-label-right': (gridDataWithYarnColors.length - rowIndex) % 2 === 1,
              'group-label-left': (gridDataWithYarnColors.length - rowIndex) % 2 === 0
            }" @click.stop="scrollToBobbin(getCellGroupInfo(rowIndex, colIndex)?.mergedGroupId || 0)">
              {{ getCellGroupInfo(rowIndex, colIndex)?.mergedGroupId }}
            </span>
          </div>
          <div v-if="(gridDataWithYarnColors.length - rowIndex) % 2 === 1" class="row-counter row-counter-right">
            {{ gridDataWithYarnColors.length - rowIndex }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>Import a PNG image to see your crochet pattern grid</p>
      <p class="hint">Each pixel will represent one stitch</p>
    </div>

    <div v-if="gridData.length > 0" class="bobbins-section">
      <h3>Color Groups ({{ sortedBobbinInfo.length }} total)</h3>
      <p class="bobbins-subheading">Max bobbins needed: {{ maxBobbinsInRow }}</p>
      <div class="bobbins-list">
        <div v-for="bobbin in sortedBobbinInfo" :key="bobbin.id" class="bobbin-item"
          :class="{ 'bobbin-wound': woundBobbins.has(bobbin.id) }" :id="`bobbin-${bobbin.id}`">
          <input type="checkbox" class="bobbin-checkbox" :checked="woundBobbins.has(bobbin.id)"
            @change="toggleWound(bobbin.id)" />
          <div class="bobbin-id" :style="{ backgroundColor: bobbin.color }">
            #{{ bobbin.id }}
          </div>
          <div class="bobbin-details">
            <div class="bobbin-name bobbin-name-link" @click="scrollToColor(bobbin.color)">{{ bobbin.name }}</div>
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
        <div v-for="(item, index) in colorPaletteWithNames" :key="index" class="palette-item" :id="`palette-${item.yarn.hex}`">
          <div class="palette-swatch-split">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <!-- Top-left triangle (PNG color) -->
              <polygon points="0,0 100,0 0,100" :fill="item.color" />
              <!-- Bottom-right triangle (Yarn color) -->
              <polygon points="100,0 100,100 0,100" :fill="yarnToRgba(item.yarn)" />
              <!-- Diagonal divider line -->
              <line x1="100" y1="0" x2="0" y2="100" stroke="var(--vp-c-border)" stroke-width="2" />
            </svg>
            <div class="swatch-label swatch-label-tl">PNG</div>
            <div class="swatch-label swatch-label-br">Yarn</div>
          </div>
          <div class="palette-info">
            <div class="palette-name">{{ item.name }}</div>
            <div class="palette-color">{{ item.hex }}</div>
            <div class="palette-stitches">{{ item.stitches }} stitches</div>
            <div class="palette-stitches">{{ item.yardage }} yards</div>
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

.row-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 1.25rem;
  padding: 0.25rem 0.75rem;
  background-color: var(--vp-c-bg-soft);
}

.nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--vp-c-text-1);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
}

.nav-btn:hover {
  background-color: var(--vp-c-bg-mute);
}

.row-nav-label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
  min-width: 4rem;
  text-align: center;
  color: var(--vp-c-text-1);
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
  max-height: 90vh;
  display: flex;
  flex-direction: column;
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
  overflow-y: auto;
  flex: 1;
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

.setting-stat {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-1);
}

.setting-stat strong {
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
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

.yarn-palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.5rem;
  max-height: 20rem;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
}

.yarn-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem;
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.yarn-chip-swatch {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.yarn-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vp-c-text-2);
  font-size: 0.7rem;
}

.pattern-grid-container {
  width: 95vw;
  margin-left: calc(50% - (95vw/2));
  padding: 0 1rem;
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
  cursor: pointer;
}

.pattern-row-active {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: -1px;
  z-index: 1;
  position: relative;
}

.pattern-cell {
  flex: 1;
  aspect-ratio: 1;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  position: relative;
}

.pattern-cell.grid-left {
  border-left: 2px solid rgba(0, 0, 0, 1.0);
}

.pattern-cell.grid-top {
  border-top: 2px solid rgba(0, 0, 0, 1.0);
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

.group-label-link {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.group-label-link:hover {
  transform: scale(1.2);
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
  /* border: 1px solid var(--vp-c-border); */
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
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  transition: background-color 0.15s ease, filter 0.2s ease, opacity 0.2s ease;
}

.bobbin-item:hover {
  background-color: var(--vp-c-bg-mute);
}

.bobbin-wound {
  filter: saturate(0.25);
  opacity: 0.6;
}

.bobbin-checkbox {
  align-self: center;
  width: 1.1rem;
  height: 1.1rem;
  cursor: pointer;
  flex-shrink: 0;
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

.bobbin-name-link {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--vp-c-brand-1);
  transition: color 0.2s ease;
}

.bobbin-name-link:hover {
  color: var(--vp-c-brand-1);
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

.palette-swatch-split {
  width: 4rem;
  height: 4rem;
  border-radius: 0.375rem;
  border: 1px solid var(--vp-c-border);
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

.palette-swatch-split svg {
  width: 100%;
  height: 100%;
  display: block;
}

.swatch-label {
  position: absolute;
  font-size: 0.625rem;
  font-weight: 600;
  color: white;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000;
  pointer-events: none;
}

.swatch-label-tl {
  top: 0.25rem;
  left: 0.25rem;
}

.swatch-label-br {
  bottom: 0.25rem;
  right: 0.25rem;
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
