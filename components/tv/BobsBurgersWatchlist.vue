<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import data from '../../tv/bobs-burgers/watchlist.json';
import {
  episodeCode,
  filterEpisodes,
  groupMaybes,
  highlightSegments,
  justWatchUrl,
  titleTally,
  type SeenSet,
  type TitleType,
  type Watchlist,
  type WatchlistFilter,
} from '../../utils/bobs-burgers';

const watchlist = data as Watchlist;
const episodes = watchlist.episodes;
const seasons = [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b);
const tally = titleTally(episodes);
const movieCount = tally.filter((t) => t.title.type === 'movie').length;
const tvCount = tally.length - movieCount;

const TYPES: { value: TitleType | 'all'; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' },
];

const STORAGE_SEEN = 'bobs-burgers-seen';
const STORAGE_FILTER = 'bobs-burgers-filter';

const filter = reactive<WatchlistFilter>({
  season: 'all',
  type: 'all',
  query: '',
  mustWatchOnly: false,
  hideEmpty: true,
  hideSeen: false,
});
const seen = ref<SeenSet>({});

// localStorage doesn't exist during SSR, so hydrate on the client.
onMounted(() => {
  try {
    seen.value = JSON.parse(localStorage.getItem(STORAGE_SEEN) || '{}');
    const f = JSON.parse(localStorage.getItem(STORAGE_FILTER) || '{}');
    if (f.season === 'all' || seasons.includes(f.season)) filter.season = f.season;
    if (TYPES.some((t) => t.value === f.type)) filter.type = f.type;
    for (const k of ['mustWatchOnly', 'hideEmpty', 'hideSeen'] as const) {
      if (typeof f[k] === 'boolean') filter[k] = f[k];
    }
  } catch {
    // corrupt or blocked storage — keep defaults
  }
});

watch(
  () => ({ ...filter, query: '' }),
  (f) => {
    try {
      localStorage.setItem(STORAGE_FILTER, JSON.stringify(f));
    } catch {
      /* storage unavailable */
    }
  }
);

