# Visualización DEMO De Ridge Sintético

## Activación local

El modo DEMO está desactivado por defecto. Para habilitarlo en desarrollo o
Staging local:

```bash
STAGING_NEON_ENDPOINT_HOST='<configured-staging-host>' APF3_DEMO_MODE=true npm run dev:staging
```

El proceso debe tener disponible el batch generado por ML.4 en:

`ml/artifacts/apf3/forecast-batch/forecast_batch.json`

El loader usa una ruta fija del proyecto, valida el JSON con el contrato Zod
ML.2 y no acepta rutas proporcionadas por el navegador.

## Restricciones

- `APF3_DEMO_MODE=true` no habilita nada cuando `NODE_ENV=production`.
- Solo se acepta `source: SYNTHETIC` con `synthetic-manifest`.
- Los productos se asocian exclusivamente por UUID canónico.
- Un ID desconocido produce un aviso de mismatch; nunca se asocia por nombre.
- Si falta o es inválido el batch, no se muestran predicciones inventadas.
- El batch histórico se clasifica como `STALE` después de `forecast_end`.
- La página no usa `products.currentStock` para reposición sintética.
- El batch ML.4 no contiene stock histórico por producto; por eso la cantidad
  de reposición permanece oculta y se explica la causa.
- La demostración no crea compras, movimientos ni actualizaciones de stock.

## Comportamiento esperado

Con un catálogo compatible, `/predicciones` muestra un banner de DEMO, resumen
del modelo Ridge, versión, cutoff, horizonte, cobertura, filtros y tarjetas por
producto. Los forecasts fuera del horizonte se muestran como históricos, no
como una recomendación operativa actual.

El batch esperado contiene 60 filas y el entorno Staging compatible debe
producir `Matching UUID: 60/60`. Esta métrica significa productos del catálogo
que coinciden por UUID con filas validadas del batch dividido entre el total de
filas del batch; no es una métrica de precisión del modelo ni un conteo de
productos cargados sin validar. El estado histórico es `STALE` cuando la fecha
actual supera `forecast_end` (`2026-11-07`).

Con el modo desactivado, producción o un artefacto ausente, la página muestra
un estado de disponibilidad y no expone forecasts sintéticos. Los artefactos
legados sintéticos tampoco se renderizan fuera del modo DEMO.

## Futuro REAL

ML.6 deberá definir una publicación REAL independiente, provenance autenticada,
stock histórico verificable por cutoff y persistencia versionada. No debe
reutilizar este flag ni convertir el batch sintético en datos operativos.

## Checklist De Cierre

- [x] El modo DEMO requiere `APF3_DEMO_MODE=true`.
- [x] `NODE_ENV=production` bloquea el modo DEMO.
- [x] El batch se valida con el contrato Zod ML.2.
- [x] El matching usa UUID, nunca nombre.
- [x] La cobertura se etiqueta como matching UUID.
- [x] Los forecasts históricos se muestran como `STALE` fuera del horizonte.
- [x] El stock actual no se usa para reposición sintética.
- [x] Batch ausente o inválido produce un estado seguro.
- [x] No se crean compras ni se modifican movimientos.
- [ ] Validación visual contra un catálogo Staging real: requiere configuración
  local de Neon y no se ejecuta automáticamente en esta suite.
