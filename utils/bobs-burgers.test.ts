import { describe, it, expect } from 'vitest';
import {
  episodeCode,
  filterEpisodes,
  justWatchUrl,
  titleTally,
  type TitleType,
  type WatchlistEpisode,
  type WatchlistFilter,
  type WatchlistTitle,
} from './bobs-burgers';
import data from '../tv/bobs-burgers/watchlist.json';

const ref = (
  key: string,
  title: string,
  { major = false, type = 'movie' as TitleType } = {}
): WatchlistTitle => ({
  key,
  title,
  type,
  year: '',
  poster: '',
  tmdb: '',
  major,
  context: '',
});

const ep = (
  title: string,
  season: number,
  number: number,
  titles: WatchlistTitle[]
): WatchlistEpisode => ({
  title,
  season,
  number,
  aired: '',
  imdb: null,
  wiki: '',
  titles,
  maybes: [],
});

const EPISODES = [
  ep('Human Flesh', 1, 1, [ref('rainman', 'Rain Man')]),
  ep('Crawl Space', 1, 2, []),
  ep('The Belchies', 2, 1, [
    ref('goonies', 'The Goonies', { major: true }),
    ref('footloose', 'Footloose'),
  ]),
  ep('Bob Day Afternoon', 2, 2, [ref('dogday', 'Dog Day Afternoon', { major: true })]),
  ep('Crab-solutely Fabulous', 3, 1, [
    ref('abfab', 'Absolutely Fabulous', { major: true, type: 'tv' }),
    ref('spongebob', 'SpongeBob SquarePants', { type: 'tv' }),
    ref('jaws', 'Jaws'),
  ]),
];

const ALL: WatchlistFilter = {
  season: 'all',
  type: 'all',
  query: '',
  mustWatchOnly: false,
  hideEmpty: false,
  hideSeen: false,
};

const names = (eps: WatchlistEpisode[]) => eps.map((e) => e.title);
const keys = (e: WatchlistEpisode) => e.titles.map((t) => t.key);

describe('episodeCode', () => {
  it('zero-pads season and episode', () => {
    expect(episodeCode({ season: 2, number: 1 })).toBe('S02E01');
    expect(episodeCode({ season: 12, number: 22 })).toBe('S12E22');
  });
});

describe('justWatchUrl', () => {
  it('builds an encoded US search URL by default', () => {
    expect(justWatchUrl('Stop! Or My Mom Will Shoot')).toBe(
      'https://www.justwatch.com/us/search?q=Stop!%20Or%20My%20Mom%20Will%20Shoot'
    );
  });

  it('encodes characters that would break the query', () => {
    expect(justWatchUrl('Fast & Furious', 'ca')).toBe(
      'https://www.justwatch.com/ca/search?q=Fast%20%26%20Furious'
    );
  });
});

describe('filterEpisodes', () => {
  it('returns everything with no filters', () => {
    expect(filterEpisodes(EPISODES, ALL)).toHaveLength(5);
  });

  it('filters by season', () => {
    expect(names(filterEpisodes(EPISODES, { ...ALL, season: 2 }))).toEqual([
      'The Belchies',
      'Bob Day Afternoon',
    ]);
  });

  it('filters by type', () => {
    const tv = filterEpisodes(EPISODES, { ...ALL, type: 'tv', hideEmpty: true });
    expect(names(tv)).toEqual(['Crab-solutely Fabulous']);
    expect(keys(tv[0])).toEqual(['abfab', 'spongebob']);

    const movies = filterEpisodes(EPISODES, { ...ALL, type: 'movie' });
    expect(keys(movies[4])).toEqual(['jaws']);
  });

  it('hides episodes without titles', () => {
    expect(names(filterEpisodes(EPISODES, { ...ALL, hideEmpty: true }))).not.toContain(
      'Crawl Space'
    );
  });

  it('keeps only must-watch titles', () => {
    const out = filterEpisodes(EPISODES, { ...ALL, mustWatchOnly: true, hideEmpty: true });
    expect(names(out)).toEqual(['The Belchies', 'Bob Day Afternoon', 'Crab-solutely Fabulous']);
    expect(keys(out[0])).toEqual(['goonies']);
  });

  it('combines type and must-watch', () => {
    const out = filterEpisodes(EPISODES, {
      ...ALL,
      type: 'movie',
      mustWatchOnly: true,
      hideEmpty: true,
    });
    expect(names(out)).toEqual(['The Belchies', 'Bob Day Afternoon']);
  });

  it('keeps all titles when the query matches the episode title', () => {
    const out = filterEpisodes(EPISODES, { ...ALL, query: 'belch' });
    expect(names(out)).toEqual(['The Belchies']);
    expect(out[0].titles).toHaveLength(2);
  });

  it('narrows to matching titles when the query matches a title', () => {
    const out = filterEpisodes(EPISODES, { ...ALL, query: 'FOOT' });
    expect(names(out)).toEqual(['The Belchies']);
    expect(keys(out[0])).toEqual(['footloose']);
  });

  it('hides seen titles, and then empty episodes', () => {
    const out = filterEpisodes(
      EPISODES,
      { ...ALL, hideSeen: true, hideEmpty: true },
      { rainman: true }
    );
    expect(names(out)).not.toContain('Human Flesh');
  });

  it('does not mutate the input', () => {
    filterEpisodes(EPISODES, { ...ALL, mustWatchOnly: true, type: 'tv' });
    expect(EPISODES[2].titles).toHaveLength(2);
    expect(EPISODES[4].titles).toHaveLength(3);
  });
});

describe('titleTally', () => {
  it('counts episodes per title, most-referenced first', () => {
    const eps = [...EPISODES, ep('Another', 4, 1, [ref('goonies', 'The Goonies')])];
    const tally = titleTally(eps);
    expect(tally[0]).toMatchObject({ title: { key: 'goonies' }, episodes: 2 });
    expect(tally).toHaveLength(7);
  });
});

describe('generated watchlist.json', () => {
  const eps = data.episodes as WatchlistEpisode[];
  const find = (t: string) => eps.find((e) => e.title === t)!;
  const titleOf = (e: string, t: string) => find(e).titles.find((x) => x.title === t);

  it('has episodes in season/episode order with unique, typed titles', () => {
    expect(eps.length).toBeGreaterThan(300);
    for (let i = 1; i < eps.length; i++) {
      const [a, b] = [eps[i - 1], eps[i]];
      expect(a.season * 1000 + a.number).toBeLessThanOrEqual(b.season * 1000 + b.number);
    }
    for (const e of eps) {
      const k = keys(e);
      expect(new Set(k).size).toBe(k.length);
      for (const t of e.titles) expect(['movie', 'tv']).toContain(t.type);
    }
  });

  it('includes the spot-checked references', () => {
    expect(titleOf('Human Flesh', 'Rain Man')?.type).toBe('movie');
    expect(titleOf('The Belchies', 'The Goonies')?.major).toBe(true);
  });

  it('applies overrides.toml', () => {
    expect(titleOf('Crawl Space', 'The Shining')?.type).toBe('movie'); // global type
    expect(titleOf('Mutiny on the Windbreaker', 'The Love Boat')?.type).toBe('tv'); // global type
    expect(titleOf('Sheesh! Cab, Bob?', 'Plump Friction')).toBeUndefined(); // ignore
    expect(titleOf('The Belchies', '127 Hours')?.context).toMatch(/IMDb Connections/); // add
  });
});
