<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { impeccableYarns, type ImpeccableYarn } from '../../utils/impeccable-yarns';
import {
  DEFAULT_COLOR_THRESHOLD,
  applyColorMapping,
  bobbinStitchCounts,
  buildColorMapping,
  buildColorMappingForTargetCount,
  computeColorGroups,
  convertToBodyMeasurements as toBodyMeasurements,
  filterSmallColorGroups,
  getYarnMappingWithOverrides,
  gridFromImageData,
  hexToRgb,
  maxBobbinsInRow as countMaxBobbinsInRow,
  mergeColorGroups,
  oklabColorDistance,
  rgbaToHex,
  sortColorsByFrequency,
  writePatternMetadata,
  yarnLengthInches,
  type ColorGroup,
} from '../../utils/intarsia';

const imageData = ref<ImageData | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const showSettings = ref(false);
const gauge = ref(2.1);
const errorMargin = ref(1.05);
const headLength = ref(5);
const tailLength = ref(10);
const heightFeet = ref(6);
const heightInches = ref(4);

const woundBobbins = ref(new Set<number>());
const currentRow = ref<number | null>(null);

const toggleWound = (id: number) => {
  const next = new Set(woundBobbins.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  woundBobbins.value = next;
};

const moveUp = () => {
  if (currentRow.value === null) currentRow.value = gridData.value.length - 1;
  else if (currentRow.value > 0) currentRow.value--;
};

const moveDown = () => {
  if (currentRow.value === null) currentRow.value = 0;
  else if (currentRow.value < gridData.value.length - 1) currentRow.value++;
};

const yardageSettings = computed(() => ({
  gauge: gauge.value,
  errorMargin: errorMargin.value,
  headLength: headLength.value,
  tailLength: tailLength.value,
}));

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value);
const fathom = computed(() => totalHeightInches.value);
const cubit = computed(() => (totalHeightInches.value / 4).toFixed(1));
const palm = computed(() => (totalHeightInches.value / 20).toFixed(1));

const convertToBodyMeasurements = (inches: number): string =>
  toBodyMeasurements(inches, totalHeightInches.value);

const rawGrid = computed(() => (imageData.value ? gridFromImageData(imageData.value) : []));

const sortedColorsByFrequency = computed(() => sortColorsByFrequency(rawGrid.value));

// Number of distinct colors in the source image, before any merging.
const rawColorCount = computed(() => sortedColorsByFrequency.value.length);

const defaultColorCount = computed(() => {
  if (sortedColorsByFrequency.value.length === 0) return 0;
  const mapping = buildColorMapping(sortedColorsByFrequency.value, DEFAULT_COLOR_THRESHOLD);
  return new Set(mapping.values()).size;
});

// null means "use this image's default count" — reset whenever a new image
// is loaded so each pattern starts from its own natural default.
const targetColorCount = ref<number | null>(null);

const effectiveTargetColorCount = computed(() => targetColorCount.value ?? defaultColorCount.value);

const targetColorCountInput = computed({
  get: () => effectiveTargetColorCount.value,
  set: (value: number) => {
    targetColorCount.value = value;
  },
});

// Can't usefully ask for more distinct pattern colors than there are raw
// colors to draw from, or more than there are physical yarns to assign them
// to (past that, the yarn-matching step runs out of yarns to hand out).
const maxColorCount = computed(() => {
  if (rawColorCount.value === 0) return 1;
  return Math.min(rawColorCount.value, impeccableYarns.length);
});

const incrementColorCount = () => {
  targetColorCount.value = Math.min(effectiveTargetColorCount.value + 1, maxColorCount.value);
};

const decrementColorCount = () => {
  targetColorCount.value = Math.max(effectiveTargetColorCount.value - 1, 1);
};

