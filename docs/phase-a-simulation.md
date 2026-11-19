# Fase A: catálogo y reglas de simulación

## Alcance

Esta fase define el universo sintético y las reglas reproducibles para una futura
simulación. No crea ventas, compras, proveedores, movimientos de inventario ni
registros en Neon. Tampoco modifica staging o producción ni despliega la aplicación.

La implementación ejecutable está en `simulation/phase_a_catalog.py` y
`simulation/phase_a_rules.py`; ambos módulos son puros y no tienen acceso a red,
base de datos ni reloj del sistema.

## Ventana y objetivos

- Inicio inclusivo: `2026-08-01`.
- Fin inclusivo: `2026-10-31`.
- Duración: exactamente 92 días calendario.
- Ventas futuras: aproximadamente 900-1,200 documentos de venta.
- Compras futuras: aproximadamente 150-250 documentos de compra.
- Semilla determinista: `42`.

Los rangos son metas de volumen para la siguiente fase, no datos generados en esta
entrega. Cada fecha debe quedar dentro de la ventana, y el orden cronológico debe
ser estable con la semilla indicada.

## Catálogo

El catálogo tiene exactamente 60 productos y 9 categorías: Abarrotes, Bebidas,
Lácteos, Snacks, Limpieza, Cuidado personal, Conservas, Refrigerados, y
Panadería. Incluye productos empaquetados (`PACKAGED`) y de unidad discreta
(`DISCRETE`), con unidades compatibles con la aplicación (`UNIT`, `KG`, `LITER`,
`PACK`). Cada producto contiene un UUID derivado de su posición, parámetros de
stock inicial/mínimo y `provenance: SYNTHETIC`.

Los nombres y parámetros representan una bodega peruana pequeña: básicos de alta
rotación, bebidas y snacks de compra frecuente, perecibles discretos, limpieza y
cuidado personal de menor rotación. No representan inventario, precios o ventas de
un comercio real.

## Reglas de movimientos futuras

1. Generar la demanda diaria por producto usando únicamente la categoría,
   presentación, clase de demanda, día de semana y variación pseudoaleatoria con
   semilla 42.
2. Concentrar más ventas de bebidas/snacks y productos de alta demanda en fines de
   semana, sin introducir tendencias anuales ni fechas fuera de la ventana definida.
3. Emitir una compra cuando el stock proyectado alcance el mínimo, respetando un
   plazo de proveedor fijo por categoría y cantidades enteras compatibles con la
   presentación. Agrupar compras para obtener aproximadamente 150-250 documentos.
4. Aplicar cada salida antes de la siguiente entrada del mismo día con un orden
   estable; nunca permitir stock negativo. Las entradas deben reponer capacidad y
   las salidas deben reflejar ventas, no ajustes manuales inventados.
5. Etiquetar todos los datos derivados como `SYNTHETIC`; no mezclar con datos
   `REAL`, usuarios, clientes ni proveedores reales.

Estas reglas describen el contrato de generación. La función que materialice
transacciones se implementará en una fase posterior y deberá permanecer separada
de este catálogo.

## Contrato ML futuro

La observación será producto-día. Para cada corte, el objetivo será predecir las
unidades vendidas durante los 7 días siguientes usando solo el historial disponible
hasta ese corte. La evaluación será cronológica, sin barajar: entrenamiento antes
del corte y prueba después del corte. Las variables de rezago y ventanas móviles
se calcularán solo con fechas anteriores al objetivo para evitar fuga de objetivo.

Los tres meses simulados permiten validar el flujo y comparar líneas base, pero son
una limitación importante. No bastan para aprender ni demostrar estacionalidad
anual; no se debe afirmar que el modelo aprende patrones de todo un año.
