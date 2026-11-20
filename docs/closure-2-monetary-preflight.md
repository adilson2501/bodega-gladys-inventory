# Closure.2: preflight monetario para Staging

No ejecutar la migración `drizzle/0004_familiar_rick_jones.sql` hasta completar esta revisión en una copia o conexión de Staging autorizada. La migración agrega los checks como `NOT VALID`: no reescribe históricos, pero sí impide nuevos datos inválidos.

## Revisiones de solo lectura

El inspector `npm run db:inspect:staging` ejecuta estas verificaciones dentro de una transacción read-only. Las consultas de fingerprints solo se ejecutan cuando las columnas existen; esto permite inspeccionar bases anteriores a `0004` sin asumir su esquema.

```sql
SELECT id FROM products WHERE selling_price < 0 OR purchase_cost < 0;
SELECT id FROM sales WHERE subtotal < 0 OR total < 0 OR subtotal <> total;
SELECT id FROM purchases WHERE subtotal < 0 OR total < 0 OR subtotal <> total;
SELECT id FROM sale_items WHERE unit_price < 0 OR line_total < 0 OR line_total <> unit_price * quantity;
SELECT id FROM purchase_items WHERE unit_cost < 0 OR line_total < 0 OR line_total <> unit_cost * quantity;

SELECT idempotency_key, COUNT(*)
FROM sales
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

SELECT idempotency_key, COUNT(*)
FROM purchases
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

SELECT idempotency_key, COUNT(*)
FROM inventory_movements
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

Registrar conteos y ejemplos de cada resultado. No corregir, borrar ni recalcular filas históricas automáticamente. Si hay resultados, decidir explícitamente si se documentan como excepciones históricas o se corrigen mediante un procedimiento aprobado antes de validar constraints.

## Cierre del preflight

- Confirmar que el esquema real corresponde a las migraciones `0000` a `0004` o identificar exactamente las pendientes.
- Confirmar que los datos monetarios respetan las precisiones `numeric(10,2)` y `numeric(12,2)`.
- Revisar el journal, el orden aplicado y cualquier objeto parcialmente aplicado.
- Registrar constraints existentes y constraints `NOT VALID`.
- Aplicar `VALIDATE CONSTRAINT` solo después de resolver/documentar hallazgos.
- Probar una venta y una compra concurrentes, una repetición idempotente y un conflicto de fingerprint.
- Verificar que no se generaron movimientos duplicados y que los costos históricos permanecen intactos.
