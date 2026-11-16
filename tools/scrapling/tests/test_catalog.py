import pytest

from cars_extractors.catalog import canonical_brand, canonical_model, slugify, split_brand_model


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Volkswagen", "Volkswagen"),
        ("VW", "Volkswagen"),
        ("  volkswagen ", "Volkswagen"),
        ("Citroen", "Citroën"),
        ("CITROËN", "Citroën"),
    ],
)
def test_canonical_brand(raw, expected):
    assert canonical_brand(raw) == expected


def test_unknown_brand_is_left_as_read():
    assert canonical_brand("Lada") == "Lada"
    assert canonical_brand(None) is None
    assert canonical_brand("  ") is None


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Gol Trend", "Gol"),
        ("gol", "Gol"),
        ("Focus III", "Focus"),
        ("EcoSport", "EcoSport"),
        ("Ecosport 1.6", "EcoSport"),
        ("T-Cross", "T-Cross"),
    ],
)
def test_canonical_model_uses_the_model_that_starts_the_text(raw, expected):
    brand = "Volkswagen" if expected in ("Gol", "T-Cross") else "Ford"
    assert canonical_model(brand, raw) == expected


def test_model_prefix_must_end_at_a_word_boundary():
    # "Golf" is another model, not a "Gol"
    assert canonical_model("Volkswagen", "Golf") == "Golf"


def test_unknown_model_or_brand_is_left_as_read():
    assert canonical_model("Ford", "Mustang") == "Mustang"
    assert canonical_model(None, "Ka") == "Ka"
    assert canonical_model("Ford", None) is None


def test_model_is_looked_up_only_under_its_brand():
    assert canonical_model("Fiat", "Ka") == "Ka"  # Fiat has no Ka: stays as read


def test_split_brand_model_from_a_title():
    assert split_brand_model("Ford Focus III") == ("Ford", "Focus")
    assert split_brand_model("VW Gol Trend") == ("Volkswagen", "Gol")
    assert split_brand_model("Citroën C3 Aircross") == ("Citroën", "C3")
    assert split_brand_model("Lada Niva") == (None, None)


def test_slugify():
    assert slugify("Citroën") == "citroen"
    assert slugify("T-Cross") == "t-cross"
    assert slugify("Gol Trend") == "gol-trend"
