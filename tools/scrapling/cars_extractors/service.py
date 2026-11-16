"""Extraction operations shared by the CLI. All data is read with code, never by an LLM.

Every result has `supported`: False means the site has no adapter, so the caller
should fall back to the generic agent.
"""

from typing import Any, Callable

from scrapling.fetchers import Fetcher, StealthyFetcher

from .registry import get_adapter

MAX_BATCH = 10
UNSUPPORTED = {"supported": False, "error": "No adapter for this site."}


def _fetch_html(url: str) -> str:
    """HTTP first (cheap). Stealth browser only if blocked."""
    page = Fetcher.get(url, impersonate="chrome", stealthy_headers=True)
    if page.status == 200:
        return page.html_content
    if page.status not in (403, 429) and page.status < 500:
        raise RuntimeError(f"HTTP {page.status}")  # 404 and similar: a browser will not help
    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    if page.status != 200:
        raise RuntimeError(f"HTTP {page.status}")
    return page.html_content


FetchHtml = Callable[[str], str]


def list_listings(url: str, fetch_html: FetchHtml = _fetch_html) -> dict[str, Any]:
    """Cards of a results page (name, link, year, km, transmission, price, currency)
    and the next page URL."""
    adapter = get_adapter(url)
    if adapter is None:
        return dict(UNSUPPORTED)
    target = adapter.results_url(url) if hasattr(adapter, "results_url") else url
    try:
        html = fetch_html(target)
        listings = adapter.parse_listing_cards(html, target)
        if not listings:
            raise ValueError("No listing cards found. This page is not a results page.")
        currency = getattr(adapter, "CARD_CURRENCY", None)
        return {
            "supported": True,
            "url_used": target,
            "listings": [{**card, "currency": currency} for card in listings],
            "next_page_url": adapter.next_page_url(html, target),
        }
    except Exception as exc:  # reported to the caller as data, not as a crash
        return {"supported": True, "error": f"{type(exc).__name__}: {exc}"}


def get_listing_details(urls: list[str], fetch_html: FetchHtml = _fetch_html) -> dict[str, Any]:
    """Full fields of each listing, read from its own page. One failing URL does
    not fail the batch: it gets an `error` instead of a `listing`."""
    if not urls:
        return {"supported": True, "error": "urls is empty"}
    if len(urls) > MAX_BATCH:
        return {"supported": True, "error": f"Too many urls, send at most {MAX_BATCH} per call."}
    adapter = get_adapter(urls[0])
    if adapter is None:
        return dict(UNSUPPORTED)

    def one(url: str) -> dict[str, Any]:
        try:
            return {"url": url, "listing": adapter.parse_listing_details(fetch_html(url), url)}
        except Exception as exc:
            return {"url": url, "error": f"{type(exc).__name__}: {exc}"}

    return {"supported": True, "results": [one(u) for u in urls]}
