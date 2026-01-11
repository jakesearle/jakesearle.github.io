import os
import model
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup

import cache

DIR = 'cache/'

def scrape_chars(url):
    soup = get_soup(url)
    names = [t.get_text(strip=True) for t in soup.select('.char-button')]
    urls = [urljoin(url, a['href']) for a in soup.select('.char-card-circle a[href]')]
    chars = [model.Character(name=n, url=u) for n, u in zip(names, urls)]
    for c in chars:
        c.skins = get_skins(c)
    return chars


def get_skins(char):
    soup = get_soup(char.url)
    headers = soup.select('div.mw-heading2')

    start = None
    for h in headers:
        if h.get_text(strip=True) == "Cosmetics":
            start = h
            break

    skins = []
    curr_skin = None
    for sib in start.find_next_siblings():
        # Stop at next heading
        if "mw-heading2" in sib.get("class", ''):
            break

        # Skin name
        if "mw-heading3" in sib.get("class", ''):
            curr_skin = model.Skin()
            curr_skin.name = sib.get_text(strip=True)
        # Description
        elif sib.name == "p":
            desc = sib.get_text(strip=False).strip()
            curr_skin.rarity = desc.split(' ')[0].strip()
            curr_skin.parse_description(desc)
        # Palette table
        elif "noresize" in sib.get("class", ''):
            table_tag = sib.find('table')
            curr_skin.palettes = get_palettes(table_tag, base_url=get_base_url(char.url))
            curr_skin.fill_no_desc()
            skins.append(curr_skin)

        else:
            print(f"Ran into a weird tag: {sib}")
    return skins

def get_palettes(table_tag, base_url=None):
    palettes = []
    rows = table_tag.find_all('tr')
    name_tags = rows[0].find_all('th')
    img_tags = rows[1].find_all('a')
    desc_tags = rows[2].find_all('td')
    for name_t, img_t, desc_t in zip(name_tags, img_tags, desc_tags):
        name = name_t.get_text(strip=True)
        img = urljoin(base_url, img_t['href'])
        desc = desc_t.get_text(strip=True)
        palette = model.Palette(name=name, unlock_str=desc, img=img)
        palettes.append(palette)
    return palettes

def get_soup(url):
    filename = cache.filename_from_url(url)
    filepath = DIR + filename
    if not os.path.exists(filepath):
        cache.cache_url(url, filename)
    return load_soup_from_file(filepath)


def load_soup_from_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as file:
        html_content = file.read()
    soup = BeautifulSoup(html_content, 'html.parser')
    return soup

def get_base_url(url):
    parsed_uri = urlparse(url)
    return '{uri.scheme}://{uri.netloc}'.format(uri=parsed_uri)
