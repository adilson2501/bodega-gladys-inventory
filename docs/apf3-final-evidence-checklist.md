# APF3: lista de evidencia final y reproducibilidad

## Comandos de reproducción

Ejecutar desde la raíz del repositorio, con el entorno local preparado:

```bash
.venv/bin/python -m ml.simulate_commercial --output ml/data/simulation-v1
.venv/bin/python -m ml.validate_simulation --output ml/data/simulation-v1
.venv/bin/python -m ml.prepare_dataset --apf3 \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3
.venv/bin/python -m ml.train_apf3 \
  --artifact-dir ml/artifacts/apf3 \
  --output-dir ml/artifacts/apf3
.venv/bin/python -m ml.infer_apf3 \
  --model ml/artifacts/apf3/model.joblib \
  --metadata ml/artifacts/apf3/model_metadata.json \
  --input ml/artifacts/apf3/inference_example.json
.venv/bin/python -m ml.infer_apf3 \
  --future-demo \
  --source ml/data/simulation-v1 \
  --artifact-dir ml/artifacts/apf3 \
  --output-dir ml/artifacts/apf3
.venv/bin/pytest ml/tests
```

La primera orden regenera datos y la de entrenamiento regenera artefactos; se
incluyen para reproducibilidad, pero no fueron ejecutadas durante el cierre de
este anexo. La demostración de importador, si se requiere, debe limitarse al
dry-run documentado en `docs/phase-c1-staging-import.md` y requiere configuración
de staging; no es necesaria para reproducir APF3 offline.

## Checklist

| Evidencia | Estado | Resultado o referencia |
| --- | --- | --- |
| Manifiesto y hashes del lote | Verificado en archivos existentes | `simulation-v1.1.0`, semilla 42, 60 productos, periodo de 92 días, fuente `SYNTHETIC` |
| Validación de simulación | Verificado previamente, según `validation_summary.json` | Válido; 931 ventas, 132 compras, 5.520 filas producto-día, stock reconciliado |
| Preparación de dataset | Verificado previamente, según reportes existentes | 5.520 observaciones, 5.100 objetivos, 3.300 muestras ML, cero faltantes |
| EDA y partición temporal | Verificado previamente | Calentamiento de 14 días, purgas, train/validation/test cronológicos |
| Entrenamiento y evaluación | Reportado previamente; no se reranó | Ridge seleccionado; MAE test 1.2984537785, RMSE 1.7314340657, R² 0.5176610528 |
| Exportación reproducible | Verificado previamente | `model.joblib` Ridge, `alpha=10.0`, hash `df16e8be...9cfb9d95` |
| Inferencia offline | Verificado previamente | Auditoría E.1; sin ventas futuras, base de datos ni modificación de stock |
| Pruebas automatizadas | Ejecutado nuevamente durante este cierre | `.venv/bin/pytest ml/tests/test_simulation.py ml/tests/test_pipeline.py ml/tests/test_train_apf3.py -k 'not future_demo'`: 16 passed, 1 deselected, 10.74 s |
| Importador staging | No ejecutado | La documentación declara que no se conectó a Neon; no presentarlo como evidencia de importación |

## Distinción de resultados

Los conteos, métricas, hashes y auditorías referidos como “verificados
previamente” provienen de artefactos ya existentes y de sus documentos de fase;
no representan una nueva ejecución. En este cierre se ejecutaron 16 pruebas
seguras de simulación, preparación, evaluación e inferencia, con una prueba
excluida porque escribe la demostración E.1 en el directorio de artefactos. No se
regeneraron datos, no se entrenó el modelo y no se modificaron los artefactos
APF3.

## Requisitos académicos pendientes

- Recuperar y anexar los documentos originales APF1 y APF2.
- Sustentar con evidencia del negocio el KPI principal: frecuencia semanal de
  revisiones manuales.
- Validar con el propietario catálogo, precios, cierres, stock mínimo, lead time
  y reglas de reposición.
- Obtener historia real suficiente y repetir la evaluación fuera de muestra.
- Incorporar una bitácora real de prompts y revisión humana, si existe; de lo
  contrario, conservar la declaración de prompt no recuperado.
- No presentar el experimento sintético como evidencia de ahorro, reducción de
  quiebres o mejora del KPI operacional.
