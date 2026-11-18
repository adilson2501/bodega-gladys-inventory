"""Reglas y límites de la simulación de Fase A; no genera transacciones."""
from datetime import date

SIMULATION_START = date(2026, 8, 1)
SIMULATION_END = date(2026, 10, 31)
SIMULATION_DAYS = (SIMULATION_END - SIMULATION_START).days + 1
SEED = 42
SALES_TARGET = (900, 1200)
PURCHASES_TARGET = (150, 250)
PRODUCT_COUNT = 60
CATEGORY_COUNT = 9


def validate_rules() -> None:
    assert SIMULATION_DAYS == 92
    assert SIMULATION_START <= SIMULATION_END
    assert SALES_TARGET[0] <= SALES_TARGET[1]
    assert PURCHASES_TARGET[0] <= PURCHASES_TARGET[1]
