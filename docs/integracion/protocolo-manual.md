# Protocolo de integración real — Recetas e ingredientes

Estado inicial: **NO EJECUTADO**. No hay un proyecto sandbox inequívocamente configurado. Este protocolo no forma parte de `npm test` y no autoriza escrituras contra el proyecto configurado actualmente.

## Condiciones de entrada y evidencias

1. Un operador identifica en Dashboard un proyecto **descartable de pruebas**, su project ref y su URL. Comparar explícitamente con el proyecto principal y registrar que son distintos. El nombre de una variable que diga TEST no basta para identificar el entorno.
2. Obtener del operador cuentas existentes de prueba: autor A, usuario B y administrador M; comprobar sus `profiles.rol` en modo lectura. No crear cuentas ni asignar roles en producción. No usar service-role para ejecutar casos de usuario: ocultaría fallos de RLS.
3. Ejecutar manualmente `inventario-solo-lectura.sql` con un operador autorizado. Revisar firmas, implementación interna, grants, políticas, índices, FKs y bucket. **No ejecutar migraciones ni las definiciones CREATE FUNCTION que aparezcan en los resultados.** Verificar también los schemas expuestos en API Settings; no exponer `recetario_private` sin revisar sus privilegios.
   El SQL Editor puede usar un rol que evita RLS: sus SELECT sirven para inventariar o comprobar persistencia, no para demostrar permisos de A, B o visitante. Esos negativos deben realizarse con sus JWT reales y con la clave pública.
4. Preparar la app en un directorio/entorno de configuración separado que apunte al sandbox y reiniciar Vite. No cambiar la configuración del principal para las pruebas. Las claves son públicas; los JWT y contraseñas se mantienen en memoria y nunca se pegan al informe, al historial compartido ni a Git.
5. Elegir IDs reales de categorías activas y de ingredientes activos mediante GET. Asegurar una receta publicada y varias propuestas de prueba identificables; si faltan datos, crearlos **manualmente en el sandbox** mediante los flujos permitidos. No usar IDs ilustrativos para guardar.
6. Cada caso registra: proyecto de pruebas confirmado, actor/rol, método/path sin tokens, payload redactado, HTTP y código PostgREST, `receta_id`, `version_id`, número/estado, fechas y evidencia posterior de lectura. Para negativos, comparar antes/después; un error HTTP por sí solo no demuestra ausencia de efectos.

### Ayuda para pruebas REST manuales (no se ejecuta automáticamente)

Usar la UI para el flujo normal y REST directo para intentar eludir los controles del frontend. Este helper no lee `.env` ni hereda la sesión de la app; todas las credenciales deben ser del sandbox identificado. No realiza nada al definirlo.

```js
const REF_TEST = 'REEMPLAZAR_POR_REF_CONFIRMADO_EN_DASHBOARD'
const CLAVE_PUBLICA_TEST = 'REEMPLAZAR_POR_PUBLISHABLE_DEL_SANDBOX'
const URL_TEST = `https://${REF_TEST}.supabase.co`
const CONFIRMO_PROYECTO_DESCARTABLE_DISTINTO_DEL_PRINCIPAL = false

