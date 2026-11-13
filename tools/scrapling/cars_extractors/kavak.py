"""Kavak Argentina adapter.

Detail: reads the schema.org `Car` node from the page's JSON-LD (stable, no CSS).
Grid: reads result cards by their `data-testid` (class names are hashed).
Nothing is ever read from the URL slug, except the link itself.
"""

import json
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from scrapling.parser import Selector

from .numbers import parse_es_ar_number

HOSTNAME = "www.kavak.com"
PATH_PREFIX = "/ar/"


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


def _to_int(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_listing_details(html: str, url: str) -> dict[str, Any]:
    """Fields of one listing, from the page content only. Missing fields are None."""
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
    return {
        "name": car.get("name"),
        "model": car.get("model"),
        "year": _to_int(car.get("vehicleModelDate")),
        "km": parse_es_ar_number(str(odometer["value"])) if "value" in odometer else None,
        "price_original": offers.get("price"),
        "currency_original": offers.get("priceCurrency"),
        "transmission": car.get("vehicleTransmission"),
        "color": car.get("color"),
        "characteristics": ", ".join(p for p in parts if p) or None,
        "link": car.get("url") or url,
    }


def parse_listing_cards(html: str, base_url: str) -> list[dict[str, Any]]:
    """Summary of each card in a results page (year, km, transmission, price)."""
    page = Selector(html)
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    for anchor in page.css('a[data-testid^="card-product-"]'):
        link = urljoin(base_url, anchor.attrib.get("href", ""))
        if not link or link in seen:
            continue
        seen.add(link)
        title = anchor.css("h3")
        subtitle = anchor.css("p")
        price = anchor.css('[class*="amount_uki-amount__large__price"]')
        # Subtitle: "2019 • 75.368 km • 2.0 TITANIUM • Manual"
        fields = [f.strip() for f in (subtitle[0].get_all_text() if subtitle else "").split("•")]
        cards.append(
            {
                "name": title[0].get_all_text().replace(" • ", " ") if title else None,
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
