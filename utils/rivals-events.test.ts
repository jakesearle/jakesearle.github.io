import { describe, it, expect } from 'vitest';
import { EVENTS, annotateEvents, type RivalsEvent } from './rivals-events';

const roster = ['Zetterburn', 'Clairen', 'Kragg', 'Ranno'];

const fixtures: RivalsEvent[] = [
  {
    id: 'older',
    name: 'Older',
    reward: 'bonus',
    starts: '2026-01-01',
    ends: '2026-02-01',
    characters: ['Zetterburn', 'Ranno'],
  },
  {
    id: 'newer',
    name: 'Newer',
    reward: 'bonus',
    starts: '2026-02-01',
    ends: '2026-03-01',
    // 'Gouie' isn't on this roster, so it shouldn't be counted
    characters: ['Clairen', 'Gouie'],
  },
];

describe('annotateEvents', () => {
  it('orders events newest first', () => {
    const annotated = annotateEvents(fixtures, roster, new Date('2026-02-15'));
    expect(annotated.map((e) => e.id)).toEqual(['newer', 'older']);
  });

  it('counts only characters that are on the roster', () => {
    const annotated = annotateEvents(fixtures, roster, new Date('2026-02-15'));
    expect(annotated.map((e) => e.matching)).toEqual([1, 2]);
  });

  it('marks the running event active and the finished one past', () => {
    const annotated = annotateEvents(fixtures, roster, new Date('2026-02-15'));
    expect(annotated.map((e) => e.active)).toEqual([true, false]);
  });

  it('treats an event that has not started yet as inactive', () => {
    const annotated = annotateEvents(fixtures, roster, new Date('2025-12-01'));
    expect(annotated.every((e) => e.active)).toBe(false);
  });

  it('treats every event as past when the clock is unknown', () => {
    const annotated = annotateEvents(fixtures, roster, null);
    expect(annotated.every((e) => e.active)).toBe(false);
  });

  it('leaves the input untouched', () => {
    const before = JSON.parse(JSON.stringify(fixtures));
    annotateEvents(fixtures, roster, new Date('2026-02-15'));
    expect(fixtures).toEqual(before);
  });
});

describe('EVENTS data', () => {
  it('has unique ids', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never ends before it starts, and lists no duplicate characters', () => {
    for (const event of EVENTS) {
      expect(event.ends > event.starts).toBe(true);
      expect(new Set(event.characters).size).toBe(event.characters.length);
    }
  });
});
