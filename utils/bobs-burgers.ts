// Shape of tv/bobs-burgers/watchlist.json, written by
// scripts/bobs-burgers-refs/bobs_refs.py from the Bob's Burgers Fandom wiki
// (plus hand corrections in scripts/bobs-burgers-refs/overrides.toml).

export type TitleType = 'movie' | 'tv';

export interface WatchlistTitle {
  key: string; // stable id (TMDB id, or a normalised title) — used for "seen" tracking
  title: string;
  type: TitleType;
  year: string;
  poster: string;
  tmdb: string;
  major: boolean; // the episode's title/plot is built on this title
  context: string; // the wiki trivia line that mentions it, or a hand-written note
}

export interface WatchlistEpisode {
  title: string;
  season: number;
  number: number;
  aired: string;
  imdb: string | null;
  wiki: string;
  titles: WatchlistTitle[];
  maybes: string[]; // titles the heuristics couldn't classify
}

export interface Watchlist {
  tmdbVerified: boolean;
  episodes: WatchlistEpisode[];
}

export interface WatchlistFilter {
  season: number | 'all';
  type: TitleType | 'all';
  query: string;
  mustWatchOnly: boolean;
  hideEmpty: boolean;
  hideSeen: boolean;
}

export type SeenSet = Record<string, true>;

export function episodeCode(ep: Pick<WatchlistEpisode, 'season' | 'number'>): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `S${pad(ep.season)}E${pad(ep.number)}`;
}

// JustWatch search for a title, which lists where it's streaming, renting or
// for sale. A search rather than a direct page: we don't have JustWatch ids.
export function justWatchUrl(title: string, region = 'us'): string {
  return `https://www.justwatch.com/${region}/search?q=${encodeURIComponent(title)}`;
}

// Returns episodes (with their title lists already narrowed) in the input order.
// A query matching the episode title keeps all its titles; otherwise only
// matching titles are kept, and episodes with none are dropped.
export function filterEpisodes(
  episodes: WatchlistEpisode[],
  f: WatchlistFilter,
  seen: SeenSet = {}
): WatchlistEpisode[] {
  const q = f.query.trim().toLowerCase();
  const out: WatchlistEpisode[] = [];
  for (const ep of episodes) {
    if (f.season !== 'all' && ep.season !== f.season) continue;
    let titles = ep.titles;
    if (f.type !== 'all') titles = titles.filter((t) => t.type === f.type);
    if (f.mustWatchOnly) titles = titles.filter((t) => t.major);
    if (f.hideSeen) titles = titles.filter((t) => !seen[t.key]);
    const episodeMatches = !q || ep.title.toLowerCase().includes(q);
    if (!episodeMatches) {
      titles = titles.filter((t) => t.title.toLowerCase().includes(q));
      if (!titles.length) continue;
    }
    if (f.hideEmpty && !titles.length) continue;
    out.push({ ...ep, titles });
  }
  return out;
}

// Distinct titles across all episodes, with how many episodes reference each.
export function titleTally(
  episodes: WatchlistEpisode[]
): { title: WatchlistTitle; episodes: number }[] {
  const tally = new Map<string, { title: WatchlistTitle; episodes: number }>();
  for (const ep of episodes) {
    for (const t of ep.titles) {
      const entry = tally.get(t.key);
      if (entry) entry.episodes++;
      else tally.set(t.key, { title: t, episodes: 1 });
    }
  }
  return [...tally.values()].sort(
    (a, b) => b.episodes - a.episodes || a.title.title.localeCompare(b.title.title)
  );
}
