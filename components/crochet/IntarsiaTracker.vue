<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { withBase } from 'vitepress';
import { type ImpeccableYarn } from '../../utils/impeccable-yarns';
import {
  bobbinStitchCounts,
  bytesToDataUrl,
  computeColorGroups,
  convertToBodyMeasurements as toBodyMeasurements,
  dataUrlToBytes,
  gridFromImageData,
  loadTrackerState,
  longestBobbinPerColor,
  maxBobbinsInRow as countMaxBobbinsInRow,
  mergeColorGroups,
  readPatternMetadata,
  resolvePatternYarns,
  saveTrackerState,
  yarnLengthInches,
  type ColorGroup,
  type Grid,
  type PatternMetadata,
} from '../../utils/intarsia';

const SETTINGS_STORAGE_KEY = 'intarsia-tracker-settings';

const fileInput = ref<HTMLInputElement | null>(null);
const showSettings = ref(false);
const gauge = ref(2.1);
const errorMargin = ref(1.05);
const headLength = ref(5);
const tailLength = ref(10);
const heightFeet = ref(6);
const heightInches = ref(4);

// The loaded pattern: its .int.png as a data URL (what gets saved), the
// stitch grid read from it, and the yarn names embedded in it.
const patternPng = ref<string | null>(null);
const patternFileName = ref('pattern');
const gridData = ref<Grid>([]);
const metadata = ref<PatternMetadata | null>(null);
const saveFailed = ref(false);

const woundBobbins = ref(new Set<number>());
const currentRow = ref<number | null>(null);

// Saving waits until the stored pattern has been loaded, so the empty
// initial state can't overwrite it.
const hydrated = ref(false);

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

// Reads a PNG data URL into a stitch grid (one pixel per stitch).
const decodePattern = (dataUrl: string): Promise<Grid> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvasEl = document.createElement('canvas');
      canvasEl.width = img.width;
      canvasEl.height = img.height;
      const ctx = canvasEl.getContext('2d');
      if (!ctx) return reject(new Error('Canvas is unavailable'));
      ctx.drawImage(img, 0, 0);
      resolve(gridFromImageData(ctx.getImageData(0, 0, img.width, img.height)));
    };
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = dataUrl;
  });

const loadPattern = async (dataUrl: string, fileName: string) => {
  gridData.value = await decodePattern(dataUrl);
  metadata.value = readPatternMetadata(dataUrlToBytes(dataUrl));
  patternPng.value = dataUrl;
  patternFileName.value = fileName;
};

onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
    if (saved) {
      const refs = { gauge, errorMargin, headLength, tailLength, heightFeet, heightInches };
      for (const [key, target] of Object.entries(refs)) {
        if (typeof saved[key] === 'number') target.value = saved[key];
      }
    }
  } catch {
    // Unreadable or unavailable storage — keep the defaults.
  }

  const state = loadTrackerState();
  if (state) {
    try {
      await loadPattern(state.png, state.fileName);
      currentRow.value = state.currentRow;
      woundBobbins.value = new Set(state.woundBobbins);
    } catch {
      // A stored pattern that no longer decodes is just dropped.
    }
  }
  hydrated.value = true;
});

watch([patternPng, currentRow, woundBobbins], () => {
  if (!hydrated.value || patternPng.value === null) return;
  saveFailed.value = !saveTrackerState({
    png: patternPng.value,
    fileName: patternFileName.value,
    currentRow: currentRow.value,
    woundBobbins: [...woundBobbins.value],
  });
});

watch([gauge, errorMargin, headLength, tailLength, heightFeet, heightInches], () => {
  if (!hydrated.value) return;
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        gauge: gauge.value,
        errorMargin: errorMargin.value,
        headLength: headLength.value,
        tailLength: tailLength.value,
        heightFeet: heightFeet.value,
        heightInches: heightInches.value,
      })
    );
  } catch {
    // ignore write failures (e.g. private browsing)
  }
});

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

const yarnMapping = computed(() => resolvePatternYarns(colorPalette.value, metadata.value));

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

// Each color's longest bobbin, by pattern color — worked from the skein.
const skeinBobbins = computed(() =>
  longestBobbinPerColor(bobbinStitchCounts(mergedColorGroups.value))
);

