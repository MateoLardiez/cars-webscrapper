import json
import sys
from pathlib import Path

import cars_cli
from cars_extractors.service import get_listing_details, list_listings, site_info

FIXTURES = Path(__file__).parent / "fixtures"
LIST_URL = "https://www.kavak.com/ar/usados"
DETAIL_URL = "https://www.kavak.com/ar/venta/ford-ka-15_se-hatchback-2017?id=562256"


def fake_fetch(pages: dict[str, str]):
    def fetch(url: str) -> str:
        if url not in pages:
            raise RuntimeError("HTTP 404")
        return pages[url]

    return fetch


def test_unsupported_site_is_reported_without_fetching():
    result = list_listings("https://www.example.com/cars", fetch_html=fake_fetch({}))
    assert result["supported"] is False


def test_list_adds_card_currency():
    html = (FIXTURES / "kavak_list.html").read_text()
    result = list_listings(LIST_URL, fetch_html=fake_fetch({LIST_URL: html}))
    assert result["supported"] is True
    assert result["listings"]
    assert all(card["currency"] == "ARS" for card in result["listings"])


def test_home_page_uses_results_page():
    html = (FIXTURES / "kavak_list.html").read_text()
    result = list_listings("https://www.kavak.com/ar", fetch_html=fake_fetch({LIST_URL: html}))
    assert result["url_used"] == LIST_URL


def test_fetch_error_is_returned_as_data():
    result = list_listings(LIST_URL, fetch_html=fake_fetch({}))
    assert result == {"supported": True, "error": "RuntimeError: HTTP 404"}


def test_one_failing_detail_does_not_fail_the_batch():
    html = (FIXTURES / "kavak_detail.html").read_text()
    missing = "https://www.kavak.com/ar/venta/missing?id=1"
    result = get_listing_details([DETAIL_URL, missing], fetch_html=fake_fetch({DETAIL_URL: html}))
    ok, failed = result["results"]
    assert ok["listing"]["year"] == 2018
    assert failed == {"url": missing, "error": "RuntimeError: HTTP 404"}


def test_details_batch_limit():
    result = get_listing_details([DETAIL_URL] * 11, fetch_html=fake_fetch({}))
    assert "at most 10" in result["error"]


def test_cli_prints_only_json(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["cars_cli.py", "list", "https://www.example.com/cars"])
    cars_cli.main()
    assert json.loads(capsys.readouterr().out)["supported"] is False


def test_cli_usage_error():
    assert "Usage" in cars_cli.run(["unknown"])["error"]


def test_site_info():
    assert site_info("https://www.kavak.com/ar") == {"supported": True, "currency": "ARS"}
    assert site_info("https://www.example.com")["supported"] is False


def test_list_applies_filters_to_the_url():
    html = (FIXTURES / "kavak_list.html").read_text()
    requested: list[str] = []

    def fetch(url: str) -> str:
        requested.append(url)
        return html

    list_listings("https://www.kavak.com/ar", {"max_km": 100000, "transmission": "manual"}, fetch_html=fetch)
    assert requested == [f"{LIST_URL}?max_km=100000&transmission=manual"]


def test_cli_list_with_filters(monkeypatch):
    calls = []
    monkeypatch.setattr(cars_cli, "list_listings", lambda url, filters: calls.append((url, filters)) or {})
    cars_cli.run(["list", "https://a.com", '{"max_km": 1}'])
    cars_cli.run(["list", "https://a.com"])
    assert calls == [("https://a.com", {"max_km": 1}), ("https://a.com", None)]
