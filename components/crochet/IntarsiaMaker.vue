<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { useRouter, withBase } from 'vitepress';
import {
  impeccableYarns,
  sortYarnsByColor,
  type ImpeccableYarn,
} from '../../utils/impeccable-yarns';
import {
  DEFAULT_COLOR_THRESHOLD,
  applyColorMapping,
  applyStitchEdits,
  buildColorMapping,
  buildColorMappingForTargetCount,
  bytesToDataUrl,
  dataUrlToBytes,
  filterSmallColorGroups,
  getYarnMappingWithOverrides,
  gridFromImageData,
  hexToRgb,
  loadTrackerState,
  replacementColors,
  oklabColorDistance,
  readPatternMetadata,
  rgbaToHex,
  saveTrackerState,
  singleStitches,
  stitchKey,
  sortColorsByFrequency,
  trackerHasProgress,
  writePatternMetadata,
  type Grid,
  type Stitch,
} from '../../utils/intarsia';

const router = useRouter();

const imageData = ref<ImageData | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

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

const reducedGrid = computed(() => applyColorMapping(rawGrid.value, filteredColorMapping.value));

// Stitches the user has recolored to a neighbor's color, keyed by stitchKey.
// Applied before yarn matching, so swaps and the export pick them up.
const stitchEdits = ref(new Map<string, string>());

const gridData = computed(() => applyStitchEdits(reducedGrid.value, stitchEdits.value));

const showSingleStitches = ref(false);

const singleStitchList = computed(() => singleStitches(gridData.value));

const singleStitchKeys = computed(() => new Set(singleStitchList.value.map(stitchKey)));

// Edits that still change something; ones made before a color-count change
// can stop applying (see applyStitchEdits).
const activeEdits = computed(() => {
  const stitches: Stitch[] = [];
  for (const [key, color] of stitchEdits.value) {
    const [x, y] = key.split(',').map(Number);
    if (gridData.value[y]?.[x] === color && reducedGrid.value[y]?.[x] !== color) {
      stitches.push({ x, y });
    }
  }
  return stitches;
});

// The stitch whose recolor popup is open, if any.
const editTarget = ref<Stitch | null>(null);

const editOptions = computed(() => {
  const target = editTarget.value;
  if (target === null) return [];
  return replacementColors(gridData.value, target).map((color) => ({
    color,
    yarn: yarnMapping.value.get(color) || { name: 'Unknown', hex: rgbaToHex(color) },
  }));
});

const editTargetYarn = computed(() => {
  const target = editTarget.value;
  const color = target && gridData.value[target.y]?.[target.x];
  return color ? yarnMapping.value.get(color) : undefined;
});

const editTargetIsEdited = computed(
  () => editTarget.value !== null && stitchEdits.value.has(stitchKey(editTarget.value))
);

const recolorStitch = (color: string | null) => {
  const target = editTarget.value;
  if (target === null) return;
  const next = new Map(stitchEdits.value);
  if (color === null) next.delete(stitchKey(target));
  else next.set(stitchKey(target), color);
  stitchEdits.value = next;
  editTarget.value = null;
};

const handlePreviewClick = (event: MouseEvent) => {
  const canvasEl = previewCanvas.value;
  if (!showSingleStitches.value || !canvasEl || gridData.value.length === 0) return;
  const rect = canvasEl.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * gridData.value[0].length);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * gridData.value.length);
  const stitch = { x, y };
  if (singleStitchKeys.value.has(stitchKey(stitch)) || stitchEdits.value.has(stitchKey(stitch))) {
    editTarget.value = stitch;
  }
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

// Pixels per stitch in the on-page preview: enough that the pattern's longer
// side is drawn at least PREVIEW_TARGET_SIZE px, so it stays sharp when CSS
// stretches it to the page width, and outlines stay crisp.
const PREVIEW_TARGET_SIZE = 1600;
const previewCellSize = computed(() => {
  const grid = gridData.value;
  const longestSide = Math.max(grid.length, grid[0]?.length ?? 0, 1);
  return Math.max(12, Math.ceil(PREVIEW_TARGET_SIZE / longestSide));
});

// Draws one cellSize-square per stitch. Empty (transparent) cells are left
// unpainted.
const drawPattern = (canvasEl: HTMLCanvasElement, grid: Grid, cellSize = 1) => {
  const height = grid.length;
  const width = grid[0].length;
  canvasEl.width = width * cellSize;
  canvasEl.height = height * cellSize;

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = grid[y][x];
      if (color === null) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
};

