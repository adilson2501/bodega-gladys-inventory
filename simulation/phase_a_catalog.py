"""Catálogo sintético determinista de Bodega Gladys.

Este módulo no escribe en la base de datos y no crea ventas, compras ni movimientos.
"""
from dataclasses import asdict, dataclass
from uuid import NAMESPACE_URL, uuid5

CATALOG_PROVENANCE = "SYNTHETIC"
CATALOG_NAMESPACE = "https://bodega-gladys.example/simulation/phase-a"


@dataclass(frozen=True)
class ProductSpec:
    id: str
    name: str
    category: str
    presentation: str
    unit_of_measure: str
    demand_class: str
    initial_stock: int
    minimum_stock: int
    provenance: str = CATALOG_PROVENANCE


# 60 referencias de consumo habitual en una bodega peruana; el orden es parte
# de la regla determinista y no representa datos de un negocio real.
_DEFINITIONS = (
    ("Abarrotes", "Arroz Costeño Extra 1 kg", "PACKAGED", "KG", "HIGH"),
    ("Abarrotes", "Azúcar Rubia 1 kg", "PACKAGED", "KG", "HIGH"),
    ("Abarrotes", "Aceite Vegetal Primor 1 L", "PACKAGED", "LITER", "HIGH"),
    ("Abarrotes", "Fideos Don Vittorio Spaghetti 500 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Abarrotes", "Lenteja 500 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Abarrotes", "Harina sin preparar 1 kg", "PACKAGED", "KG", "MEDIUM"),
    ("Abarrotes", "Sal yodada 1 kg", "PACKAGED", "KG", "LOW"),
    ("Abarrotes", "Avena en hojuelas 500 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Bebidas", "Agua San Luis 625 ml", "PACKAGED", "UNIT", "HIGH"),
    ("Bebidas", "Gaseosa Inca Kola 500 ml", "PACKAGED", "UNIT", "HIGH"),
    ("Bebidas", "Gaseosa Coca-Cola 500 ml", "PACKAGED", "UNIT", "HIGH"),
    ("Bebidas", "Gaseosa Kola Inglesa 500 ml", "PACKAGED", "UNIT", "MEDIUM"),
    ("Bebidas", "Jugo Gloria durazno 1 L", "PACKAGED", "LITER", "MEDIUM"),
    ("Bebidas", "Bebida energética Volt 300 ml", "PACKAGED", "UNIT", "MEDIUM"),
    ("Bebidas", "Chicha morada 500 ml", "PACKAGED", "UNIT", "LOW"),
    ("Lácteos", "Leche Gloria evaporada 400 g", "PACKAGED", "UNIT", "HIGH"),
    ("Lácteos", "Yogur Gloria fresa 1 L", "PACKAGED", "LITER", "MEDIUM"),
    ("Lácteos", "Yogur bebible fresa 180 g", "PACKAGED", "UNIT", "MEDIUM"),
    ("Lácteos", "Queso fresco porción", "DISCRETE", "UNIT", "MEDIUM"),
    ("Lácteos", "Mantequilla barra 100 g", "PACKAGED", "UNIT", "LOW"),
    ("Lácteos", "Huevo fresco", "DISCRETE", "UNIT", "HIGH"),
    ("Lácteos", "Leche chocolatada 200 ml", "PACKAGED", "UNIT", "MEDIUM"),
    ("Snacks", "Galleta Soda Field 6 unidades", "PACKAGED", "PACK", "HIGH"),
    ("Snacks", "Galleta Casino chocolate", "PACKAGED", "UNIT", "HIGH"),
    ("Snacks", "Papas Lays clásica 45 g", "PACKAGED", "UNIT", "HIGH"),
    ("Snacks", "Chizitos 35 g", "PACKAGED", "UNIT", "MEDIUM"),
    ("Snacks", "Chocolate Sublime", "PACKAGED", "UNIT", "MEDIUM"),
    ("Snacks", "Caramelo surtido", "DISCRETE", "UNIT", "LOW"),
    ("Snacks", "Chicle individual", "DISCRETE", "UNIT", "LOW"),
    ("Limpieza", "Detergente Bolívar 500 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Limpieza", "Lejía Clorox 1 L", "PACKAGED", "LITER", "MEDIUM"),
    ("Limpieza", "Lavavajilla Sapolio 500 ml", "PACKAGED", "UNIT", "MEDIUM"),
    ("Limpieza", "Jabón para ropa 250 g", "PACKAGED", "UNIT", "LOW"),
    ("Limpieza", "Esponja de cocina", "DISCRETE", "UNIT", "LOW"),
    ("Limpieza", "Bolsa para basura mediana", "DISCRETE", "UNIT", "LOW"),
    ("Limpieza", "Papel toalla rollo", "PACKAGED", "UNIT", "MEDIUM"),
    ("Cuidado personal", "Jabón de tocador 90 g", "PACKAGED", "UNIT", "MEDIUM"),
    ("Cuidado personal", "Shampoo Head & Shoulders 180 ml", "PACKAGED", "UNIT", "LOW"),
    ("Cuidado personal", "Pasta dental Colgate 75 ml", "PACKAGED", "UNIT", "MEDIUM"),
    ("Cuidado personal", "Papel higiénico Elite 4 rollos", "PACKAGED", "PACK", "HIGH"),
    ("Cuidado personal", "Toalla higiénica paquete", "PACKAGED", "PACK", "MEDIUM"),
    ("Cuidado personal", "Rastrillo descartable", "DISCRETE", "UNIT", "LOW"),
    ("Conservas", "Atún Florida 170 g", "PACKAGED", "UNIT", "MEDIUM"),
    ("Conservas", "Sardina en tomate 155 g", "PACKAGED", "UNIT", "LOW"),
    ("Conservas", "Arveja en lata 425 g", "PACKAGED", "UNIT", "LOW"),
    ("Conservas", "Leche condensada 393 g", "PACKAGED", "UNIT", "LOW"),
    ("Conservas", "Mermelada fresa 250 g", "PACKAGED", "UNIT", "LOW"),
    ("Conservas", "Mayonesa  pequeña 100 g", "PACKAGED", "UNIT", "MEDIUM"),
    ("Refrigerados", "Salchicha hot dog 250 g", "PACKAGED", "PACK", "HIGH"),
    ("Refrigerados", "Hot dog familiar 500 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Refrigerados", "Jamón sandwich 200 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Refrigerados", "Nuggets de pollo 400 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Refrigerados", "Queso edam tajado 200 g", "PACKAGED", "PACK", "MEDIUM"),
    ("Refrigerados", "Chorizo parrillero 500 g", "PACKAGED", "PACK", "LOW"),
    ("Panadería", "Pan francés", "DISCRETE", "UNIT", "HIGH"),
    ("Panadería", "Pan integral", "DISCRETE", "UNIT", "MEDIUM"),
    ("Panadería", "Tamal criollo", "DISCRETE", "UNIT", "LOW"),
    ("Panadería", "Queque porción", "DISCRETE", "UNIT", "LOW"),
    ("Panadería", "Empanada de carne", "DISCRETE", "UNIT", "MEDIUM"),
    ("Panadería", "Rosquita", "DISCRETE", "UNIT", "LOW"),
)


def _stock(demand_class: str) -> tuple[int, int]:
    return {"HIGH": (24, 8), "MEDIUM": (14, 5), "LOW": (8, 3)}[demand_class]


def build_catalog() -> tuple[ProductSpec, ...]:
    return tuple(
        ProductSpec(
            id=str(uuid5(NAMESPACE_URL, f"{CATALOG_NAMESPACE}/{index:03d}")),
            name=name,
            category=category,
            presentation=presentation,
            unit_of_measure=unit,
            demand_class=demand_class,
            initial_stock=_stock(demand_class)[0],
            minimum_stock=_stock(demand_class)[1],
        )
        for index, (category, name, presentation, unit, demand_class) in enumerate(_DEFINITIONS, 1)
    )


CATALOG = build_catalog()


def catalog_as_dicts() -> list[dict[str, object]]:
    """Devuelve una copia serializable, sin efectos secundarios."""
    return [asdict(product) for product in CATALOG]
