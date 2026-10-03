# Fixture: one real test, and one that tests nothing (a known AI-generated pattern), for the `tests` facts source.
from routers.orders import list_orders


def test_list_orders_is_empty():
    assert list_orders() == []


def test_noop():
    assert True
