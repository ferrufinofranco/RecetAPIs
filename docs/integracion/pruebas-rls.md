# Ocho pruebas RLS reales (opt-in)

## Última ejecución real — 2026-11-12

Comando: `npm.cmd run test:rls -- --single-project-test-only`. Se usó el único proyecto autorizado explícitamente por el usuario como dedicado a pruebas, sin datos reales.

**Resultado: RLS-01 a RLS-08 aprobadas, 0 fallidas, 0 omitidas, en 69,82 segundos.** Se autenticaron A, B y administrador contra Supabase Auth; se validaron sus roles en la base y se ejercitó la API REST real sin mocks, service_role ni claves secretas. No se observaron errores de autorización en los casos ejecutados; esto no certifica operaciones fuera de su alcance.

| Caso | Resultado real |
|---|---|
| RLS-01 | Aislamiento de solicitudes A/B aprobado. |
| RLS-02 | Versión pendiente y relaciones privadas de A invisibles para B. |
| RLS-03 | Lectura de recetas, relaciones y solicitudes propias aprobada. |
| RLS-04 | Lectura administrativa de pendientes y solicitudes ajenas aprobada. |
| RLS-05 | Resolución por usuarios comunes denegada sin cambios; control admin persistido. |
| RLS-06 | Aprobación y rechazo por usuarios comunes denegados sin cambios; ambas acciones admin persistidas. |
| RLS-07 | Intentos de autoasignación de `profiles.rol = 'admin'` sin cambios. |
| RLS-08 | Lecturas privadas y escrituras protegidas anónimas bloqueadas sin efectos; control administrativo aprobado. |

Manifiesto local ignorado por Git: `artifacts/rls/rls-48644cb8-4869-41b9-9290-d98ec9540184.json`, estado **`limpieza-segura-finalizada`**. Identificadores verificados: recetas 6/7/8/9, versiones 10/11/12/13, solicitudes 9/10/11, categoría 7 e ingrediente 16. La limpieza verificó bajas lógicas de las cuatro recetas, cierre de las tres solicitudes, desactivación del ingrediente y cierre local de las tres sesiones. **Permanecen historial/relaciones, solicitudes resueltas, ingrediente inactivo y categoría propia**, conforme a la limitación de borrado físico documentada abajo. No se modificaron registros ajenos, políticas, RPC SQL ni permisos.

Antes de esa ejecución se corrigió una incompatibilidad del runner: Vitest 5 no ofrece `describe.sequential`; se reemplazó por `describe` y `sequence: { concurrent: false, shuffle: false }` en la configuración independiente. El intento que detectó ese error no ejecutó casos ni contactó Supabase. No se cambiaron aserciones de seguridad para obtener el resultado.

Regresión posterior: **`npm test`: 150 aprobadas (72 Vitest + 78 node:test), 0 fallidas/omitidas. `npm run build`: correcto**, con type-check y Vite. Los ocho casos reales siguen separados del comando habitual.

## Preparación inicial — historial 2026-11-12

| Comprobación | Resultado |
|---|---|
| `npm test` | **150 aprobadas**: 72 Vitest + 78 node:test; 0 fallidas, 0 omitidas. |
| `npm run build` | **Correcto**: vue-tsc y Vite. |
| `npm run test:rls` | **Detenido, exit 1**, antes de iniciar Vitest o hacer peticiones. |
| RLS-01 a RLS-08 | **8 no ejecutadas**, 0 aprobadas, 0 fallidas observadas; no se certifica autorización real. |
| Acciones remotas en esta preparación | **0 peticiones**, 0 logins, 0 escrituras, 0 usuarios creados, 0 migraciones ejecutadas. |

Además, se verificaron la sintaxis de los archivos de integración, el descubrimiento de los ocho casos con `vitest list` y 11 validaciones locales del gate (configuración requerida, colisiones de destino, confirmación, referencia, claves, URL e identidades). Estas comprobaciones no usan red y **no cuentan como pruebas RLS aprobadas**.

Faltan todas las variables `RLS_*` de `.env.rls.example`: destino de testing, referencia independiente, URL principal, confirmación explícita, publishable key y credenciales de A/B/admin. El `.env` del frontend **no acredita un sandbox** y nunca se usa como destino o fuente de credenciales para esta suite.

### Reintento posterior con autorización de proyecto único

Se agregó el modo explícito descrito abajo y se ejecutó `npm.cmd run test:rls -- --single-project-test-only`. La validación volvió a detenerse **antes de cualquier petición**: `RLS_USER_A_EMAIL` y `RLS_USER_B_EMAIL` corresponden a la misma cuenta. Deben representar identidades Auth distintas para que la prueba de aislamiento A/B sea válida. No se alteraron ni se publicaron sus valores. Resultado: **8 casos RLS no ejecutados**, sin logins ni escrituras remotas; no hay errores RLS observados que atribuir a políticas/RPC. Regresión posterior al cambio: `npm test` **150 aprobadas** y `npm run build` **correcto**. Las 11 validaciones locales del gate, incluyendo el bloqueo por defecto y la excepción explícita, también pasaron sin red.

