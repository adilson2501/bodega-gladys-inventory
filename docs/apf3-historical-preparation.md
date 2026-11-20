# Preparación Histórica APF3

## Alcance

`ml/prepare_history.py` prepara filas de features para inferencia APF3 a partir
del export comercial canónico local. En esta fase solo acepta el lote
`SYNTHETIC` de `ml/data/simulation-v1`. No conecta a Neon, no entrena Ridge,
no carga `model.joblib` y no escribe en la base de datos.

## Fuentes canónicas

- `products.csv`: `id`, `category`, `unit_of_measure`, `initial_stock`,
  `current_stock`, `source`.
- `sales.csv`: `id`, `created_at`, `source`. Las fechas se convierten a
  `America/Lima`.
- `sale_items.csv`: `id`, `sale_id`, `product_id`, `quantity`, `source`.
- `inventory_movements.csv`: producto, timestamp, stock anterior y resultante,
  cantidad y `source`.
- `daily_product_sales.csv`: observación producto-día que demuestra cobertura,
  incluye ventas completadas y ceros observados.
- `simulation_manifest.json`: periodo, hashes y provenance `SYNTHETIC`.

Las ventas completadas se agregan desde `sales` y `sale_items`; la tabla diaria
se verifica contra esa agregación. Un día ausente no se convierte en cero.
Solo los ceros explícitamente presentes en la observación diaria son válidos.

## Features

Las fórmulas no se duplican: el módulo llama a
`prepare_dataset._feature_values` y usa el mismo `_historical_stock` que el
entrenamiento y la demostración APF3.

- `lag_1`, `lag_2`, `lag_7`: unidades de días anteriores al cutoff.
- `rolling_mean_7`, `rolling_mean_14`: medias de ventanas anteriores.
- `rolling_std_7`: desviación estándar poblacional de los siete días previos.
- `sales_frequency_7`, `sales_frequency_14`: días previos con unidades mayores
  que cero.
- `day_of_week`, `month`: calendario de `America/Lima`.
- `stock_available_eod`: uno si el stock reconstruido del día es positivo.
- `historical_demand_class`: `zero`, `low`, `regular` o `high` según la media
  histórica de 14 días.
- `category`, `unit_of_measure`: metadata del producto.

El cutoff es inclusivo para la historia disponible, pero las features usan
únicamente valores anteriores al cutoff. El objetivo futuro no se suministra.
Se requieren 14 días previos para emitir una fila elegible.

## Elegibilidad

Cada producto recibe uno de estos estados:

- `SUFFICIENT_HISTORY`: puede emitirse una fila de features.
- `INSUFFICIENT_HISTORY`: menos de 14 días previos.
- `MISSING_OBSERVATIONS`: falta cobertura producto-día.
- `INVALID_STOCK_HISTORY`: la cadena previous/resulting stock no coincide.
- `INVALID_PRODUCT_METADATA`: metadata o provenance del producto inválidos.

Las filas no elegibles no reciben features fabricadas.

## Paridad y límites

El cutoff `2026-10-31` del producto
`6ce5d35d-c954-5f70-8e79-d1046a3b3475` reproduce los valores de
`ml/artifacts/apf3/future_inference_input.json` dentro de `1e-8` para floats.
El output se ordena por `product_id` y es determinista.

La simulación no demuestra precisión en producción, estacionalidad anual ni
demanda no servida real. Para REAL se necesitarán exportación autenticada,
política de cobertura observada, timezone acordada, stock histórico confiable,
tratamiento de quiebres y validación independiente de provenance. La salida
preparada debe envolverse después en el contrato ML.2, sin marcarla como REAL
sin verificación confiable.
