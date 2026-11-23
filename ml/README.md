# MVP de pronóstico reproducible

Este directorio no ejecuta servicios permanentes. Usa el CSV de ventas autorizado por la aplicación, sin `actor_id`, `actor_email` ni datos de clientes. El origen se etiqueta como `REAL`; el modo sintético es únicamente una demostración (`DEMO`) y nunca se mezcla con recomendaciones operativas.

## Resultados APF3

La reproducción del 22 de noviembre de 2026 en Windows (Python 3.12.13, scikit-learn 1.6.1) coincide con los conteos, métricas y pronósticos del informe APF3 del Grupo 5 (secciones 2 a 5 y anexos A a C) a la precisión publicada. El experimento completo se ejecutó con archivos locales.

### Datos y evaluación

- **Origen sintético** con semilla 42 y 92 días del 1 de agosto al 31 de octubre de 2026.
- **60 productos, 9 categorías y 10 proveedores.** Se generaron 931 ventas (1.441 líneas), 132 compras (411 líneas) y 1.852 movimientos de inventario. El validador confirmó la conciliación del stock final.
- De 5.520 observaciones producto-día se obtuvieron 5.100 objetivos completos y 3.300 muestras aptas. El objetivo suma las unidades vendidas de `t+1` a `t+7` a partir de ventas completadas.
- Se usaron 2.220 muestras para entrenamiento (15 de agosto al 20 de septiembre), 540 para validación (1 al 9 de octubre) y 540 para prueba (16 al 24 de octubre). Se aplicaron 14 días de calentamiento y se excluyeron fechas entre particiones para evitar que las ventanas del objetivo se solaparan.

| Método | MAE entrenamiento | MAE validación | MAE prueba | RMSE prueba | R² prueba |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ingenuo de 7 días | 1,4207 | 1,3981 | 1,3870 | 2,0874 | 0,2989 |
| Media móvil de 14 días | 1,2448 | 1,2769 | 1,3120 | 1,8645 | 0,4407 |
| **Ridge (alfa 10)** | 1,0405 | **1,2375** | **1,2985** | **1,7314** | **0,5177** |
| Random Forest | 0,9098 | 1,2381 | 1,3313 | 1,8246 | 0,4644 |

Ridge se eligió por su MAE de validación antes de consultar el conjunto de prueba. Su MAE de prueba fue de aproximadamente **1,30 unidades por producto en siete días**, un **1,04 %** menor que el de la media móvil. La ventaja es modesta. En dos cortes de prueba predijo cerca de 4,9 unidades frente a 11 ventas observadas. El desempeño con ventas reales y la reducción de revisiones manuales siguen pendientes de medir.

### Demostración de reposición

Para **Papas Lays clásica 45 g**, con corte al 31 de octubre de 2026, Ridge pronosticó **5,7834 unidades** para el 1 al 7 de noviembre. Con 9 unidades en stock y un mínimo de 8, el stock objetivo fue `ceil(5,7834) + 8 = 14` y la reposición informativa fue de **5 unidades**. La ejecución fue offline, sin conexión a Neon ni registro de compras.

### Reproducir y verificar el APF3

Desde la raíz de un clon limpio, ejecuta estos comandos con `uv`.

```text
uv run --python 3.12 --with-requirements ml/requirements.txt python -m ml.simulate_commercial --output ml/data/simulation-v1
uv run --python 3.12 --with-requirements ml/requirements.txt python -m ml.validate_simulation --output ml/data/simulation-v1
uv run --python 3.12 --with-requirements ml/requirements.txt python -m ml.prepare_dataset --apf3 --source ml/data/simulation-v1 --artifact-dir ml/artifacts/apf3
uv run --python 3.12 --with-requirements ml/requirements.txt python -m ml.train_apf3 --artifact-dir ml/artifacts/apf3 --output-dir ml/artifacts/apf3
uv run --python 3.12 --with-requirements ml/requirements.txt python -m ml.infer_apf3 --future-demo
uv run --python 3.12 --with-requirements ml/requirements.txt python -m pytest -q ml/tests
```

Pasaron **20 pruebas de Python**, incluidas las 5 del simulador. Los conteos quedan en `ml/data/simulation-v1/validation_summary.json`. En `ml/artifacts/apf3/` se generan `temporal_split.json`, `evaluation_metrics.json`, `error_analysis.json`, `future_inference_output.json` y `replenishment_recommendation.json`, entre otros. Git ignora ambos directorios de salida.

Los ocho prefijos SHA-256 del anexo C difieren de los archivos de Windows tal como se generaron. Al normalizar los saltos de línea a LF coinciden los prefijos de `quality_report.json` y `temporal_split.json`. Los otros seis siguen difiriendo. Dos ejecuciones locales generaron hashes idénticos entre sí para los ocho archivos. La reproducción confirma los resultados a la precisión publicada. Las huellas del anexo corresponden a su paquete de evidencias original.

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
