# MVP de pronóstico reproducible

Este directorio no ejecuta servicios permanentes. Usa el CSV de ventas autorizado por la aplicación, sin `actor_id`, `actor_email` ni datos de clientes. El origen se etiqueta como `REAL`; el modo sintético es únicamente una demostración (`DEMO`) y nunca se mezcla con recomendaciones operativas.

## Reproducción

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r ml/requirements.txt
curl -L -o ml/data/ventas.csv http://localhost:3000/api/export/ml-sales
python ml/prepare_dataset.py --input ml/data/ventas.csv --output ml/data/daily_sales.csv
python ml/train.py --input ml/data/daily_sales.csv --artifact ml/artifacts/forecast.json --metrics ml/artifacts/metrics.json
pytest ml/tests
```

La descarga requiere una sesión autenticada y el endpoint solo contiene líneas de venta. Si no hay historia suficiente, para una demostración separada se puede ejecutar `python ml/train.py --synthetic`; ese archivo queda etiquetado `SYNTHETIC` y `DEMO`.

## Diseño

La unidad de observación es producto-día. Solo se usan `sales` y `sale_items`; compras, ajustes y salidas manuales no entran. Los ceros se materializan únicamente dentro de una ventana de observación explícita (`--coverage-start`/`--coverage-end`) o entre la primera y última observación de un producto, nunca antes de su primera venta ni en días no observados por defecto. Productos con menos de 14 días observados no reciben un pronóstico operativo.

Se comparan persistencia ingenua (último valor), media móvil de 7 días y `RandomForestRegressor` con rezagos y calendario. La división es cronológica (80/20), sin barajar. Los rezagos y medias usan solo fechas anteriores. Se informan MAE y WAPE; WAPE puede ser inestable con demanda total baja y no sustituye evidencia de producción.

El JSON contiene versión, fuente, fechas, modelo, esquema de variables, evaluación y filas de pronóstico. La interfaz lo valida antes de mostrarlo.
