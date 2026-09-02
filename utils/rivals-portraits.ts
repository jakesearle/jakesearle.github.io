// Portrait framing for the character cards.
//
// The source art is full-body and every character stands differently in their
// frame, so at a plain "cover" fit the heads land at wildly different heights
// and the row reads as disjointed. These offsets slide each portrait up or down
// until the eye-lines agree — about a third of the way down the card tends to
// look right.
//
// TUNING: the numbers are pixels against a 200px-tall card. Positive moves the
// portrait DOWN, negative moves it UP, 0 is the plain "cover" framing. Nudge
// one, save, and the dev server hot-reloads it.
//
// The artwork is transparent right up to the frame edge, so a portrait that
// slides simply shows more of the card's own colour — the same colour already
// visible around the character. Push far enough and you'll clip the character's
// feet or head at the card edge, which is the real limit on how far to go.

/**
 * Draws a red guide line across every card at EYE_LINE so you can see where the
 * eyes should land while tuning. Debug only — set it back to false when done.
 */
export const SHOW_EYE_LINE = false;

/** Where the eye-line should sit, as a fraction of the card height. */
export const EYE_LINE = 1 / 3;

export const PORTRAIT_OFFSETS: Record<string, number> = {
  Zetterburn: 8,
  Clairen: 0,
  Loxodont: -30,
  Forsburn: -10,
  Kragg: 0,
  Maypul: -8,
  Olympia: 8,
  Galvan: -8,
  'La Reina': -32,
  Wrastor: 4,
  Fleet: -4,
  Absa: 16,
  Ranno: 24,
  Orcane: 8,
  Etalus: -16,
  Slade: 16,
  Gouie: 22,
};

export function portraitOffset(name: string): number {
  return PORTRAIT_OFFSETS[name] ?? 0;
}
