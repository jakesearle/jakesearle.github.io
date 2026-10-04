import { describe, it, expect } from 'vitest';
import {
  type Grid,
  applyColorMapping,
  applyStitchEdits,
  replacementColors,
  singleStitches,
  bobbinStitchCounts,
  buildColorMappingForTargetCount,
  computeColorGroups,
  convertToBodyMeasurements,
  filterSmallColorGroups,
  getOptimalYarnMapping,
  getYarnMappingWithOverrides,
  gridFromImageData,
  hexToRgba,
  hungarianAlgorithm,
  longestBobbinPerColor,
  maxBobbinsInRow,
  mergeColorGroups,
  readPatternMetadata,
  readTextChunk,
  resolvePatternYarns,
  insertTextChunk,
  writePatternMetadata,
  rgbaToHex,
  sortColorsByFrequency,
} from './intarsia';
import { impeccableYarns, sortYarnsByColor } from './impeccable-yarns';

const RED = 'rgba(255,0,0,1)';
const NEAR_RED = 'rgba(250,5,5,1)';
const BLUE = 'rgba(0,0,255,1)';

// Compact grid notation: one character per stitch, '.' is no stitch.
const COLORS: Record<string, string> = { A: RED, B: BLUE, C: 'rgba(0,255,0,1)' };
const grid = (...rows: string[]): Grid =>
  rows.map((row) => [...row].map((ch) => (ch === '.' ? null : COLORS[ch])));

const yarnByName = (name: string) => {
  const yarn = impeccableYarns.find((y) => y.name === name);
  if (!yarn) throw new Error(`no yarn named ${name}`);
  return yarn;
};

describe('color conversion', () => {
  it('round-trips hex through rgba', () => {
    expect(rgbaToHex(hexToRgba('#0a9ea9'))).toBe('#0a9ea9');
  });
});

describe('gridFromImageData', () => {
  it('reads pixels row by row and treats mostly-transparent pixels as no stitch', () => {
    const data = [255, 0, 0, 255, 0, 0, 255, 10, 0, 0, 255, 200, 1, 2, 3, 255];
    expect(gridFromImageData({ width: 2, height: 2, data })).toEqual([
      [RED, null],
      [BLUE, 'rgba(1,2,3,1)'],
    ]);
  });
});

describe('color reduction', () => {
  it('merges similar colors to reach the target count', () => {
    const sorted = sortColorsByFrequency([[RED, RED, NEAR_RED, BLUE]]);
    const mapping = buildColorMappingForTargetCount(sorted, 2);
    expect(mapping.get(NEAR_RED)).toBe(RED);
    expect(new Set(mapping.values())).toEqual(new Set([RED, BLUE]));
  });

  it('folds colors under the minimum stitch count into their nearest neighbor', () => {
    const sorted = sortColorsByFrequency([[RED, RED, RED, NEAR_RED, BLUE, BLUE, BLUE]]);
    const identity = new Map(sorted.map(([color]) => [color, color]));
    const filtered = filterSmallColorGroups(identity, sorted, 2);
    expect(applyColorMapping([[NEAR_RED, BLUE]], filtered)).toEqual([[RED, BLUE]]);
  });

  it('leaves the mapping alone when every color would be filtered out', () => {
    const sorted = sortColorsByFrequency([[RED, BLUE]]);
    const identity = new Map(sorted.map(([color]) => [color, color]));
    expect(filterSmallColorGroups(identity, sorted, 5)).toBe(identity);
  });
});

describe('single-stitch edits', () => {
  it('finds stitches that are a whole color group on their own', () => {
    expect(singleStitches(grid('AAB', 'AAA'))).toEqual([{ x: 2, y: 0 }]);
  });

  it('skips one-stitch runs that continue a bobbin from the row below', () => {
    expect(singleStitches(grid('ABB', 'AAB'))).toEqual([]);
  });

  it('offers neighbor colors on either side, nearest first', () => {
    const g: Grid = [[NEAR_RED, RED, BLUE]];
    expect(replacementColors(g, { x: 1, y: 0 })).toEqual([NEAR_RED, BLUE]);
  });

  it('offers a diagonal color when the stitch would continue that bobbin', () => {
    expect(replacementColors(grid('..B', 'AA.'), { x: 2, y: 0 })).toEqual([RED]);
  });

  it('skips a color whose bobbin is already continued elsewhere in the row', () => {
    // The top row is worked left to right, so the left A claims the bobbin
    // below first and a recolored stitch would start a new one-stitch bobbin.
    expect(replacementColors(grid('A.B', 'AA.'), { x: 2, y: 0 })).toEqual([]);
  });

  it('offers nothing for an empty cell', () => {
    expect(replacementColors(grid('.A'), { x: 0, y: 0 })).toEqual([]);
  });

  it('applies edits, skipping colors the grid no longer has', () => {
    const g = grid('AB', 'BA');
    const edits = new Map([
      ['1,0', RED],
      ['0,1', 'rgba(1,1,1,1)'],
    ]);
    expect(applyStitchEdits(g, edits)).toEqual(grid('AA', 'BA'));
  });
});

