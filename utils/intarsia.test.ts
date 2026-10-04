import { describe, it, expect } from 'vitest';
import {
  type Grid,
  applyColorMapping,
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
  maxBobbinsInRow,
  mergeColorGroups,
  rgbaToHex,
  sortColorsByFrequency,
} from './intarsia';
import { impeccableYarns } from './impeccable-yarns';

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

describe('convertToBodyMeasurements', () => {
  it('rounds up to whole palms of the given height', () => {
    // 80" tall: fathom 80", cubit 20", palm 4".
    expect(convertToBodyMeasurements(101, 80)).toBe('1 fathom, 1 cubit, 1 palm');
    expect(convertToBodyMeasurements(0, 80)).toBe('0 palms');
  });
});
