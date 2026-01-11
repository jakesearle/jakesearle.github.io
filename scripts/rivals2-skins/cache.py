import os

import jsonpickle
import requests

DIR = 'cache/'


def add_txt_extension(string):
    if not string.endswith('.txt'):
        string += '.txt'
    return string


def save_ndjson(list_of_puzzles, filepath):
    create_cache()
    with open(filepath, 'w') as outfile:
        out_str = '\n'.join(jsonpickle.encode(p) for p in list_of_puzzles)
        outfile.write(out_str)


def load_pickle_ndjson(filepath):
    with open(filepath, 'r') as infile:
        return [jsonpickle.decode(line) for line in infile.readlines()]


def read_lines(filename):
    with open(filename) as infile:
        return [line.strip() for line in infile.readlines()]


def create_cache():
    if not os.path.exists(DIR):
        os.makedirs(DIR)
    # else:
        # print(f"Directory '{DIR}' already exists.")


def cache_url(url, filename):
    create_cache()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    response = requests.get(url, headers=headers)
    filepath = DIR + filename
    if response.status_code == 200:
        with open(filepath, 'wb') as file:
            file.write(response.content)
        print(f"HTML response saved as '{filepath}'.")
    else:
        print(f"Failed to fetch HTML response from '{url}'. Status code: {response.status_code}")


def filename_from_url(url):
    return url.replace('/', '_') + '.html'
