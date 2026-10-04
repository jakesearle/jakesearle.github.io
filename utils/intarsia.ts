// Pure pattern logic shared by the intarsia Maker and Tracker: color math,
// color reduction, yarn matching, bobbin grouping, and the .int.png format.

import { impeccableYarns, type ImpeccableYarn } from './impeccable-yarns';

// A pattern is a grid of stitch colors, top row first; null is "no stitch".
// Colors are `rgba(r,g,b,1)` strings as read from the source image.
export type Grid = (string | null)[][];

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

const RGB_PATTERN = /rgba?\((\d+),\s*(\d+),\s*(\d+)/;

export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

export const rgbaToHex = (rgba: string): string => {
  const match = rgba.match(RGB_PATTERN);
  if (!match) return rgba;

  return (
    '#' +
    [match[1], match[2], match[3]]
      .map((x) => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
};

export const hexToRgba = (hex: string): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},1)`;
};

export const rgbToOklab = (
  r: number,
  g: number,
  b: number
): { L: number; a: number; b: number } => {
  // Convert to linear RGB
  const toLinear = (c: number) => {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Convert to Oklab
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
};

// Plain Oklab distance between two `rgba(...)` colors, scaled so the merge
// thresholds read as small integers. Used for merging pattern colors.
export const colorDistance = (color1: string, color2: string): number => {
  const match1 = color1.match(RGB_PATTERN);
  const match2 = color2.match(RGB_PATTERN);

  if (!match1 || !match2) return Infinity;

  const oklab1 = rgbToOklab(parseInt(match1[1]), parseInt(match1[2]), parseInt(match1[3]));
  const oklab2 = rgbToOklab(parseInt(match2[1]), parseInt(match2[2]), parseInt(match2[3]));

  const dL = oklab1.L - oklab2.L;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;

  return Math.sqrt(dL * dL + da * da + db * db) * 333;
};

// Oklab distance between two hex colors with chroma boosted, so hue
// differences count for more. Used for matching pattern colors to yarns.
export const oklabColorDistance = (hex1: string, hex2: string): number => {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  const lab1 = rgbToOklab(rgb1.r, rgb1.g, rgb1.b);
  const lab2 = rgbToOklab(rgb2.r, rgb2.g, rgb2.b);

  const hueEmphasis = 1.5; // increase to weight hue more heavily

  // Convert to OKLCh to isolate chroma, then boost it
  const C1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const h1 = Math.atan2(lab1.b, lab1.a);
  const C2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const h2 = Math.atan2(lab2.b, lab2.a);

  // Reconstruct boosted a/b from amplified chroma
  const a1 = C1 * hueEmphasis * Math.cos(h1);
  const b1 = C1 * hueEmphasis * Math.sin(h1);
  const a2 = C2 * hueEmphasis * Math.cos(h2);
  const b2 = C2 * hueEmphasis * Math.sin(h2);

  const dL = lab1.L - lab2.L;
  const da = a1 - a2;
  const db = b1 - b2;

  return Math.sqrt(dL * dL + da * da + db * db);
};

// ---------------------------------------------------------------------------
// Reading an image
// ---------------------------------------------------------------------------

// Pixels this transparent or more are treated as "no stitch" rather than a
// real color — a fully transparent pixel's RGB channels are meaningless (often
// (0,0,0), i.e. black) and shouldn't become part of the pattern.
export const TRANSPARENCY_ALPHA_THRESHOLD = 128;

export const gridFromImageData = (image: {
  width: number;
  height: number;
  data: ArrayLike<number>;
}): Grid => {
  const { width, height, data } = image;
  const grid: Grid = [];

  for (let y = 0; y < height; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < TRANSPARENCY_ALPHA_THRESHOLD) {
        row.push(null);
      } else {
        row.push(`rgba(${data[index]},${data[index + 1]},${data[index + 2]},1)`);
      }
    }
    grid.push(row);
  }

  return grid;
};

export const sortColorsByFrequency = (grid: Grid): [string, number][] => {
  const colorCounts = new Map<string, number>();
  for (const row of grid) {
    for (const color of row) {
      if (color === null) continue;
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    }
  }
  return Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
};

// ---------------------------------------------------------------------------
// Color reduction
// ---------------------------------------------------------------------------

// Greedily merges each color (in frequency order) into the first prior color
// within `threshold` of it, otherwise it becomes its own representative.
export const buildColorMapping = (
  sortedColors: [string, number][],
  threshold: number
): Map<string, string> => {
  const colorMapping = new Map<string, string>();

  for (const [color] of sortedColors) {
    let mapped = false;
    for (const [mappedColor] of colorMapping) {
      if (colorDistance(color, mappedColor) < threshold) {
        colorMapping.set(color, mappedColor);
        mapped = true;
        break;
      }
    }
    if (!mapped) {
      colorMapping.set(color, color);
    }
  }

  return colorMapping;
};

// colorDistance is monotonic non-increasing in threshold (a larger gap can
// only merge more colors), so a larger threshold never yields more distinct
// colors than a smaller one — binary search is well-defined here.
const MAX_MERGE_THRESHOLD = 500;
const BINARY_SEARCH_ITERATIONS = 24;

export const buildColorMappingForTargetCount = (
  sortedColors: [string, number][],
  targetCount: number
): Map<string, string> => {
  if (sortedColors.length === 0) return new Map();
  if (targetCount >= sortedColors.length) return buildColorMapping(sortedColors, 0);

  let low = 0;
  let high = MAX_MERGE_THRESHOLD;
  let bestMapping = buildColorMapping(sortedColors, high);

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const mapping = buildColorMapping(sortedColors, mid);
    const count = new Set(mapping.values()).size;
    if (count <= targetCount) {
      high = mid;
      bestMapping = mapping;
    } else {
      low = mid;
    }
  }

  return bestMapping;
};

// The distance threshold this planner used before "Number of Colors" replaced
// it as the control — kept so a freshly loaded image starts at the same
// merge behavior a user would have gotten before, just expressed as a count.
export const DEFAULT_COLOR_THRESHOLD = 15;

export const filterSmallColorGroups = (
  mapping: Map<string, string>,
  sortedColors: [string, number][],
  minStitches: number
): Map<string, string> => {
  if (minStitches <= 1) return mapping;

  const repStitchCounts = new Map<string, number>();
  for (const [color, count] of sortedColors) {
    const rep = mapping.get(color) ?? color;
    repStitchCounts.set(rep, (repStitchCounts.get(rep) || 0) + count);
  }

  const qualifyingReps = new Set(
    Array.from(repStitchCounts.entries())
      .filter(([, count]) => count >= minStitches)
      .map(([rep]) => rep)
  );

  // If every color would get filtered out, the threshold is too aggressive
  // for this pattern — leave the mapping alone rather than erasing everything.
  if (qualifyingReps.size === 0) return mapping;

  const reassignedRep = new Map<string, string>();
  for (const rep of repStitchCounts.keys()) {
    if (qualifyingReps.has(rep)) {
      reassignedRep.set(rep, rep);
      continue;
    }
    let nearestRep = rep;
    let nearestDistance = Infinity;
    for (const candidate of qualifyingReps) {
      const distance = colorDistance(rep, candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRep = candidate;
      }
    }
    reassignedRep.set(rep, nearestRep);
  }

  const filteredMapping = new Map<string, string>();
  for (const [color, rep] of mapping) {
    filteredMapping.set(color, reassignedRep.get(rep) ?? rep);
  }
  return filteredMapping;
};

export const applyColorMapping = (grid: Grid, mapping: Map<string, string>): Grid =>
  grid.map((row) => row.map((color) => (color === null ? null : mapping.get(color) || color)));

// ---------------------------------------------------------------------------
// Yarn matching
// ---------------------------------------------------------------------------

// Hungarian Algorithm (Kuhn-Munkres, O(size^3)) for optimal assignment.
// Pattern colors are rows, yarns are columns; padded to square with zero-cost
// dummy entries so every row still gets a real assignment when possible.
export const hungarianAlgorithm = (costMatrix: number[][]): number[] => {
  const n = costMatrix.length;
  if (n === 0) return [];

  const m = costMatrix[0].length;
  const size = Math.max(n, m);

  const cost = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i < n && j < m ? costMatrix[i][j] : 0))
  );

  // 1-indexed internally, as is standard for this algorithm.
  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0); // p[j] = row currently assigned to column j
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(size + 1).fill(Infinity);
    const used = new Array(size + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowAssignment = Array(n).fill(-1);
  for (let j = 1; j <= size; j++) {
    const i = p[j] - 1;
    if (i >= 0 && i < n && j - 1 < m) {
      rowAssignment[i] = j - 1;
    }
  }

  return rowAssignment;
};

// Assigns each pattern color its own yarn, minimizing total color distance.
export const getOptimalYarnMapping = (
  patternColors: string[],
  yarns: ImpeccableYarn[] = impeccableYarns
): Map<string, ImpeccableYarn> => {
  const mapping = new Map<string, ImpeccableYarn>();

  // Build cost matrix: rows = pattern colors, columns = yarns
  const costMatrix = patternColors.map((patternColor) => {
    const patternHex = rgbaToHex(patternColor);
    return yarns.map((yarn) => oklabColorDistance(patternHex, yarn.hex));
  });

  const assignment = hungarianAlgorithm(costMatrix);

  for (let i = 0; i < patternColors.length; i++) {
    const yarnIndex = assignment[i];
    if (yarnIndex !== -1 && yarnIndex < yarns.length) {
      mapping.set(patternColors[i], yarns[yarnIndex]);
    }
  }

  return mapping;
};

// Optimal yarn matching, except colors in `overrides` keep their hand-picked
// yarn. The rest are matched against the yarns nobody has claimed, so no two
// pattern colors ever share a yarn.
export const getYarnMappingWithOverrides = (
  patternColors: string[],
  overrides: Map<string, ImpeccableYarn>,
  yarns: ImpeccableYarn[] = impeccableYarns
): Map<string, ImpeccableYarn> => {
  const kept = new Map<string, ImpeccableYarn>();
  for (const color of patternColors) {
    const yarn = overrides.get(color);
    if (yarn) kept.set(color, yarn);
  }
  const claimed = new Set(Array.from(kept.values(), (yarn) => yarn.name));
  const mapping = getOptimalYarnMapping(
    patternColors.filter((color) => !kept.has(color)),
    yarns.filter((yarn) => !claimed.has(yarn.name))
  );
  for (const [color, yarn] of kept) mapping.set(color, yarn);
  return mapping;
};

// ---------------------------------------------------------------------------
// Bobbin groups
// ---------------------------------------------------------------------------

export interface ColorGroup {
  color: string | null;
  startIndex: number;
  endIndex: number;
  groupNumber: number;
  mergedGroupId: number;
}

// Splits each row into runs of one color.
export const computeColorGroups = (grid: Grid): ColorGroup[][] => {
  const groups: ColorGroup[][] = [];

  for (const row of grid) {
    const rowGroups: ColorGroup[] = [];
    let currentColor = row[0];
    let startIndex = 0;
    let groupNumber = 1;

    for (let i = 1; i <= row.length; i++) {
      if (i === row.length || row[i] !== currentColor) {
        rowGroups.push({
          color: currentColor,
          startIndex,
          endIndex: i - 1,
          groupNumber,
          mergedGroupId: 0,
        });

        if (i < row.length) {
          currentColor = row[i];
          startIndex = i;
          groupNumber++;
        }
      }
    }

    groups.push(rowGroups);
  }

  return groups;
};

// Chains runs across rows into bobbins, working bottom-up. A run continues the
// bobbin of an overlapping same-color run in the row below; when several
// overlap, the one nearest the row's starting side wins, and a bobbin can only
// continue into one run per row.
export const mergeColorGroups = (colorGroups: ColorGroup[][]): ColorGroup[][] => {
  const groups = colorGroups.map((row) => row.map((g) => ({ ...g })));
  let globalGroupId = 1;

  for (let rowIndex = groups.length - 1; rowIndex >= 0; rowIndex--) {
    const rowNumber = groups.length - rowIndex;
    const isOddRow = rowNumber % 2 === 1;
    const rowGroups = groups[rowIndex];
    const claimedGroupIds = new Set<number>();

    const sortedGroups = isOddRow ? [...rowGroups].reverse() : [...rowGroups];

    for (const group of sortedGroups) {
      if (rowIndex === groups.length - 1) {
        group.mergedGroupId = globalGroupId++;
        continue;
      }

      const rowBelow = groups[rowIndex + 1];
      const overlappingGroups = rowBelow.filter(
        (g) =>
          g.color === group.color &&
          !(g.endIndex < group.startIndex - 1 || g.startIndex > group.endIndex + 1)
      );

      if (overlappingGroups.length > 0) {
        let selectedGroup;
        if (isOddRow) {
          selectedGroup = overlappingGroups.reduce((rightmost, current) =>
            current.startIndex > rightmost.startIndex ? current : rightmost
          );
        } else {
          selectedGroup = overlappingGroups.reduce((leftmost, current) =>
            current.startIndex < leftmost.startIndex ? current : leftmost
          );
        }

        if (claimedGroupIds.has(selectedGroup.mergedGroupId)) {
          group.mergedGroupId = globalGroupId++;
        } else {
          group.mergedGroupId = selectedGroup.mergedGroupId;
          claimedGroupIds.add(selectedGroup.mergedGroupId);
        }
      } else {
        group.mergedGroupId = globalGroupId++;
      }
    }
  }

  return groups;
};

// Total stitches per bobbin, keyed by merged group id.
export const bobbinStitchCounts = (
  mergedGroups: ColorGroup[][]
): Map<number, { color: string; count: number }> => {
  const counts = new Map<number, { color: string; count: number }>();

  for (const row of mergedGroups) {
    for (const group of row) {
      if (group.color === null) continue;

      const stitchCount = group.endIndex - group.startIndex + 1;
      const existing = counts.get(group.mergedGroupId);
      if (existing) {
        existing.count += stitchCount;
      } else {
        counts.set(group.mergedGroupId, { color: group.color, count: stitchCount });
      }
    }
  }

  return counts;
};

export const maxBobbinsInRow = (mergedGroups: ColorGroup[][]): number => {
  let maxCount = 0;
  for (const row of mergedGroups) {
    const uniqueGroups = new Set(row.filter((g) => g.color !== null).map((g) => g.mergedGroupId));
    maxCount = Math.max(maxCount, uniqueGroups.size);
  }
  return maxCount;
};

// ---------------------------------------------------------------------------
// Yardage
// ---------------------------------------------------------------------------

export interface YardageSettings {
  gauge: number;
  errorMargin: number;
  headLength: number;
  tailLength: number;
}

export const yarnLengthInches = (stitches: number, settings: YardageSettings): number =>
  stitches * settings.gauge * settings.errorMargin + settings.headLength + settings.tailLength;

// Expresses a length as fathoms, cubits, and palms of someone this tall,
// rounded up to the nearest palm.
export const convertToBodyMeasurements = (inches: number, heightInches: number): string => {
  const palmInches = heightInches / 20;
  const cubitInches = heightInches / 4;
  const fathomInches = heightInches;

  const roundedToPalm = Math.ceil(inches / palmInches) * palmInches;

  let remaining = roundedToPalm;
  const fathoms = Math.floor(remaining / fathomInches);
  remaining -= fathoms * fathomInches;

  const cubits = Math.floor(remaining / cubitInches);
  remaining -= cubits * cubitInches;

  const palms = Math.round(remaining / palmInches);

  const parts = [];
  if (fathoms > 0) parts.push(`${fathoms} fathom${fathoms > 1 ? 's' : ''}`);
  if (cubits > 0) parts.push(`${cubits} cubit${cubits > 1 ? 's' : ''}`);
  if (palms > 0) parts.push(`${palms} palm${palms > 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(', ') : '0 palms';
};

// ---------------------------------------------------------------------------
// .int.png files
// ---------------------------------------------------------------------------
//
// A saved pattern is a PNG with one pixel per stitch, each pixel a yarn's hex
// color, plus a tEXt chunk naming the yarn behind each color. The names let a
// file survive hex codes being refreshed in the yarn list; without the chunk
// (or for colors it doesn't name), colors fall back to exact-hex and then
// nearest-yarn matching, so any plain PNG still imports.

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const METADATA_KEYWORD = 'intarsia';

export interface PatternMetadata {
  version: 1;
  // Pixel hex color -> yarn name.
  yarns: Record<string, string>;
}

let crcTable: Uint32Array | null = null;

const crc32 = (bytes: Uint8Array): number => {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const isPng = (png: Uint8Array): boolean =>
  png.length >= 8 && PNG_SIGNATURE.every((byte, i) => png[i] === byte);

// Calls `visit` with each chunk's type, data, and the offset just past it.
const forEachChunk = (
  png: Uint8Array,
  visit: (type: string, data: Uint8Array, end: number) => boolean | void
) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const end = offset + 12 + length;
    if (visit(type, data, end) === false) return;
    offset = end;
  }
};

