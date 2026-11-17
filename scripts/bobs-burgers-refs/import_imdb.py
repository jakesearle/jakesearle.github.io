#!/usr/bin/env python3
"""Turn a pasted IMDb "Connections" list into overrides.toml entries for one episode.

Copy the References / Spoofs / Features sections from an episode's IMDb Connections page
(imdb.com/title/tt…/movieconnections/), then:

    pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py S1E3            # add + re-export
    pbpaste | python3 scripts/bobs-burgers-refs/import_imdb.py S1E3 --dry-run  # just show it

Titles the episode already lists are skipped, as are video games, music videos and anything in
overrides.toml's `ignore` list. TV series are added with type = "tv". If the paste includes the
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
NOISE = re.compile(r"^(edit|jump to|contribute to this page|suggest an edit.*|learn more.*|"
                   r"edit page|back|connections|more from this title|more to explore)$", re.I)

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


def toml_str(s):
    # JSON string escapes are valid TOML basic-string escapes
    return json.dumps(s, ensure_ascii=False)


def entry_line(e):
    d = e.description.strip().rstrip(".")
    # IMDb notes are often lowercase fragments ("mentioned in dialogue")
    note = d[:1].upper() + d[1:] + "." if d else ("Spoofed" if e.section == "spoofs" else "Referenced")
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


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) != 1:
        sys.exit(__doc__)
    season, number = episode_code(args[0])
    code = f"S{season:02}E{number:02}"

    # export first so "already listed" reflects the current overrides
    with contextlib.redirect_stdout(io.StringIO()):
        br.cmd_export()
    data = json.loads(br.OUT_JSON.read_text())
    ep = next((e for e in data["episodes"] if (e["season"], e["number"]) == (season, number)), None)
    if not ep:
        sys.exit(f"S{season}E{number} isn't in the watchlist data")
    listed = {br.simple(t["title"]) for t in ep["titles"]}
    raw = tomllib.loads(br.OVERRIDES.read_text())
    ignored = {br.simple(t) for t in raw.get("ignore", [])}
    removed = {br.simple(t) for t in raw.get(code, {}).get("remove", [])}

    text = sys.stdin.read()
    entries = parse(text)
    if not entries:
        sys.exit("found no titles in the paste — expected lines like 'Night of the Living Dead (1968)'")

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

    print(f"S{season}E{number} {ep['title']}: {len(new)} to add, {len(entries) - len(new)} skipped")
    print("\n".join(report))
    if not new:
        return
    lines = [entry_line(e) for e in new]
    if dry:
        print("\n(dry run) would add to [" + code + "]:\n" + "\n".join(lines))
        return

    before = br.OVERRIDES.read_text()
    after = insert(before, code, ep["title"], lines)
    try:
        tomllib.loads(after)
    except tomllib.TOMLDecodeError as err:
        sys.exit(f"not writing: the result wouldn't be valid TOML ({err})")
    br.OVERRIDES.write_text(after)
    print(f"\nupdated {br.OVERRIDES.name}")
    br.cmd_export()


if __name__ == "__main__":
    main(sys.argv[1:])
