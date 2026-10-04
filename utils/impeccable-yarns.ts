export interface ImpeccableYarn {
  name: string;
  hex: string;
}

export const impeccableYarns: ImpeccableYarn[] = [
  { name: 'Almond', hex: '#bcaa9c' },
  { name: 'Amethyst', hex: '#481c3f' },
  { name: 'Apricot', hex: '#e5b193' },
  { name: 'Aqua', hex: '#0a9ea9' },
  { name: 'Aran', hex: '#ecddcb' },
  { name: 'Arbor Rose', hex: '#ec1c56' },
  { name: 'Aruba Blue', hex: '#1cbabd' },
  { name: 'Baked Clay', hex: '#be7468' },
  { name: 'Barely Pink', hex: '#e1ceca' },
  { name: 'Barley', hex: '#5f514e' },
  { name: 'Black', hex: '#2d2425' },
  { name: 'Blue Haze', hex: '#add2db' },
  { name: 'Blue Moon', hex: '#3e5571' },
  { name: 'Brite Sky Blue', hex: '#065c84' },
  { name: 'Burgundy', hex: '#700627' },
  { name: 'Butterscotch', hex: '#ffca66' },
  { name: 'Cherry', hex: '#aa041e' },
  { name: 'Chocolate Brown', hex: '#452823' },
  { name: 'Citron', hex: '#c7cf72' },
  { name: 'Claret', hex: '#9c0619' },
  { name: 'Classic Gray', hex: '#d0cbca' },
  { name: 'Clear Blue', hex: '#0778c1' },
  { name: 'Cloud', hex: '#e0d5cc' },
  { name: 'Coral', hex: '#fb7281' },
  { name: 'Dark Charcoal', hex: '#201f25' },
  { name: 'Dark Emerald', hex: '#12625e' },
  { name: 'Deep Forest', hex: '#5a4d38' },
  { name: 'Eggplant', hex: '#6e5fa8' },
  { name: 'Fern', hex: '#9d9554' },
  { name: 'Forest', hex: '#777247' },
  { name: 'Fuchsia Blooms', hex: '#ca1756' },
  { name: 'Glacier', hex: '#9bc1cd' },
  { name: 'Gold', hex: '#d98408' },
  { name: 'Golden Beige', hex: '#dbcfbf' },
  { name: 'Grape Punch', hex: '#4f39a5' },
  { name: 'Grass', hex: '#ddbf07' },
  { name: 'Green Lagoon', hex: '#73887f' },
  { name: 'Guacamole', hex: '#699255' },
  { name: 'Heather', hex: '#f2cba1' },
  { name: 'Jade', hex: '#74c096' },
  { name: 'Jasmine Green', hex: '#a2d97b' },
  { name: 'Kelly Green', hex: '#086d50' },
  { name: 'Laurel', hex: '#a9ac9d' },
  { name: 'Lavender', hex: '#8c719b' },
  { name: 'Lemon', hex: '#fdce6b' },
  { name: 'Lippy', hex: '#cf076d' },
  { name: 'Misty Blue', hex: '#5b7682' },
  { name: 'Navy Blue', hex: '#33242f' },
  { name: 'Orange Crush', hex: '#ec2808' },
  { name: 'Orchid', hex: '#d19dae' },
  { name: 'Orchid Bloom', hex: '#cfbfdb' },
  { name: 'Pale Gray', hex: '#8b8b8b' },
  { name: 'Peach Pink', hex: '#f89273' },
  { name: 'Petunia', hex: '#c8cde2' },
  { name: 'Plum', hex: '#7a5a71' },
  { name: 'Pumpkin', hex: '#cd4109' },
  { name: 'Putty', hex: '#c0bdb6' },
  { name: 'Red Hot', hex: '#ad0409' },
  { name: 'Rich Orchid', hex: '#af054f' },
  { name: 'Royal', hex: '#042068' },
  { name: 'Sapphire', hex: '#0c1a2b' },
  { name: 'Sea Green', hex: '#7dcdd2' },
  { name: 'Skylight', hex: '#b2d9d2' },
  { name: 'Smoke', hex: '#bdc3cc' },
  { name: 'Soft Rose', hex: '#f5a9ae' },
  { name: 'Soft Taupe', hex: '#c5916b' },
  { name: 'Sphagnum', hex: '#5b5d44' },
  { name: 'Sunny Day', hex: '#ff9d08' },
  { name: 'Teal', hex: '#168fad' },
  { name: 'Thunder', hex: '#4c4648' },
  { name: 'True Grey', hex: '#685c5e' },
  { name: 'Violet', hex: '#8a6984' },
  { name: 'Walnut', hex: '#533e30' },
  { name: 'White', hex: '#ece7eb' },
  { name: 'White Smoke', hex: '#bbbfc3' },
];

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
};

// Hue/saturation/lightness, only for sorting swatches into a rainbow.
const hsl = (hex: string): { h: number; s: number; l: number } => {
  const { r, g, b } = hexToRgb(hex);
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  let h: number;
  if (max === rr) h = ((gg - bb) / delta) % 6;
  else if (max === gg) h = (bb - rr) / delta + 2;
  else h = (rr - gg) / delta + 4;

  return {
    h: (h * 60 + 360) % 360,
    s: delta / (1 - Math.abs(2 * l - 1)),
    l,
  };
};

// Near-neutral colors have a meaningless hue angle, so they'd scatter through
// the rainbow at random. Group them together at the end instead, ordered
// light to dark.
const NEUTRAL_SATURATION = 0.15;

// Orders yarns as a rainbow by hue, with near-neutrals grouped at the end
// from light to dark. Returns a new array.
export const sortYarnsByColor = (yarns: ImpeccableYarn[]): ImpeccableYarn[] =>
  [...yarns].sort((a, b) => {
    const ha = hsl(a.hex);
    const hb = hsl(b.hex);
    const aNeutral = ha.s < NEUTRAL_SATURATION;
    const bNeutral = hb.s < NEUTRAL_SATURATION;
    if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;
    if (aNeutral) return hb.l - ha.l;
    return ha.h - hb.h || hb.l - ha.l;
  });