No hay errores de políticas o funciones observados en ejecución real. La tabla de casos identifica los objetos SQL de referencia a investigar **si** falla una futura ejecución; no demuestra que estén instalados ni que sean la causa exclusiva (otras políticas permisivas pueden ampliar acceso).

## Configurar sin tocar el proyecto principal

1. Un operador debe identificar en Supabase Dashboard un proyecto **separado, desechable, exclusivo de testing y sin datos reales**. No usar producción, ni un clon con datos personales. Esta suite no crea proyectos, usuarios ni despliega SQL.
2. Contrastar el esquema instalado con las migraciones suministradas y [el inventario de solo lectura](inventario-solo-lectura.sql). No ejecutar ciegamente los archivos por número: `05_recetario_categorias_baja_actualizado.sql` utiliza los nombres posteriores a 06; seguir sus instrucciones de compatibilidad. Se requieren los contratos de 01/02/04/06/07/08/09/10/11/12/14/15 para fixtures, lecturas, RPC y limpieza. La 13 se revisó pero su flujo de edición publicada no es objeto de estos ocho casos.
3. Aprovisionar **fuera de la suite y solo en testing** tres cuentas distintas, confirmadas, con login email/contraseña habilitado: A y B con `profiles.rol = 'usuario'`; administrador con `profiles.rol = 'admin'`. La asignación inicial del admin corresponde al operador, no al cliente ni a metadatos editables. No usar cuentas con MFA obligatorio en este flujo password-only.
4. Desde la carpeta de la aplicación, copiar la plantilla:

   ```powershell
   Copy-Item .env.rls.example .env.rls.local
   ```

5. Completar **localmente**, sin enviar contraseñas al chat:

   | Variable | Valor esperado |
   |---|---|
   | `RLS_SUPABASE_URL` | URL HTTPS canónica del proyecto de testing. |
   | `RLS_TEST_PROJECT_REF` | Referencia de 20 caracteres, contrastada independientemente en Dashboard. |
   | `RLS_PRIMARY_SUPABASE_URL` | URL canónica del proyecto principal, para la lista de bloqueo. |
   | `RLS_CONFIRM_TEST_ONLY` | Texto exacto `TEST_ONLY:` seguido de la referencia de testing. Confirma que el operador verificó el uso exclusivo y ausencia de datos reales. |
   | `RLS_SUPABASE_PUBLISHABLE_KEY` | Publishable key **del testing**, con prefijo `sb_publishable_`. |
   | `RLS_USER_A_EMAIL`, `RLS_USER_A_PASSWORD` | Cuenta común A, exclusiva de testing. |
   | `RLS_USER_B_EMAIL`, `RLS_USER_B_PASSWORD` | Cuenta común B, exclusiva de testing. |
   | `RLS_ADMIN_EMAIL`, `RLS_ADMIN_PASSWORD` | Administrador exclusivo de testing. |

   Usar comillas dotenv para contraseñas que contengan `#` u otros caracteres especiales. Las variables del proceso tienen precedencia sobre `.env.rls.local`; una variable vacía bloquea la ejecución. `.env.rls.local` y los artefactos están ignorados por Git; la plantilla no contiene secretos.

6. Ejecutar explícitamente:

   ```powershell
   npm.cmd run test:rls
   ```

   Se requiere la versión Node indicada en `package.json`. No agregar este comando a `npm test`, a la build ni al arranque del frontend.

### Gate de seguridad

**Excepción autorizada posteriormente: proyecto único dedicado a pruebas.** El usuario confirmó que su único proyecto contiene solamente datos de prueba, sin usuarios ni información real, y autorizó adaptar la validación. Para ese escenario ejecutar explícitamente:

```powershell
npm.cmd run test:rls -- --single-project-test-only
```

El flag habilita `RLS_ALLOW_SINGLE_PROJECT_TESTING=I_CONFIRM_NO_REAL_DATA` solo en el proceso del launcher y sus hijos. En ese modo `RLS_PRIMARY_SUPABASE_URL` es opcional y la URL de testing puede coincidir con las URLs de la app. El modo se anuncia y se registra en el manifiesto. No se cambia el `.env` del frontend ni se reutilizan sus claves. Se siguen exigiendo URL canónica, referencia exacta, `RLS_CONFIRM_TEST_ONLY=TEST_ONLY:<ref>`, publishable key propia y las tres identidades y roles reales. Sin el flag (o la autorización equivalente del entorno), el bloqueo original sigue activo. **No usar esta excepción con datos reales o producción.** La confirmación del operador no permite verificar automáticamente el contenido del proyecto.

