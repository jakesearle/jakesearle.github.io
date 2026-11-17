"""Tests for import_imdb.py.  Run:  python3 -m unittest scripts/bobs-burgers-refs/test_import_imdb.py"""
import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_imdb import entry_line, episode_code, insert, parse, sentence, split_batch  # noqa: E402

# How a copy from the IMDb page arrived in chat: markdown links, blank bullets between entries
MARKDOWN_PASTE = """\
* [Night of the Living Dead](https://www.imdb.com/title/tt0063350/?ref_=ttcnn_sm) (1968)
* Tina still gets nightmares from watching this movie when she was eight.

*

* [Star Wars: Episode IV - A New Hope](https://www.imdb.com/title/tt0076759/?ref_=ttcnn_sm) (1977)
* Chewbacca mentioned

*

* [Coyote Ugly](https://www.imdb.com/title/tt0200550/?ref_=ttcnn_sm) (2000)
* Tina says the women featured on the cover of Al's magazine are "the girls of Coyote Ugly."
"""

# A plain-text copy of a whole Connections page, with headings and page chrome
PLAIN_PAGE = """\
Connections
Jump to
Featured in (1)
References (4)
Spoofs (1)
Edit
Featured in
"WatchMojo" Top 10 Funniest Bob's Burgers Moments (TV Episode 2017)
The Goonies parody is #3.
References
Footloose (1984)
mentioned in dialogue
Family Guy (TV Series 1999– )
Gene quotes it
"The Simpsons" Treehouse of Horror (TV Episode 1990)
Burgerboss (Video Game 2011)
Spoofs
The Goonies (1985)
Episode title, kids searching for lost treasure
Contribute to this page
"""


class ParseTests(unittest.TestCase):
    def test_markdown_paste(self):
        got = [(e.title, e.year, e.kind) for e in parse(MARKDOWN_PASTE)]
        self.assertEqual(got, [
            ("Night of the Living Dead", "1968", "movie"),
            ("Star Wars: Episode IV - A New Hope", "1977", "movie"),
            ("Coyote Ugly", "2000", "movie"),
        ])
        self.assertEqual(parse(MARKDOWN_PASTE)[1].description, "Chewbacca mentioned")

    def test_plain_page_keeps_only_outgoing_sections(self):
        got = {e.title: e for e in parse(PLAIN_PAGE)}
        self.assertNotIn("WatchMojo", got)  # "Featured in" points the other way
        self.assertEqual(list(got), ["Footloose", "Family Guy", "The Simpsons", "Burgerboss", "The Goonies"])
        self.assertEqual(got["Footloose"].description, "mentioned in dialogue")
        self.assertEqual((got["Family Guy"].kind, got["Family Guy"].year), ("tv", ""))
        self.assertEqual(got["The Simpsons"].kind, "tv")  # an episode of a show -> the show
        self.assertEqual(got["Burgerboss"].kind, "skip")  # video game
        self.assertEqual(got["The Goonies"].section, "spoofs")

    def test_stops_at_page_footer(self):
        text = "Spoofs\nRain Man (1988)\nThe toothpick scene\nMore from this title\nPhotos\nCreated 1mo ago\n"
        (e,) = parse(text)
        self.assertEqual(e.description, "The toothpick scene")  # footer not glued on

    def test_drops_more_buttons(self):
        (e,) = parse("References\nPretty Woman (1990)\nMentioned in dialogue\n1 more\n")
        self.assertEqual(e.description, "Mentioned in dialogue")
        self.assertEqual(sentence("Playing at the theater 7 more"), "Playing at the theater.")

    def test_episode_code(self):
        self.assertEqual(episode_code("S1E3"), (1, 3))
        self.assertEqual(episode_code("s01e03"), (1, 3))
        with self.assertRaises(SystemExit):
            episode_code("1x03")


# What the bookmarklet copies: each page tagged with its IMDb id
BATCH = """\
=== IMDb tt2273811 ===
Back
Connections
The Belchies
Bob's Burgers
References
Footloose (1984)
mentioned in dialogue

=== IMDb tt1645218 ===
Connections
Human Flesh
Spoofs
Rain Man (1988)
The toothpick scene
"""


