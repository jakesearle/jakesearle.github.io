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
- Stage shows and books: `add` a well-known screen adaptation with `adapted_from = "stage"` (or
  `"book"`) and a note, which shows a "From the stage" label on the page; otherwise `ignore` it.

The file's header comment documents every field. Export prints a warning for any entry that didn't
match anything, so typos and entries that no longer match the wiki don't fail silently.

## Importing from IMDb Connections

The wiki misses many references that an episode's IMDb Connections page lists
(`imdb.com/title/tt…/movieconnections/`; each episode on the site links to it). To add them, copy
the page's References / Spoofs / Features entries and pipe them in:

```sh
pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py S1E3 --dry-run   # preview
pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py S1E3             # add + re-export
```

It appends `add` entries to that episode's section in `overrides.toml` (creating it in episode
order if needed), then re-exports. Titles the episode already lists, titles in `ignore` or that
episode's `remove`, video games and music videos are skipped; TV series get `type = "tv"`. If the
paste includes section headings, "Featured in", "Referenced in" and similar sections are dropped,
since they list other works that mention the episode. IMDb's description becomes the note, so
reword it in `overrides.toml` if you'd rather not publish IMDb's text as-is.

Tests: `python3 -m unittest scripts/bobs-burgers-refs/test_import_imdb.py`

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
