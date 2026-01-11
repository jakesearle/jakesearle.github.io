import scraper
from pprint import pprint

default_url = "https://dragdown.wiki/wiki/RoA2"


def main():
    chars = scraper.scrape_chars(default_url)
    pprint(chars)

if __name__ == '__main__':
    main()
