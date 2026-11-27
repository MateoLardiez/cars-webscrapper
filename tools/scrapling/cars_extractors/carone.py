"""CarOne (carone.com.ar) adapter.

The site is a Next.js front over Magento: cars come from its public GraphQL API,
so nothing is read from the HTML. The URLs the backend sees are still the site's
own pages (results: /comprar?carOptions=usados, car: /comprar/usados/<url_key>).
`fetch` turns each URL into a GraphQL POST and returns the JSON answer, which the
`parse_*` functions read.

Search filters travel as query parameters of the results URL (canonical brand
and model names, prices in ARS, km, transmission, page). `fetch` translates them
to the API's filter, so the site only returns matching cars.
"""

import json
from typing import Any, Callable
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from scrapling.fetchers import Fetcher

from .catalog import canonical_brand, canonical_model, normalize

SITE_ID = "carone"
HOSTNAME = "carone.com.ar"
PATH_PREFIX = "/comprar"
START_URL = f"https://{HOSTNAME}{PATH_PREFIX}?carOptions=usados"
CARD_CURRENCY = "ARS"

API_URL = f"https://{HOSTNAME}/api/graphql"
CAR_PATH = f"{PATH_PREFIX}/usados/"
USED_TAG = "2"  # the "Usados" car option of the site (carone_tags_arg / car_options)
PAGE_SIZE = 30

_CAR_FIELDS = """
  url_key
  carone_marca_data { label }
  carone_modelo_data { label }
  carone_version_description
  carone_year
  carone_mileage
  carone_transmission_data { label }
  carone_type_data { label }
  carone_fuel_data { label }
  price_range { maximum_price { final_price { currency value } } }
  color_data { name }
"""

_PRODUCTS_QUERY = (
    "query Products($filter: ProductAttributeFilterInput, $page: Int!, $size: Int!) {"
    " products(search: \"\", filter: $filter, pageSize: $size, currentPage: $page,"
    " sort: {created_at: DESC}) {"
    " page_info { current_page total_pages } items {" + _CAR_FIELDS + "} } }"
)

_FILTER_IDS_QUERY = (
    "query FilterIds($filters: CatalogFiltersInput) { catalogFilters(filters: $filters) {"
    " brands { default { id label } others { id label } }"
    " models { default { id label brand_id } others { id label brand_id } }"
    " transmissions { id label } } }"
)

# The answer to a search no car on the site can match, without asking the API
_NO_RESULTS = {"products": {"page_info": {"current_page": 1, "total_pages": 1}, "items": []}}

_TRANSMISSION_LABELS = {"manual": "manual", "automatic": "automatico"}

# Search filter -> query parameter of the results URL
_FILTER_PARAMS = ("min_km", "max_km", "min_price", "max_price", "transmission", "brand", "model")

Post = Callable[[dict[str, Any]], dict[str, Any]]


def _post_graphql(payload: dict[str, Any]) -> dict[str, Any]:
    """The `data` of a GraphQL answer. HTTP and GraphQL errors raise."""
    page = Fetcher.post(API_URL, json=payload, impersonate="chrome", stealthy_headers=True)
    if page.status != 200:
        raise RuntimeError(f"HTTP {page.status}")
    answer = json.loads(page.body)
    if answer.get("errors"):
        raise RuntimeError(f"GraphQL error: {answer['errors'][0].get('message')}")
    return answer["data"]


def _params(url: str) -> dict[str, str]:
    return {name: values[0] for name, values in parse_qs(urlparse(url).query).items()}