// Minimum total stitches (across the whole pattern) a post-merge color needs
// to survive as its own color, so a stray outlier hue doesn't get its own
// bobbin for just a stitch or two. Colors under this get folded into their
// nearest surviving neighbor. The default and bounds all scale with the
// pattern's size, since "5 stitches" means something very different on a
// 20-stitch-wide pattern than on a 200-stitch-wide one.
// Counts only real (non-transparent) pixels — an image with a transparent
// background shouldn't have its thresholds inflated by empty padding.
const totalStitchCount = computed(() =>
  sortedColorsByFrequency.value.reduce((sum, [, count]) => sum + count, 0)
);

const minMinStitchCount = computed(() => 1);
const maxMinStitchCount = computed(() =>
  Math.max(minMinStitchCount.value, Math.floor(totalStitchCount.value * 0.1))
);
const defaultMinStitchCount = computed(() => {
  const value = Math.max(1, Math.floor(totalStitchCount.value * 0.01));
  return Math.min(Math.max(value, minMinStitchCount.value), maxMinStitchCount.value);
});

const minStitchFilterEnabled = ref(true);

// null means "use this image's default" — reset whenever a new image is
// loaded so each pattern starts from its own natural default.
const minStitchCountOverride = ref<number | null>(null);

const effectiveMinStitchCount = computed(() => {
  const value = minStitchCountOverride.value ?? defaultMinStitchCount.value;
  return Math.min(Math.max(value, minMinStitchCount.value), maxMinStitchCount.value);
});

const minStitchCountInput = computed({
  get: () => effectiveMinStitchCount.value,
  set: (value: number) => {
    minStitchCountOverride.value = value;
  },
});

const incrementMinStitchCount = () => {
  minStitchCountOverride.value = Math.min(
    effectiveMinStitchCount.value + 1,
    maxMinStitchCount.value
  );
};

const decrementMinStitchCount = () => {
  minStitchCountOverride.value = Math.max(
    effectiveMinStitchCount.value - 1,
    minMinStitchCount.value
  );
};

const colorCountMapping = computed(() => {
  if (rawGrid.value.length === 0) return new Map<string, string>();
  return buildColorMappingForTargetCount(
    sortedColorsByFrequency.value,
    effectiveTargetColorCount.value
  );
});

const filteredColorMapping = computed(() => {
  if (!minStitchFilterEnabled.value) return colorCountMapping.value;
  return filterSmallColorGroups(
    colorCountMapping.value,
    sortedColorsByFrequency.value,
    effectiveMinStitchCount.value
  );
});

// How many colors the "Minimum Stitches" filter folded away, on top of
// whatever "Number of Colors" already merged — shown as a live stat.
const removedSmallColorCount = computed(() => {
  const beforeCount = new Set(colorCountMapping.value.values()).size;
  const afterCount = new Set(filteredColorMapping.value.values()).size;
  return Math.max(0, beforeCount - afterCount);
});

const gridData = computed(() => applyColorMapping(rawGrid.value, filteredColorMapping.value));

const colorGroups = computed(() => computeColorGroups(gridData.value));

const mergedColorGroups = computed(() => mergeColorGroups(colorGroups.value));

// Flat colIndex -> group lookup per row, so getCellGroupInfo is O(1) instead of
// scanning a row's groups on every call (it's called up to 5x per cell).
const cellGroupLookup = computed(() => {
  return mergedColorGroups.value.map((rowGroups) => {
    const lookup: ColorGroup[] = [];
    for (const group of rowGroups) {
      for (let col = group.startIndex; col <= group.endIndex; col++) {
        lookup[col] = group;
      }
    }
    return lookup;
  });
});

const getCellGroupInfo = (rowIndex: number, colIndex: number) => {
  return cellGroupLookup.value[rowIndex]?.[colIndex];
};