function toggleSeen(key: string) {
  const next = { ...seen.value };
  if (next[key]) delete next[key];
  else next[key] = true;
  seen.value = next;
  try {
    localStorage.setItem(STORAGE_SEEN, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

const visible = computed(() => filterEpisodes(episodes, filter, seen.value));
const seenCount = computed(() => Object.keys(seen.value).length);
// Sentences are built as strings: Prettier's whitespace-insensitive HTML
// formatting would otherwise drop the spaces between template fragments.
const summary = computed(
  () =>
    `${movieCount} movies and ${tvCount} TV shows referenced across ${episodes.length} episodes.` +
    (seenCount.value ? ` You've seen ${seenCount.value}.` : '')
);
const noneLabel = computed(() =>
  filter.type === 'movie'
    ? 'No movie references found on the wiki.'
    : filter.type === 'tv'
      ? 'No TV references found on the wiki.'
      : 'No movie or TV references found on the wiki.'
);
const heuristicsNote =
  'Movies and TV shows are picked out by keyword heuristics plus hand corrections, ' +
  'so expect a few misses and mislabels.';
</script>

<template>
  <div class="watchlist">
    <p class="summary">
      {{ summary }}
      <strong>Must-watch</strong>
      means the episode's title or plot is built on it.
    </p>

    <div class="controls">
      <div class="pills" role="group" aria-label="Season">
        <button
          type="button"
          :aria-pressed="filter.season === 'all'"
          @click="filter.season = 'all'"
        >
          All
        </button>
        <button
          v-for="s in seasons"
          :key="s"
          type="button"
          :aria-pressed="filter.season === s"
          @click="filter.season = s"
        >
          S{{ s }}
        </button>
      </div>
      <div class="row">
        <div class="pills" role="group" aria-label="Show movies, TV, or both">
          <button
            v-for="t in TYPES"
            :key="t.value"
            type="button"
            :aria-pressed="filter.type === t.value"
            @click="filter.type = t.value"
          >
            {{ t.label }}
          </button>
        </div>
        <input
          v-model="filter.query"
          type="search"
          placeholder="Search episodes, movies or shows…"
          aria-label="Search episodes, movies or shows"
        />
      </div>
      <div class="row">
        <label>
          <input v-model="filter.mustWatchOnly" type="checkbox" />
          Must-watch only
        </label>
        <label>
          <input v-model="filter.hideSeen" type="checkbox" />
          Hide seen
        </label>
        <label>
          <input v-model="filter.hideEmpty" type="checkbox" />
          Hide episodes with none
        </label>
      </div>
    </div>

    <p v-if="!visible.length" class="muted">Nothing matches.</p>

    <article v-for="ep in visible" :key="ep.title" class="ep">
      <header>
        <span class="code">{{ episodeCode(ep) }}</span>
        <span class="ep-title">{{ ep.title }}</span>
        <span class="links">
          <a :href="ep.wiki + '/Trivia'" target="_blank" rel="noopener">wiki</a>
          <template v-if="ep.imdb">
            ·
            <a
              :href="`https://www.imdb.com/title/${ep.imdb}/movieconnections/`"
              target="_blank"
              rel="noopener"
            >
              IMDb
            </a>
          </template>
        </span>
      </header>

      <ul v-if="ep.titles.length" class="titles">
        <li v-for="t in ep.titles" :key="t.key" :class="{ seen: seen[t.key] }">
          <input
            type="checkbox"
            :checked="!!seen[t.key]"
            :aria-label="`Seen ${t.title}`"
            @change="toggleSeen(t.key)"
          />
          <img v-if="t.poster" :src="t.poster" alt="" loading="lazy" />
          <div>
            <div class="t-title">
              <span v-if="t.type === 'tv'" class="tag" title="TV show">TV</span>
              <a v-if="t.tmdb" :href="t.tmdb" target="_blank" rel="noopener">{{ t.title }}</a>
              <template v-else>{{ t.title }}</template>
              <span v-if="t.year" class="muted">({{ t.year }})</span>
              <span v-if="t.major" class="badge">must-watch</span>
              <a
                class="watch"
                :href="justWatchUrl(t.title)"
                target="_blank"
                rel="noopener"
                :aria-label="`Where to watch ${t.title} (JustWatch)`"
              >
                Where to watch ↗
              </a>
            </div>
            <div class="context">{{ t.context }}</div>
          </div>
        </li>
      </ul>
      <p v-else class="muted none">{{ noneLabel }}</p>

      <details v-if="!watchlist.tmdbVerified && ep.maybes.length && !filter.mustWatchOnly">
        <summary>
          {{ ep.maybes.length }} other mention{{ ep.maybes.length > 1 ? 's' : '' }} (unsure what
          they are)
        </summary>
        <ul class="maybes">
          <li v-for="g in groupMaybes(ep.maybes)" :key="g.context">
            <template v-for="(seg, i) in highlightSegments(g.context, g.titles)" :key="i">
              <mark v-if="seg.hit">{{ seg.text }}</mark>
              <template v-else>{{ seg.text }}</template>
            </template>
          </li>
        </ul>
      </details>
    </article>

    <p class="muted credit">
      Reference data from the
      <a href="https://bobs-burgers.fandom.com/" target="_blank" rel="noopener">
        Bob's Burgers Wiki
      </a>
      (CC BY-SA) episode Trivia pages.
      <template v-if="watchlist.tmdbVerified">
        Matching and posters by
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a>
      </template>
      <template v-else>{{ heuristicsNote }}</template>
    </p>
  </div>
</template>

<style scoped>
.summary {
  color: var(--vp-c-text-2);
}

.controls {
  position: sticky;
  top: var(--vp-nav-height, 64px);
  z-index: 5;
  background: var(--vp-c-bg);
  padding: 10px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pills {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.pills button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--vp-c-text-1);
}

/* White text needs a dark enough pill: brand-1 is the darkest brand shade in
   light mode but the lightest in dark mode, where brand-3 (the brand-button
   colour) is darker. Both clear 4.5:1 contrast for the 13px label. */
.pills button[aria-pressed='true'] {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.dark .pills button[aria-pressed='true'] {
  background: var(--vp-c-brand-3);
  border-color: var(--vp-c-brand-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.row .pills {
  flex: none;
}

.row input[type='search'] {
  flex: 1 1 220px;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  font-size: 14px;
}

.row label {
  display: flex;
  gap: 5px;
  align-items: center;
  cursor: pointer;
}

.ep {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 10px 0;
}

.ep header {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
}

.code {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 13px;
  color: var(--vp-c-brand-1);
}

.ep-title {
  font-weight: 600;
  font-size: 16px;
}

.links {
  margin-left: auto;
  font-size: 12px;
}

.links a,
.credit a {
  color: var(--vp-c-text-2);
}

ul.titles {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

ul.titles li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 6px 0;
}

/* the text column fills the row, so "Where to watch" can sit at the right edge */
ul.titles li > div {
  flex: 1;
  min-width: 0;
}

ul.titles li input {
  margin-top: 5px;
  accent-color: var(--vp-c-brand-1);
}

ul.titles img {
  width: 34px;
  border-radius: 3px;
  flex: none;
}

/* Flex gap supplies the spaces that Prettier's whitespace-insensitive
   formatting strips from between the inline pieces. */
.t-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  font-weight: 600;
  line-height: 1.4;
}

.t-title .muted {
  font-weight: 400;
}

.tag {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--vp-c-text-3);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 16px;
  color: var(--vp-c-text-2);
}

.badge {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  vertical-align: 1px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.watch {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.watch:hover {
  text-decoration: underline;
}

.context {
  font-size: 13px;
  line-height: 1.45;
  color: var(--vp-c-text-2);
}

li.seen .t-title,
li.seen .context {
  color: var(--vp-c-text-3);
  text-decoration: line-through;
}

.muted {
  color: var(--vp-c-text-2);
}

.none {
  margin: 6px 0 0;
  font-size: 13px;
}

details {
  margin-top: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

details summary {
  cursor: pointer;
}

ul.maybes {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.45;
}

ul.maybes li + li {
  margin-top: 4px;
}

/* the unsure titles, highlighted where they appear in the trivia line */
ul.maybes mark {
  background: none;
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.credit {
  margin-top: 24px;
  font-size: 12px;
}
</style>