// Rings each stitch, dark outside and `color` inside so it shows on any
// stitch color.
const outlineStitches = (
  canvasEl: HTMLCanvasElement,
  stitches: Stitch[],
  cellSize: number,
  color: string
) => {
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  for (const [style, width, inset] of [
    ['rgba(0,0,0,0.85)', 3, 1.5],
    [color, 1.5, 1.5],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const { x, y } of stitches) {
      ctx.strokeRect(
        x * cellSize + inset,
        y * cellSize + inset,
        cellSize - inset * 2,
        cellSize - inset * 2
      );
    }
  }
};

watchEffect(() => {
  const canvasEl = previewCanvas.value;
  const grid = gridDataWithYarnColors.value;
  if (!canvasEl || grid.length === 0) return;
  drawPattern(canvasEl, grid, previewCellSize.value);
  if (showSingleStitches.value) {
    outlineStitches(canvasEl, singleStitchList.value, previewCellSize.value, '#facc15');
    outlineStitches(canvasEl, activeEdits.value, previewCellSize.value, 'rgba(255,255,255,0.95)');
  }
});

// Base name of the imported file, for naming the downloaded .int.png.
const sourceFileName = ref('pattern');

// The finished pattern (reduction, swaps and all) as .int.png bytes: one
// pixel per stitch in its yarn's color, with the yarn names embedded.
const buildPatternPng = async (): Promise<Uint8Array<ArrayBuffer> | null> => {
  const grid = gridDataWithYarnColors.value;
  if (grid.length === 0) return null;

  const canvasEl = document.createElement('canvas');
  drawPattern(canvasEl, grid);
  const blob = await new Promise<Blob | null>((resolve) => canvasEl.toBlob(resolve, 'image/png'));
  if (!blob) return null;

  const yarns: Record<string, string> = {};
  for (const yarn of yarnMapping.value.values()) yarns[yarn.hex.toLowerCase()] = yarn.name;
  return writePatternMetadata(new Uint8Array(await blob.arrayBuffer()), { version: 1, yarns });
};