El launcher valida **antes de iniciar el runner**; la suite vuelve a validar incluso si se invoca Vitest directamente. Por defecto, se exige la referencia y confirmación exactas, y se bloquea si el destino coincide con `RLS_PRIMARY_SUPABASE_URL`, `VITE_SUPABASE_URL` del proceso o las URLs conocidas de `.env`, `.env.local`, `.env.development[.local]` y `.env.production[.local]`. URLs malformadas, rutas, puertos, dominios personalizados, destinos HTTP/locales, credenciales en URL, claves JWT legacy y claves secret/service-role no se admiten. Esta versión solo admite proyectos alojados `https://<ref>.supabase.co`.

No hay una API pública que permita probar administrativamente que un proyecto está destinado exclusivamente a testing: la referencia contrastada y la confirmación del operador son requisitos, no una detección automática del contenido de la base. No completar esas variables por conjetura. Si el principal usa una configuración externa/no estándar, el operador debe identificar su URL canónica real en `RLS_PRIMARY_SUPABASE_URL` antes de autorizar nada.

Después del gate se obtienen tres JWT auténticos mediante `POST /auth/v1/token?grant_type=password`, se validan mediante `/auth/v1/user` y se leen `id,rol` del perfil propio. **No se escribe ningún fixture antes de verificar las tres cuentas y sus roles efectivos**. Si faltan perfiles, roles, confirmación de correo, conectividad o contratos, la ejecución falla; no convierte errores en pruebas aprobadas.

## Diseño y criterios

- Configuración independiente `vitest.rls.config.js`: Node, ejecución secuencial, sin plugins Vue, setup de mocks ni carga dotenv de Vite. Descubre solo `tests/integration/rls/**/*.rls.js`. La configuración habitual excluye explícitamente `tests/integration/**`; node:test habitual solo descubre archivos en `tests/*.test.js`.
- REST real mediante `fetch` nativo de Node, separado del Axios del frontend para no heredar interceptores, persistencia o dobles de pruebas. Todas las solicitudes llevan `apikey`; las autenticadas también llevan el JWT de su cuenta. El visitante no lleva `Authorization` (una publishable key no es un JWT).
- No hay service_role, Supabase Admin API, conexiones SQL elevadas ni mocks. La única sesión administrativa es la cuenta real con rol `admin` en `profiles`.
- Se crean registros con marcador UUID `rls-...`: una categoría, un ingrediente, cuatro recetas con versiones/relaciones propias y tres solicitudes. A y B tienen fixtures independientes. No se buscan registros de producción ni se usan IDs preexistentes del catálogo.
- Se comprueban IDs retornados, padre/autor/solicitante, estado pendiente, nombres y relaciones no vacías con contenido exacto. IDs bigint fuera del rango seguro de JS detienen la suite antes de reutilizarlos; no se promete soporte lossless de todo bigint.
- Las lecturas negativas usan IDs conocidos sin filtros de autor/estado del frontend; `200 []` es válido solo si el actor autorizado ve los registros y las relaciones correspondientes.
- Una escritura bloqueada requiere denegación de autorización (`401/403`, código PostgreSQL `42501`) o, para PATCH filtrado, `200 []`, **y relectura persistida sin cambios**. Un 404/RPC ausente, 400/argumento inválido, 5xx o JWT vencido no se acepta como prueba de RLS. Los controles positivos aplican el mismo cuerpo al actor autorizado y verifican el cambio, no solo el HTTP.
- RLS-07 no intenta un control positivo de edición de rol: el modelo no ofrece ese permiso a ningún cliente, ni siquiera al admin. Comprueba ambos perfiles comunes sin cambios y la capacidad efectiva del admin de leer solicitudes ajenas; sus RPC administrativas ya se ejercitan en RLS-05/06. Si se detecta escalamiento, fallar y pedir revisión al operador: no intentar reparar el rol con permisos elevados.
- Los JWT y respuestas completas de Auth permanecen en memoria; no se imprimen ni se guardan contraseñas, emails, claves, tokens, headers o cuerpos de error remoto. No activar trazas HTTP externas con credenciales reales.

## Casos y objetos responsables de referencia

