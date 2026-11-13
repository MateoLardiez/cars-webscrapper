"""Number parsing for es-AR text. Never delegated to the LLM."""

import re

_NUMBER = re.compile(r"\d[\d.]*(?:,\d+)?")


def parse_es_ar_number(text: str | None) -> int | float | None:
    """Parse the first es-AR number in `text`.

    In es-AR the dot is the thousands separator and the comma is the decimal
    one: "146.000 km" -> 146000, "$ 12.140.000" -> 12140000, "1,5" -> 1.5.
    Returns None when there is no number.
    """
    if not text:
        return None
    match = _NUMBER.search(text)
    if match is None:
        return None
    raw = match.group(0).rstrip(".").replace(".", "").replace(",", ".")
    value = float(raw)
    return int(value) if value.is_integer() else value