// tEXt is Latin-1, so anything beyond ASCII is \u-escaped (still valid JSON).
const toAscii = (text: string) =>
  text.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// Returns a copy of `png` with a tEXt chunk inserted right after IHDR.
export const insertTextChunk = (
  png: Uint8Array,
  keyword: string,
  text: string
): Uint8Array<ArrayBuffer> => {
  if (!isPng(png)) throw new Error('Not a PNG file');

  let ihdrEnd = -1;
  forEachChunk(png, (type, _data, end) => {
    if (type === 'IHDR') ihdrEnd = end;
    return false;
  });
  if (ihdrEnd === -1) throw new Error('PNG is missing its IHDR chunk');

  const body = new TextEncoder().encode(`tEXt${keyword}\0${toAscii(text)}`);
  const chunk = new Uint8Array(body.length + 8);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length - 4);
  chunk.set(body, 4);
  view.setUint32(body.length + 4, crc32(body));

  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.subarray(0, ihdrEnd), 0);
  result.set(chunk, ihdrEnd);
  result.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return result;
};

export const readTextChunk = (png: Uint8Array, keyword: string): string | null => {
  if (!isPng(png)) return null;

  let text: string | null = null;
  forEachChunk(png, (type, data) => {
    if (type !== 'tEXt') return;
    const separator = data.indexOf(0);
    if (separator === -1) return;
    if (new TextDecoder('latin1').decode(data.subarray(0, separator)) !== keyword) return;
    text = new TextDecoder('latin1').decode(data.subarray(separator + 1));
    return false;
  });
  return text;
};