const shouldShowGroupLabel = (rowIndex: number, colIndex: number) => {
  const group = getCellGroupInfo(rowIndex, colIndex);
  if (!group || group.color === null) return false;

  const rowNumber = gridData.value.length - rowIndex;
  const isOddRow = rowNumber % 2 === 1;

  for (let r = gridData.value.length - 1; r >= rowIndex; r--) {
    const currentRowNumber = gridData.value.length - r;
    const currentIsOddRow = currentRowNumber % 2 === 1;
    const rowGroups = mergedColorGroups.value[r];

    for (const g of rowGroups) {
      if (g.mergedGroupId === group.mergedGroupId) {
        if (r === rowIndex) {
          if (currentIsOddRow) {
            return colIndex === g.endIndex;
          } else {
            return colIndex === g.startIndex;
          }
        }
        return false;
      }
    }
  }

  return false;
};

const getCellBorders = (rowIndex: number, colIndex: number) => {
  const group = getCellGroupInfo(rowIndex, colIndex);
  if (!group || group.color === null) {
    return { top: false, right: false, bottom: false, left: false };
  }

  const borders = {
    top: false,
    right: false,
    bottom: false,
    left: false,
  };

  const topGroup = rowIndex > 0 ? getCellGroupInfo(rowIndex - 1, colIndex) : null;
  const bottomGroup =
    rowIndex < gridData.value.length - 1 ? getCellGroupInfo(rowIndex + 1, colIndex) : null;
  const leftGroup = colIndex > 0 ? getCellGroupInfo(rowIndex, colIndex - 1) : null;
  const rightGroup =
    colIndex < gridData.value[rowIndex].length - 1
      ? getCellGroupInfo(rowIndex, colIndex + 1)
      : null;

  if (!topGroup || topGroup.mergedGroupId !== group.mergedGroupId) {
    borders.top = true;
  }
  if (!bottomGroup || bottomGroup.mergedGroupId !== group.mergedGroupId) {
    borders.bottom = true;
  }
  if (!leftGroup || leftGroup.mergedGroupId !== group.mergedGroupId) {
    borders.left = true;
  }
  if (!rightGroup || rightGroup.mergedGroupId !== group.mergedGroupId) {
    borders.right = true;
  }

  return borders;
};

const darkenColor = (color: string, amount: number = 0.3): string => {
  let r: number, g: number, b: number;

  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

  if (hexMatch) {
    r = parseInt(hexMatch[1], 16);
    g = parseInt(hexMatch[2], 16);
    b = parseInt(hexMatch[3], 16);
  } else if (rgbMatch) {
    r = parseInt(rgbMatch[1]);
    g = parseInt(rgbMatch[2]);
    b = parseInt(rgbMatch[3]);
  } else {
    return color;
  }

  const brightness = (r + g + b) / 3;

  if (brightness < 100) {
    return `rgb(${Math.min(255, r + 80)},${Math.min(255, g + 80)},${Math.min(255, b + 80)})`;
  } else {
    return `rgb(${Math.max(0, Math.floor(r * (1 - amount)))},${Math.max(0, Math.floor(g * (1 - amount)))},${Math.max(0, Math.floor(b * (1 - amount)))})`;
  }
};

// Tints the group-label pill with the cell's own yarn color (darkened
// heavily, so white text stays readable) instead of a neutral black, so the
// number visually ties back to its own bobbin's color.
const getLabelBackground = (color: string | null): string => {
  if (color === null) return 'transparent';
  const darkened = darkenColor(color, 0.65);
  const match = darkened.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return darkened;
  return `rgba(${match[1]},${match[2]},${match[3]},0.7)`;
};

const colorPalette = computed(() => {
  const colors = new Set<string>();
  for (const row of gridData.value) {
    for (const color of row) {
      if (color !== null) colors.add(color);
    }
  }
  return Array.from(colors);
});

const maxBobbinsInRow = computed(() => countMaxBobbinsInRow(mergedColorGroups.value));

