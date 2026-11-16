import re
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
    assert details["link"] == "https://www.kavak.com/ar/venta/ford-ka-15_s-hatchback-2018?id=562256"


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
    assert first["link"] == "https://www.kavak.com/ar/venta/ford-focus_iii-20_titanium-sedan-2019?id=562001"
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


def test_filtered_url_adds_kavak_params():
    from cars_extractors.kavak import filtered_url

    url = filtered_url(
        "https://www.kavak.com/ar/usados",
        {"min_km": None, "max_km": 100000, "max_price": 15470300, "transmission": "manual"},
    )
    assert url == "https://www.kavak.com/ar/usados?max_km=100000&max_price=15470300&transmission=manual"


def test_filtered_url_maps_automatic_and_keeps_user_params():
    from cars_extractors.kavak import filtered_url

    url = filtered_url(
        "https://www.kavak.com/ar/usados?max_km=50000&page=2",
        {"max_km": 100000, "transmission": "automatic"},
    )
    assert url == "https://www.kavak.com/ar/usados?max_km=50000&page=2&transmission=automatico"


def test_filtered_url_is_idempotent():
    from cars_extractors.kavak import filtered_url

    filters = {"max_km": 100000, "transmission": "manual"}
    once = filtered_url("https://www.kavak.com/ar/usados", filters)
    assert filtered_url(once, filters) == once


def test_cards_carry_the_canonical_brand_and_model(list_html):
    cards = parse_listing_cards(list_html, "https://www.kavak.com/ar/usados/ford")
    assert [(c["brand"], c["model"]) for c in cards] == [("Ford", "Focus"), ("Ford", "Focus"), ("Ford", "Mondeo")]


def test_details_carry_the_canonical_brand_and_model(detail_html):
    details = parse_listing_details(detail_html, SLUG_URL)
    assert details["brand"] == "Ford"
    assert details["model"] == "Ka"


def test_details_normalize_a_model_variant(detail_html):
    html = detail_html.replace('"model":"Ka"', '"model":"Ka Plus"')
    assert parse_listing_details(html, SLUG_URL)["model"] == "Ka"


def test_details_without_brand_keywords_take_it_from_the_name(detail_html):
    html = re.sub(r'"keywords":"[^"]*"', '"keywords":""', detail_html)
    assert parse_listing_details(html, SLUG_URL)["brand"] == "Ford"


def test_filtered_url_puts_brand_and_model_in_query_params():
    from cars_extractors.kavak import filtered_url

    start = "https://www.kavak.com/ar/usados"
    assert filtered_url(start, {"brand": "Ford"}) == f"{start}?maker=ford"
    assert filtered_url(start, {"brand": "Ford", "model": "Ka"}) == f"{start}?maker=ford&model=ka"
    assert filtered_url(start, {"brand": "Citroën", "model": "C3"}) == f"{start}?maker=citroen&model=c3"
    assert (
        filtered_url(start, {"brand": "Ford", "model": "Ka", "max_km": 1000})
        == f"{start}?max_km=1000&maker=ford&model=ka"
    )


def test_filtered_url_ignores_a_model_without_brand_and_keeps_user_params():
    from cars_extractors.kavak import filtered_url

    start = "https://www.kavak.com/ar/usados"
    assert filtered_url(start, {"model": "Ka"}) == start
    assert filtered_url(f"{start}?maker=ford", {"brand": "Fiat"}) == f"{start}?maker=ford"


def test_site_identity():
    from cars_extractors import kavak

    assert kavak.SITE_ID == "kavak"
    assert kavak.START_URL == "https://www.kavak.com/ar/usados"
    assert get_adapter(kavak.START_URL) is kavak


def test_card_links_carry_the_car_id(list_html):
    cards = parse_listing_cards(list_html, "https://www.kavak.com/ar/usados")
    assert [c["link"].rsplit("?id=", 1)[1] for c in cards] == ["562001", "561376", "560976"]


def test_cards_sharing_a_slug_stay_distinct_by_id():
    html = (
        '<a href="https://www.kavak.com/ar/venta/ford-ka-se-2018" data-testid="card-product-1"><h3>Ford Ka</h3></a>'
        '<a href="https://www.kavak.com/ar/venta/ford-ka-se-2018" data-testid="card-product-2"><h3>Ford Ka</h3></a>'
        '<a href="https://www.kavak.com/ar/venta/ford-ka-se-2018" data-testid="card-product-2"><h3>Ford Ka</h3></a>'
    )
    links = [c["link"] for c in parse_listing_cards(html, "https://www.kavak.com/ar/usados")]
    assert links == [
        "https://www.kavak.com/ar/venta/ford-ka-se-2018?id=1",
        "https://www.kavak.com/ar/venta/ford-ka-se-2018?id=2",
    ]


def test_detail_link_without_id_stays_canonical(detail_html):
    url = "https://www.kavak.com/ar/venta/ford-ka-15_se-hatchback-2017"
    assert parse_listing_details(detail_html, url)["link"].endswith("ford-ka-15_s-hatchback-2018")


def test_reserved_cards_are_left_out():
    html = (
        '<a href="https://www.kavak.com/ar/venta/ford-ka-a-2019" data-testid="card-product-1">'
        "<div>Reservado</div><h3>Ford • Ka</h3></a>"
        '<a href="https://www.kavak.com/ar/venta/ford-ka-b-2019" data-testid="card-product-2">'
        "<h3>Ford • Ka</h3></a>"
    )
    cards = parse_listing_cards(html, "https://www.kavak.com/ar/usados")
    assert [c["link"] for c in cards] == ["https://www.kavak.com/ar/venta/ford-ka-b-2019?id=2"]


def test_reserved_detail_page_is_rejected(detail_html):
    reserved = detail_html.replace("<body>", "<body><div>Este auto está reservado pero podría volver</div>", 1)
    assert "Este auto está reservado" in reserved
    with pytest.raises(ValueError, match="reserved"):
        parse_listing_details(reserved, SLUG_URL)
