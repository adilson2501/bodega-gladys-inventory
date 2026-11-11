# Resumen técnico APF3

## Problema

Estimar unidades vendidas por producto durante los siguientes siete días para apoyar la decisión de compra, sin cambiar inventario automáticamente.

## Datos y preparación

La fuente real son exclusivamente ventas completadas y sus líneas (`sales` y `sale_items`), exportadas por `/api/export/ml-sales`. La extracción no incluye usuarios, clientes ni actores. Se agregan cantidades por producto y día, se descartan cantidades inválidas y se marca cada fila como `REAL`. Los días cero solo se crean dentro de una ventana observada; no se inventan días anteriores a la primera observación.

Si la historia de un producto no alcanza el mínimo del experimento, el resultado es `INSUFFICIENT_HISTORY`, no una predicción disfrazada. El modo `--synthetic` es un conjunto separado y explícito para demostrar el flujo, no evidencia del negocio.

## Métodos y evidencia

Se ejecutan persistencia ingenua, media móvil de siete días y `RandomForestRegressor` con rezagos 1/2/7, media móvil previa y día de semana. La división 80/20 es cronológica, sin barajar. Las variables se calculan solo con valores previos al día objetivo. Se reportan MAE y WAPE sobre la misma ventana.

Este repositorio no contiene todavía una exportación real con suficiente historia, por lo que no se afirma una mejora medida. Si el modelo entrenado pierde frente a la línea base, `metrics.json` conserva ese resultado sin ocultarlo. WAPE es especialmente inestable cuando la demanda total es baja o cero.

## Pronóstico y límites

El artefacto JSON versionado contiene origen, fechas, esquema de variables, evaluación y pronóstico de siete días por producto. Next.js valida su forma y cruza únicamente IDs de productos existentes. La reposición es `max(0, ceil(demanda_7d + stock_seguridad - stock_actual))`; no crea compras ni altera stock. Se necesita más historia real, validación fuera de muestra y seguimiento de error antes de usarlo como política automática.

## Evidencia pendiente

Se requiere ejecutar el flujo con una exportación real que cubra varias semanas, revisar la ventana de observación con el negocio y comparar los tres modelos en una fecha de corte no usada en entrenamiento.