describe('yarn matching', () => {
  it('finds the minimum-cost assignment', () => {
    expect(
      hungarianAlgorithm([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ])
    ).toEqual([1, 0, 2]);
  });

  it('never gives two pattern colors the same yarn', () => {
    const mapping = getOptimalYarnMapping([RED, NEAR_RED, BLUE]);
    const names = Array.from(mapping.values(), (yarn) => yarn.name);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  });

  it('keeps overrides and matches the rest against unclaimed yarns', () => {
    const plain = getOptimalYarnMapping([RED, BLUE]);
    const stolen = plain.get(BLUE)!;
    const mapping = getYarnMappingWithOverrides([RED, BLUE], new Map([[RED, stolen]]));
    expect(mapping.get(RED)).toBe(stolen);
    expect(mapping.get(BLUE)).toBeDefined();
    expect(mapping.get(BLUE)!.name).not.toBe(stolen.name);
  });

  it('ignores overrides for colors no longer in the pattern', () => {
    const mapping = getYarnMappingWithOverrides([RED], new Map([[BLUE, yarnByName('Aqua')]]));
    expect([...mapping.keys()]).toEqual([RED]);
  });
});

describe('bobbin groups', () => {
  it('splits rows into single-color runs', () => {
    const groups = computeColorGroups(grid('AAB.'));
    expect(groups[0].map((g) => [g.color, g.startIndex, g.endIndex])).toEqual([
      [RED, 0, 1],
      [BLUE, 2, 2],
      [null, 3, 3],
    ]);
  });

  it('continues a bobbin into an overlapping same-color run in the row above', () => {
    const merged = mergeColorGroups(computeColorGroups(grid('AAB', 'ABB')));
    // Bottom row is worked right to left, so its blue run gets bobbin 1.
    expect(merged[1].map((g) => g.mergedGroupId)).toEqual([2, 1]);
    expect(merged[0].map((g) => g.mergedGroupId)).toEqual([2, 1]);
  });

  it('starts a new bobbin when the one below is already continued in this row', () => {
    const merged = mergeColorGroups(computeColorGroups(grid('ABA', 'AAA')));
    expect(merged[0].map((g) => g.mergedGroupId)).toEqual([1, 2, 3]);
    expect(maxBobbinsInRow(merged)).toBe(3);
  });

  it('totals stitches per bobbin', () => {
    const merged = mergeColorGroups(computeColorGroups(grid('AAB', 'ABB')));
    const counts = bobbinStitchCounts(merged);
    expect(counts.get(1)).toEqual({ color: BLUE, count: 3 });
    expect(counts.get(2)).toEqual({ color: RED, count: 3 });
  });
});

describe('longestBobbinPerColor', () => {
  it('picks the bobbin with the most stitches for each color, lower id on ties', () => {
    const counts = new Map([
      [1, { color: RED, count: 4 }],
      [2, { color: BLUE, count: 2 }],
      [3, { color: RED, count: 9 }],
      [4, { color: BLUE, count: 2 }],
    ]);
    expect(longestBobbinPerColor(counts)).toEqual(
      new Map([
        [RED, 3],
        [BLUE, 2],
      ])
    );
  });
});

describe('convertToBodyMeasurements', () => {
  it('rounds up to whole palms of the given height', () => {
    // 80" tall: fathom 80", cubit 20", palm 4".
    expect(convertToBodyMeasurements(101, 80)).toBe('1 fathom, 1 cubit, 1 palm');
    expect(convertToBodyMeasurements(0, 80)).toBe('0 palms');
  });
});

