# Bob's Burgers movie & TV references

Generates `tv/bobs-burgers/watchlist.json`, the data behind `/tv/bobs-burgers/`: for each episode,
the movies and TV shows it references.

The source is the [Bob's Burgers Fandom wiki](https://bobs-burgers.fandom.com/): every page using
`{{Episode}}`, plus its `/Trivia` subpage. These are fetched through the MediaWiki API (around 20
batched requests) and cached in `cache/` (gitignored). Titles are pulled from Wikipedia/IMDb links
and italicised titles in trivia lines that talk about references, parodies or homages. Each one is
then guessed to be a movie, a TV show, something else (song, book, game…) or unknown, from nearby
words like "film" or "sitcom".

IMDb isn't used as a source: it has no free API for connections and blocks automated access.

```sh
python3 scripts/bobs-burgers-refs/bobs_refs.py all      # fetch → extract → (tmdb) → export
python3 scripts/bobs-burgers-refs/bobs_refs.py extract  # re-parse cached pages after tweaking rules
python3 scripts/bobs-burgers-refs/bobs_refs.py export   # apply overrides.toml and write the JSON
```

## Hand corrections: `overrides.toml`

Fix anything the guesses get wrong, then re-run `export` (no new download from the wiki is needed).
Overrides beat both the keyword guesses and TMDB.

- `movies`, `tv`, `ignore`: set a title's type everywhere it appears. Use `ignore` for things that
  aren't real movies or shows, such as parody names made up for the episode.
- `[S01E02]` tables: `add`, `remove`, `must_watch`, `not_must_watch` for a single episode. `add`
  is useful for references the wiki misses but IMDb's Connections page lists.

The file's header comment documents every field. Export prints a warning for any entry that didn't
match anything, so typos and entries that no longer match the wiki don't fail silently.

## TMDB (optional, recommended)

Without TMDB, the type is a keyword guess. With a free
[TMDB](https://www.themoviedb.org/settings/api) read token, each title is looked up as a movie and
as a TV show instead: unmatched titles are dropped, wiki typos get corrected, and posters and years
are added.

```sh
TMDB_READ_TOKEN=… python3 scripts/bobs-burgers-refs/bobs_refs.py tmdb
python3 scripts/bobs-burgers-refs/bobs_refs.py export
```

## Known gaps

- The wiki tends to list an episode's premise parody but skips quick dialogue mentions that IMDb's
  Connections page has. The page links each episode's IMDb Connections page for that reason.
- `IMDB_OVERRIDES` in the script fixes episodes where the wiki links the wrong IMDb title.
- Upcoming episodes are skipped until the wiki gives them season and episode numbers.
