# Closure.3A: operación segura de Staging

Este documento separa explícitamente diagnóstico read-only de cualquier operación que escriba en Staging.

## A. Inspección read-only

Requiere `STAGING_NEON_ENDPOINT_HOST` en el entorno de ejecución y `DATABASE_URL` dentro de `.env.staging.local`. El hostname debe ser el endpoint aprobado de Staging y no puede coincidir con `PRODUCTION_NEON_ENDPOINT_HOST` cuando esta variable esté configurada.

```bash
STAGING_NEON_ENDPOINT_HOST='hostname-staging-aprobado' \
npm run db:inspect:staging
```

El inspector valida el endpoint, abre `BEGIN READ ONLY`, detecta las cinco migraciones, consulta capacidades del esquema, revisa journal, constraints y datos históricos, y termina con `ROLLBACK`. No imprime cadenas de conexión.

La inspección no requiere aprobación para leer, pero sí requiere aprobación para aceptar su resultado.

## B. Backup

Crear un backup o branch recuperable de Staging mediante el procedimiento aprobado por el administrador de Neon. Registrar el identificador, timestamp y prueba de restauración.

**Aprobación manual obligatoria.** Los scripts locales no crean backups.

## C. Ejecución de migraciones

1. Confirmar que el inspector reporta `0000`, `0001` y `0002` aplicadas y `0003` pendiente.
2. Aplicar `drizzle/0003_app-user-roles.sql` mediante el procedimiento aprobado.
3. Verificar journal, enum y tabla `app_user_roles`.
4. Confirmar que `0004` es la siguiente migración pendiente.
5. Aplicar `drizzle/0004_familiar_rick_jones.sql`.

**Aprobación manual obligatoria antes de cada migración.** Nunca ejecutar una migración si el inspector reporta orden inesperado, conflicto de hash u objetos parciales.

## D. Asignación de roles

1. Listar usuarios Auth mediante una consulta read-only aprobada.
2. Aprobar IDs ADMIN individualmente.
3. Asignar roles con `assignUserRole(userId, role)` desde un procedimiento server-only aprobado.
4. Verificar al menos un ADMIN funcional antes de continuar.
5. Asignar un OPERATOR de prueba solo si fue aprobado.

**Aprobación manual obligatoria.** No asignar roles desde FormData, navegador o SQL improvisado.

## E. Validación de constraints

Los checks de `0004` son `NOT VALID`. Primero deben revisarse los hallazgos históricos. Solo después se puede ejecutar `VALIDATE CONSTRAINT` para cada constraint aprobado.

**Aprobación manual obligatoria.** Un hallazgo histórico no se corrige automáticamente.

## F. Pruebas de integración

Solo después de autorizar escrituras:

- Crear registros desechables con UUIDs y prefijos únicos.
- Probar ventas, compras, stock, concurrencia e idempotencia.
- Probar ADMIN y OPERATOR.
- Confirmar snapshots históricos y movimientos.
- Ejecutar cleanup y verificar que no queden registros.
- Mantener la demo de predicciones aislada de datos comerciales reales.

**Aprobación manual obligatoria.** `db:reset:staging` y cualquier importación de datos no forman parte del preflight read-only.
