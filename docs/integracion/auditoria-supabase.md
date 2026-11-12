# Auditoría de integración — Recetas e ingredientes

Fecha: 2026-11-12. Continuación con las migraciones incorporadas al repositorio. **Dictamen: contratos de las cuatro RPC de creación/edición verificados en archivos SQL y compatibles con las claves esperadas por el frontend; validaciones alineadas (int32, numeric(12,3), IDs inseguros, versión posterior) con la limitación de precisión bigint documentada. Integración autenticada, persistencia y configuración efectiva no certificadas.**

## Alcance y fuentes

- Código actual de `src/services`, formulario compartido, helpers, store y guards.
- Fuentes principales: `supabase/migrations/09_recetario_alta_recetas.sql`, `12_recetario_edicion_reenvio.sql`, `13_recetario_proponer_edicion_publicada.sql` y `15_recetario_cierre_modulos.sql`. Se leyeron wrappers e implementaciones internas. `README_PARA_OPENCODE.md` confirma que son copias de referencia, no evidencia del despliegue.
- Fuentes complementarias: esquema 01, lectura 02/10, renombrado 06, moderación 11, baja 14 y permisos/RPC de categorías e ingredientes 04/05/07/08. Esto resuelve la falta de fuentes señalada en la auditoría anterior. `inventario-solo-lectura.sql` sigue siendo una consulta auxiliar, no una migración.
- Solo se encontró `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; no configuración real dedicada de TEST/STAGING/local Supabase. `example.supabase.co` en Vitest es un mock, no un sandbox.
- No se inició sesión con cuentas reales, no se crearon usuarios, no se invocaron RPC ni se hicieron escrituras o subidas reales.

## 1. Contratos verificados en archivos SQL 09, 12, 13 y 15

**Las cuatro RPC devuelven un objeto JSONB de nivel superior con `version_id`**, no un escalar, array, string JSON ni una clave `nueva_version_id`. Sus wrappers públicos son `RETURNS jsonb` y retornan sin envolver el resultado interno. Falta comprobar que esas mismas definiciones estén instaladas en Supabase.

| RPC y firma SQL | Respuesta definida | Identidad/estado de la versión | Evidencia SQL |
|---|---|---|---|
| `crear_receta(p_datos jsonb)` | `{receta_id, version_id, estado:'pendiente'}` | ID de la nueva versión obtenido con `INSERT ... RETURNING id`; autor obtenido de `auth.uid()` y perfil existente. La imagen comienza en null. | 09:149–175; wrapper 09:185–192. |
| `editar_propuesta_receta(p_version_id bigint, p_datos jsonb)` | `{receta_id, version_id, estado:'pendiente', accion}` | Pendiente: `version_id=p_version_id`, acción `actualizada`. Rechazada: nuevo ID `RETURNING id`, acción `reenviada`; se conserva la rechazada y se copia su imagen. Solo autor, receta no eliminada, sin una versión posterior. | 12:104–145, 245–302; wrapper 12:311–321. |
| `proponer_edicion_receta(p_receta_id bigint, p_datos jsonb)` | `{receta_id, version_id, estado:'pendiente', accion:'propuesta_creada', version_publicada_id}` | Nueva pendiente propia, conservando publicada e imagen aprobada. Llama a la interna de 12, que retorna `version_id`; `v_resultado || jsonb_build_object(...)` solo reemplaza `accion` y agrega `version_publicada_id`, **no elimina ni anida `version_id`**. | 13:54–116; wrapper 13:125–135. |
| `admin_editar_receta(p_receta_id bigint, p_datos jsonb)` | `{receta_id, version_id, estado:'publicada', version_anterior_id}` | Nuevo ID de versión publicada; anterior pasa a `anterior`. Exige admin, receta no eliminada, publicada existente y ausencia de pendiente. Omisión/null/ruta de imagen conservan/quitan/reemplazan respectivamente. | 15:290–319, 398–448; wrapper 15:456–458. |

### Correspondencia con Axios y el formulario

- `src/services/recetas.js:52–56`, `109–114`, `149–154` y `161–165` usan los endpoints y nombres de argumentos de esas firmas. No hay discrepancias en los nombres `p_datos`, `p_version_id` o `p_receta_id`.
- Las cuatro funciones devuelven `response.data` de Axios directamente. El formulario usa la respuesta de alta/edición/propuesta en `respuestaGuardado` y `completarImagen` (`RecetaFormulario.vue:53–57,128–134`). `obtenerVersionGuardada` lee exactamente `.version_id`, no `.receta_id`, `.numero` ni `.version_publicada_id`.
- La reserva del ID ya conocido para una pendiente editada es compatible con 12, pero **no es necesaria con estos SQL**, que siempre incluyen la clave. Para rechazadas reenviadas y nuevas propuestas se usa el ID nuevo del JSON; no el original.
- En edición administrativa, el frontend no necesita consumir el `version_id` retornado: sube primero el archivo si corresponde y envía `imagen_path` dentro de `p_datos`. Después informa publicada y vuelve a consultar. No llama a asignar_imagen_receta sobre esa publicada.
- Categorías/ingredientes/pasos siguen usando `version_id` como FK. La 06 solo renombra las tablas; las FKs de 01:90–119 conservan la referencia a `receta_versiones.id`.
- El formato de respuesta es compatible, **con la salvedad de representación numérica**: los cuatro `jsonb_build_object` reciben variables bigint sin `::text`, de modo que emiten números JSON. Para IDs mayores al entero seguro de JS no está garantizada la identidad exacta.

### Otros contratos ahora documentados

| RPC pública (`POST /rest/v1/rpc/...`) | Parámetros del frontend y SQL | Retorno SQL | Interpretación actual |
|---|---|---|---|
| `solicitar_ingrediente` | `p_nombre text` | `jsonb`: `solicitud_id`, `estado='pendiente'` | Axios devuelve el objeto; UI informa pendiente y recarga. No confunde S con ingrediente o versión. |
| `resolver_solicitud_ingrediente` | `p_solicitud_id bigint`, `p_accion text`, `p_ingrediente_id bigint DEFAULT NULL` | `solicitud_id`, `estado`, `ingrediente_id` | Payload usa null para aprobar/rechazar y ID activo para asociar. UI retira la fila y vuelve a consultar; no depende de campos JSON distintos. |
| `asignar_imagen_receta` | `p_version_id bigint`, `p_imagen_path text` | `version_id`, `imagen_path` | Usa ID de versión, path o null, no ID de receta. Solo se espera éxito HTTP; la correspondencia real debe verificarse por GET. |
| `admin_editar_receta` | `p_receta_id bigint`, `p_datos jsonb` | `receta_id`, **`version_id`**, `estado='publicada'`, `version_anterior_id` | Envía ID de receta y datos normalizados. Omite imagen si no cambia, null para quitar, ruta propia del admin para reemplazar. No intenta asociar luego sobre una publicada. |

El payload general coincide con las validaciones SQL 15: título, porciones enteras positivas, opcionales null, dificultad facil/media/dificil, categorías sin duplicados, ingredientes/cantidades/unidades y array de textos de pasos. Axios entrega el JSON en `data`, no bajo `data.result` ni como JSON textual.

El SDK usa el mismo proyecto/clave pública que Axios. `api.js` envía `apikey` y agrega `Authorization: Bearer <access_token>` solo con sesión; no envía la publishable key como JWT. Los callbacks Auth no esperan consultas REST dentro del lock de Supabase.

## 2. Discrepancias y precisión bigint

### 2.1 Cierre de los contratos que antes carecían de SQL

| RPC usada | Parámetros enviados | Contrato encontrado |
|---|---|---|
| Alta/ediciones | Los de la sección 1 | Confirmados en 09/12/13/15. Ya no faltan sus estructuras de respuesta a nivel de archivos. |
| `aprobar_receta` | `p_version_id` | 11:102–175: JSONB `{receta_id,version_id,estado:'publicada'}`, validación admin, pendiente y no eliminada; transición publicada/anterior, sin cambiar imagen. |
| `rechazar_receta` | `p_version_id`, `p_motivo` | 11:178–254: `p_motivo text DEFAULT NULL`; JSONB `{receta_id,version_id,estado:'rechazada'}`, motivo recortado y publicada intacta. |
| `eliminar_receta` | `p_receta_id` | 14:62–147: JSONB `{receta_id,eliminada:true,versiones_descartadas}`, autor/admin, receta activa, pendientes a descartada, historial conservado. |
| `eliminar_categoria` | `p_categoria_id` | 05 actualizado:12–95: `RETURNS void`, admin, protección de General, desactivación y reasignación. Compatible con el servicio que no espera cuerpo. |
| `desactivar_ingrediente` | `p_ingrediente_id` | 08:18–69: `RETURNS void`, admin, UPDATE solo si activo, error si no hay fila, sin modificar relaciones. |

El último grupo se usa como comando: el cliente no necesita sus IDs de retorno. Para altas/renombrados, 04:15–16 y 07:18–19 conceden INSERT/UPDATE **solo de nombre**, con RLS admin. Los POST/PATCH actuales envían solo ese campo. Los defaults activos y los índices únicos normalizados están en 01. `Prefer: return=representation` y el control de `200 []` son coherentes con este contrato.

La fecha de solicitudes **sí es `creada_en`**, definida en 01:130: coincide con la UI. Las FKs y los índices de una única publicada/pendiente están definidos en 01:59–119. Falta contrastar esos objetos con el catálogo efectivo de la base, no obtener otro contrato por conjetura.

### 2.2 Pérdida de precisión detectada y reproducida localmente

- `src/services/api.js:8–12` deja la transformación JSON predeterminada de Axios: un entero JSON se convierte a `Number` antes de la lógica de negocio. La misma exposición existe en GET de columnas bigint de PostgREST, no solo en las respuestas de RPC.
- `src/services/imagenes.js:25–31` comprueba únicamente dígitos con `String(id)`: acepta números ya redondeados sin `Number.isSafeInteger` ni control de rango.
- `src/utils/recetas.js:16`, `src/utils/misRecetas.js:12` y `src/services/recetas.js:189` aplican `String()` después del parse: **no recuperan los dígitos originales**. Las claves numéricas del Map en obtenerRecetas pueden fusionar dos IDs distintos; Set/selecciones/URLs/payloads pueden comparar o reenviar el valor redondeado.
- `src/utils/crearReceta.js` conserva IDs de categorías/ingredientes, pero no rechaza IDs numéricos inseguros. Sus `Number()` corresponden a porciones, tiempo y cantidad, **no a conversiones explícitas de IDs**. No se encontró `parseInt`/`parseFloat` ni `v-model.number` aplicado a identificadores en `src/`.
- IDs de perfiles/autores son UUID textuales; este hallazgo afecta los bigint de receta, versión, categoría, ingrediente y solicitud, no las UUID de Auth.

Reproducción actual, local y sin red: `JSON.parse('{"version_id":9007199254740993}')` produce `9007199254740992`, y el helper lo acepta. Los IDs `9007199254740992` y `9007199254740993` colisionan al parsearse como Number. El mismo JSON con `"version_id":"9007199254740993"` conserva exactamente los dígitos y el helper acepta el string. No se ha observado corrupción de IDs reales ni se ha ejecutado una escritura para demostrarla.

### 2.3 Corrección aplicada en el frontend (precisión bigint)

Tras la auditoría se aplicó la contención mínima, sin cambiar SQL ni arquitectura: `src/utils/ids.js` exporta `exigirIdEnteroSeguro(valor, descripcion)`, que **rechaza** cualquier `number` que no sea `Number.isSafeInteger` (incluye NaN/Infinity) en lugar de convertirlo, porque serializar como string **no recupera** los dígitos ya perdidos. Se aplica antes de enviar:

- IDs de categorías e ingredientes en `prepararDatosReceta` (`src/utils/crearReceta.js`).
- `p_version_id`/`p_receta_id` en `editar_propuesta_receta`, `proponer_edicion_receta`, `eliminar_receta`, `admin_editar_receta` (`src/services/recetas.js`), `aprobar_receta`/`rechazar_receta` (`src/services/moderacion.js`) y `asignar_imagen_receta`.
- `obtenerVersionGuardada` (`src/services/imagenes.js`): un `version_id` inseguro se rechaza antes de asociar la imagen.

**Limitación documentada:** un bigint real mayor a `Number.MAX_SAFE_INTEGER` puede llegar **ya redondeado** desde la respuesta JSON (por ejemplo `9007199254740993` → `9007199254740992`) y convertirse en un entero "seguro" que ninguna validación cliente puede distinguir ni reparar. Esta corrección evita actuar con valores no seguros evidentes, pero **no soporta todo el rango bigint**: para eso hace falta preservar los enteros exactos al parsear el cuerpo crudo en la instancia Axios, antes de su transformación a Number, o emitir IDs como texto (requiere aprobación SQL y cubrir también los GET de tablas, no solo las cuatro RPC). No se instaló un parser lossless ni se cambió SQL.

### 2.4 Diferencias de validación corregidas y restantes

- **Porciones/tiempo (corregido):** `prepararDatosReceta` ahora rechaza valores mayores a `2147483647` (`integer` de 32 bits de 09/12/15), conservando los mensajes de error existentes.
- **Cantidad (corregido):** `prepararDatosReceta` valida el rango de `numeric(12,3)` (01:103): máximo `999999999.999` y hasta tres decimales; también rechaza valores que SQL redondearía a `0.000` (el CHECK exige `cantidad > 0`).
- **Versión posterior (manejo agregado):** la precarga `obtenerPropuestaPropia` ahora consulta `numero` y las versiones hermanas (`receta:recetas!inner(id,autor_id,receta_versiones(numero))`); si existe una versión con `numero` mayor (regla 12:130–137), devuelve null y la vista muestra "Propuesta no disponible" en lugar de ofrecer una edición que la RPC rechazaría. Si la RPC aun así informa el error al guardar, `mensajeErrorCrearReceta` muestra un mensaje específico en lugar del genérico. Si el despliegue no incluye `numero` o hermanas, el control no bloquea (la RPC sigue imponiendo la regla).
- La validación de SQL para cantidad finita no finita requiere revisión: ver H07. Los campos/unidades/null/orden del resto del payload sí coinciden.
- Opción futura, que necesita aprobación SQL: emitir IDs como texto. Cambiar solo los retornos de las cuatro RPC **no basta**: los GET de las tablas también deben tener una representación exacta. Las firmas bigint y los casts de IDs de los SQL actuales aceptan entradas decimales textuales.

## 3. RLS y Storage: qué demuestra el SQL y qué no

- **Perfiles:** 01:143–165 crea perfil con rol por default `usuario`, sin copiar rol desde metadata. 01:192–195 permite SELECT del perfil propio. La 02:9–26 revoca permisos previos de las tablas a anon/authenticated y devuelve solo SELECT de profiles a authenticated; en los archivos disponibles no se concede UPDATE de `rol` ni se crea una política de escritura de perfiles. Esto respalda el diseño, no certifica ausencia de grants de columna, roles heredados o cambios manuales en el despliegue.
- **Catálogo:** 02:31–103 usa una función estable definer para comprobar publicada/no eliminada y evitar ciclos RLS; versiones públicas y sus tres relaciones se limitan a versiones publicadas visibles. La 06 conserva políticas/FKs al renombrar las relaciones. No se depende solamente de filtros Vue.
- **Autor:** 10:23–47 concede lectura de recetas/versiones propias no eliminadas; 12:20–67 agrega lectura de las tres relaciones propias. La 01 deja ingredientes inactivos legibles para conservar referencias de recetas existentes. Las categorías se leen activas; su baja reasigna asociaciones mediante la RPC de 05/06.
- **Administración:** 11:30–96 agrega lectura de recetas no eliminadas y relaciones pendientes para admins; 14:42–54 amplía versiones para gestión administrativa, incluidas rechazadas/anteriores de recetas no eliminadas. Es coherente con el panel y la precarga de edición administrativa de una publicada ajena.
- **Escritura de recetas:** los scripts no conceden INSERT/UPDATE/DELETE directos de recetas/versiones/relaciones a los roles API. La autorización ocurre dentro de las internas definer. 09 verifica usuario y perfil; 12/13 verifican autor y receta no eliminada; 15 verifica rol admin. Las cuatro usan `search_path=''`, wrappers invoker, revocación de EXECUTE a PUBLIC/anon y concesión a authenticated tanto en wrapper como en interna. El acceso al schema privado se concede a authenticated, no a anon/PUBLIC. Que un usuario común tenga EXECUTE sobre el wrapper admin es intencional: su operación debe fallar por el control de rol interno, no porque la función no exista.
- **Versionado e historial:** 01:74–87 declara unicidad de `(receta_id,numero)` y un único estado publicada/pendiente por receta. 11/12/13/14/15 serializan operaciones de la misma receta con `FOR UPDATE` sobre el padre. El rechazo conserva la publicada; la aprobación reemplaza su estado; la baja no borra relaciones. Concurrencia efectiva e índices instalados aún requieren prueba de sandbox e inventario.
- Solicitudes: la política 15 permite SELECT a solicitante o admin y concede SELECT a authenticated. Las nuevas RPC comprueban `auth.uid()` y rol en `profiles`, no metadata del registro. Wrappers invoker e internas definer usan `search_path=''`; sus EXECUTE se revocan a PUBLIC/anon y se conceden a authenticated.
- La asignación de imagen exige propuesta pendiente propia, receta no eliminada, carpeta del UUID propio y existencia exacta del objeto. No habilita al admin a modificar por esa RPC una publicada ajena; el frontend usa `admin_editar_receta` en ese caso, compatible con el SQL.
- El bucket definido es **público** `recetas-imagenes`, límite **5242880 bytes**, MIME JPEG/PNG/WebP. Cliente y SQL usan `UUID/archivo`, extensiones permitidas y nombres nuevos; el cliente configura `upsert:false`. `resolverImagen` añade el bucket a la ruta almacenada y conserva formatos legacy.
- La política INSERT nueva limita la carpeta propia, pero la migración no elimina otras políticas de Storage ni acredita ausencia de políticas UPDATE/DELETE previas. Las políticas permisivas se combinan por OR. Revisar el inventario completo antes de afirmar que no existe sobrescritura o lectura privada indebida.
- Se conocen ahora las políticas **de referencia**, pero no las políticas/grants efectivos instalados. Un guard Vue no reemplaza RLS; deben probarse lecturas por IDs exactos **sin los filtros del frontend**, permisos de columna y posibles políticas adicionales.

## 4. Evidencia real histórica y alcance de esta continuación

La tabla siguiente conserva las observaciones de la auditoría anterior; **no se repitieron contra Supabase en esta continuación**. Comando reproducible: `node tools/auditar-supabase-solo-lectura.mjs`. Solo usa GET anónimo con clave pública; no invoca RPC ni imprime contenido de filas, credenciales o URL del proyecto. En aquella ejecución se usó el proyecto configurado, no identificado como sandbox.

| Observación | HTTP / resultado | Conclusión limitada |
|---|---|---|
| Catálogo con joins actuales, publicada/no eliminada, limit 1 | 200; 1 fila; 0 objetos relacionados nulos en la respuesta | El endpoint y esos joins son compatibles para la muestra pública. No prueba toda la base ni permite detectar por sí solo filas de relación omitidas completamente por RLS. |
| Versiones pendiente/rechazada/anterior/descartada como visitante | 200; 0 filas | No hubo exposición observada. Sin IDs privados existentes conocidos, NO demuestra RLS. |
| solicitudes_ingredientes como visitante | 401 | Lectura anónima denegada en esta petición. No prueba aislamiento A/B ni existencia de las RPC. |
| profiles como visitante | 401 | Lectura anónima denegada en esta petición. No prueba restricciones de escritura ni de rol. |

**En esta continuación: peticiones reales a Supabase 0, flujos de negocio reales 0, escrituras 0, uploads 0, migraciones ejecutadas 0.** Solo se leyeron archivos y se hicieron comprobaciones locales de serialización/validación. Las pruebas automatizadas usan mocks. Las respuestas y políticas desplegadas, Storage y persistencia siguen pendientes de `protocolo-manual.md` (I01–I26).

## 5. Hallazgos y riesgos

| ID | Prioridad / estado | Causa y evidencia | Impacto / comprobación pendiente |
|---|---|---|---|
| H01 | Cerrado a nivel de archivos — despliegue pendiente | 09/12/13/15 contienen firmas y objetos JSONB con `version_id`, incluida la composición transitiva de la 13. | La falta de contrato estático quedó resuelta. Confirmar las mismas definiciones/respuestas instaladas y la identidad V/R en sandbox. |
| H02 | Diseño estático contrastado — permisos efectivos no certificados | 01/02/10/11/12/14/15 documentan lectura propia/pública/admin, bloqueo de escrituras de perfiles/recetas y controles internos. | Ya no faltan esas fuentes; falta inventario del despliegue, grants heredados/de columna y negativos I04/I16–I19. No se declara un bypass de RLS observado. |
| H03 | Media — contención aplicada en frontend; limitación estructural documentada | Las cuatro respuestas JSONB emiten bigint numéricos; el parse de Axios/JSON puede redondearlos. `exigirIdEnteroSeguro` (nuevo `src/utils/ids.js`) ahora rechaza `number` no seguros antes de toda RPC de escritura y en `obtenerVersionGuardada`. | Un bigint real > Number.MAX_SAFE_INTEGER puede llegar ya redondeado y pasar como entero "seguro": no es detectable ni recuperable desde el cliente (limitación en 2.3). Para soporte completo: parseo lossless en Axios o IDs como texto con aprobación SQL. |
| H04 | Media — comportamiento conocido de diseño | Bucket público; los objetos no se borran al rechazar o dar de baja una receta. | URL conocida permite ver imagen pendiente/rechazada/eliminada. La UI lo advierte; no es prueba de fallo de RLS de recetas. Decidir si el requisito de privacidad acepta esta exposición. |
| H05 | Media — limitación estructural conocida | Guardado, upload y asociación son peticiones/transacciones separadas. No hay DELETE de Storage en la política nueva. | Puede quedar contenido sin imagen u objetos sin asociar. La UI separa reintentos y no duplica contenido confirmado; un timeout de contenido requiere verificar persistencia antes de reenviar. No prometer atomicidad global. |
| H06 | Media — ventana de carrera en SQL de referencia; no explotada | 01:123–139 no define unicidad por usuario/nombre pendiente; 15:64–73 hace EXISTS y luego INSERT sin lock/advisory ni otro índice único en las migraciones disponibles. | Dos llamadas concurrentes podrían crear solicitudes duplicadas. Se despejó la duda sobre índices de referencia; inventariar los efectivos y ejecutar I15 antes de corregir SQL con aprobación. |
| H07 | Media — cantidad no finita no excluida explícitamente | 09/12/15 usan `::numeric <= 0`; 13 delega en 12. 01:103 define numeric(12,3) con CHECK cantidad > 0, sin rechazo explícito de NaN. | `NaN` merece prueba REST directa en sandbox: su comparación numeric no se comporta como un número finito ordinario. Infinity, en cambio, debe fallar al almacenar numeric con precisión/escala acotadas, si coincide el esquema 01. No se ejecutó SQL adversarial ni se confirmó explotación. |
| H08 | Media — políticas acumuladas no inventariadas | SQL 15 reemplaza únicamente políticas por nombres específicos. | No acredita que otras políticas/grants previos no amplíen acceso. Revisar todas las políticas efectivas y privilegios de tablas, columnas y funciones; no modificar durante esta auditoría. |
| H09 | Cerrado en archivos — metadato compatible | 01:130 define solicitudes_ingredientes.creada_en, como la UI espera. | Solo falta comprobar que el despliegue no tenga drift respecto del archivo. |
| H10 | Baja — cerrado: rangos alineados en el cliente | `prepararDatosReceta` ahora limita porciones/tiempo a `integer` de 32 bits y cantidades a `numeric(12,3)` (máximo `999999999.999`, hasta tres decimales). | Los valores que SQL rechazaría ya no se envían. Solo falta comprobar en sandbox que el despliegue coincide con 01/09/12/15 (drift). |

No se implementaron correcciones funcionales: esta etapa actualiza evidencias sin alterar SQL, RLS, autenticación ni funcionalidades. H03/H10 se reprodujeron en memoria local, no en la base. H06/H07 tienen ahora fuentes/constraints de referencia para su análisis, pero siguen sin una prueba ejecutada contra el despliegue.

**Actualización posterior (validaciones):** se aplicaron las correcciones de los puntos 2.3 y 2.4 en `src/` (helper de IDs, rangos int32/numeric(12,3), manejo de versión posterior), sin tocar SQL, RLS ni diseño visual. Detalle de la regresión en la sección 6.

## 6. Regresión y cierre

Ejecutados en esta continuación, en este orden y con el resultado real:

- `npm test`: **71 Vitest + 71 node:test = 142 aprobadas, 0 fallidas, 0 omitidas**. Son pruebas de cliente con mocks; no sustituyen la integración real.
- `npm run build`: **correcto**, con `vue-tsc --build` y compilación Vite sin errores.
- Comprobaciones locales de serialización (sin red ni escrituras): se reprodujo el redondeo de `version_id` y la colisión de IDs, y se confirmó que una cadena decimal conserva los dígitos exactos.

### 6.1 Regresión posterior a las correcciones de validación

- `npm test`: **72 Vitest + 78 node:test = 150 aprobadas, 0 fallidas, 0 omitidas** (8 pruebas nuevas).
- `npm run build`: **correcto** (`vue-tsc --build` + Vite, 201 módulos).
- Durante la corrida inicial fallaron 2 pruebas nuevas por expectativas del propio test (un `fallo` simulado no reestablecido y un `version_id: NaN` que cae en la rama de dígitos antes del chequeo de seguridad); corregidas sin cambios en `src/`. La segunda corrida pasó completa.

No se instalaron dependencias, no se ejecutaron migraciones y no se escribieron datos en Supabase. Las correcciones tocaron solo `src/` y `tests/`: validaciones en límites, no reglas de negocio ni SQL.

## 7. Configuración e integración real todavía pendientes

1. Comparar con la base instalada las firmas, `pg_get_functiondef`, retornos, propietarios de internas definer, `proconfig`, grants efectivos de función/tabla/columna y pertenencia de roles. El historial de migraciones aplicado no debe inferirse de los nombres de archivo.
2. Verificar schemas expuestos (solo wrappers previstos en public), caché de PostgREST y ausencia de overloads incompatibles. Un `NOTIFY` escrito en un archivo no prueba recarga del despliegue.
3. Inventariar todas las políticas permisivas/restrictivas efectivas, RLS habilitado y grants heredados/PUBLIC. El SQL Editor puede evitar RLS: los negativos deben ejecutarse con JWT reales de A, B y admin en un sandbox inequívoco.
4. Verificar respuestas HTTP reales de las cuatro RPC, tipo JSONB objeto, `version_id` y su FK al padre/autor, pendiente conservada vs nueva versión, imagen heredada, publicación/historial, errores y locks concurrentes. Verificar especialmente la representación exacta de bigint en todo GET/RPC.
5. Comprobar el bucket efectivo, visibilidad pública, 5 MB, MIME, INSERT en carpeta propia, bloqueo de sobrescritura/UPDATE/DELETE y otras políticas preexistentes. La URL de una imagen pendiente puede ser pública por diseño, sin que el contenido de su receta lo sea.
6. Ejecutar los casos preparados I01–I26 de `protocolo-manual.md` con usuarios/filas conocidas, incluyendo rechazo de información ajena, perfiles.rol no autoeditable, NaN, solicitudes concurrentes y padres eliminados. No hay un sandbox confirmado nuevo ni se ejecutaron esos casos en esta continuación.

El bloqueo por **falta de archivos de contrato** quedó resuelto. La contención de precisión y los límites de validación están aplicados en el cliente; persiste la certificación del **estado efectivo**: ninguna lectura de estas migraciones demuestra que producción tenga las mismas funciones, índices o políticas, y el soporte de bigint completo (más allá del rechazo de valores no seguros) sigue abierto sin cambio SQL.
