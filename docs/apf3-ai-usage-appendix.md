# Apéndice: uso de asistencia de IA en APF3

## Criterio de registro

Este apéndice distingue la asistencia documentada de la evidencia que no se
conservó. El repositorio no contiene historial completo de conversaciones,
prompts, identidad de la herramienta ni registros de aceptación humana. Por
ello, no se inventan prompts exactos ni se atribuye una revisión humana
nominativa sin evidencia.

## Registro de uso

| Tarea | Herramienta de IA | Prompt o referencia disponible | Artefactos generados o modificados | Verificación realizada | Revisión humana responsable | Limitaciones conocidas |
| --- | --- | --- | --- | --- | --- | --- |
| Desarrollo de la simulación sintética | No identificable en el repositorio | Prompt original no recuperado; referencia: `ml/simulate_commercial.py`, Fases A-B | Simulador, reglas, catálogo y exportación `simulation-v1` | Tests de determinismo, validación de conteos, ledger, referencias, aritmética de stock y hashes | No consta evidencia nominativa de revisión humana | Parámetros comerciales no validados y resultados no reales |
| Desarrollo del importador | No identificable en el repositorio | Prompt original no recuperado; referencia: `docs/phase-c1-staging-import.md` | `scripts/import-simulation-staging.mjs` y pruebas del importador | Documentación y pruebas locales de rechazo, dry-run y cero escrituras | No consta evidencia nominativa de revisión humana; además, no se ejecutó importación Neon | No se puede inferir validación de base de datos real |
| Preparación de datos y EDA | No identificable en el repositorio | Prompt original no recuperado; referencia: `ml/prepare_dataset.py`, Fase D.1 | CSV APF3, reportes de calidad, EDA, partición y diccionario | Cobertura 60 x 92, objetivos recomputados, cero observado, purgas, hashes y tests | No consta evidencia nominativa de revisión humana | EDA describe un generador sintético y no demanda real |
| Entrenamiento y evaluación ML | No identificable en el repositorio | Prompt original no recuperado; referencia: `ml/train_apf3.py`, Fase D.2 | Pipelines Ridge/Random Forest, métricas, gráficos y `model.joblib` | Validación cronológica, selección por MAE de validación, test congelado, metadatos y hash del modelo | No consta evidencia nominativa de revisión humana | Métricas no prueban impacto empresarial ni generalización |
| Inferencia offline | No identificable en el repositorio | Prompt original no recuperado; referencia: `ml/infer_apf3.py`, Fase E.1 | Entrada/salida de inferencia, auditoría y recomendación informativa | Hash, esquema, fecha, procedencia y ausencia de ventas futuras; sin cambios de stock | No consta evidencia nominativa de revisión humana | No hay API productiva ni política automática de compras |
| Documentación técnica | No identificable en el repositorio | Prompt original no recuperado; referencias: documentos `phase-*`, `APF3-ML.md` y este apéndice | Documentación técnica y anexos académicos | Contraste con código, manifiestos, reportes y artefactos locales | La revisión académica final queda pendiente; no se afirma realizada | Puede faltar contexto de APF1/APF2 y trazabilidad de decisiones no registrada |

## Declaración de responsabilidad

La asistencia de IA, cuando se utilizó, se considera apoyo de elaboración y no
fuente de evidencia empírica. La responsabilidad de revisar código, resultados,
interpretación y afirmaciones corresponde al equipo del proyecto. En este
repositorio no hay una bitácora suficiente para identificar qué sugerencia
específica produjo cada línea ni para certificar una aprobación humana histórica;
esa limitación debe conservarse en el informe final.
