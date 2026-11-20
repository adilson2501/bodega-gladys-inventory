# Closure.1: autorización por roles

## Modelo

La aplicación mantiene la autenticación en Neon Auth y guarda la autorización
en `app_user_roles`. La tabla no tiene una foreign key hacia las tablas internas
de Neon Auth.

Los únicos roles son:

- `ADMIN`: operaciones comerciales, inventario, productos, exportaciones y roles.
- `OPERATOR`: lectura operativa, ventas y compras.

Un usuario autenticado sin una fila válida en `app_user_roles` queda rechazado.
Nunca se acepta un rol desde `FormData`, query parameters o el navegador.

## Permisos

| Permiso | ADMIN | OPERATOR |
| --- | --- | --- |
| Dashboard, productos, stock, historial, predicciones | Sí | Sí |
| Crear/editar/desactivar productos | Sí | No |
| Registrar ventas | Sí | Sí |
| Registrar compras | Sí | Sí |
| Movimientos manuales | Sí | No |
| Ajustes de stock | Sí | No |
| Exportar ventas | Sí | No |
| Exportar datos ML | Sí | No |
| Gestionar roles | Sí | No |

Los checks server-side están en las Server Actions y APIs. La UI solamente
oculta controles para mejorar la experiencia y no constituye un control de
seguridad.

## Asignación inicial segura

`assignUserRole(userId, role)` es un helper server-only idempotente. Usa
`ON CONFLICT (user_id) DO UPDATE` y no está expuesto como Server Action ni como
endpoint público.

El flujo bootstrap puede asignar `ADMIN` únicamente al usuario creado por el
bootstrap inicial, después de validar el token de instalación y la ausencia de
usuarios Auth. Si la respuesta del proveedor no permite resolver el ID, la
operación no activa el acceso: debe completarse una asignación administrativa
explícita.

La comprobación de usuarios y la creación en Neon Auth siguen siendo pasos
separados. La concurrencia del bootstrap debe controlarse operacionalmente con
una única ventana de instalación o con un procedimiento transaccional aprobado
por el administrador de la base; esta fase no modifica tablas internas de Neon
Auth.

## Rollout obligatorio

1. Revisar los usuarios existentes y aprobar explícitamente los IDs ADMIN.
2. Aplicar `drizzle/0003_app-user-roles.sql` en Staging.
3. Ejecutar el backfill aprobado mediante el helper o procedimiento operativo.
4. Verificar que existe al menos un ADMIN y que puede iniciar sesión.
5. Crear/asignar un OPERATOR de prueba.
6. Probar acciones y exportaciones con ambos roles.
7. Preparar un rollout de Producción separado, con backup y ventana aprobada.

No se debe desplegar el enforcement contra una base que todavía no tenga la
tabla y las asignaciones aprobadas. No se deben asignar todos los usuarios como
ADMIN por defecto.

La inspección de usuarios y la aprobación de IDs son read-only. La asignación de
roles y la verificación de login requieren aprobación manual separada. El orden
operativo completo está documentado en `docs/closure-3a-staging-operations.md`.

## Validación local

```bash
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Estos comandos no aplican migraciones ni asignan roles.