const skeinBobbinIds = computed(() => new Set(skeinBobbins.value.values()));

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
    .map((color) => {
      const yarn: ImpeccableYarn = mapping.get(color) || { name: 'Unknown', hex: '#000000' };
      const stitches = colorStitchCount.get(color) || 0;
      return {
        color,
        yarn,
        stitches,
        yardage: (yarnLengthInches(stitches, yardageSettings.value) / 36).toFixed(1),
      };
    })
    .sort((a, b) => b.stitches - a.stitches);
});

const hasProgress = computed(() => currentRow.value !== null || woundBobbins.value.size > 0);

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  // Clear the input so picking the same file again still fires a change.
  target.value = '';
  if (!file) return;

  if (
    hasProgress.value &&
    !window.confirm('Replace the current pattern? Your row and bobbin progress will be reset.')
  ) {
    return;
  }

  const dataUrl = bytesToDataUrl(new Uint8Array(await file.arrayBuffer()));
  try {
    await loadPattern(dataUrl, file.name.replace(/(\.int)?\.png$/i, '') || 'pattern');
  } catch {
    window.alert('Could not read that image.');
    return;
  }
  currentRow.value = null;
  woundBobbins.value = new Set();
};

const triggerFileInput = () => {
  fileInput.value?.click();
};

const printPage = () => {
  if (typeof window !== 'undefined') {
    window.print();
  }
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
      <button class="upload-btn" @click="triggerFileInput">Import .int.png</button>
      <button v-if="gridData.length > 0" class="print-btn" @click="printPage">
        Print / Save as PDF
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

    <p v-if="gridData.length > 0 && !metadata" class="pattern-note">
      This PNG wasn't made in the
      <a :href="withBase('/crochet/tools/intarsia/')">Pattern Maker</a>
      , so each of its colors was matched to the nearest yarn.
    </p>
    <p v-if="saveFailed" class="pattern-note">
      Couldn't save to this browser's storage, so progress will be lost on reload.
    </p>

    <div v-if="showSettings" class="settings-popup">
      <div class="settings-content">
        <div class="settings-header">
          <h3>Settings</h3>
          <button class="close-btn" @click="showSettings = false">×</button>
        </div>
        <div class="settings-body">
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
        </div>
      </div>
    </div>

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

    <div v-else-if="hydrated" class="empty-state">
      <p>Import an .int.png to track your progress on it</p>
      <p class="hint">
        Make one from any PNG in the
        <a :href="withBase('/crochet/tools/intarsia/')">Intarsia Pattern Maker</a>
      </p>
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
            <div class="bobbin-name-row">
              <div class="bobbin-name bobbin-name-link" @click="scrollToColor(bobbin.color)">
                {{ bobbin.name }}
              </div>
              <span
                v-if="skeinBobbinIds.has(bobbin.id)"
                class="skein-badge"
                title="Longest bobbin of this color: work it straight from the skein"
              >
                Skein
              </span>
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
          v-for="item in colorPaletteWithNames"
          :id="`palette-${item.yarn.hex}`"
          :key="item.color"
          class="palette-item"
        >
          <div class="palette-swatch" :style="{ backgroundColor: item.yarn.hex }" />
          <div class="palette-info">
            <div class="palette-name">{{ item.yarn.name }}</div>
            <div class="palette-color">{{ item.yarn.hex }}</div>
            <div class="palette-stitches">{{ item.stitches }} stitches</div>
            <div class="palette-stitches">{{ item.yardage }} yards</div>
            <div v-if="skeinBobbins.has(item.color)" class="palette-stitches">
              Pull from skein:
              <span class="skein-link" @click="scrollToBobbin(skeinBobbins.get(item.color) || 0)">
                #{{ skeinBobbins.get(item.color) }}
              </span>
            </div>
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

.bobbin-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.skein-badge {
  padding: 0.0625rem 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 0.625rem;
  white-space: nowrap;
}

.skein-link {
  color: var(--vp-c-brand-1);
  cursor: pointer;
}

.skein-link:hover {
  text-decoration: underline;
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

.pattern-note {
  margin: -0.5rem 0 1.25rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.palette-swatch {
  width: 4rem;
  height: 4rem;
  border-radius: 0.375rem;
  border: 1px solid var(--vp-c-border);
  flex-shrink: 0;
}

@media print {
  .pattern-note {
    display: none;
  }
}
</style>
