# APF3: matriz de trazabilidad

## Nota sobre APF1 y APF2

Los archivos originales de APF1 y APF2 no están disponibles en el repositorio
local inspeccionado. La trazabilidad histórica completa, las entrevistas y la
validación directa con el negocio no pueden afirmarse. La matriz usa únicamente
la evidencia independiente disponible en la documentación de Fases A-E, el
código y los artefactos. Las filas atribuidas a APF1/APF2 deben contrastarse con
los entregables originales antes de la entrega académica.

## Matriz

| Elemento | Evidencia o implementación local | Estado y alcance |
| --- | --- | --- |
| Problema de ingeniería original | Apoyar la gestión de inventario mediante estimación de ventas futuras por producto, sin compra automática | Verificable en `docs/APF3-ML.md`; la formulación APF1 original no está disponible |
| KPI principal de negocio | Frecuencia semanal de revisiones manuales de inventario | Se conserva como KPI principal; no fue medido ni reemplazado por una métrica ML |
| KPIs secundarios | Error de pronóstico por unidades: MAE, RMSE, R² y WAPE; sesgo medio | Son métricas del experimento sintético, no KPIs de mejora operativa |
| Contrato APF2 | Observación producto-día, historial previo al corte, objetivo de unidades vendidas en `t+1...t+7`, partición cronológica | Parcialmente verificable en Fase A y D.1; el documento APF2 original falta |
| Campos implementados en el MVP | Producto, categoría, unidad, ventas y líneas, compras, movimientos, stock mínimo, stock resultante, fecha, fuente y estado de observación | Verificable en CSV, simulador, preparación e inferencia; el MVP no ejecuta inferencia Ridge en Next.js |
| Campos usados en dataset ML | `product_id`, `category`, `unit_of_measure`, lags 1/2/7, medias móviles 7/14, desviación 7, frecuencias 7/14, día de semana, mes, stock disponible y clase histórica | Verificable en `data_dictionary.json`, `ml_samples.csv` y `train_apf3.py` |
| Objetivo ML | Unidades de venta completadas durante los siete días posteriores al corte, excluyendo el día del corte | Verificado en D.1: 5.100 objetivos completos y recomputación exacta |
| Evaluación ML | División temporal: train 2.220, validación 540, test 540; Ridge y Random Forest frente a dos líneas base | Verificable; Ridge seleccionado por MAE de validación y congelado antes del test |
| Resultado experimental | Ridge: test MAE 1.2985, RMSE 1.7314, R² 0.5177; Random Forest: MAE 1.3313, RMSE 1.8246, R² 0.4644 | Válido solo para datos sintéticos; no implica mejora del KPI principal |
| Validación empresarial pendiente | Comparar la frecuencia semanal de revisión manual antes/después, confirmar catálogo, cierres, precios, lead times, stock mínimo y utilidad de la recomendación | Requisito faltante; no hay evidencia local de medición ni aprobación del propietario |

## Interpretación correcta

MAE, RMSE y R² cuantifican el desempeño predictivo dentro de las particiones
del experimento. No miden cuántas veces se revisa manualmente el inventario, ni
demuestran que ese KPI haya mejorado. Para afirmar impacto APF1/APF2 se necesita
una medición operacional de la frecuencia semanal, un diseño de comparación y
validación con datos reales.

## Trazabilidad de artefactos

`ml/data/simulation-v1/` -> `prepare_dataset.py` ->
`ml/artifacts/apf3/prepared_product_day.csv` y `ml_samples.csv` ->
`train_apf3.py` -> `model.joblib` y métricas -> `infer_apf3.py` -> salida de
inferencia offline. La cadena conserva hashes SHA-256 y la etiqueta
`SYNTHETIC`; no existe una escritura de stock ni una API de inferencia en
producción.