const bobbinInfo = computed(() => {
  const groupStitches = bobbinStitchCounts(mergedColorGroups.value);
  const mapping = yarnMapping.value;

  return Array.from(groupStitches.entries())
    .map(([groupId, info]) => {
      const lengthInches = Math.ceil(yarnLengthInches(info.count, yardageSettings.value));
      const yarn = mapping.get(info.color) || { name: 'Unknown', hex: '#000000' };

      return {
        id: groupId,
        color: yarn.hex,
        name: yarn.name,
        stitches: info.count,
        yarnLength: lengthInches,
        bodyMeasurements: convertToBodyMeasurements(lengthInches),
      };
    })
    .sort((a, b) => a.id - b.id);
});

const sortedBobbinInfo = computed(() => {
  return [...bobbinInfo.value].sort((a, b) => {
    const aWound = woundBobbins.value.has(a.id) ? 1 : 0;
    const bWound = woundBobbins.value.has(b.id) ? 1 : 0;
    return aWound - bWound || a.id - b.id;
  });
});

const scrollToColor = (color: string) => {
  const element = document.getElementById(`palette-${color}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Briefly highlight the element
    element.style.outline = '3px solid var(--vp-c-brand-1)';
    element.style.outlineOffset = '4px';
    setTimeout(() => {
      element.style.outline = '';
      element.style.outlineOffset = '';
    }, 2000);
  }
};

const scrollToBobbin = (groupId: number) => {
  const element = document.getElementById(`bobbin-${groupId}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Briefly highlight the element
    element.style.outline = '3px solid var(--vp-c-brand-1)';
    element.style.outlineOffset = '4px';
    setTimeout(() => {
      element.style.outline = '';
      element.style.outlineOffset = '';
    }, 2000);
  }
};

// Yarns the user has hand-picked via the palette's swap popup, keyed by
// pattern color.
const yarnOverrides = ref(new Map<string, ImpeccableYarn>());

const yarnMapping = computed(() =>
  getYarnMappingWithOverrides(colorPalette.value, yarnOverrides.value)
);

// The pattern color whose swap popup is open, if any.
const swapTarget = ref<string | null>(null);

const swapCandidates = computed(() => {
  const target = swapTarget.value;
  if (target === null) return [];
  const used = new Set(Array.from(yarnMapping.value.values(), (yarn) => yarn.name));
  const targetHex = rgbaToHex(target);
  return impeccableYarns
    .filter((yarn) => !used.has(yarn.name))
    .map((yarn) => ({ yarn, distance: oklabColorDistance(targetHex, yarn.hex) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ yarn }) => yarn);
});

const swapYarn = (yarn: ImpeccableYarn) => {
  if (swapTarget.value === null) return;
  const next = new Map(yarnOverrides.value);
  next.set(swapTarget.value, yarn);
  yarnOverrides.value = next;
  swapTarget.value = null;
};

const gridDataWithYarnColors = computed(() => {
  const mapping = yarnMapping.value;
  return gridData.value.map((row) =>
    row.map((patternColor) => {
      if (patternColor === null) return null;
      const yarn = mapping.get(patternColor);
      return yarn ? yarn.hex : patternColor;
    })
  );
});

// Draws the pattern at its native pixel resolution (one canvas pixel per
// stitch) so the settings preview stays crisp when scaled up by CSS, letting
// the color-count change be judged without closing the settings pane. Empty
// (transparent) cells are simply left unpainted.
const drawPattern = (canvasEl: HTMLCanvasElement, grid: (string | null)[][]) => {
  const height = grid.length;
  const width = grid[0].length;
  canvasEl.width = width;
  canvasEl.height = height;

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = grid[y][x];
      if (color === null) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
};

watchEffect(() => {
  const canvasEl = previewCanvas.value;
  const grid = gridDataWithYarnColors.value;
  if (!canvasEl || grid.length === 0) return;
  drawPattern(canvasEl, grid);
});

// Base name of the imported file, for naming the downloaded .int.png.
const sourceFileName = ref('pattern');

