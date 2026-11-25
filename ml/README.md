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

Para la simulación de Fase A, la ventana es estrictamente `2026-08-01` a
`2026-10-31` (92 días). La tarea futura es predecir las unidades vendidas en los
siguientes 7 días por producto-día, usando únicamente información histórica
disponible en cada corte. La partición de entrenamiento/prueba debe ser
cronológica, sin barajar, y las variables deben calcularse antes del objetivo para
evitar fuga de información. Tres meses simulados sirven para validar el flujo,
pero no permiten aprender ni afirmar estacionalidad anual.

La salida comercial mejorada de Phase B.1 está en `ml/data/simulation-v1/` y
contiene 60 x 92 observaciones producto-día, demanda potencial separada de ventas
completadas y objetivos de siete días solo para cortes con futuro completo.

Se comparan persistencia ingenua (último valor), media móvil de 7 días y `RandomForestRegressor` con rezagos y calendario. La división es cronológica (80/20), sin barajar. Los rezagos y medias usan solo fechas anteriores. Se informan MAE y WAPE; WAPE puede ser inestable con demanda total baja y no sustituye evidencia de producción.

El JSON contiene versión, fuente, fechas, modelo, esquema de variables, evaluación y filas de pronóstico. La interfaz lo valida antes de mostrarlo.

## APF3 dataset preparation

Phase D.1 prepares the canonical synthetic export without fitting a model:

```bash
.venv/bin/pip install -r ml/requirements.txt
.venv/bin/python -m ml.prepare_dataset --apf3 \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3
.venv/bin/pytest ml/tests
```

The preparation writes product-day data, feature/target data, training-only
EDA statistics and charts, quality and temporal-split reports, a preprocessing
plan, and SHA-256 metadata under `ml/artifacts/apf3/`. It validates the
authoritative seven-day targets against sale-item transactions, preserves
`SYNTHETIC` provenance, and applies a chronological warm-up/purge design. It
does not connect to Neon or train Ridge, Random Forest, or any other model.

## APF3 model training

Phase D.2 trains and evaluates the frozen APF3 dataset offline:

```bash
.venv/bin/python -m ml.train_apf3 \
  --artifact-dir ml/artifacts/apf3 \
  --output-dir ml/artifacts/apf3
.venv/bin/python -m ml.infer_apf3 \
  --model ml/artifacts/apf3/model.joblib \
  --metadata ml/artifacts/apf3/model_metadata.json \
  --input ml/artifacts/apf3/inference_example.json
```

The trainer uses purged chronological cross-validation, selects between Ridge
and Random Forest on validation MAE, evaluates the untouched test set once,
and exports only a project-generated offline joblib pipeline. It never writes
to a database or modifies inventory.

## APF3 future inference demonstration

Phase E.1 derives the 2026-10-31 feature record and closing stock from the
canonical local simulation, then runs the exported model without November data:

```bash
.venv/bin/python -m ml.infer_apf3 \
  --future-demo \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3 \
  --output-dir ml/artifacts/apf3
```

It writes the input, prediction, audit, and informational replenishment JSON
files under `ml/artifacts/apf3/`. It does not create purchases or modify stock.