const downloadPattern = async () => {
  const png = await buildPatternPng();
  if (!png) return;

  const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sourceFileName.value}.int.png`;
  link.click();
  URL.revokeObjectURL(url);
};

const openInTracker = async () => {
  if (
    trackerHasProgress(loadTrackerState()) &&
    !window.confirm(
      'The Tracker already has a pattern in progress. Replace it? Its row and bobbin progress will be reset.'
    )
  ) {
    return;
  }

  const png = await buildPatternPng();
  if (!png) return;

  const saved = saveTrackerState({
    png: bytesToDataUrl(png),
    fileName: sourceFileName.value,
    currentRow: null,
    woundBobbins: [],
  });
  if (!saved) {
    window.alert(
      "Couldn't save to this browser's storage. Download the .int.png and import it in the Tracker instead."
    );
    return;
  }
  router.go(withBase('/crochet/tools/intarsia/tracker'));
};

const colorPaletteWithNames = computed(() => {
  const colorStitchCount = new Map<string, number>();
  for (const row of gridData.value) {
    for (const color of row) {
      if (color === null) continue;
      colorStitchCount.set(color, (colorStitchCount.get(color) || 0) + 1);
    }
  }

  const mapping = yarnMapping.value;
  return colorPalette.value
    .map((color) => ({
      color,
      yarn: mapping.get(color) || { name: 'Unknown', hex: '#000000' },
      hex: rgbaToHex(color),
      stitches: colorStitchCount.get(color) || 0,
    }))
    .sort((a, b) => b.stitches - a.stitches);
});

const yarnsByColor = sortYarnsByColor(impeccableYarns);

// Colors actually in the pattern, after the Minimum Stitches filter and
// stitch edits — can be lower than the number allowed.
const actualColorCount = computed(() => colorPalette.value.length);

const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;
  // An .int.png has already had its colors squashed, so start it with every
  // color allowed and no small-color filtering rather than merging it further.
  let isIntPng = /\.int\.png$/i.test(file.name);
  sourceFileName.value = file.name.replace(/(\.int)?\.png$/i, '') || 'pattern';

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    isIntPng ||= readPatternMetadata(dataUrlToBytes(dataUrl)) !== null;
    const img = new Image();
    img.onload = () => {
      if (!canvas.value) return;

      canvas.value.width = img.width;
      canvas.value.height = img.height;

      const ctx = canvas.value.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      imageData.value = ctx.getImageData(0, 0, img.width, img.height);
      targetColorCount.value = isIntPng ? maxColorCount.value : null;
      minStitchFilterEnabled.value = !isIntPng;
      minStitchCountOverride.value = null;
      yarnOverrides.value = new Map();
      stitchEdits.value = new Map();
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
};

const triggerFileInput = () => {
  fileInput.value?.click();
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
      <button class="upload-btn" @click="triggerFileInput">Import PNG</button>
      <button v-if="gridData.length > 0" class="print-btn" @click="downloadPattern">
        Download .int.png
      </button>
      <button v-if="gridData.length > 0" class="print-btn" @click="openInTracker">
        Open in Tracker
      </button>
    </div>

    <canvas ref="canvas" style="display: none"></canvas>

    <div v-if="gridData.length > 0">
      <div class="preview-pane">
        <canvas
          ref="previewCanvas"
          class="pattern-preview"
          :class="{ 'pattern-preview-editing': showSingleStitches }"
          @click="handlePreviewClick"
        ></canvas>
      </div>
      <div class="maker-settings">
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
          <p class="setting-stat">
            {{ effectiveTargetColorCount }} colors allowed · {{ actualColorCount }} actually used
          </p>
        </div>
        <div class="setting-item">
          <div class="setting-item-header">
            <label for="min-stitches">Minimum Stitches</label>
            <label class="min-stitches-toggle">
              <input v-model="minStitchFilterEnabled" type="checkbox" />
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
        </div>
        <div class="setting-item">
          <div class="setting-item-header">
            <label for="single-stitches">Single Stitches</label>
            <label class="min-stitches-toggle">
              <input id="single-stitches" v-model="showSingleStitches" type="checkbox" />
              Highlight
            </label>
          </div>
          <p class="setting-description">
            Color groups (bobbins) that are just one stitch. Highlight them (yellow rings), then
            click one to recolor it to a neighboring color. Edited stitches get white rings; click
            one again to undo.
          </p>
          <p class="setting-stat">
            {{ singleStitchList.length }} single stitch{{
              singleStitchList.length === 1 ? '' : 'es'
            }}
            <template v-if="activeEdits.length > 0">
              · {{ activeEdits.length }} edited
              <button type="button" class="link-btn" @click="stitchEdits = new Map()">Reset</button>
            </template>
          </p>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>Import a PNG image to turn it into an intarsia pattern</p>
      <p class="hint">Each pixel will represent one stitch</p>
    </div>

    <div v-if="gridData.length > 0" class="palette-section">
      <h3>Color Palette</h3>
      <div class="palette-grid">
        <div v-for="item in colorPaletteWithNames" :key="item.color" class="palette-item">
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
            <div class="palette-name">{{ item.yarn.name }}</div>
            <div class="palette-color">{{ item.hex }}</div>
            <div class="palette-stitches">{{ item.stitches }} stitches</div>
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

    <details v-if="gridData.length > 0" class="yarns-details">
      <summary>Available yarn colors ({{ impeccableYarns.length }})</summary>
      <div class="yarn-palette">
        <div v-for="yarn in yarnsByColor" :key="yarn.name" class="yarn-chip" :title="yarn.name">
          <div class="yarn-chip-swatch" :style="{ backgroundColor: yarn.hex }" />
          <span class="yarn-chip-name">{{ yarn.name }}</span>
        </div>
      </div>
    </details>

    <div v-if="editTarget !== null" class="settings-popup" @click.self="editTarget = null">
      <div class="settings-content swap-content">
        <div class="settings-header">
          <h3>Recolor {{ editTargetYarn?.name }} stitch</h3>
          <button class="close-btn" @click="editTarget = null">×</button>
        </div>
        <div class="settings-body">
          <p v-if="editOptions.length === 0 && !editTargetIsEdited" class="setting-description">
            No neighboring color would join this stitch to a larger color group.
          </p>
          <button
            v-for="option in editOptions"
            :key="option.color"
            class="swap-option"
            @click="recolorStitch(option.color)"
          >
            <span class="swap-option-swatch" :style="{ backgroundColor: option.yarn.hex }" />
            <span class="palette-name">{{ option.yarn.name }}</span>
            <span class="palette-color">{{ option.yarn.hex }}</span>
          </button>
          <button v-if="editTargetIsEdited" class="swap-option" @click="recolorStitch(null)">
            <span class="palette-name">Undo edit</span>
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

.preview-pane {
  display: flex;
  justify-content: center;
  padding: 1rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.75rem;
  background-color: var(--vp-c-bg-soft);
}

.pattern-preview {
  display: block;
  max-width: 100%;
  max-height: 80vh;
}

.pattern-preview-editing {
  cursor: pointer;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--vp-c-brand-1);
  cursor: pointer;
}

.link-btn:hover {
  text-decoration: underline;
}

.maker-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.maker-settings .setting-item {
  margin-bottom: 0;
  padding: 1.25rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.75rem;
}

.yarns-details {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--vp-c-border);
}

.yarns-details summary {
  margin-bottom: 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  cursor: pointer;
}
</style>
