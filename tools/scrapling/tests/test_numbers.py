import pytest

from cars_extractors.numbers import parse_es_ar_number


@pytest.mark.parametrize(
    "text, expected",
    [
        ("146.000 km", 146000),
        ("$12.140.000", 12140000),
        ("$ 23.016.838", 23016838),
        ("1,5", 1.5),
        ("1.234,56", 1234.56),
        ("75.368 km", 75368),
        ("950", 950),
    ],
)
def test_parses_es_ar_format(text, expected):
    assert parse_es_ar_number(text) == expected


@pytest.mark.parametrize("text", [None, "", "sin dato", "$"])
def test_returns_none_without_number(text):
    assert parse_es_ar_number(text) is None
