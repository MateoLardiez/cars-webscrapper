"""MCP server that extracts car listing data with code, not with the LLM.

Tools return already structured fields. For a site without adapter they
return `supported: false` so the agent falls back to the generic Scrapling tools.
"""

from typing import Any, Callable

from mcp.server.mcpserver import MCPServer
from scrapling.fetchers import Fetcher, StealthyFetcher

from cars_extractors.registry import get_adapter

mcp = MCPServer("cars")


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


def _run(url: str, work: Callable[[Any, str], dict[str, Any]]) -> dict[str, Any]:
    adapter = get_adapter(url)
    if adapter is None:
        return {"supported": False, "error": "No adapter for this site. Use the generic scrapling tools."}
    try:
        return {"supported": True, **work(adapter, _fetch_html(url))}
    except Exception as exc:  # report to the agent instead of crashing the server
        return {"supported": True, "error": f"{type(exc).__name__}: {exc}"}


@mcp.tool()
def list_listings(url: str) -> dict[str, Any]:
    """List the listing cards of a results page (name, absolute link, year, km,
    transmission, price) and the next page URL. Use these only to choose
    candidates; fetch details with get_listing_details before saving."""

    target = url
    adapter = get_adapter(url)
    if adapter is not None and hasattr(adapter, "results_url"):
        target = adapter.results_url(url)

    def work(adapter: Any, html: str) -> dict[str, Any]:
        listings = adapter.parse_listing_cards(html, target)
        if not listings:
            raise ValueError("No listing cards found. This page is not a results page.")
        return {
            "url_used": target,
            "listings": listings,
            "next_page_url": adapter.next_page_url(html, target),
        }

    return _run(target, work)


MAX_BATCH = 10


@mcp.tool()
def get_listing_details(urls: list[str]) -> dict[str, Any]:
    """Open listing pages (up to 10 per call) and return, for each URL, the
    fields for save_car (name, model, year, km, price_original,
    currency_original, transmission, color, characteristics, link). Every field
    comes from the page content only and is null when the page does not show
    it. Pass all candidates in ONE call instead of calling once per listing."""
    if not urls:
        return {"supported": True, "error": "urls is empty"}
    if len(urls) > MAX_BATCH:
        return {"supported": True, "error": f"Too many urls, send at most {MAX_BATCH} per call."}
    if get_adapter(urls[0]) is None:
        return {"supported": False, "error": "No adapter for this site. Use the generic scrapling tools."}

    def one(url: str) -> dict[str, Any]:
        result = _run(url, lambda adapter, html: {"listing": adapter.parse_listing_details(html, url)})
        result.pop("supported", None)
        return {"url": url, **result}

    return {"supported": True, "results": [one(u) for u in urls]}


if __name__ == "__main__":
    mcp.run()