// Saves the finished pattern (reduction, swaps and all) as an .int.png: one
// pixel per stitch in its yarn's color, with the yarn names embedded.
const downloadPattern = async () => {
  const grid = gridDataWithYarnColors.value;
  if (grid.length === 0) return;

  const canvasEl = document.createElement('canvas');
  drawPattern(canvasEl, grid);
  const blob = await new Promise<Blob | null>((resolve) => canvasEl.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const yarns: Record<string, string> = {};
  for (const yarn of yarnMapping.value.values()) yarns[yarn.hex.toLowerCase()] = yarn.name;
  const png = writePatternMetadata(new Uint8Array(await blob.arrayBuffer()), {
    version: 1,
    yarns,
  });

  const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sourceFileName.value}.int.png`;
  link.click();
  URL.revokeObjectURL(url);
};

const colorPaletteWithNames = computed(() => {
  const colors = colorPalette.value;
  const colorStitchCount = new Map<string, number>();

  for (const row of gridData.value) {
    for (const color of row) {
      if (color === null) continue;
      colorStitchCount.set(color, (colorStitchCount.get(color) || 0) + 1);
    }
  }

  const mapping = yarnMapping.value;

  const result = colors.map((color) => {
    const yarn = mapping.get(color) || { name: 'Unknown', hex: '#000000' };
    const stitches = colorStitchCount.get(color) || 0;
    const yarnLengthYards = (yarnLengthInches(stitches, yardageSettings.value) / 36).toFixed(1);

    return {
      color,
      name: yarn.name,
      yarn: yarn,
      hex: rgbaToHex(color),
      stitches,
      yardage: yarnLengthYards,
    };
  });

  return result.sort((a, b) => b.stitches - a.stitches);
});

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;
  sourceFileName.value = file.name.replace(/(\.int)?\.png$/i, '') || 'pattern';

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      if (!canvas.value) return;

      canvas.value.width = img.width;
      canvas.value.height = img.height;

      const ctx = canvas.value.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      imageData.value = ctx.getImageData(0, 0, img.width, img.height);
      currentRow.value = null;
      targetColorCount.value = null;
      minStitchCountOverride.value = null;
      yarnOverrides.value = new Map();
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const triggerFileInput = () => {
  fileInput.value?.click();
};

const printPage = () => {
  if (typeof window !== 'undefined') {
    window.print();
  }
};

const yarnToRgba = (yarn: { hex: string }) => {
  const rgb = hexToRgb(yarn.hex);
  return `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
};
</script>

