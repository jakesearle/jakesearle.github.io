#!/usr/bin/env python3
"""Build a per-episode "watch these first" list of movies and TV shows Bob's Burgers references.

Source: the Bob's Burgers Fandom wiki (MediaWiki API, CC-BY-SA), specifically
each episode's "/Trivia" subpage. Optional: verify/enrich titles with TMDB.

Usage (from anywhere; paths are relative to this file):
    python3 bobs_refs.py fetch      # download wiki pages into ./cache (polite, batched)
    python3 bobs_refs.py extract    # parse trivia -> cache/refs.json
    python3 bobs_refs.py tmdb       # (optional) needs TMDB_API_KEY or TMDB_READ_TOKEN
    python3 bobs_refs.py export     # cache/refs.json + overrides.toml -> tv/bobs-burgers/watchlist.json
    python3 bobs_refs.py all        # all of the above (tmdb skipped if no key)
"""
import difflib
import json
import os
import re
import sys
import time
import tomllib
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
WIKI_API = "https://bobs-burgers.fandom.com/api.php"
WIKI_BASE = "https://bobs-burgers.fandom.com/wiki/"
UA = "bobs-refs-personal-project/0.1 (personal, non-commercial)"
REFS = CACHE / "refs.json"
REPO = ROOT.parents[1]
OUT_JSON = REPO / "tv" / "bobs-burgers" / "watchlist.json"
OVERRIDES = ROOT / "overrides.toml"
# What an added title adapts, when the episode references the original rather than the screen version
ADAPTED_FROM = ("stage", "book")

# Episodes where the wiki links the wrong IMDb title (checked by hand on imdb.com)
IMDB_OVERRIDES = {
    "Human Flesh": "tt1645218",  # wiki links tt1854660
}


# ---------------------------------------------------------------- fetch ----

