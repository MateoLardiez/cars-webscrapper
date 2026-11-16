"""Canonical brands and models, shared with the backend (apps/shared/catalog.json).

Each site names cars its own way ("VW" or "Volkswagen", "Gol Trend" or "Gol").
Adapters turn what they read into the canonical name so the backend can compare
it with the user's filter. A name that is not in the catalog is left as read.
"""

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(__file__).resolve().parents[3] / "apps" / "shared" / "catalog.json"


def normalize(text: str) -> str:
    """Lowercase, no accents, single spaces."""
    stripped = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in stripped if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(text)).strip("-")


@lru_cache(maxsize=1)
def _catalog() -> list[dict[str, Any]]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["brands"]


def _names(entry: dict[str, Any]) -> list[str]:
    return [entry["name"], *entry.get("aliases", [])]


def _starts_with_name(text: str, name: str) -> bool:
    """`text` starts with `name` and the name ends at a word boundary."""
    return text == name or text.startswith(name + " ")


def _match(entries: list[dict[str, Any]], text: str) -> tuple[dict[str, Any], str] | None:
    """The entry whose longest name starts `text`, with that normalized name."""
    best: tuple[dict[str, Any], str] | None = None
    for entry in entries:
        for name in _names(entry):
            n = normalize(name)
            if _starts_with_name(text, n) and (best is None or len(n) > len(best[1])):
                best = (entry, n)
    return best


def canonical_brand(raw: str | None) -> str | None:
    text = normalize(raw or "")
    if not text:
        return None
    found = _match(_catalog(), text)
    # The whole text must be the brand: "Ford Ka" is not a brand name
    return found[0]["name"] if found and found[1] == text else (raw or "").strip()


def _brand_entry(brand: str | None) -> dict[str, Any] | None:
    if brand is None:
        return None
    return next((b for b in _catalog() if normalize(b["name"]) == normalize(brand)), None)


def canonical_model(brand: str | None, raw: str | None) -> str | None:
    """The catalog model that starts `raw` ("Gol Trend" gives "Gol")."""
    text = normalize(raw or "")
    if not text:
        return None
    entry = _brand_entry(brand)
    found = _match(entry["models"], text) if entry else None
    return found[0]["name"] if found else (raw or "").strip()


def split_brand_model(title: str) -> tuple[str | None, str | None]:
    """Brand and model from a title such as "Ford Focus III". (None, None) when
    the title does not start with a known brand."""
    found = _match(_catalog(), normalize(title))
    if found is None:
        return None, None
    entry, name = found
    rest = " ".join(title.split()[len(name.split()) :])
    return entry["name"], canonical_model(entry["name"], rest)