| Caso | Verificación y control positivo | Política / función a revisar si falla |
|---|---|---|
| RLS-01 | B ve su solicitud, no la de A; A confirma existencia. | `Solicitudes: propietario o admin consulta` (15). |
| RLS-02 | B no ve receta/versión pendiente de A, ni categorías/ingredientes/pasos consultados directamente o embebidos; A y B sí ven sus propias relaciones exactas. | Políticas `Catalogo:*` (02, renombradas por 06), `Autor:*` (10/12), `Admin:*` (11/14). |
| RLS-03 | A lee receta, versión pendiente, relaciones y solicitud por IDs propios. | `Autor: leer mis recetas`, `Autor: leer mis versiones` (10), relaciones propias (12), solicitudes (15). |
| RLS-04 | Admin lee solicitudes, versiones pendientes y relaciones de A y B. | Lectura admin de recetas/pendientes/relaciones (11), versiones para gestión (14), solicitudes (15). |
| RLS-05 | A y B no resuelven una solicitud real válida; no cambia ninguna columna; admin aplica el mismo rechazo y se persiste. | Wrapper `resolver_solicitud_ingrediente` e interna `resolver_solicitud_ingrediente_internal` (15). |
| RLS-06 | A y B no aprueban ni rechazan versiones válidas; receta/versión/relaciones permanecen iguales. Admin realiza ambas acciones en fixtures separados; la aprobada es visible anónimamente. | Wrappers `aprobar_receta` / `rechazar_receta` e internas homónimas con sufijo `_internal` (11). |
| RLS-07 | A y B intentan PATCH de su propio `profiles.rol` a admin; ambos perfiles siguen en `usuario`. | Grants/revokes de profiles (01/02), `Leer mi perfil` (01), cualquier grant de columna/política adicional desplegada. |
| RLS-08 | Anónimo no lee solicitudes/relaciones privadas, ni crea receta/solicitud, modera, resuelve, elimina o renombra ingrediente. Relecturas de objetivos y búsquedas por marcador verifican ausencia de efectos. Admin renombra y restaura el mismo ingrediente como control positivo. | Grants y RLS (02/07), wrappers/grants e internas de alta (09), moderación (11), baja (14), solicitudes (15). |

Los nombres de tests incluyen las familias de políticas/RPC y migraciones para ubicar fallos. Una falla puede indicar drift del despliegue, un grant inesperado o una política adicional: inventariar antes de atribuir causa. **No modificar SQL para hacer pasar la suite.**

## Limpieza, fallos y evidencias

- Antes de cada alta de receta/solicitud se registra la intención en `artifacts/rls/rls-<uuid>.json`; también se guardan nombres previstos de catálogo y marcadores de intentos anónimos. Se añaden los IDs confirmados, dueños y estado de limpieza. Este archivo no es un reporte de pruebas aprobadas: sus estados describen fixtures/limpieza, no certificación RLS.
- `afterAll` intenta limpiar incluso tras fallos parciales. Relee y valida nombre/dueño/ID antes de actuar: rechaza solo solicitudes propias pendientes, da baja lógica a recetas propias y desactiva el ingrediente propio sin modificar asociaciones. Verifica persistencia o invisibilidad posterior y cierra únicamente las sesiones Auth creadas por la suite (`scope=local`). Una limpieza no confirmada hace fallar la ejecución.
- **No existe limpieza física segura por la API suministrada.** Permanecen historial de recetas y relaciones, solicitudes resueltas, ingrediente inactivo y categoría propia. No se llama a `eliminar_categoria`: reasigna asociaciones globales y podría tocar registros ajenos. No se agregan grants, RPC auxiliares ni SQL para borrar. La baja lógica se comprueba por resultado RPC y ausencia REST posterior; RLS impide inspeccionar directamente `eliminada_en` del registro ya oculto.
- Ante timeout, caída del proceso, escritura indebida, contrato inesperado o cambio de rol, revisar el manifiesto y buscar **por ID exacto o marcador completo de esa ejecución** en el proyecto de testing. Puede existir un commit sin respuesta; no hay reintentos automáticos de escrituras ni se infiere rollback. Un operador podrá retirar físicamente registros solo tras verificar que son de la suite y no afectan datos ajenos. La suite no ofrece un borrado masivo automático.
- No ejecutar en paralelo contra las mismas cuentas. Si `beforeAll` falla, los ocho casos no llegaron a ejecutarse: un resumen con casos omitidos no acredita RLS. Si falla `afterAll`, informar también la limpieza incompleta aunque los ocho cuerpos hayan pasado.
- Fuera del alcance: Storage, concurrencia/idempotencia, todas las ramas de resolución de ingredientes, edición/versionado adicional, PWA y CI/CD.

## Archivos de esta implementación

Se agregaron `.env.rls.example`, `vitest.rls.config.js`, `tools/test-rls.mjs` y `tests/integration/rls/{config.mjs,harness.mjs,security.rls.js}`. Se añadió `test:rls` en `package.json`, la exclusión explícita en `vitest.config.js`, el ignore de artefactos y documentación en README y este archivo. No se cambiaron dependencias, frontend, permisos ni migraciones SQL; se conservaron los cambios previos del repositorio.
