import json
from pathlib import Path
from typing import Any

import pytest

from cars_extractors import carone
from cars_extractors.carone import (
    fetch,
    filtered_url,
    listing_filter,
    next_page_url,
    parse_listing_cards,
    parse_listing_details,
)
from cars_extractors.registry import get_adapter
from cars_extractors.service import get_listing_details, list_listings, site_info

FIXTURES = Path(__file__).parent / "fixtures"
START = "https://carone.com.ar/comprar?carOptions=usados"
CAR_URL = "https://carone.com.ar/comprar/usados/renault-logan-ii-1-6-16v-life"
USED = {"stock_status": {"eq": "IN_STOCK"}, "carone_tags_arg": {"in": ["2"]}}


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


class FakeApi:
    """Answers the GraphQL POSTs from fixtures and records what was asked."""

    def __init__(self, products: str = "carone_list.json"):
        self.products = json.loads(fixture(products))
        self.ids = json.loads(fixture("carone_filter_ids.json"))
        self.calls: list[dict[str, Any]] = []

    def __call__(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        return self.ids if "catalogFilters" in payload["query"] else self.products

    @property
    def product_calls(self) -> list[dict[str, Any]]:
        return [c["variables"] for c in self.calls if "products(" in c["query"]]


def test_cards_come_from_the_api_answer():
    cards = parse_listing_cards(fixture("carone_list.json"), START)
    assert len(cards) == 4
    assert cards[0] == {
        "name": "Renault Logan II 1.6 16V LIFE",
        "brand": "Renault",
        "model": "Logan",
        "link": CAR_URL,
        "year": 2024,
        "km": 59400,
        "transmission": "Manual",
        "price": 21630000,
    }
    assert cards[1]["transmission"] == "Automático"


def test_details_of_one_car():
    details = parse_listing_details(fixture("carone_detail.json"), CAR_URL)
    assert details == {
        "name": "Renault Logan II 1.6 16V LIFE",
        "brand": "Renault",
        "model": "Logan",
        "year": 2024,
        "km": 59400,
        "price_original": 21630000,
        "currency_original": "ARS",
        "transmission": "Manual",
        "color": "Blanco",
        "characteristics": "II 1.6 16V LIFE, Sedan, Nafta",
        "link": CAR_URL,
    }


def test_car_out_of_stock_is_not_a_listing():
    empty = json.dumps({"products": {"page_info": {}, "items": []}})
    with pytest.raises(ValueError, match="not available"):
        parse_listing_details(empty, CAR_URL)


def test_next_page_until_the_last():
    text = fixture("carone_list.json")  # page 1 of 38
    assert next_page_url(text, START + "&brand=Renault") == START + "&brand=Renault&page=2"
    last = json.dumps({"products": {"page_info": {"current_page": 38, "total_pages": 38}, "items": []}})
    assert next_page_url(last, START + "&page=38") is None


def test_filters_go_in_the_results_url():
    url = filtered_url(START, {"min_price": 100, "max_price": 200, "max_km": 50000, "min_km": None,
                               "transmission": "automatic", "brand": "Chevrolet", "model": "Tracker"})
    assert url == (START + "&max_km=50000&min_price=100&max_price=200"
                   "&transmission=automatic&brand=Chevrolet&model=Tracker")


def test_model_without_brand_is_ignored():
    assert filtered_url(START, {"model": "Tracker"}) == START


def test_price_and_km_filter_without_looking_up_ids():
    api = FakeApi()
    result = listing_filter({"min_price": "100", "max_km": "50000"}, api)
    assert result == {**USED, "price": {"from": "100"}, "carone_mileage": {"to": "50000"}}
    assert api.calls == []


def test_brand_model_and_transmission_become_site_ids():
    api = FakeApi()
    result = listing_filter({"brand": "Chevrolet", "model": "S10", "transmission": "manual"}, api)
    assert result == {
        **USED,
        "carone_transmission": {"in": ["11893"]},
        "carone_marca": {"in": ["11140"]},
        "carone_modelo": {"in": ["25151"]},  # the site writes it "S-10"
    }


def test_a_model_includes_its_variants():
    result = listing_filter({"brand": "Citroën", "model": "C3"}, FakeApi())
    assert result is not None
    assert result["carone_modelo"] == {"in": ["11971", "25118"]}  # C3 and C3 Aircross


def test_brand_the_site_does_not_sell_asks_no_products():
    api = FakeApi()
    text = fetch(START + "&brand=Honda", post=api)
    assert parse_listing_cards(text, START) == []
    assert next_page_url(text, START) is None
    assert api.product_calls == []


def test_fetch_results_page_asks_the_page_in_the_url():
    api = FakeApi()
    fetch(START + "&max_price=40000000&page=3", post=api)
    assert api.product_calls == [{"filter": {**USED, "price": {"to": "40000000"}}, "page": 3, "size": carone.PAGE_SIZE}]


def test_fetch_car_page_asks_its_url_key():
    api = FakeApi("carone_detail.json")
    text = fetch(CAR_URL, post=api)
    assert api.product_calls[0]["filter"]["url_key"] == {"eq": "renault-logan-ii-1-6-16v-life"}
    assert parse_listing_details(text, CAR_URL)["year"] == 2024


def test_fetch_rejects_other_pages():
    with pytest.raises(ValueError):
        fetch("https://carone.com.ar/comprar/reserva", post=FakeApi())


def test_registered_by_hostname():
    assert get_adapter(START) is carone
    assert get_adapter(CAR_URL) is carone
    assert get_adapter("https://carone.com.ar/") is None
    assert site_info(START) == {"supported": True, "currency": "ARS"}


def test_service_uses_the_adapter_fetch(monkeypatch):
    requested: list[str] = []

    def fake_fetch(url: str) -> str:
        requested.append(url)
        return fixture("carone_detail.json") if "/usados/" in url else fixture("carone_list.json")

    monkeypatch.setattr(carone, "fetch", fake_fetch)
    listed = list_listings(START, {"max_km": 50000})
    assert requested == [START + "&max_km=50000"]
    assert all(card["currency"] == "ARS" for card in listed["listings"])
    assert listed["next_page_url"] == START + "&max_km=50000&page=2"
    details = get_listing_details([CAR_URL])
    assert details["results"][0]["listing"]["color"] == "Blanco"


def test_search_with_no_cars_on_the_site_is_an_empty_result(monkeypatch):
    monkeypatch.setattr(carone, "fetch", lambda url: fetch(url, post=FakeApi()))
    listed = list_listings(START, {"brand": "Honda"})
    assert listed == {
        "supported": True,
        "url_used": START + "&brand=Honda",
        "listings": [],
        "next_page_url": None,
    }


def test_only_a_products_answer_is_a_results_page():
    assert carone.is_results_page(json.dumps(carone._NO_RESULTS))
    assert not carone.is_results_page("<html></html>")
    assert not carone.is_results_page(json.dumps({"catalogFilters": {}}))
    assert not carone.is_results_page("[]")


class FakeSend:
    """Answers each POST with the next (status, body), or raises it."""

    def __init__(self, *answers: Any):
        self.answers = list(answers)
        self.calls = 0

    def __call__(self, payload: dict[str, Any]) -> tuple[int, bytes]:
        self.calls += 1
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


OK = (200, json.dumps({"data": {"products": {}}}).encode())


@pytest.mark.parametrize("first", [(503, b""), (429, b""), ConnectionError("reset")])
def test_a_transient_api_failure_is_retried_once(first):
    send = FakeSend(first, OK)
    waits: list[float] = []
    assert carone._post_graphql({}, send=send, sleep=waits.append) == {"products": {}}
    assert send.calls == 2
    assert waits == [carone.RETRY_DELAY_SECONDS]


def test_a_second_api_failure_raises():
    with pytest.raises(RuntimeError, match="HTTP 503"):
        carone._post_graphql({}, send=FakeSend((503, b""), (503, b"")), sleep=lambda _s: None)


def test_a_client_error_is_not_retried():
    send = FakeSend((400, b""))
    with pytest.raises(RuntimeError, match="HTTP 400"):
        carone._post_graphql({}, send=send, sleep=lambda _s: None)
    assert send.calls == 1
