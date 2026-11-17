#!/usr/bin/env python3
"""Turn IMDb "Connections" lists into overrides.toml entries.

Easiest: the "Copy for watchlist" bookmarklet (open bookmarklet.html to install it). Click it on
each episode's IMDb Connections page, then import everything you collected in one go; each page
is tagged with its IMDb id, so the episode is worked out for you:

    pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py            # add + re-export
    pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py --dry-run  # just show it

Or paste one episode's list by hand (copied from imdb.com/title/tt…/movieconnections/) and name
the episode:

    pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py S1E3

Titles the episode already lists are skipped, as are video games, music videos and anything in
overrides.toml's `ignore` list. TV series are added with type = "tv". If the text includes the
section headings, only References, Spoofs and Features are used ("Featured in", "Referenced in"
and the like point the other way: other works that mention this episode).
"""
import contextlib
import io
import json
import re
import sys
import tomllib
from dataclasses import dataclass

import bobs_refs as br

# IMDb section headings: keep these…
KEEP_SECTIONS = {"references", "spoofs", "features", "edited from"}
# …and drop these (other works pointing at this episode, or unrelated links)
DROP_SECTIONS = {"featured in", "referenced in", "spoofed in", "edited into", "follows",
                 "followed by", "version of", "remade as", "remake of", "spin-off from",
                 "spin-off", "alternate language version of", "references (in)"}
# Page chrome that shows up when copying a whole page
NOISE = re.compile(r"^(edit|jump to|suggest an edit.*|learn more.*|edit page|back|connections|"
                   r"cast & crew|user reviews|trivia|imdbpro|all topics|"
                   r"\d+ more)$", re.I)  # "7 more": the button that expands collapsed notes
# The Connections list ends where the page footer starts; ignore everything after it
END = re.compile(r"^(contribute to this page|more from this title|more to explore)$", re.I)
# How the bookmarklet tags each page it copies
BATCH_MARKER = re.compile(r"^=== IMDb (tt\d+) ===[ \t]*$", re.M)

# "[Title](https://www.imdb.com/title/tt123/…) (1968)"  or  "Title (TV Series 1999–)"
ENTRY = re.compile(
    r"^\[?(?P<title>[^\[\]]+?)\]?"
    r"(?:\((?P<url>https?://[^)\s]*)\))?"
    r"\s*\((?P<paren>[^()]*\b(?:1[89]|20)\d\d\b[^()]*)\)\s*$"
)
SKIP_KINDS = re.compile(r"video game|music video|podcast", re.I)
TV_KINDS = re.compile(r"\bTV (?:series|mini[ -]?series|episode|special|short)\b", re.I)


@dataclass
class Entry:
    title: str
    year: str
    kind: str  # "movie", "tv", or "skip"
    description: str = ""
    section: str = ""
    raw_kind: str = ""


def parse(text):
    """Pasted Connections text -> list of Entry (in paste order)."""
    entries, section, keep = [], "", True
    for raw in text.splitlines():
        line = re.sub(r"^\s*(?:[*\-•]|\d+\.)\s*", "", raw).strip()   # bullets
        line = re.sub(r"^#+\s*", "", line)                            # markdown headings
        if END.match(line):
            break
        if not line or NOISE.match(line):
            continue
        heading = re.sub(r"\s*\(\d+\)$", "", line).strip().lower()    # "References (3)"
        if heading in KEEP_SECTIONS or heading in DROP_SECTIONS:
            section, keep = heading, heading in KEEP_SECTIONS
            continue
        m = ENTRY.match(line)
        if m:
            if not keep:
                continue
            title, paren = m["title"].strip(), m["paren"].strip()
            year = re.search(r"(?:1[89]|20)\d\d", paren).group(0)
            kind = "skip" if SKIP_KINDS.search(paren) else "tv" if TV_KINDS.search(paren) else "movie"
            # TV episodes are listed as '"Show" Episode Name' — keep the show
            q = re.match(r'^"([^"]+)"', title)
            if q:
                title, kind = q.group(1), "skip" if kind == "skip" else "tv"
            if kind == "tv":
                year = ""  # a series' start year isn't what you'd watch; keep it off
            entries.append(Entry(title, year, kind, section=section, raw_kind=paren))
        elif entries and keep:
            d = entries[-1].description
            entries[-1].description = f"{d} {line}".strip()
    return entries


def episode_code(arg):
    m = re.fullmatch(r"\s*S(\d{1,2})\s*E(\d{1,3})\s*", arg, re.I)
    if not m:
        sys.exit(f"episode should look like S1E3 or S01E03, not {arg!r}")
    return int(m[1]), int(m[2])


def split_batch(text):
    """Bookmarklet output -> [(imdb_id, page_text)], or None if the text has no markers."""
    parts = BATCH_MARKER.split(text)
    if len(parts) == 1:
        return None
    return list(zip(parts[1::2], parts[2::2]))


def toml_str(s):
    # JSON string escapes are valid TOML basic-string escapes
    return json.dumps(s, ensure_ascii=False)


def sentence(text):
    """IMDb notes as a sentence: capitalised, ending in punctuation, without doubling it.

    'mentioned in dialogue' -> 'Mentioned in dialogue.'   '"Serpentine!"' stays as it is.
    """
    d = re.sub(r"\s+\d+ more$", "", text.strip())  # "Mentioned in dialogue 1 more"
    if not d:
        return ""
    d = d[0].upper() + d[1:]
    # already ends a sentence, possibly inside closing quotes/brackets: "…!"  "…?"  …)
    if re.search(r"[.!?…][\"'”’)\]]*$", d):
        return d
    # a quote that ends without punctuation ("Pasta la vista, baby") is complete as it is
    if re.search(r"[\"”]$", d) and d[0] in "\"“":
        return d
    return d + "."