class BatchTests(unittest.TestCase):
    def test_splits_pages_by_imdb_id(self):
        pages = split_batch(BATCH)
        self.assertEqual([i for i, _ in pages], ["tt2273811", "tt1645218"])
        self.assertEqual([e.title for e in parse(pages[0][1])], ["Footloose"])
        self.assertEqual([e.title for e in parse(pages[1][1])], ["Rain Man"])

    def test_plain_paste_is_not_a_batch(self):
        self.assertIsNone(split_batch(MARKDOWN_PASTE))


class EntryLineTests(unittest.TestCase):
    def test_lines_are_valid_toml(self):
        for e in parse(MARKDOWN_PASTE + PLAIN_PAGE):
            if e.kind == "skip":
                continue
            doc = tomllib.loads("add = [\n" + entry_line(e) + "\n]")
            item = doc["add"][0]
            self.assertEqual(item["title"], e.title)
            self.assertTrue(item["note"].endswith("(from IMDb Connections)"))
        coyote = tomllib.loads("x = [" + entry_line(parse(MARKDOWN_PASTE)[2]) + "]")["x"][0]
        self.assertIn('"the girls of Coyote Ugly."', coyote["note"])  # quotes survive escaping

    def test_note_is_capitalised_sentence(self):
        e = parse("References\nFootloose (1984)\nmentioned in dialogue\n")[0]
        self.assertIn('note = "Mentioned in dialogue. (from IMDb Connections)"', entry_line(e))

    def test_sentence_punctuation(self):
        self.assertEqual(sentence("mentioned in dialogue"), "Mentioned in dialogue.")
        self.assertEqual(sentence('"Serpentine!"'), '"Serpentine!"')
        self.assertEqual(sentence('"Pasta la vista, baby"'), '"Pasta la vista, baby"')
        self.assertEqual(sentence("Gene claims to play it on the triangle."), "Gene claims to play it on the triangle.")
        self.assertEqual(sentence('Linda says it\'s like "West Side Story"'), 'Linda says it\'s like "West Side Story".')
        self.assertEqual(sentence(""), "")

    def test_spoof_without_description(self):
        e = parse("Spoofs\nThe Goonies (1985)\n")[0]
        self.assertIn('note = "Spoofed (from IMDb Connections)"', entry_line(e))


BASE = """\
movies = ["The Shining"]

[S01E02]  # Crawl Space
add = [
  { title = "Ghost", year = 1990 },
]

[S01E05]  # Hamburger Dinner Theater
remove = ["Pirates of Penzance"]

[S02E01]  # The Belchies
add = [
  { title = "Footloose" },
]
"""
NEW = ['  { title = "Jaws", year = 1975 },']


class InsertTests(unittest.TestCase):
    def adds(self, text, code):
        return [a["title"] for a in tomllib.loads(text)[code].get("add", [])]

    def test_appends_to_existing_add_list(self):
        out = insert(BASE, "S01E02", "Crawl Space", NEW)
        self.assertEqual(self.adds(out, "S01E02"), ["Ghost", "Jaws"])

    def test_adds_list_to_section_without_one(self):
        out = insert(BASE, "S01E05", "Hamburger Dinner Theater", NEW)
        doc = tomllib.loads(out)
        self.assertEqual(doc["S01E05"]["remove"], ["Pirates of Penzance"])
        self.assertEqual(self.adds(out, "S01E05"), ["Jaws"])

    def test_new_section_goes_in_episode_order(self):
        out = insert(BASE, "S01E03", "Sacred Cow", NEW)
        self.assertEqual(self.adds(out, "S01E03"), ["Jaws"])
        self.assertLess(out.index("[S01E02]"), out.index("[S01E03]"))
        self.assertLess(out.index("[S01E03]"), out.index("[S01E05]"))

    def test_new_section_at_the_end(self):
        out = insert(BASE, "S09E01", "Some Episode", NEW)
        self.assertTrue(out.rstrip().endswith("]"))
        self.assertEqual(self.adds(out, "S09E01"), ["Jaws"])
        self.assertEqual(self.adds(out, "S02E01"), ["Footloose"])  # untouched


if __name__ == "__main__":
    unittest.main()