def _to_int(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _url_key(url: str) -> str | None:
    """The car's url_key when the URL is a car page."""
    path = urlparse(url).path
    if not path.startswith(CAR_PATH):
        return None
    return path.removeprefix(CAR_PATH).strip("/") or None


def _options(group: dict[str, Any] | None) -> list[dict[str, Any]]:
    group = group or {}
    return [*(group.get("default") or []), *(group.get("others") or [])]


def _range(low: str | None, high: str | None) -> dict[str, str] | None:
    """An API range filter (both ends inclusive). None without bounds."""
    bounds = {"from": _to_int(low), "to": _to_int(high)}
    return {end: str(value) for end, value in bounds.items() if value is not None} or None


def listing_filter(params: dict[str, str], post: Post) -> dict[str, Any] | None:
    """The API filter for the search in the results URL parameters. None when
    the search cannot match any car on the site (a brand, model or transmission
    it does not have). The ids of brand, model and transmission are looked up
    only when the search uses them."""
    api_filter: dict[str, Any] = {
        "stock_status": {"eq": "IN_STOCK"},
        "carone_tags_arg": {"in": [USED_TAG]},
    }
    price = _range(params.get("min_price"), params.get("max_price"))
    if price:
        api_filter["price"] = price
    km = _range(params.get("min_km"), params.get("max_km"))
    if km:
        api_filter["carone_mileage"] = km

    brand, model, transmission = params.get("brand"), params.get("model"), params.get("transmission")
    if not (brand or transmission):
        return api_filter
    ids = post({"query": _FILTER_IDS_QUERY,
                "variables": {"filters": {"stock_status": "IN_STOCK", "car_options": [int(USED_TAG)]}}})
    found = ids["catalogFilters"]

    if transmission:
        wanted = _TRANSMISSION_LABELS.get(transmission)
        match = [t["id"] for t in found.get("transmissions") or [] if normalize(t["label"]) == wanted]
        if not match:
            return None
        api_filter["carone_transmission"] = {"in": match}

    if brand:
        brand_ids = [b["id"] for b in _options(found.get("brands"))
                     if normalize(canonical_brand(b["label"]) or "") == normalize(brand)]
        if not brand_ids:
            return None
        api_filter["carone_marca"] = {"in": brand_ids}
        if model:
            # "C3 Aircross" counts as a "C3", the same as on the other sites
            model_ids = [m["id"] for m in _options(found.get("models"))
                         if m.get("brand_id") in brand_ids
                         and normalize(canonical_model(brand, m["label"]) or "") == normalize(model)]
            if not model_ids:
                return None
            api_filter["carone_modelo"] = {"in": model_ids}
    return api_filter


def fetch(url: str, post: Post = _post_graphql) -> str:
    """The API answer (JSON text) for a car page or a results page URL."""
    key = _url_key(url)
    if key is not None:
        car_filter = {"stock_status": {"eq": "IN_STOCK"}, "url_key": {"eq": key}}
        data = post({"query": _PRODUCTS_QUERY, "variables": {"filter": car_filter, "page": 1, "size": 1}})
        return json.dumps(data)
    if urlparse(url).path.rstrip("/") != PATH_PREFIX:
        raise ValueError("Not a CarOne results or car page")
    params = _params(url)
    api_filter = listing_filter(params, post)
    if api_filter is None:
        return json.dumps(_NO_RESULTS)
    page = _to_int(params.get("page")) or 1
    variables = {"filter": api_filter, "page": page, "size": PAGE_SIZE}
    return json.dumps(post({"query": _PRODUCTS_QUERY, "variables": variables}))


def filtered_url(url: str, filters: dict[str, Any]) -> str:
    """Add the search filters to a results URL. Prices are in CARD_CURRENCY.
    A parameter already in the URL is kept. A model without a brand is ignored."""
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    values = {name: filters.get(name) for name in _FILTER_PARAMS}
    if not filters.get("brand"):
        values["model"] = None
    for param, value in values.items():
        if value is not None and value != "" and param not in query:
            query[param] = [str(value)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def _items(text: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    products = json.loads(text).get("products") or {}
    return products.get("items") or [], products.get("page_info") or {}


def _label(data: dict[str, Any] | None) -> str | None:
    label = (data or {}).get("label")
    return label.strip() if isinstance(label, str) and label.strip() else None


def _display(text: str | None) -> str | None:
    """The site writes labels in any case ("AUTOMÁTICO", "blanco")."""
    return text.capitalize() if text else None


def _car(item: dict[str, Any]) -> dict[str, Any]:
    """The fields both the card and the car page give."""
    brand = canonical_brand(_label(item.get("carone_marca_data")))
    raw_model = _label(item.get("carone_modelo_data"))
    model = canonical_model(brand, raw_model)
    version = (item.get("carone_version_description") or "").strip()
    name = " ".join(p for p in (brand, raw_model, version) if p) or None
    price = ((item.get("price_range") or {}).get("maximum_price") or {}).get("final_price") or {}
    return {
        "name": name,
        "brand": brand,
        "model": model,
        "link": f"https://{HOSTNAME}{CAR_PATH}{item['url_key']}",
        "year": _to_int(item.get("carone_year")),
        "km": _to_int(item.get("carone_mileage")),
        "transmission": _display(_label(item.get("carone_transmission_data"))),
        "price": price.get("value"),
        "currency": price.get("currency"),
    }


def parse_listing_cards(text: str, base_url: str) -> list[dict[str, Any]]:
    """One card per car in a results answer."""
    cards = []
    for item in _items(text)[0]:
        if not item.get("url_key"):
            continue
        car = _car(item)
        del car["currency"]  # the service adds CARD_CURRENCY to every card
        cards.append(car)
    return cards


def parse_listing_details(text: str, url: str) -> dict[str, Any]:
    """Fields of one car. A car no longer in stock is not in the answer."""
    items = [i for i in _items(text)[0] if i.get("url_key")]
    if not items:
        raise ValueError("Listing not available (not in stock)")
    item = items[0]
    car = _car(item)
    colors = [_display(c.get("name", "").strip()) for c in item.get("color_data") or [] if c.get("name", "").strip()]
    parts = [
        (item.get("carone_version_description") or "").strip() or None,
        _display(_label(item.get("carone_type_data"))),
        _display(_label(item.get("carone_fuel_data"))),
    ]
    return {
        "name": car["name"],
        "brand": car["brand"],
        "model": car["model"],
        "year": car["year"],
        "km": car["km"],
        "price_original": car["price"],
        "currency_original": car["currency"],
        "transmission": car["transmission"],
        "color": ", ".join(c for c in colors if c) or None,
        "characteristics": ", ".join(p for p in parts if p) or None,
        "link": car["link"],
    }


def next_page_url(text: str, current_url: str) -> str | None:
    """The results URL of the next page, if the answer says there is one."""
    page_info = _items(text)[1]
    current = _to_int(page_info.get("current_page")) or 1
    total = _to_int(page_info.get("total_pages")) or 1
    if current >= total:
        return None
    parsed = urlparse(current_url)
    query = parse_qs(parsed.query)
    query["page"] = [str(current + 1)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