describe('.int.png metadata', () => {
  // Smallest structurally valid PNG: signature, IHDR (zeroed), IEND. The
  // reader never inflates image data, so it needs nothing more.
  const png = new Uint8Array([
    ...[137, 80, 78, 71, 13, 10, 26, 10], // signature
    ...[0, 0, 0, 13, 73, 72, 68, 82, ...new Array(13).fill(0), 0, 0, 0, 0], // IHDR
    ...[0, 0, 0, 0, 73, 69, 78, 68, 0xae, 0x42, 0x60, 0x82], // IEND
  ]);

  const chunkTypes = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const types: string[] = [];
    for (let offset = 8; offset < bytes.length;) {
      const length = view.getUint32(offset);
      types.push(String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)));
      offset += 12 + length;
    }
    return types;
  };

  it('round-trips through a tEXt chunk placed right after IHDR', () => {
    const metadata = { version: 1 as const, yarns: { '#0a9ea9': 'Aqua', '#ecddcb': 'Aran' } };
    const written = writePatternMetadata(png, metadata);
    expect(readPatternMetadata(written)).toEqual(metadata);
    expect(chunkTypes(written).slice(0, 2)).toEqual(['IHDR', 'tEXt']);
    expect(chunkTypes(written).slice(2)).toEqual(chunkTypes(png).slice(1));
  });

  it('writes a valid chunk CRC', () => {
    const written = insertTextChunk(png, 'k', 'v');
    const view = new DataView(written.buffer);
    const ihdrEnd = 8 + 12 + view.getUint32(8);
    const length = view.getUint32(ihdrEnd);
    const body = written.subarray(ihdrEnd + 4, ihdrEnd + 8 + length);
    expect(new TextDecoder().decode(body)).toBe('tEXtk\0v');
    expect(view.getUint32(ihdrEnd + 8 + length)).toBe(0xcb04f390);
  });

  it('escapes non-ASCII text so it survives Latin-1', () => {
    const written = writePatternMetadata(png, { version: 1, yarns: { '#000000': 'Crème ☕' } });
    expect(readPatternMetadata(written)?.yarns['#000000']).toBe('Crème ☕');
  });

  it('reads nothing from a plain PNG or a non-PNG', () => {
    expect(readPatternMetadata(png)).toBeNull();
    expect(readTextChunk(new Uint8Array([1, 2, 3]), 'intarsia')).toBeNull();
  });
});

describe('resolvePatternYarns', () => {
  const aqua = yarnByName('Aqua');
  const aran = yarnByName('Aran');

  it('prefers the yarn named in metadata even if its hex has changed', () => {
    const resolved = resolvePatternYarns([RED], { version: 1, yarns: { '#ff0000': 'Aqua' } });
    expect(resolved.get(RED)).toBe(aqua);
  });

  it('falls back to exact hex, then to the nearest unclaimed yarn', () => {
    const aquaPixel = hexToRgba(aqua.hex);
    const resolved = resolvePatternYarns([aquaPixel, hexToRgba(aran.hex), RED], null);
    expect(resolved.get(aquaPixel)).toBe(aqua);
    expect(resolved.get(hexToRgba(aran.hex))).toBe(aran);
    expect(resolved.get(RED)).toBeDefined();
    expect(new Set(Array.from(resolved.values(), (y) => y.name)).size).toBe(3);
  });

  it('ignores names that are no longer in the yarn list', () => {
    const aquaPixel = hexToRgba(aqua.hex);
    const resolved = resolvePatternYarns([aquaPixel], {
      version: 1,
      yarns: { [aqua.hex]: 'Discontinued' },
    });
    expect(resolved.get(aquaPixel)).toBe(aqua);
  });
});

describe('sortYarnsByColor', () => {
  it('orders by hue with neutrals last, light to dark', () => {
    const names = sortYarnsByColor([
      { name: 'Black', hex: '#111111' },
      { name: 'Blue', hex: '#0000ff' },
      { name: 'White', hex: '#eeeeee' },
      { name: 'Red', hex: '#ff0000' },
      { name: 'Green', hex: '#00ff00' },
    ]).map((y) => y.name);
    expect(names).toEqual(['Red', 'Green', 'Blue', 'White', 'Black']);
  });
});
