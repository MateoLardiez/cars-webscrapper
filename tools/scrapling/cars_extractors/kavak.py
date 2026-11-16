"""Kavak Argentina adapter.

Detail: reads the schema.org `Car` node from the page's JSON-LD (stable, no CSS).
Grid: reads result cards by their `data-testid` (class names are hashed).
Nothing is ever read from the URL slug, except the link itself.
The car id (`?id=`) is what identifies a car: the slug alone can open another one.
"""

import json
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from scrapling.parser import Selector

from .catalog import canonical_brand, canonical_model, slugify, split_brand_model
from .numbers import parse_es_ar_number

SITE_ID = "kavak"
HOSTNAME = "www.kavak.com"
PATH_PREFIX = "/ar"
START_URL = f"https://{HOSTNAME}{PATH_PREFIX}/usados"  # where a search over the whole site starts
CARD_CURRENCY = "ARS"  # result cards show the price without currency; Kavak AR lists in pesos


def _car_node(page: Selector) -> dict[str, Any] | None:
    for script in page.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.text)
        except json.JSONDecodeError:
            continue
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
        for node in nodes:
            if isinstance(node, dict) and node.get("@type") == "Car":
                return node
    return None


# A reserved car keeps its price in the page data, but the page hides it and the
# car cannot be bought: it is not a listing to save.
_RESERVED_NOTICE = "Este auto está reservado"
_RESERVED_BADGE = "Reservado"


def _with_id(link: str, car_id: str | None) -> str:
    """Kavak's /venta/<slug> page does not identify one car: many cars share a
    slug and the server answers with another one. `?id=<car id>` selects the
    right car (and a person who opens the link sees it)."""
    if not car_id:
        return link
    parsed = urlparse(link)
    query = parse_qs(parsed.query)
    query["id"] = [car_id]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def _id_from_url(url: str) -> str | None:
    ids = parse_qs(urlparse(url).query).get("id")
    return ids[0] if ids else None


def _to_int(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _brand(car: dict[str, Any]) -> str | None:
    """The page has no brand field: it is the first keyword ("Ford,Ka,2018,...")."""
    keywords = str(car.get("keywords") or "").split(",")
    if keywords[0].strip():
        return canonical_brand(keywords[0])
    return split_brand_model(car.get("name") or "")[0]


def parse_listing_details(html: str, url: str) -> dict[str, Any]:
    """Fields of one listing, from the page content only. Missing fields are None."""
    if _RESERVED_NOTICE in html:
        raise ValueError("Listing not available (reserved)")
    car = _car_node(Selector(html))
    if car is None:
        raise ValueError("No Car data found in the page")
    offers = car.get("offers") or {}
    # Kavak answers 200 with an empty Car node for listings that no longer exist
    if not offers.get("price") and not car.get("vehicleModelDate") and not car.get("mileageFromOdometer"):
        raise ValueError("Listing not available (page has no year, km or price)")
    odometer = car.get("mileageFromOdometer") or {}
    engine = car.get("vehicleEngine") or {}
    parts = [
        car.get("bodyType"),
        engine.get("fuelType"),
        car.get("vehicleConfiguration"),
        engine.get("name"),
    ]
    brand = _brand(car)
    return {
        "name": car.get("name"),
        "brand": brand,
        "model": canonical_model(brand, car.get("model")),
        "year": _to_int(car.get("vehicleModelDate")),
        "km": parse_es_ar_number(str(odometer["value"])) if "value" in odometer else None,
        "price_original": offers.get("price"),
        "currency_original": offers.get("priceCurrency"),
        "transmission": car.get("vehicleTransmission"),
        "color": car.get("color"),
        "characteristics": ", ".join(p for p in parts if p) or None,
        "link": _with_id(car.get("url") or url, _id_from_url(url)),
    }


def results_url(url: str) -> str:
    """The home page has no cards: use the general results page instead."""
    parsed = urlparse(url)
    if parsed.path.rstrip("/") == PATH_PREFIX:
        return urlunparse(parsed._replace(path=f"{PATH_PREFIX}/usados", query="", fragment=""))
    return url


# Search filters that Kavak takes under the same name as a query parameter
_FILTER_PARAMS = ("min_km", "max_km", "min_price", "max_price", "transmission")
_TRANSMISSION_VALUES = {"manual": "manual", "automatic": "automatico"}


def filtered_url(url: str, filters: dict[str, Any]) -> str:
    """Add the search filters to a results URL so Kavak returns only matching
    cards. Prices are in CARD_CURRENCY. A parameter already in the URL is kept.

    Brand and model go in the `maker` and `model` parameters of the general
    results page (a path like /usados/ford/ka is ignored by Kavak). A model
    without a brand is ignored."""
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    values: dict[str, Any] = {name: filters.get(name) for name in _FILTER_PARAMS}
    if filters.get("transmission") is not None:
        values["transmission"] = _TRANSMISSION_VALUES.get(filters["transmission"])
    if filters.get("brand"):
        values["maker"] = slugify(filters["brand"])
        if filters.get("model"):
            values["model"] = slugify(filters["model"])
    for param, value in values.items():
        if value is not None and param not in query:
            query[param] = [str(value)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def parse_listing_cards(html: str, base_url: str) -> list[dict[str, Any]]:
    """Summary of each card in a results page (year, km, transmission, price).
    Reserved cars are left out."""
    page = Selector(html)
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    for anchor in page.css('a[data-testid^="card-product-"]'):
        href = anchor.attrib.get("href", "")
        if not href or _RESERVED_BADGE in anchor.get_all_text():
            continue
        # data-testid="card-product-<car id>"
        car_id = anchor.attrib.get("data-testid", "").removeprefix("card-product-") or None
        link = _with_id(urljoin(base_url, href), car_id)
        if link in seen:
            continue
        seen.add(link)
        title = anchor.css("h3")
        subtitle = anchor.css("p")
        price = anchor.css('[class*="amount_uki-amount__large__price"]')
        # Subtitle: "2019 • 75.368 km • 2.0 TITANIUM • Manual"
        fields = [f.strip() for f in (subtitle[0].get_all_text() if subtitle else "").split("•")]
        name = title[0].get_all_text().replace(" • ", " ") if title else None
        brand, model = split_brand_model(name or "")
        cards.append(
            {
                "name": name,
                "brand": brand,
                "model": model,
                "link": link,
                "year": _to_int(fields[0]) if fields else None,
                "km": parse_es_ar_number(fields[1]) if len(fields) > 1 and "km" in fields[1] else None,
                "transmission": fields[-1] if len(fields) > 3 else None,
                "price": parse_es_ar_number(price[0].get_all_text()) if price else None,
            }
        )
    return cards


def next_page_url(html: str, current_url: str) -> str | None:
    """URL of the next results page, if the pagination links to it."""
    parsed = urlparse(current_url)
    query = parse_qs(parsed.query)
    current = _to_int(query.get("page", ["0"])[0]) or 0
    for anchor in Selector(html).css("a[href]"):
        href_query = parse_qs(urlparse(anchor.attrib["href"]).query)
        if href_query.get("page") == [str(current + 1)]:
            query["page"] = [str(current + 1)]
            return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
    return None