<template>
  <div class="crochet-pattern-importer">
    <div class="controls">
      <input
        ref="fileInput"
        type="file"
        accept="image/png"
        style="display: none"
        @change="handleFileUpload"
      />
      <button class="upload-btn" @click="triggerFileInput">Import PNG Pattern</button>
      <button v-if="gridData.length > 0" class="print-btn" @click="printPage">
        Print / Save as PDF
      </button>
      <button v-if="gridData.length > 0" class="print-btn" @click="downloadPattern">
        Download .int.png
      </button>
      <div v-if="gridData.length > 0" class="row-nav">
        <button class="nav-btn" title="Previous row" @click="moveUp">▲</button>
        <span class="row-nav-label">
          {{ currentRow !== null ? `Row ${gridData.length - currentRow}` : '—' }}
        </span>
        <button class="nav-btn" title="Next row" @click="moveDown">▼</button>
      </div>
      <button class="settings-btn" title="Settings" @click="showSettings = !showSettings">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          ></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    </div>

    <div v-if="showSettings" class="settings-popup">
      <div class="settings-content">
        <div class="settings-header">
          <h3>Settings</h3>
          <button class="close-btn" @click="showSettings = false">×</button>
        </div>
        <div class="settings-body">
          <div class="setting-item">
            <label for="color-count">Number of Colors</label>
            <div class="setting-control">
              <input
                id="color-count"
                v-model.number="targetColorCountInput"
                type="range"
                min="1"
                :max="maxColorCount"
              />
              <button
                type="button"
                class="step-btn"
                :disabled="effectiveTargetColorCount <= 1"
                aria-label="Decrease number of colors"
                @click="decrementColorCount"
              >
                −
              </button>
              <input
                v-model.number="targetColorCountInput"
                type="number"
                min="1"
                :max="maxColorCount"
                class="threshold-input"
              />
              <button
                type="button"
                class="step-btn"
                :disabled="effectiveTargetColorCount >= maxColorCount"
                aria-label="Increase number of colors"
                @click="incrementColorCount"
              >
                +
              </button>
            </div>
            <p class="setting-description">
              Target number of colors in the pattern. Similar colors in the source image are merged
              together to reach this count — the Minimum Stitches filter below can then remove a few
              more, so the final count may end up slightly lower.
            </p>
          </div>
          <div class="setting-item">
            <div class="setting-item-header">
              <label for="min-stitches">Minimum Stitches</label>
              <label class="min-stitches-toggle">
                <input type="checkbox" v-model="minStitchFilterEnabled" />
                Enabled
              </label>
            </div>
            <div class="setting-control">
              <input
                id="min-stitches"
                v-model.number="minStitchCountInput"
                type="range"
                :min="minMinStitchCount"
                :max="maxMinStitchCount"
                :disabled="!minStitchFilterEnabled"
              />
              <button
                type="button"
                class="step-btn"
                :disabled="!minStitchFilterEnabled || effectiveMinStitchCount <= minMinStitchCount"
                aria-label="Decrease minimum stitches"
                @click="decrementMinStitchCount"
              >
                −
              </button>
              <input
                v-model.number="minStitchCountInput"
                type="number"
                :min="minMinStitchCount"
                :max="maxMinStitchCount"
                class="threshold-input"
                :disabled="!minStitchFilterEnabled"
              />
              <button
                type="button"
                class="step-btn"
                :disabled="!minStitchFilterEnabled || effectiveMinStitchCount >= maxMinStitchCount"
                aria-label="Increase minimum stitches"
                @click="incrementMinStitchCount"
              >
                +
              </button>
            </div>
            <p class="setting-description">
              Colors used fewer than this many stitches total are folded into their nearest
              neighboring color, instead of being left as a stray single-stitch color.
            </p>
            <p class="setting-stat">
              <template v-if="minStitchFilterEnabled">
                {{ removedSmallColorCount }} too small color{{
                  removedSmallColorCount === 1 ? '' : 's'
                }}
                removed
              </template>
              <template v-else>Filter disabled — no colors removed</template>
            </p>
            <canvas
              v-if="gridData.length > 0"
              ref="previewCanvas"
              class="color-preview-canvas"
            ></canvas>
          </div>
          <div class="setting-item">
            <label for="gauge">Gauge (in./st.)</label>
            <div class="setting-control">
              <input
                id="gauge"
                v-model.number="gauge"
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">Inches of yarn consumed per stitch</p>
          </div>
          <div class="setting-item">
            <label for="error-margin">Error Margin (multiplier)</label>
            <div class="setting-control">
              <input
                id="error-margin"
                v-model.number="errorMargin"
                type="number"
                min="1"
                max="2"
                step="0.05"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">
              Multiplier applied to stitch yarn estimate to account for tension variation (e.g. 1.1
              = 10% extra)
            </p>
          </div>
          <div class="setting-item">
            <label for="head-length">Head Length (in.)</label>
            <div class="setting-control">
              <input
                id="head-length"
                v-model.number="headLength"
                type="number"
                min="0"
                max="50"
                step="0.5"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">Yarn left at the start of the bobbin</p>
          </div>
          <div class="setting-item">
            <label for="tail-length">Tail Length (in.)</label>
            <div class="setting-control">
              <input
                id="tail-length"
                v-model.number="tailLength"
                type="number"
                min="0"
                max="50"
                step="0.5"
                class="threshold-input"
              />
            </div>
            <p class="setting-description">Yarn left at the end of the bobbin</p>
          </div>
          <div class="setting-item">
            <label>User Height</label>
            <div class="setting-control">
              <input
                v-model.number="heightFeet"
                type="number"
                min="0"
                max="8"
                class="threshold-input"
                style="width: 3rem"
              />
              <span style="margin: 0 0.25rem">ft.</span>
              <input
                v-model.number="heightInches"
                type="number"
                min="0"
                max="11"
                class="threshold-input"
                style="width: 3rem"
              />
              <span style="margin: 0 0.25rem">in.</span>
            </div>
            <p class="setting-description">Your height for body-based measurements</p>
          </div>
          <div class="setting-item body-measurements">
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Fathom" target="_blank" rel="noopener">
                Fathom (Wingspan)
              </a>
              <span>{{ fathom }} in.</span>
            </div>
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Cubit" target="_blank" rel="noopener">Cubit</a>
              <span>{{ cubit }} in.</span>
            </div>
            <div class="measurement-row">
              <a href="https://en.wikipedia.org/wiki/Hand_(unit)" target="_blank" rel="noopener">
                Palm
              </a>
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
                <div class="yarn-chip-swatch" :style="{ backgroundColor: yarn.hex }" />
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
        <div
          v-for="(row, rowIndex) in gridDataWithYarnColors"
          :key="rowIndex"
          class="pattern-row"
          :class="{ 'pattern-row-active': currentRow === rowIndex }"
          @click="currentRow = rowIndex"
        >
          <div
            v-if="(gridDataWithYarnColors.length - rowIndex) % 2 === 0"
            class="row-counter row-counter-left"
          >
            {{ gridDataWithYarnColors.length - rowIndex }}
          </div>
          <div
            v-for="(color, colIndex) in row"
            :key="colIndex"
            class="pattern-cell"
            :class="{
              'grid-left': colIndex % 10 === 0 && colIndex !== 0,
              'grid-top': rowIndex % 10 === 0 && rowIndex !== 0,
              'pattern-cell-empty': color === null,
            }"
            :style="
              color === null
                ? {}
                : {
                    backgroundColor: color,
                    boxShadow:
                      [
                        getCellBorders(rowIndex, colIndex).top
                          ? `inset 0 2px 0 0 ${darkenColor(color)}`
                          : null,
                        getCellBorders(rowIndex, colIndex).right
                          ? `inset -2px 0 0 0 ${darkenColor(color)}`
                          : null,
                        getCellBorders(rowIndex, colIndex).bottom
                          ? `inset 0 -2px 0 0 ${darkenColor(color)}`
                          : null,
                        getCellBorders(rowIndex, colIndex).left
                          ? `inset 2px 0 0 0 ${darkenColor(color)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'none',
                  }
            "
          >
            <span
              v-if="shouldShowGroupLabel(rowIndex, colIndex)"
              class="group-label group-label-link"
              :class="{
                'group-label-right': (gridDataWithYarnColors.length - rowIndex) % 2 === 1,
                'group-label-left': (gridDataWithYarnColors.length - rowIndex) % 2 === 0,
              }"
              :style="{ backgroundColor: getLabelBackground(color) }"
              @click.stop="scrollToBobbin(getCellGroupInfo(rowIndex, colIndex)?.mergedGroupId || 0)"
            >
              {{ getCellGroupInfo(rowIndex, colIndex)?.mergedGroupId }}
            </span>
          </div>
          <div
            v-if="(gridDataWithYarnColors.length - rowIndex) % 2 === 1"
            class="row-counter row-counter-right"
          >
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
        <div
          v-for="bobbin in sortedBobbinInfo"
          :id="`bobbin-${bobbin.id}`"
          :key="bobbin.id"
          class="bobbin-item"
          :class="{ 'bobbin-wound': woundBobbins.has(bobbin.id) }"
        >
          <input
            type="checkbox"
            class="bobbin-checkbox"
            :checked="woundBobbins.has(bobbin.id)"
            @change="toggleWound(bobbin.id)"
          />
          <div class="bobbin-id" :style="{ backgroundColor: bobbin.color }">#{{ bobbin.id }}</div>
          <div class="bobbin-details">
            <div class="bobbin-name bobbin-name-link" @click="scrollToColor(bobbin.color)">
              {{ bobbin.name }}
            </div>
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
          :id="`palette-${item.yarn.hex}`"
          :key="index"
          class="palette-item"
        >
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
          <button class="swap-btn" title="Swap yarn" @click="swapTarget = item.color">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m16 3 4 4-4 4"></path>
              <path d="M20 7H4"></path>
              <path d="m8 21-4-4 4-4"></path>
              <path d="M4 17h16"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div v-if="swapTarget !== null" class="settings-popup" @click.self="swapTarget = null">
      <div class="settings-content swap-content">
        <div class="settings-header">
          <h3>Swap {{ yarnMapping.get(swapTarget)?.name }}</h3>
          <button class="close-btn" @click="swapTarget = null">×</button>
        </div>
        <div class="settings-body">
          <p v-if="swapCandidates.length === 0" class="setting-description">
            Every yarn is already in the palette.
          </p>
          <button
            v-for="yarn in swapCandidates"
            :key="yarn.name"
            class="swap-option"
            @click="swapYarn(yarn)"
          >
            <span class="swap-option-swatch" :style="{ backgroundColor: yarn.hex }" />
            <span class="palette-name">{{ yarn.name }}</span>
            <span class="palette-color">{{ yarn.hex }}</span>
          </button>
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
  transition:
    background-color 0.25s,
    border-color 0.25s;
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
  transition:
    background-color 0.25s,
    border-color 0.25s;
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
  transition:
    background-color 0.25s,
    border-color 0.25s;
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
  transition:
    background-color 0.25s,
    color 0.25s;
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

.setting-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.setting-item-header label {
  margin-bottom: 0;
}

.setting-item .min-stitches-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.min-stitches-toggle input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.setting-control {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.setting-control input[type='range'] {
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
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.threshold-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 25%, transparent);
}

.step-btn {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.375rem;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.step-btn:hover:not(:disabled) {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.color-preview-canvas {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 0.75rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
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
  margin-left: calc(50% - (95vw / 2));
  padding: 0 1rem;
  overflow-x: auto;
}

.pattern-grid {
  display: inline-block;
  border: 1px solid var(--vp-c-border);
  width: fit-content;
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
  min-width: 1rem;
  min-height: 1rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  position: relative;
}

.pattern-cell.grid-left {
  border-left: 2px solid rgba(0, 0, 0, 1);
}

.pattern-cell.grid-top {
  border-top: 2px solid rgba(0, 0, 0, 1);
}

.pattern-cell-empty {
  background-color: transparent;
  background-image: repeating-linear-gradient(
    45deg,
    var(--vp-c-bg-soft) 0,
    var(--vp-c-bg-soft) 4px,
    transparent 4px,
    transparent 8px
  );
}

.group-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 0.875rem;
  padding: 0 0.1875rem;
  font-size: 0.625rem;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
  color: white;
  line-height: 1;
  white-space: nowrap;
  border-radius: 0.1875rem;
  z-index: 2;
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
  transform: translateY(-50%) scale(1.2);
  z-index: 3;
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
  transition:
    background-color 0.15s ease,
    filter 0.2s ease,
    opacity 0.2s ease;
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

.swap-btn {
  margin-left: auto;
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0.25rem;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--vp-c-text-3);
  display: flex;
  transition:
    background-color 0.25s,
    color 0.25s;
}

.swap-btn:hover {
  background-color: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.swap-content {
  max-width: 360px;
}

.swap-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.25s;
}

.swap-option:last-child {
  margin-bottom: 0;
}

.swap-option:hover {
  border-color: var(--vp-c-brand-1);
}

.swap-option-swatch {
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  border: 1px solid var(--vp-c-border);
  flex-shrink: 0;
}

.swap-option .palette-color {
  margin-left: auto;
}

@media print {
  .swap-btn {
    display: none;
  }
}
</style>
