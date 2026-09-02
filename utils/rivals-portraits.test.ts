import { describe, it, expect } from 'vitest';
import { PORTRAIT_OFFSETS, portraitOffset } from './rivals-portraits';

describe('portraitOffset', () => {
  it('returns the configured offset', () => {
    PORTRAIT_OFFSETS['__tuned__'] = -12;
    expect(portraitOffset('__tuned__')).toBe(-12);
    delete PORTRAIT_OFFSETS['__tuned__'];
  });

  it('falls back to the plain cover framing for an unknown character', () => {
    expect(portraitOffset('Nobody')).toBe(0);
  });
});