async function restSandbox(path, { jwt, method = 'GET', json } = {}) {
  if (!CONFIRMO_PROYECTO_DESCARTABLE_DISTINTO_DEL_PRINCIPAL || REF_TEST.startsWith('REEMPLAZAR')) {
    throw new Error('Bloqueado: falta identificar y confirmar el sandbox')
  }
  if (!CLAVE_PUBLICA_TEST.startsWith('sb_publishable_')) throw new Error('Usar solo clave publishable')
  if (!['GET', 'POST', 'PATCH'].includes(method)) throw new Error('Método fuera de este protocolo')
  const destino = new URL(`/rest/v1/${path}`, URL_TEST)
  if (destino.origin !== URL_TEST) throw new Error('Destino distinto del sandbox')
  const response = await fetch(destino, {
    method, redirect: 'error',
    headers: {
      apikey: CLAVE_PUBLICA_TEST,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Prefer: 'return=representation',
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}
```

Obtener los JWT mediante login normal o un cliente SDK **separado** configurado con `persistSession:false` y exclusivamente URL/clave públicas del sandbox. No enviar la publishable key como Bearer. No imprimir los JWT. Las pruebas de intento de PATCH son negativas y pueden modificar datos si hay un defecto: únicamente sobre cuentas/registros descartables del sandbox.

## Flujo de contenido, imágenes y versionado

Todos los casos siguientes requieren ejecución manual en el sandbox. Las garantías SQL no se consideran aprobadas hasta verificar las lecturas posteriores.

| ID | Actor y acción | Evidencia / resultado esperado |
|---|---|---|
| I01 | A crea una receta con título de prueba, IDs activos reales, cantidad positiva y pasos ordenados; selecciona imagen válida. | Una sola llamada `crear_receta({p_datos})`. Respuesta JSON **objeto** con `version_id` inequívoco; si falta, detener la etapa de imagen y registrar el contrato real. `receta_id` puede devolverse o recuperarse por lectura de V. No interpretar un escalar como ID de versión. |
| I02 | Verificar respuesta de I01 por lectura de `receta_versiones?id=eq.V` y `recetas?id=eq.R` (R se obtiene de `V.receta_id` si no venía en la respuesta). | `V.receta_id = R`, estado `pendiente`, autor A y número correcto; relaciones `receta_categorias`, `receta_ingredientes`, `receta_pasos` con `version_id=V`, no con R. Cantidades, unidades y orden coinciden. Para detectar confusiones, incluir una versión donde R y V sean distintos; si coincidieron inicialmente, comprobarlo también en I06 sin forzar IDs ni alterar secuencias. |
| I03 | Completar la imagen de I01. | Storage sube a `recetas-imagenes/A_UUID/uuid-aleatorio.ext`, `upsert:false`; después `asignar_imagen_receta({p_version_id:V,p_imagen_path:ruta})`. Ruta sin bucket ni URL, objeto existente y `V.imagen_path` coincidente. Nunca actualizar una versión publicada. |
| I04 | Visitante y B consultan V y sus tres relaciones por ID exacto, sin filtros de la UI. | No ven la propuesta de A: denegación o cero filas. A y M sí ven el contenido completo. El catálogo no contiene R mientras esté pendiente. Si no se conoce una fila privada existente, un array vacío no basta como prueba de RLS. |
| I05 | M aprueba V mediante `aprobar_receta({p_version_id:V})`. | V pasa a `publicada`; catálogo/detalle público devuelven ese contenido e imagen. La respuesta debe corresponder al contrato SQL inventariado, aunque el cliente no use su body. |
| I06 | A propone editar R publicada mediante `proponer_edicion_receta({p_receta_id:R,p_datos})`, con otro título y otra imagen. | Respuesta identifica una **nueva** versión V2 pendiente, `V2 != V`, mismo R. GET del catálogo y GET directo público siguen mostrando V y su imagen, no V2. `asignar_imagen_receta` solo recibe V2. |
| I07 | A edita V2 pendiente mediante `editar_propuesta_receta({p_version_id:V2,p_datos})`. | Mismo V2 y estado pendiente; respuesta `version_id=V2`. Cambios/relaciones se aplican a V2, no V. Repetir con un ingrediente inactivo original permitido; un inactivo nuevo y duplicados deben rechazarse sin efectos. |
| I08 | M rechaza V2 con motivo; A consulta Mis recetas. | V2 queda rechazada con el motivo. R sigue publicada con V y su imagen; una sola tarjeta por R. A puede corregir mediante editar_propuesta_receta; respuesta identifica nueva V3 pendiente y V2 sigue rechazada e intacta en historial. |
| I09 | M aprueba una modificación pendiente de prueba. | La pendiente pasa a publicada y la publicada anterior a `anterior`, manteniendo relaciones e imágenes históricas. La nueva imagen aparece ahora en catálogo. No probar aprobación y rechazo de la misma propuesta como si fueran dos casos independientes. |
| I10 | Dos sesiones de A intentan proponer a la vez; dos administradores intentan decidir la misma pendiente. | Solo una pendiente nueva por R y una transición válida; la otra petición rechazada sin duplicar versiones. Revisar locks/índices y lecturas finales, no solo respuestas. |
| I11 | A elimina R mediante `eliminar_receta({p_receta_id:R})`. | `recetas.eliminada_en` tiene fecha, pendientes pasan a `descartada`, versiones/relaciones históricas conservadas. Mis recetas, catálogo y moderación excluyen R. Visitante/B consultando IDs exactos sin filtros no deben recuperar contenido privado/eliminado. |
| I12 | Repetir baja, edición o aprobación sobre la eliminada. | RPC rechazada y snapshots de versiones, estados, relaciones e imagen sin cambios. No confiar solo en que no se vean botones. |

## Solicitudes y permisos negativos

| ID | Actor y acción | Evidencia / resultado esperado |
|---|---|---|
| I13 | A llama `solicitar_ingrediente({p_nombre:nombre_unico})` y consulta sus solicitudes. | Objeto `{solicitud_id,estado:'pendiente'}`. Fila con `solicitante_id=A`, nombre recortado y fecha visible según columna real. B no la ve por ID directo; M sí. |
| I14 | M resuelve **tres solicitudes distintas**: aprobar, rechazar, asociar. | `resolver_solicitud_ingrediente({p_solicitud_id:S,p_accion:accion,p_ingrediente_id:null_o_ID_ACTIVO})` devuelve S, estado final e ingrediente correspondiente. Aprobar crea un solo ingrediente; rechazar no crea; asociar reutiliza el activo existente sin duplicarlo. A ve aprobada/rechazada/asociada. |
| I15 | Reprocesar una solicitud resuelta; asociar con inactivo; aprobar un nombre ya existente. | Errores sin cambios; duplicado `23505` permite sugerir asociar. Dos solicitudes iguales pendientes concurrentes de A no deben duplicarse; revisar si existe índice único o mecanismo de serialización previo a la migración 15. |
| I16 | Visitante consulta solicitudes/profiles/versiones privadas y llama RPC privadas sin JWT. | Denegación de RPC (401/403 según gateway), lecturas privadas denegadas o sin filas conocidas. No usar un endpoint inexistente como prueba de autorización. Probar también las tablas de relación de una V privada conocida. |
| I17 | B llama las RPC de edición, propuesta, imagen y baja con R/V de A. | Denegación real por autoría, sin efectos. Incluir `asignar_imagen_receta` con ruta propia de B y V de A: poseer una imagen no autoriza cambiar la receta ajena. |
| I18 | Usuario común llama aprobar_receta, rechazar_receta, resolver_solicitud_ingrediente y admin_editar_receta. | RPC existentes pero rechazadas por rol, con snapshots sin cambios. Probar también eliminar_categoria y desactivar_ingrediente con registros de prueba y comprobar rechazo. Las restricciones de Router no cuentan como evidencia de backend. |
| I19 | B intenta PATCH de receta/versión ajena; A intenta PATCH directo de estado a publicada; usuario intenta cambiar su propio profiles.rol. | Debe impedir cambios indebidos, incluso si la fila propia es legible. Distinguir PATCH `200 []` de escritura autorizada; verificar estado/rol posterior con un operador. Si cambia el rol, detener el caso y registrar incidente; no usar el token escalado. |

## Storage y edición administrativa

| ID | Actor y acción | Evidencia / resultado esperado |
|---|---|---|
| I20 | A sube JPG, PNG y WebP <=5 MB; luego intenta >5 MB, MIME/extensión inválidos, carpeta B y sobrescritura de objeto existente. | Casos válidos aceptados; inválidos rechazados por backend sin reemplazar objetos. Repetir **saltándose la validación JS**, con SDK directo del sandbox. Verificar todas las políticas efectivas, no solo la INSERT de la migración 15. |
| I21 | Asociar path inexistente, ajeno, URL completa o un ID de receta en lugar de versión; quitar con null una imagen propia pendiente. | Inválidos rechazados y V sin cambios; null permitido solo en pendiente propia. No confundir el número de versión, `version_id` y `receta_id`. |
| I22 | Copiar la URL pública de imagen pendiente y abrir sin sesión. | **200 es esperado por diseño** si el objeto existe: el bucket es público. No confundir visibilidad del archivo con publicación de la receta. La URL puede seguir accesible tras rechazo/baja; no existe revocación por cambiar estado SQL. |
| I23 | Cortar conexión en upload o asignación después del contenido; reintentar desde UI. | Contenido/versionado no se repite; si objeto ya se subió se reutiliza su path; no se sobrescribe. Registrar posibles objetos sin asociar. La operación completa no es una única transacción REST+Storage. |
| I24 | M edita R publicada de A, sin pendiente, usando admin_editar_receta. | Objeto `{receta_id:R,version_id:VN,estado:'publicada',version_anterior_id:V}`. VN nueva; V anterior conservada; catálogo muestra VN. Omitir imagen_path conserva, null quita, nueva ruta debe existir bajo UUID de M. No llamar asignar_imagen_receta sobre una publicada. |
| I25 | M intenta edición directa con una pendiente existente, con receta eliminada o sin publicada; usuario común intenta lo mismo. | Rechazo sin nuevas versiones ni cambios en la publicada. Comprobar carrera: una pendiente creada después de la precarga también debe impedir edición directa. |
| I26 | M intenta cantidad textual `NaN` o `Infinity` en admin_editar_receta desde REST directo, sobre receta de prueba. | Debe rechazarse por integridad. La migración 15 solo compara `::numeric <= 0`; confirmar constraints/tipos reales. La validación Number.isFinite del frontend no demuestra esta garantía SQL. |

## Criterios de cierre

- Registrar cada caso como **aprobado**, **fallido**, **bloqueado por falta de contrato** o **no ejecutado**. Nunca trasladar un resultado de mock a esta tabla como integración aprobada.
- Conservar IDs y snapshots redactados del sandbox para reproducir defectos. No realizar limpiezas por DELETE ni restauraciones fuera del alcance; el operador administra el ciclo de vida del proyecto descartable.
- Para cerrar el bloque de imágenes se necesita demostrar el `version_id` devuelto en **alta**, **pendiente editada**, **rechazada reenviada** y **propuesta sobre publicada** y la correspondencia FK. El frontend maneja una respuesta ambigua como error de imagen, no como prueba de éxito completo.
