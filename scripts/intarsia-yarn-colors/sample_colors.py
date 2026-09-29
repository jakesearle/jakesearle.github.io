"""
Estimate yarn hex codes from swatch photos.

Michaels blocks scripted access, so there's no way to pull hex codes
automatically. Instead: save a swatch photo per color into images/, named
after the color (e.g. "Chocolate Brown.jpg"), and this script samples the
center of each photo to estimate a hex code. It also diffs against the
current values in IntarsiaPlanner.vue so you can see what would change.

Usage:
    source ../../.venv/bin/activate  (from this directory)
    python sample_colors.py [images_dir]
"""

import re
import sys
import warnings
from pathlib import Path

from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning, module="PIL")

SCRIPT_DIR = Path(__file__).parent
DEFAULT_IMAGES_DIR = SCRIPT_DIR / "images"
PLANNER_FILE = SCRIPT_DIR.parent.parent / "components" / "crochet" / "IntarsiaPlanner.vue"

# Sample the middle of the photo to avoid edges, shadows, and any label text.
CENTER_FRACTION = 0.4


def sample_hex(image_path: Path) -> str:
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        w, h = img.size
        cw, ch = int(w * CENTER_FRACTION), int(h * CENTER_FRACTION)
        left, top = (w - cw) // 2, (h - ch) // 2
        pixels = list(img.crop((left, top, left + cw, top + ch)).getdata())

    # Median per channel is more robust to fiber texture/shadow speckle than a mean.
    n = len(pixels)
    r = sorted(p[0] for p in pixels)[n // 2]
    g = sorted(p[1] for p in pixels)[n // 2]
    b = sorted(p[2] for p in pixels)[n // 2]
    return f"#{r:02x}{g:02x}{b:02x}"


def load_existing_hexes() -> dict[str, str]:
    if not PLANNER_FILE.exists():
        return {}
    text = PLANNER_FILE.read_text()
    return {
        name: hexcode.lower()
        for name, hexcode in re.findall(
            r"name:\s*'([^']+)',\s*hex:\s*'(#[0-9A-Fa-f]{6})'", text
        )
    }


def main():
    images_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IMAGES_DIR
    if not images_dir.exists():
        print(f"No such directory: {images_dir}")
        sys.exit(1)

    existing = load_existing_hexes()
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in exts)
    if not files:
        print(f"No images found in {images_dir}")
        print("Save a swatch photo per color as '<Color Name>.jpg'")
        sys.exit(1)

    print(f"{'Color':<20}{'New':<10}{'Old':<10}Changed")
    for f in files:
        name = f.stem.replace("_", " ")
        new_hex = sample_hex(f)
        old_hex = existing.get(name, "-")
        changed = "yes" if old_hex not in ("-", new_hex) else ""
        print(f"{name:<20}{new_hex:<10}{old_hex:<10}{changed}")


if __name__ == "__main__":
    main()
