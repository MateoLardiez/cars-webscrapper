from pathlib import Path

import pytest

from cars_extractors.kavak import next_page_url, results_url, parse_listing_cards, parse_listing_details
from cars_extractors.registry import get_adapter

FIXTURES = Path(__file__).parent / "fixtures"
# The requested slug says 2017 and "_se"; the page content says 2018 and "_s".
SLUG_URL = "https://www.kavak.com/ar/venta/ford-ka-15_se-hatchback-2017?id=562256"


@pytest.fixture
def detail_html() -> str:
    return (FIXTURES / "kavak_detail.html").read_text()


@pytest.fixture
def list_html() -> str:
    return (FIXTURES / "kavak_list.html").read_text()


def test_year_comes_from_the_page_not_the_slug(detail_html):
    details = parse_listing_details(detail_html, SLUG_URL)
    assert details["year"] == 2018
    assert details["name"] == "Ford Ka 1.5 S Hatchback 2018"


def test_detail_fields(detail_html):
    details = parse_listing_details(detail_html, SLUG_URL)
    assert details["km"] == 147320
    assert details["price_original"] == 11789699
    assert details["currency_original"] == "ARS"
    assert details["model"] == "Ka"
    assert details["transmission"] == "Manual"
    assert details["color"] == "Gris"
    assert details["link"] == "https://www.kavak.com/ar/venta/ford-ka-15_s-hatchback-2018"


def test_missing_field_is_none_and_never_taken_from_url(detail_html):
    html = detail_html.replace('"vehicleModelDate":"2018"', '"vehicleModelDate":null')
    assert parse_listing_details(html, SLUG_URL)["year"] is None


def test_page_without_car_data_raises():
    with pytest.raises(ValueError):
        parse_listing_details("<html></html>", SLUG_URL)


def test_cards(list_html):
    cards = parse_listing_cards(list_html, "https://www.kavak.com/ar/usados/ford")
    assert len(cards) == 3
    first = cards[0]
    assert first["name"] == "Ford Focus III"
    assert first["link"] == "https://www.kavak.com/ar/venta/ford-focus_iii-20_titanium-sedan-2019"
    assert first["year"] == 2019
    assert first["km"] == 75368
    assert first["transmission"] == "Manual"
    assert first["price"] == 23016838


def test_next_page(list_html):
    base = "https://www.kavak.com/ar/usados/ford"
    assert next_page_url(list_html, base) == base + "?page=1"
    assert next_page_url(list_html, base + "?page=2") == base + "?page=3"
    assert next_page_url(list_html, base + "?page=3") is None


def test_registry():
    assert get_adapter(SLUG_URL) is not None
    assert get_adapter("https://www.kavak.com/ar") is not None
    assert get_adapter("https://www.kavak.com/ar/") is not None
    assert get_adapter("https://www.kavak.com/mx/seminuevos") is None
    assert get_adapter("https://www.kavak.com/arxyz") is None
    assert get_adapter("https://example.com/cars") is None


def test_empty_car_node_is_rejected():
    html = (
        '<script type="application/ld+json">'
        '{"@graph":[{"@type":"Car","name":"No Existe 123  Undefined","model":"existe"}]}</script>'
    )
    with pytest.raises(ValueError):
        parse_listing_details(html, SLUG_URL)


def test_home_resolves_to_results_page():
    assert results_url("https://www.kavak.com/ar") == "https://www.kavak.com/ar/usados"
    assert results_url("https://www.kavak.com/ar/?x=1") == "https://www.kavak.com/ar/usados"
    assert results_url("https://www.kavak.com/ar/usados/ford") == "https://www.kavak.com/ar/usados/ford"
