import re
from enum import Enum

PLUSHIE_URL = "https://www.symbiotestudios.com/products/orcane-plush-rivals-of-aether-official-collectible-rivals-2-dlc-code"

class Character:
    def __init__(self, name=None, url=None, skins=()):
        self.name = name
        self.skins = skins
        self.url = url

    def __str__(self):
        return f"{self.name}"

    def __repr__(self):
        return self.__str__()


class UnlockType(Enum):
    INCLUDED = 1

    COIN_SHOP = 11
    BUCKS_SHOP = 2
    MEDAL_SHOP = 3

    IN_BUNDLE = 4
    IN_PASS = 6

    THIRD_PARTY = 5

    LVL_50 = 10
    LVL_100 = 7

    KICKSTARTER_EARLY_BIRD = 8
    KICKSTARTER_AETHERIAN_TIER = 9

class CustomFX(Enum):
    VFX = 1
    SFX = 2
    VICTORY_THEME = 3

class Skin:
    def __init__(self, name=None, rarity="Common", description=None, palettes=()):
        self.name = name
        self.rarity = rarity
        self.description = description
        self.palettes = palettes
        self.unlock_types = set()
        self.custom_stuff = set()
        self.bundle_name = None
        self.event_name = None
        self.third_party_url = None

    def parse_description(self, description):
        self.description = description

        bundle_name = get_bundle_name(description)
        if bundle_name:
            self.bundle_name = bundle_name
            self.unlock_types.add(UnlockType.IN_BUNDLE)
        event_name = get_event_name(description)
        if event_name:
            self.event_name = event_name
            self.unlock_types.add(UnlockType.IN_PASS)

        if "VFX" in description:
            self.custom_stuff.add(CustomFX.VFX)
        if "SFX" in description:
            self.custom_stuff.add(CustomFX.SFX)
        if "victory theme" in description:
            self.custom_stuff.add(CustomFX.VICTORY_THEME)
        if "bundled" in description and "Plushie" in description:
            self.unlock_types.add(UnlockType.THIRD_PARTY)
            self.third_party_url = PLUSHIE_URL
        if "Bucks Shop" in description:
            self.unlock_types.add(UnlockType.BUCKS_SHOP)
        if "Medals Shop" in description:
            self.unlock_types.add(UnlockType.MEDAL_SHOP)
        if "Coin Shop" in description:
            self.unlock_types.add(UnlockType.COIN_SHOP)
        if "tournament exclusive skin" in description:
            self.unlock_types.add(UnlockType.THIRD_PARTY)
        if "Evo 2025 online store" in description:
            self.unlock_types.add(UnlockType.THIRD_PARTY)
        if "Genesis X2 online store" in description:
            self.unlock_types.add(UnlockType.THIRD_PARTY)
        if "Level 100" in description:
            self.unlock_types.add(UnlockType.LVL_100)
        if "Early Bird Special" in description:
            self.unlock_types.add(UnlockType.KICKSTARTER_EARLY_BIRD)
        if "event-centric bundles" in description:
            self.unlock_types.add(UnlockType.IN_BUNDLE)
        if "Level 50" in description:
            self.unlock_types.add(UnlockType.LVL_50)
        if "available to all players" in description:
            self.unlock_types.add(UnlockType.INCLUDED)

    def fill_no_desc(self):
        self.unlock_types = { UnlockType.INCLUDED }

    def __str__(self):
        return f"{self.name} ({self.rarity})"

    def __repr__(self):
        return self.__str__()


class Palette:
    def __init__(self, name=None, unlock_str=None, img=None):
        self.name = name
        self.unlock_str = unlock_str
        self.img = img

    def __str__(self):
        return f"{self.name}"

    def __repr__(self):
        return self.__str__()

def get_bundle_name(s):
    pattern = r"in the ((?:[A-Z0-9][A-Za-z0-9.']*|of)(?:\s+(?:[A-Z0-9][A-Za-z0-9.']*|of))*) Bundle"

    match = re.search(pattern, s)
    if match:
        return match.group(1)
    return None

def get_event_name(s):
    pattern = r"in the ((?:[A-Z0-9][A-Za-z0-9.']*|of)(?:\s+(?:[A-Z0-9][A-Za-z0-9.']*|of))*) Event Pass"

    match = re.search(pattern, s)
    if match:
        return match.group(1)
    return None