def _get(url, params=None, headers=None, data=None):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def wiki_contents(titles):
    """Return {title: wikitext} for up to 50 titles per request."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        d = _get(WIKI_API, data={
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "titles": "|".join(chunk), "redirects": 1,
            "format": "json", "formatversion": 2,
        })
        # map redirected/normalized titles back to what we asked for
        back = {}
        for k in ("normalized", "redirects"):
            for m in d["query"].get(k, []):
                back[m["to"]] = back.get(m["from"], m["from"])
        for p in d["query"]["pages"]:
            if p.get("missing") or "revisions" not in p:
                continue
            asked = back.get(p["title"], p["title"])
            out[asked] = p["revisions"][0]["slots"]["main"]["content"]
        time.sleep(1)  # be polite
    return out


def wiki_imdb_ids(titles):
    """IMDb links are template-generated, so read them from rendered external links."""
    out = {}
    for i in range(0, len(titles), 50):
        params = {"action": "query", "prop": "extlinks", "ellimit": "max", "elquery": "www.imdb.com/title/",
                  "elprotocol": "http", "titles": "|".join(titles[i:i + 50]), "format": "json", "formatversion": 2}
        while True:
            d = _get(WIKI_API, data=params)
            for p in d["query"]["pages"]:
                for l in p.get("extlinks", []):
                    m = IMDB_ID.search(l["url"])
                    if m:
                        out.setdefault(p["title"], m.group(1))
            if "continue" not in d:
                break
            params.update(d["continue"])
        time.sleep(1)
    return out


def cmd_fetch():
    CACHE.mkdir(exist_ok=True)
    d = _get(WIKI_API, {"action": "query", "list": "embeddedin", "eititle": "Template:Episode",
                        "einamespace": 0, "eilimit": 500, "format": "json"})
    titles = [e["title"] for e in d["query"]["embeddedin"]]
    print(f"{len(titles)} pages use Template:Episode")
    main = wiki_contents(titles)
    trivia = wiki_contents([t + "/Trivia" for t in titles])
    (CACHE / "episodes.json").write_text(json.dumps(main, indent=1))
    (CACHE / "trivia.json").write_text(json.dumps(trivia, indent=1))
    (CACHE / "imdb_ids.json").write_text(json.dumps(wiki_imdb_ids(titles), indent=1))
    print(f"cached {len(main)} episode pages, {len(trivia)} trivia pages")


# -------------------------------------------------------------- extract ----

INFOBOX_FIELD = lambda name: re.compile(r"\|\s*" + name + r"\s*=\s*([^\n|]*)")
IMDB_ID = re.compile(r"imdb\.com/title/(tt\d+)")
# ''[[wikipedia:Target|Label]]''  /  [[wikipedia:Target]]
WP_LINK = re.compile(r"(''+)?\[\[\s*(?:wikipedia|wp|w):([^|\]]+)(?:\|([^\]]+))?\]\](''+)?", re.I)
# ''[http://www.imdb.com/title/tt123/ Label]''
EXT_LINK = re.compile(r"(''+)?\[(https?://[^\s\]]+)\s+([^\]]+)\](''+)?")
# ''[[Local page|Label]]''  (italic local links are often film titles too)
LOCAL_LINK = re.compile(r"''+\[\[([^|\]:]+)(?:\|([^\]]+))?\]\]''+")
ITALIC = re.compile(r"(?<!')''([^'\n]{2,80}?)''(?!')")
YEAR_FILM = re.compile(r"\b(1[89]\d\d|20\d\d)\s+(?:film|movie|animated film|horror film)", re.I)

REF_WORDS = re.compile(r"referenc|parod|homage|nod to|spoof|allusion|inspired by|based on|"
                       r"riff|callback to|similar to|resembl|like in|from the (?:film|movie)", re.I)
MOVIE_WORDS = re.compile(r"\b(film|movie|flick)s?\b", re.I)
# Bare "series"/"show" are too loose: "the Evil Dead series" is a film franchise, "an episode of
# the series" is Bob's Burgers itself, "show and tell" is neither.
TV_WORDS = re.compile(r"\b(tv|television|sitcom|miniseries|cartoon|anime|soap opera|telenovela|"
                      r"(?:tv|television|animated|cartoon|web|anthology|reality|drama|comedy) series|"
                      r"(?:tv|television|game|talk|reality|cooking|children's|kids'?|variety|sketch) show|"
                      r"network)s?\b", re.I)
OTHER_WORDS = re.compile(r"\b(song|album|band|singer|rapper|novel|book|comic|video game|board game|"
                         r"commercial|musical|broadway|play|poem|meme|brand|company|restaurant|toy|"
                         r"magazine|painting|slogan|catchphrase)s?\b", re.I)
# a reference to the episode's *premise* - the must-watch kind
MAJOR_WORDS = re.compile(r"\b(episode'?s? title|the title|title of the episode|title and|"
                         r"plot|premise|script cover|entire episode|whole episode|"
                         r"episode is (?:a )?(?:parody|reference|homage)|parod(?:y|ies) (?:of )?the (?:film|movie))", re.I)


def clean(text):
    """Wikitext -> readable plain text (good enough for display)."""
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", t)
    t = re.sub(r"\{\{[^}]*\}\}", "", t)
    t = re.sub(r"'''?", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", t).strip(" *:")


def norm_title(s):
    s = re.sub(r"\s*\((?:\d{4} )?(?:film|movie|franchise|film series|tv series|tv program|"
               r"american tv series|sitcom)\)$", "", s.strip(), flags=re.I)
    return s.replace("_", " ").strip(" .,;:\"")


def bullets(wikitext, section="Trivia"):
    """Top-level bullets of a section, with sub-bullets folded into their parent."""
    m = re.search(r"==\s*" + section + r"\s*==(.*?)(?=\n==[^=]|\Z)", wikitext, re.S | re.I)
    body = m.group(1) if m else wikitext
    out = []
    for line in body.split("\n"):
        if line.startswith("**") and out:
            out[-1] += "\n" + line
        elif line.startswith("*"):
            out.append(line)
    return [b for b in out if b.strip("* \n")]


def candidates(bullet, is_ref=False):
    """Yield dicts of possible titles found in one trivia bullet."""
    seen = set()
    year = YEAR_FILM.search(bullet)
    year = int(year.group(1)) if year else None

    def add(title, how, imdb=None, hint=None):
        t = norm_title(title)
        if (not t or t.lower() in seen or len(t) > 70
                or not t[0].isupper() and not t[0].isdigit()   # "film franchise", "idiom with..."
                or re.fullmatch(r"[\d\s'’s]+", t)):            # bare years like "1974"
            return
        seen.add(t.lower())
        found.append({"title": t, "how": how, "imdb": imdb, "hint": hint, "year": year})

    found = []
    for m in EXT_LINK.finditer(bullet):
        url, label = m.group(2), m.group(3)
        im = IMDB_ID.search(url)
        if im:  # IMDb has movies and series alike, so the link alone doesn't settle the type
            add(label, "imdb-link", imdb=im.group(1))
    for m in WP_LINK.finditer(bullet):
        target, label = m.group(2), m.group(3) or m.group(2)
        italic = bool(m.group(1) and m.group(4))
        hint = ("movie" if re.search(r"\((?:\d{4} )?film\)", target, re.I) else
                "tv" if re.search(r"\((?:\w+ )?(?:tv series|sitcom|tv program)\)", target, re.I) else None)
        # non-italic wikipedia links are often people/places, so only take them in "reference" bullets
        if italic or hint or is_ref:
            add(label, "wikipedia-link", hint=hint)
    for m in LOCAL_LINK.finditer(bullet):
        add(m.group(2) or m.group(1), "italic-local-link")
    for m in ITALIC.finditer(bullet):
        inner = m.group(1)
        if "[" in inner or "]" in inner:
            continue
        add(inner, "italic")
    return found


def guess_kind(c, text):
    """movie / tv / other / unknown, from the words around the title (then the whole bullet)."""
    if c["hint"]:
        return c["hint"]
    i = text.lower().find(c["title"].lower())
    window = text[max(0, i - 50): i + len(c["title"]) + 50] if i >= 0 else text
    # don't let the title's own words vote ("The Truman Show", "Movie 43")
    window = window.replace(c["title"], " ")
    near = {k for k, rx in (("movie", MOVIE_WORDS), ("tv", TV_WORDS), ("other", OTHER_WORDS))
            if rx.search(window)}
    if len(near) == 1:
        return near.pop()
    if not near:  # nothing close by: e.g. "many horror movie references: ... The Shining"
        whole = text.replace(c["title"], " ")
        bullet = {k for k, rx in (("movie", MOVIE_WORDS), ("tv", TV_WORDS)) if rx.search(whole)}
        if len(bullet) == 1 and not OTHER_WORDS.search(window):
            return bullet.pop()
    return "unknown"


def infobox(wikitext, field):
    m = INFOBOX_FIELD(field).search(wikitext)
    return m.group(1).strip() if m else ""


def cmd_extract():
    main = json.loads((CACHE / "episodes.json").read_text())
    trivia = {k.removesuffix("/Trivia"): v for k, v in json.loads((CACHE / "trivia.json").read_text()).items()}
    ids_f = CACHE / "imdb_ids.json"
    imdb_ids = json.loads(ids_f.read_text()) if ids_f.exists() else {}
    # trivia often italicizes *other Bob's Burgers episodes*; those aren't outside references
    own_titles = {simple(norm_title(t.replace(" (episode)", ""))) for t in main}
    episodes = []
    for title, wt in main.items():
        season = infobox(wt, "season")
        number = re.split(r"\D", infobox(wt, "number"))[0]  # "6<hr />7" two-parters -> 6
        if not (season.isdigit() and number.isdigit()):
            continue  # skips the movie, shorts, unaired pilot, etc.
        ep = {
            "title": title, "season": int(season), "number": int(number),
            "overall": infobox(wt, "over"), "aired": infobox(wt, "usa"),
            "imdb": IMDB_OVERRIDES.get(title) or imdb_ids.get(title),
            "wiki": WIKI_BASE + urllib.parse.quote(title.replace(" ", "_")),
            "has_trivia": title in trivia, "refs": [],
        }
        for b in bullets(trivia.get(title, "")):
            is_ref = bool(REF_WORDS.search(b))
            cands = candidates(b, is_ref)
            if not cands:
                continue
            text = clean(b)
            for c in cands:
                if not (is_ref or c["how"] in ("imdb-link", "wikipedia-link")):
                    continue
                if simple(c["title"]) in own_titles and c["how"] not in ("imdb-link", "wikipedia-link"):
                    continue
                ep["refs"].append({
                    **c,
                    "kind_guess": guess_kind(c, text),
                    "major": bool(MAJOR_WORDS.search(b)),
                    "context": text,  # whole trivia line; titles get trimmed on export
                })
        episodes.append(ep)
    episodes.sort(key=lambda e: (e["season"], e["number"]))
    REFS.write_text(json.dumps(episodes, indent=1))
    kinds = Counter(r["kind_guess"] for e in episodes for r in e["refs"])
    print(f"{len(episodes)} episodes, {sum(kinds.values())} candidate refs: "
          + ", ".join(f"{n} {k}" for k, n in kinds.most_common()))


# ----------------------------------------------------------------- tmdb ----

TMDB = "https://api.themoviedb.org/3"
TMDB_CACHE_VERSION = "v2"  # bump when the shape of cached matches changes


def tmdb_get(path, params):
    key, token = os.environ.get("TMDB_API_KEY"), os.environ.get("TMDB_READ_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if key and not token:
        params = {**params, "api_key": key}
    time.sleep(0.05)
    return _get(TMDB + path, params, headers=headers)


def simple(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "and"))


def _tmdb_search(media, title, year):
    """Best TMDB hit for a title as `media` ('movie' or 'tv'), or None."""
    name, orig = ("title", "original_title") if media == "movie" else ("name", "original_name")
    params = {"query": title}
    if year:
        params["year" if media == "movie" else "first_air_date_year"] = year
    hits = tmdb_get(f"/search/{media}", params).get("results", [])
    exact = [h for h in hits if simple(title) in (simple(h.get(name, "")), simple(h.get(orig, "")))]
    # require exact title match; prefer the most-voted (avoids obscure same-name titles)
    exact.sort(key=lambda h: h.get("vote_count", 0), reverse=True)
    if exact and exact[0].get("vote_count", 0) >= 50:
        return exact[0]
    if hits:
        # wiki typos ("Inglorious Basterds", "Seventeen Again"): accept a close, well-known top hit
        top = hits[0]
        if (difflib.SequenceMatcher(None, simple(title), simple(top.get(name, ""))).ratio() >= 0.85
                and top.get("vote_count", 0) >= 200):
            return top
    return None


def tmdb_match(ref, cache):
    ck = f"{TMDB_CACHE_VERSION}|{ref['imdb'] or ref['title'] + '|' + str(ref['year'])}"
    if ck in cache:
        return cache[ck]
    res, media = None, None
    if ref["imdb"]:
        d = tmdb_get(f"/find/{ref['imdb']}", {"external_source": "imdb_id"})
        for media in ("movie", "tv"):
            if d.get(f"{media}_results"):
                res = d[f"{media}_results"][0]
                break
    else:
        # try the guessed type first; "unknown" tries movie first
        order = ("tv", "movie") if ref["kind_guess"] == "tv" else ("movie", "tv")
        for media in order:
            res = _tmdb_search(media, ref["title"], ref["year"] if media == "movie" else None)
            if res:
                break
    if res:
        res = {
            "media": media, "id": res["id"],
            "title": res.get("title") or res.get("name"),
            "date": res.get("release_date") or res.get("first_air_date") or "",
            "poster_path": res.get("poster_path"),
        }
    cache[ck] = res
    return res


def cmd_tmdb():
    if not (os.environ.get("TMDB_API_KEY") or os.environ.get("TMDB_READ_TOKEN")):
        print("tmdb: skipped (set TMDB_API_KEY or TMDB_READ_TOKEN to enable)")
        return
    episodes = json.loads(REFS.read_text())
    cache_f = CACHE / "tmdb.json"
    cache = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    for ep in episodes:
        for r in ep["refs"]:
            # songs, books, brands… often share names with films; overrides can rescue a miss
            r["tmdb"] = None if r["kind_guess"] == "other" else tmdb_match(r, cache)
    cache_f.write_text(json.dumps(cache, indent=1))
    REFS.write_text(json.dumps(episodes, indent=1))
    found = Counter(r["tmdb"]["media"] for e in episodes for r in e["refs"] if r.get("tmdb"))
    print(f"tmdb: matched {found['movie']} movies and {found['tv']} TV shows")


# ------------------------------------------------------------ overrides ----

class Overrides:
    """Hand corrections from overrides.toml, applied on export (they beat guesses and TMDB).

    Tracks which entries matched something, so typos and stale entries get reported.
    """

    def __init__(self, path):
        raw = tomllib.loads(path.read_text()) if path.exists() else {}
        self.types = {}
        for kind, key in (("movie", "movies"), ("tv", "tv"), ("ignore", "ignore")):
            for t in raw.pop(key, []):
                self.types[simple(t)] = (kind, t)
        self.episodes = {}
        for code, ep in raw.items():
            if not (isinstance(ep, dict) and re.fullmatch(r"S\d\dE\d\d", code)):
                sys.exit(f"overrides.toml: unexpected entry {code!r} (episode tables look like [S01E02])")
            self.episodes[code] = ep
        self.used = set()

    def kind_for(self, title):
        hit = self.types.get(simple(title))
        if hit:
            self.used.add(("type", hit[1]))
            return hit[0]
        return None

    def episode(self, code):
        if code in self.episodes:
            self.used.add(("episode", code))
        return self.episodes.get(code, {})

    def report(self, codes, misses):
        for kind, t in self.types.values():
            if ("type", t) not in self.used:
                misses.append(f"{kind} {t!r} didn't match any title")
        for code in self.episodes:
            if code not in codes:
                misses.append(f"[{code}] isn't an episode")
        for m in misses:
            print(f"  overrides warning: {m}")


# --------------------------------------------------------------- export ----

def ref_kind(r, overrides):
    """Final type for an extracted ref: override, else TMDB (when it ran), else the guess."""
    forced = overrides.kind_for(r["title"])
    if not forced and r.get("tmdb"):
        forced = overrides.kind_for(r["tmdb"]["title"])
    if forced:
        return forced
    if "tmdb" in r:
        return r["tmdb"]["media"] if r["tmdb"] else "other"
    return r["kind_guess"]


def trim(s, n=300):
    return s if len(s) <= n else s[: n - 3].rstrip() + "…"


def cmd_export():
    episodes = json.loads(REFS.read_text())
    tmdb_ran = any("tmdb" in r for e in episodes for r in e["refs"])
    overrides = Overrides(OVERRIDES)
    misses, codes, data = [], set(), []
    for e in episodes:
        code = f"S{e['season']:02}E{e['number']:02}"
        codes.add(code)
        fix = overrides.episode(code)
        removed = {simple(t) for t in fix.get("remove", [])}
        titles, maybes = {}, []

        def put(item, major):
            """Add (or merge into) the episode's list, keyed by a normalised title."""
            k = simple(item["title"])
            if k in titles:
                titles[k]["major"] |= major
            else:
                titles[k] = {**item, "major": major}

        for r in e["refs"]:
            kind = ref_kind(r, overrides)
            if simple(r["title"]) in removed:
                continue
            if kind == "unknown":
                if all(simple(m["title"]) != simple(r["title"]) for m in maybes):
                    maybes.append({"title": r["title"], "context": r["context"]})
                continue
            if kind not in ("movie", "tv"):
                continue
            t = r.get("tmdb") if r.get("tmdb") and r["tmdb"]["media"] == kind else None
            put({
                "key": f"{t['media']}-{t['id']}" if t else simple(r["title"]),
                "title": t["title"] if t else r["title"], "type": kind,
                "year": t["date"][:4] if t else (str(r["year"]) if r["year"] and kind == "movie" else ""),
                "poster": f"https://image.tmdb.org/t/p/w92{t['poster_path']}" if t and t.get("poster_path") else "",
                "tmdb": f"https://www.themoviedb.org/{t['media']}/{t['id']}" if t else "",
                "context": trim(r["context"]),
            }, r["major"])

        for a in fix.get("add", []):
            kind = a.get("type", "movie")
            if kind not in ("movie", "tv"):
                misses.append(f"[{code}] add {a.get('title')!r}: type must be \"movie\" or \"tv\"")
                continue
            adapted = a.get("adapted_from")
            if adapted not in (None, *ADAPTED_FROM):
                misses.append(f"[{code}] add {a.get('title')!r}: adapted_from must be one of "
                              + ", ".join(f'"{x}"' for x in ADAPTED_FROM))
                adapted = None
            put({
                "key": simple(a["title"]), "title": a["title"], "type": kind,
                "year": str(a.get("year", "")), "poster": "", "tmdb": "",
                "context": a.get("note", "Added by hand."),
                # only written when set, to keep the JSON small
                **({"adaptedFrom": adapted} if adapted else {}),
            }, bool(a.get("must_watch")))

        present = {simple(t["title"]) for t in titles.values()} | {simple(m["title"]) for m in maybes}
        for t in fix.get("remove", []):
            if simple(t) not in present and not any(simple(t) == simple(r["title"]) for r in e["refs"]):
                misses.append(f"[{code}] remove {t!r} isn't in that episode")
        for field, value in (("must_watch", True), ("not_must_watch", False)):
            for t in fix.get(field, []):
                match = titles.get(simple(t))
                if match:
                    match["major"] = value
                else:
                    misses.append(f"[{code}] {field} {t!r} isn't listed for that episode")

        # anything typed by override is no longer a "maybe"
        maybes = [m for m in maybes if simple(m["title"]) not in titles]
        ordered = sorted(titles.values(), key=lambda t: (not t["major"], t["type"] != "movie"))
        data.append({k: e[k] for k in ("title", "season", "number", "aired", "imdb", "wiki")}
                    | {"titles": ordered, "maybes": maybes})

    overrides.report(codes, misses)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    # one episode per line: compact, but diffs stay readable when the data is regenerated
    lines = ",\n".join("  " + json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in data)
    OUT_JSON.write_text('{"tmdbVerified":' + json.dumps(tmdb_ran) + ',"episodes":[\n' + lines + "\n]}\n")
    json.loads(OUT_JSON.read_text())  # sanity check
    counts = Counter(t["type"] for d in data for t in d["titles"])
    print(f"wrote {OUT_JSON.relative_to(REPO)}: {counts['movie']} movie and {counts['tv']} TV refs "
          f"across {len(data)} episodes")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    steps = {"fetch": [cmd_fetch], "extract": [cmd_extract], "tmdb": [cmd_tmdb], "export": [cmd_export],
             "all": [cmd_fetch, cmd_extract, cmd_tmdb, cmd_export]}
    if cmd not in steps:
        sys.exit(__doc__)
    for f in steps[cmd]:
        f()
