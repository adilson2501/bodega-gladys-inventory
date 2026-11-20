# APF3: justificación de los datos sintéticos

## Alcance y estatus de la evidencia

APF3 utiliza un lote local, determinista y explícitamente marcado como
`SYNTHETIC`. No representa ventas reales de Bodega Gladys ni una medición
reportada por su propietario. La evidencia verificable corresponde al lote
`simulation-v1.1.0:42:2026-08-01:2026-10-31`, sus reportes de validación y los
artefactos APF3. La simulación no se conecta a Neon ni modifica la aplicación.

## Necesidad de la simulación

La simulación fue necesaria para probar el contrato de datos, la preparación de
observaciones producto-día, la partición temporal, la evaluación comparativa y
la inferencia offline sin disponer localmente de una exportación real con
historia suficiente. Su función es de ingeniería y experimentación: comprobar
la integridad del flujo y producir un caso reproducible. No sustituye la
validación comercial ni permite inferir el comportamiento de clientes reales.

## Supuestos de contexto y decisiones de ingeniería

La documentación de Fase A describe como contexto de diseño una bodega peruana
pequeña, con abarrotes de alta rotación, bebidas, snacks, perecibles discretos,
limpieza y cuidado personal. El catálogo contiene nueve categorías y unidades
compatibles con la aplicación. Estas son representaciones de contexto, no
observaciones del negocio.

Las siguientes decisiones son de ingeniería del simulador: semilla 42, UUIDv5
estables, versión `simulation-v1.1.0`, proveedores sintéticos, calendario
2026-08-01 a 2026-10-31, clases de demanda, factores por categoría y calendario,
bandas de precios y costos, horarios de entrega, cantidades de seguridad,
horarios UTC deterministas y ausencia de descuentos, impuestos, clientes y
datos personales. Los precios y costos son supuestos de presentación, no
precios de mercado verificados.

No hay evidencia local que valide con datos reales la distribución de demanda,
las clases `HIGH/MEDIUM/LOW`, los factores por categoría o mes, los precios,
costos, niveles mínimos, horarios de proveedores, cantidades de seguridad,
probabilidad de cierre, ruido aleatorio o reglas de compra. Deben presentarse
como parámetros de prueba, no como hechos informados por el propietario.

## Parámetros y reglas observables

- **Tamaño del catálogo:** se fijaron 60 productos y nueve categorías para
  representar un panel multproducto manejable y probar referencias, categorías,
  inventario y codificación categórica. El número no fue estimado a partir de un
  inventario real; es una decisión de cobertura del experimento.
- **Ventana de 92 días:** corresponde a tres meses calendario inclusivos,
  definidos en Fase A, y permite formar ventanas históricas de 14 días y un
  objetivo de siete días. Es suficiente para probar el flujo, pero insuficiente
  para aprender estacionalidad anual.
- **Frecuencia de transacciones:** cada día se genera una cantidad de tickets
  mediante un calendario sembrado. Lunes-jueves tienen medias inferiores,
  viernes-sábado superiores y domingo una media menor; algunos domingos se
  cierran. Se aplica un factor mensual y ruido normal acotado. La salida
  observada contiene 931 ventas y 132 compras; esos conteos son resultados de la
  ejecución sintética, no metas de negocio alcanzadas.
- **Cantidades y selección:** para cada ticket se seleccionan productos con
  ponderaciones derivadas de categoría, clase de demanda, día de semana, fin de
  semana, mes y variación pseudoaleatoria. La cantidad por línea es normalmente
  una unidad y ocasionalmente dos. La demanda potencial se conserva separada de
  la venta completada.
- **Precios:** cada categoría y presentación usa una banda fija de costo y
  precio de venta en céntimos; el precio de venta es superior al costo. El
  cálculo monetario se hace en enteros y se exporta con dos decimales.
- **Compras y stock:** dos compras iniciales establecen el stock de apertura.
  Luego se evalúa el punto de reorden mínimo en los días de entrega del
  proveedor, incorporando una cantidad de seguridad y demanda esperada. Las
  compras se procesan antes de las ventas del día. Cada línea genera un
  movimiento `IN/PURCHASE` o `OUT/SALE`, con stock anterior y resultante; nunca
  se permite stock negativo.
- **Movimientos especiales:** el desperdicio refrigerado solo puede aparecer
  bajo una condición sembrada de exceso de stock. En el lote validado hubo cero
  movimientos de desperdicio. El ledger contiene 1.852 eventos y coincide con
  los movimientos.
- **Estacionalidad y cierres:** no se modela estacionalidad anual. Se incluyen
  efectos de día de semana, fin de semana y factores mensuales acotados. La
  preparación identifica como cierres las fechas 2026-08-09, 2026-08-23,
  2026-09-27 y 2026-10-04.
- **Cero frente a ausencia:** la tabla canónica contiene las 60 combinaciones de
  producto por cada uno de los 92 días. Un día observado sin venta queda como
  `OBSERVED_ZERO`; un cierre se marca `CLOSED`. Por ello, cero ventas no se
  interpreta como dato faltante. La preparación falla ante cobertura incompleta
  y no rellena ausencias con cero.
- **Stockout:** se marca `STOCKOUT_CENSORED` cuando la demanda potencial excede
  la cantidad completada (`unfulfilled_units > 0`). Se identificaron dos
  observaciones producto-día censuradas y se conservaron como indicadores; no se
  reconstruyó una demanda causal no observada.

## Evidencia cuantitativa verificable

El manifiesto y la validación reportan 60 productos, 10 proveedores, 931 ventas,
1.441 líneas de venta, 132 compras, 411 líneas de compra, 5.520 observaciones
producto-día y 5.100 objetivos completos de siete días. El reporte APF3 registra
3.300 muestras utilizables después del calentamiento y las purgas temporales,
sin días producto faltantes. El stock final está reconciliado y toda fila tiene
proveniencia `SYNTHETIC`.

## Limitaciones de generalización

El modelo aprende regularidades del generador, no una población comercial
observada. La muestra no contiene clientes reales, promociones, feriados,
reacciones a precios, cambios de surtido, entregas reales, pérdidas registradas
ni estacionalidad anual. Las ventas completadas pueden subestimar la demanda en
los dos días censurados. Las bandas de precio, cierres, proveedores y reglas de
reposición no tienen validación externa. Por tanto, los resultados de Ridge y
Random Forest describen este experimento sintético y no prueban exactitud,
ahorro, reducción de quiebres ni mejora operativa en Bodega Gladys. Antes de un
uso operativo se requiere una exportación real, definición de la ventana de
observación con el negocio, evaluación fuera de muestra y seguimiento de
errores.

## Fuentes locales consultadas

`docs/phase-a-simulation.md`, `docs/phase-b-simulation.md`,
`docs/phase-d1-apf3-dataset.md`, `ml/simulate_commercial.py`,
`ml/prepare_dataset.py`, `ml/data/simulation-v1/simulation_manifest.json`,
`validation_summary.json`, `stock_reconciliation.json`, `quality_report.json` y
`dataset_metadata.json`.