def entry_line(e):
    note = sentence(e.description) or ("Spoofed" if e.section == "spoofs" else "Referenced")
    note += " (from IMDb Connections)"
    parts = [f"title = {toml_str(e.title)}"]
    if e.kind == "tv":
        parts.append('type = "tv"')
    if e.year:
        parts.append(f"year = {e.year}")
    parts.append(f"note = {toml_str(note)}")
    return "  { " + ", ".join(parts) + " },"


def insert(toml_text, code, ep_title, lines):
    """Add `lines` to [code]'s add array, creating the array or section if needed."""
    rows = toml_text.split("\n")
    header = re.compile(r"^\[(S\d\dE\d\d)\]")
    start = next((i for i, r in enumerate(rows) if header.match(r) and header.match(r)[1] == code), None)
    if start is None:
        # new section, kept in episode order
        block = [f"[{code}]  # {ep_title} — from IMDb's Connections page", "add = [", *lines, "]", ""]
        after = next((i for i, r in enumerate(rows) if header.match(r) and header.match(r)[1] > code), None)
        if after is None:
            if rows and rows[-1] != "":
                rows.append("")
            rows[len(rows):] = block
        else:
            rows[after:after] = block
        return "\n".join(rows)
    end = next((i for i in range(start + 1, len(rows)) if header.match(rows[i])), len(rows))
    add = next((i for i in range(start + 1, end) if re.match(r"^add\s*=", rows[i])), None)
    if add is None:
        rows[start + 1:start + 1] = ["add = [", *lines, "]"]
        return "\n".join(rows)
    if not re.match(r"^add\s*=\s*\[\s*(#.*)?$", rows[add]):
        sys.exit(f"[{code}]'s add list is on one line; split it over several lines and retry")
    close = next((i for i in range(add + 1, end) if re.match(r"^\]\s*(#.*)?$", rows[i])), None)
    if close is None:
        sys.exit(f"couldn't find the end of [{code}]'s add list")
    rows[close:close] = lines
    return "\n".join(rows)


def plan_episode(ep, text, raw):
    """Decide what to add for one episode. Returns (entry lines, report lines)."""
    code = f"S{ep['season']:02}E{ep['number']:02}"
    listed = {br.simple(t["title"]) for t in ep["titles"]}
    ignored = {br.simple(t) for t in raw.get("ignore", [])}
    removed = {br.simple(t) for t in raw.get(code, {}).get("remove", [])}
    entries = parse(text)
    new, report = [], []
    for e in entries:
        k = br.simple(e.title)
        if e.kind == "skip":
            report.append(f"  skip  {e.title} ({e.raw_kind}): not a movie or TV show")
        elif k in listed:
            report.append(f"  skip  {e.title}: already listed")
        elif k in ignored or k in removed:
            report.append(f"  skip  {e.title}: in overrides.toml's ignore/remove list")
        else:
            listed.add(k)
            new.append(e)
            report.append(f"  add   {e.title}" + (" (TV)" if e.kind == "tv" else f" ({e.year})"))
    head = f"S{ep['season']}E{ep['number']} {ep['title']}: "
    head += f"{len(new)} to add, {len(entries) - len(new)} skipped" if entries else "no titles found"
    return [entry_line(e) for e in new], [head, *report]


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) > 1:
        sys.exit(__doc__)

    # export first so "already listed" reflects the current overrides
    with contextlib.redirect_stdout(io.StringIO()):
        br.cmd_export()
    episodes = json.loads(br.OUT_JSON.read_text())["episodes"]
    raw = tomllib.loads(br.OVERRIDES.read_text())

    text = sys.stdin.read()
    batch = split_batch(text)
    jobs = []  # (episode, page text)
    if args:
        season, number = episode_code(args[0])
        ep = next((e for e in episodes if (e["season"], e["number"]) == (season, number)), None)
        if not ep:
            sys.exit(f"S{season}E{number} isn't in the watchlist data")
        if batch and len(batch) > 1:
            sys.exit("that's several copied pages; leave off the episode and they'll be matched by IMDb id")
        jobs.append((ep, batch[0][1] if batch else text))
    elif batch:
        by_imdb = {e["imdb"]: e for e in episodes if e["imdb"]}
        for imdb_id, page in batch:
            ep = by_imdb.get(imdb_id)
            if ep:
                jobs.append((ep, page))
            else:
                print(f"{imdb_id}: not a Bob's Burgers episode in the watchlist data, skipping")
    else:
        sys.exit("name the episode (e.g. S1E3), or use text copied with the bookmarklet\n\n" + __doc__)

    planned = []
    for ep, page in jobs:
        lines, report = plan_episode(ep, page, raw)
        print("\n".join(report))
        if lines:
            planned.append((ep, lines))
    if not planned:
        print("\nnothing new to add")
        return
    if dry:
        for ep, lines in planned:
            print(f"\n(dry run) would add to [S{ep['season']:02}E{ep['number']:02}]:\n" + "\n".join(lines))
        return

    after = br.OVERRIDES.read_text()
    for ep, lines in planned:
        after = insert(after, f"S{ep['season']:02}E{ep['number']:02}", ep["title"], lines)
    try:
        tomllib.loads(after)
    except tomllib.TOMLDecodeError as err:
        sys.exit(f"not writing: the result wouldn't be valid TOML ({err})")
    br.OVERRIDES.write_text(after)
    total = sum(len(lines) for _, lines in planned)
    print(f"\nupdated {br.OVERRIDES.name}: {total} titles across {len(planned)} episode(s)")
    br.cmd_export()


if __name__ == "__main__":
    main(sys.argv[1:])