export const writePatternMetadata = (
  png: Uint8Array,
  metadata: PatternMetadata
): Uint8Array<ArrayBuffer> => insertTextChunk(png, METADATA_KEYWORD, JSON.stringify(metadata));

// null for a PNG with no (or unreadable) intarsia metadata.
export const readPatternMetadata = (png: Uint8Array): PatternMetadata | null => {
  const text = readTextChunk(png, METADATA_KEYWORD);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.version !== 1 || typeof parsed.yarns !== 'object' || parsed.yarns === null) {
      return null;
    }
    return parsed as PatternMetadata;
  } catch {
    return null;
  }
};

// Maps each color in a loaded pattern to a yarn: first by the name saved in
// the file's metadata, then by exact hex, then by nearest unclaimed yarn.
export const resolvePatternYarns = (
  patternColors: string[],
  metadata: PatternMetadata | null,
  yarns: ImpeccableYarn[] = impeccableYarns
): Map<string, ImpeccableYarn> => {
  const byName = new Map(yarns.map((yarn) => [yarn.name, yarn]));
  const byHex = new Map(yarns.map((yarn) => [yarn.hex.toLowerCase(), yarn]));
  const resolved = new Map<string, ImpeccableYarn>();
  const claimed = new Set<string>();

  const claim = (color: string, yarn: ImpeccableYarn | undefined) => {
    if (!yarn || claimed.has(yarn.name) || resolved.has(color)) return;
    resolved.set(color, yarn);
    claimed.add(yarn.name);
  };

  for (const color of patternColors) {
    const name = metadata?.yarns[rgbaToHex(color)];
    if (name) claim(color, byName.get(name));
  }
  for (const color of patternColors) claim(color, byHex.get(rgbaToHex(color)));

  const nearest = getOptimalYarnMapping(
    patternColors.filter((color) => !resolved.has(color)),
    yarns.filter((yarn) => !claimed.has(yarn.name))
  );
  for (const [color, yarn] of nearest) resolved.set(color, yarn);
  return resolved;
};
