# RecetAPIs

## Auditoría de integración

Ver [informe de auditoría](docs/integracion/auditoria-supabase.md), [protocolo manual de sandbox](docs/integracion/protocolo-manual.md) e [inventario SQL de solo lectura](docs/integracion/inventario-solo-lectura.sql). El comando `node tools/auditar-supabase-solo-lectura.mjs` realiza únicamente GET anónimos y no certifica RPC, persistencia ni RLS autenticadas. La [suite RLS real](docs/integracion/pruebas-rls.md) aprobó sus ocho casos en el único proyecto autorizado explícitamente como exclusivo de testing, sin datos reales; no ejecutar escrituras de prueba en producción.

This template should help get you started developing with Vue 3 in Vite.

## Autenticación y roles

- Usar Node `^22.18.0 || >=24.12.0`, `npm ci` y las variables existentes `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env`. No usar claves secretas ni service-role en el frontend.
- `npm run dev` inicia la app. `/` y `/recetas/:id` siguen siendo públicos. `/registro` y `/login` son para visitantes; `/admin` requiere sesión y un perfil propio con `rol = 'admin'`.
- El SDK oficial de Supabase persiste y renueva la sesión. Pinia mantiene usuario, perfil y estado de inicialización; no persiste roles por su cuenta. Axios conserva `apikey` y agrega `Authorization: Bearer <access_token>` solo cuando hay sesión.
- El registro envía únicamente `nombre` en los metadatos. El trigger existente de Supabase debe crear `profiles` con rol `usuario`. La app solo lee perfiles con `GET /rest/v1/profiles?select=id,email,nombre,rol&id=eq.<user-id>&limit=1`; nunca asigna ni modifica roles.
- Para probar registro, usar un correo accesible. Si la confirmación está habilitada, confirmar desde el email antes del login. En Supabase Auth, permitir el redirect real de la app a `/login` (por ejemplo `http://localhost:5173/login`). Si se despliega en un subdirectorio, incluirlo en esa URL.
- Después del login, recargar para comprobar la restauración de sesión y usar **Cerrar sesión**. Sin sesión, visitar `/admin` debe llevar a Login; con rol `usuario`, a Acceso denegado; con una cuenta `admin` ya existente, al panel de categorías e ingredientes. No se crean administradores desde Vue.
- Antes de cada acceso a `/admin` se vuelve a consultar el perfil. Un perfil ausente o un fallo REST deniega el acceso; una revocación de rol se refleja en la próxima navegación protegida o recarga. Los guards no sustituyen RLS: las políticas existentes deben proteger cada operación y evitar que los usuarios cambien su propio rol. No se modifican tablas ni políticas desde esta implementación.
- Ejecutar `npm test` y `npm run build`. Las pruebas de Auth/REST usan dobles: no registran usuarios ni verifican las políticas reales de Supabase. El despliegue con history requiere fallback de rutas a `index.html`.

## Categorías administrativas

- En `/admin`, crear una categoría con nombre, editarla y comprobar el listado actualizado. Probar nombre vacío, solo espacios y un nombre ya existente: debe aparecer un error sin informar éxito. General no ofrece edición ni eliminación.
- Se reutiliza Axios y su JWT de sesión: `GET /rest/v1/categorias?select=id,nombre&activa=eq.true&order=nombre.asc`; alta con `POST` enviando únicamente `nombre` (el estado inicial lo resuelve Supabase); edición con `PATCH` por `id`, restringida a categorías activas distintas de General, enviando únicamente `nombre`. Las escrituras solicitan `Prefer: return=representation`; un UPDATE con cero filas no se considera exitoso. Si falla la lectura posterior, se mantiene el aviso de guardado y se permite reintentar solo el listado.
- El botón **Eliminar** pide confirmación y envía exclusivamente `POST /rest/v1/rpc/eliminar_categoria` con `{ "p_categoria_id": ID }`, reutilizando `apikey` y el JWT del administrador. No se ejecuta DELETE ni se manipulan asociaciones desde Vue: la RPC existente valida permisos, protege General, desactiva la categoría, quita asociaciones y asigna General a las versiones que queden sin categorías.
- Para probar eliminación, usar una categoría de prueba: primero cancelar y comprobar que sigue en el listado; luego confirmar y verificar que desaparece del listado activo y del filtro público al volver al catálogo. Si estaba asociada a una receta, comprobar las categorías en su detalle; si era la única categoría, debe aparecer General. Mientras se elimina se bloquean otras operaciones; si falla la RPC se muestra el error, sin informar éxito. Si solo falla la recarga posterior, reintentar el listado, no la eliminación.
- Para verificar RLS, no basta con que `/admin` esté bloqueado. Iniciar sesión como `usuario` y probar REST directamente, sin pasar por los formularios. Hacerlo en un entorno de prueba: una política incorrecta podría permitir el alta. En la consola del navegador, con `npm run dev`, se puede reutilizar el Axios actual (agrega el JWT del usuario común sin copiarlo):

```js
const { api } = await import('/src/services/api.js')
// Debe rechazarse, normalmente con 403 / código 42501.
await api.post('categorias', {
  nombre: `Prueba RLS ${Date.now()}`,
}, { headers: { Prefer: 'return=representation' } })
```

- Para probar UPDATE, usar el ID y nombre de una categoría de prueba distinta de General. El mismo nombre evita cambiarlo si una política incorrecta permite la operación; aun así, una fila devuelta evidencia acceso de escritura indebido:

```js
await api.patch('categorias', { nombre: 'NOMBRE_ACTUAL_DE_LA_CATEGORIA_DE_PRUEBA' }, {
  params: { id: 'eq.ID_DE_LA_CATEGORIA_DE_PRUEBA', select: 'id,nombre' },
  headers: { Prefer: 'return=representation' },
})
```

- Un usuario común debe recibir rechazo o `200` con `data: []` para UPDATE, sin cambios en la fila; confirmar luego con una lectura. No interpretar un `200` vacío como autorización, ni un error de nombre duplicado como prueba suficiente de RLS. Repetir sin sesión si se desea verificar el rol público. Nunca sustituir el JWT por la publishable key ni usar una clave secret/service-role.

## Ingredientes administrativos

- En `/admin`, la sección Ingredientes lista activos e inactivos con su estado visible. Permite crear y renombrar ambos, y desactivar únicamente los activos; no incluye eliminación física ni reactivación.
- Lectura: `GET /rest/v1/ingredientes?select=id,nombre,activo&order=nombre.asc`, sin filtro por estado. Alta: `POST /rest/v1/ingredientes?select=id,nombre,activo`. Edición: `PATCH /rest/v1/ingredientes?id=eq.ID&select=id,nombre,activo`. Ambos cuerpos contienen únicamente `{ "nombre": "..." }`, con espacios laterales recortados; se reutilizan `apikey`, JWT y `Prefer: return=representation`.
- Probar con una cuenta admin: crear un nombre nuevo, editarlo, cancelar una edición y comprobar el listado actualizado. También editar un ingrediente inactivo existente y confirmar que no cambia su estado. Un nombre vacío o solo espacios se rechaza; un duplicado, incluso con distintas mayúsculas o espacios laterales, muestra el error de unicidad de Supabase (código `23505`).
- El botón **Desactivar** pide confirmación y usa exclusivamente `POST /rest/v1/rpc/desactivar_ingrediente` con `{ "p_ingrediente_id": ID }`, mediante el mismo Axios con `apikey` y JWT. La RPC valida el rol y desactiva; no se ejecuta PATCH sobre `activo` ni se alteran recetas. El botón no se muestra para inactivos y se bloquean las operaciones mientras se procesa.
- Para probar desactivación, usar un ingrediente activo de prueba: cancelar primero y comprobar que sigue activo; luego confirmar y verificar que permanece en el listado con la etiqueta **Inactivo**, sin botón Desactivar y con edición disponible. Si aparece en una receta existente, comprobar que siga figurando en su detalle. No se agrega ningún filtro global de ingredientes activos.
- Si POST de alta o PATCH de nombre devuelve cero filas, no se informa éxito. La RPC de desactivación no requiere devolver filas. Si solo falla la lectura posterior a una operación exitosa, se conserva el mensaje de éxito y se permite reintentar el listado antes de otra operación. Las pruebas de ingredientes usan REST/Auth simulados y no crean ni modifican datos reales.

## Alta de recetas

- Iniciar sesión como usuario o administrador y abrir **Crear receta** (`/recetas/crear`). Un visitante es redirigido a Login. El formulario coloca ingredientes después del título, permite múltiples categorías y permite editar, quitar, subir y bajar pasos.
- Se reutilizan `GET /rest/v1/ingredientes?select=id,nombre,activo&order=nombre.asc` y `GET /rest/v1/categorias?select=id,nombre&activa=eq.true&order=nombre.asc`. Solo la vista de creación filtra ingredientes activos: las lecturas administrativas y de recetas existentes siguen incluyendo inactivos.
- El único guardado es `POST /rest/v1/rpc/crear_receta`, con `{ "p_datos": { ... } }`, `apikey` y `Authorization: Bearer <access_token>`. Se envían título, descripción, porciones, tiempo_minutos, dificultad, IDs reales de categorías, ingredientes con cantidad/unidad y un array de textos de pasos en el orden visible. Los opcionales vacíos se envían como `null`. No se envía autor, estado, número de versión ni IDs generados; la RPC obtiene el autor de la sesión y crea la versión pendiente.
- Prueba manual: agregar ingredientes con cantidades positivas y unidades, quitar uno y volver a agregarlo; no debe poder repetirse. Seleccionar categorías, completar porciones y agregar varios pasos. Editarlos y reordenarlos antes de enviar. Probar título vacío, porciones fraccionarias, cantidad cero y ausencia de categorías o pasos. Los errores conservan el formulario; durante el envío se deshabilita y después del éxito se reemplaza por el aviso de pendiente para evitar repetir el envío.
- Para comprobar el guardado real, usar una receta de prueba con título identificable. En Network, verificar una sola petición de contenido a `rpc/crear_receta` (con imagen hay una etapa posterior de Storage y asociación). Luego consultar **en modo lectura** `receta_versiones` en el Table Editor de Supabase y comprobar `estado = 'pendiente'` y su `receta_id`; en `recetas`, el `autor_id` debe ser el usuario autenticado. Verificar que las relaciones en `receta_categorias`, `receta_ingredientes` y `receta_pasos` referencien esa versión mediante `version_id`. La receta no debe aparecer en el catálogo público mientras esté pendiente. No cambiar su estado para esta prueba.
- Ejecutar `node --test tests/crearReceta.test.js` para las validaciones, acceso y contrato RPC, y `npm run build`. Las pruebas automatizadas simulan la escritura; no crean recetas ni verifican el estado real en Supabase. Ante un timeout o fallo de conexión, comprobar el guardado antes de reenviar: el bloqueo del botón evita dobles clics, pero no reemplaza idempotencia del servidor.

## Mis recetas

- `/mis-recetas` requiere sesión y está enlazada desde la navegación de usuarios autenticados. Usa el ID del usuario de Pinia, Axios con `apikey` y JWT, y las políticas RLS existentes. Si cambia el usuario o se cierra sesión, se limpia el listado y se cancela la consulta anterior.
- Consulta de lectura: `GET /rest/v1/recetas?select=id,creada_en,receta_versiones(id,numero,estado,titulo,motivo_rechazo)&autor_id=eq.UUID&eliminada_en=is.null&order=creada_en.desc,id.desc`. También envía `receta_versiones.estado=in.(publicada,pendiente,rechazada)`, `receta_versiones.order=numero.desc`, `offset` y `limit=1000`. La relación anidada obtiene las versiones sin hacer una tarjeta por cada versión.
- La tarjeta muestra la fecha de creación de `recetas` y prioriza el título/estado de la versión publicada. Sin publicación, usa la propuesta pendiente o rechazada de mayor `numero`. Una publicación con propuesta pendiente aparece en **Publicadas**, con el indicador **Modificaciones pendientes**, no en **Pendientes**. Un rechazo de una propuesta posterior puede mostrar su motivo sin cambiar el estado publicado; no se muestran motivos de rechazos anteriores a la publicación.
- Para probar, iniciar sesión y abrir Mis recetas; verificar una sola tarjeta por receta y los filtros Todas/Pendientes/Publicadas/Rechazadas con los registros propios existentes. Tras crear una receta, debe aparecer como Pendiente. Probar una cuenta sin recetas, acceso sin sesión (redirige a Login) y otra cuenta (no debe mostrar recetas ajenas). Para el caso publicado con cambios pendientes, usar una receta que ya tenga esas versiones; esta pantalla no crea ni modera versiones.
- `node --test tests/misRecetas.test.js` verifica selección de versiones, filtros, guard y contrato REST con dobles. La consulta real autenticada y RLS deben comprobarse con cuentas del proyecto; no se modifica la base durante las pruebas automatizadas.

## Moderación de recetas

- En `/admin`, **Recetas pendientes** lista propuestas por `creada_en.asc,id.asc`, con título, fecha y número de versión. **Revisar** vuelve a consultar la versión pendiente e incluye descripción, porciones, tiempo, dificultad, categorías, ingredientes, cantidades/unidades, pasos ordenados e imagen. La ruta conserva su guard de administrador y antes de decidir se vuelve a verificar el perfil mediante el store existente.
- Listado: `GET /rest/v1/receta_versiones?select=id,titulo,numero,creada_en,receta:recetas!inner(id)&estado=eq.pendiente&receta.eliminada_en=is.null&order=creada_en.asc,id.asc`, con `offset` y `limit=1000`. Detalle: mismo endpoint y filtros, `id=eq.ID_VERSION`, `limit=1` y relaciones anidadas `receta_categorias(categorias(id,nombre))`, `receta_ingredientes(cantidad,unidad,ingredientes(id,nombre))` y `receta_pasos(orden,descripcion)` junto con los campos generales. No se confunde el ID de receta con el de versión.
- Decisiones: `POST /rest/v1/rpc/aprobar_receta` con `{ "p_version_id": ID_VERSION }`; `POST /rest/v1/rpc/rechazar_receta` con `{ "p_version_id": ID_VERSION, "p_motivo": "texto" }`. El motivo vacío o solo espacios se envía como `null`. Ambas usan Axios con `apikey` y JWT; la RPC resuelve los cambios de estado, sin UPDATE directo desde Vue.
- Prueba manual con propuestas de prueba existentes: como admin, revisar una propuesta, cancelar la confirmación de aprobación y comprobar que continúa pendiente. Confirmar después: debe desaparecer del listado y aparecer publicada al volver al catálogo. Revisar otra propuesta, indicar un motivo opcional y rechazar; debe desaparecer de pendientes y figurar rechazada en Mis recetas del autor (o conservarse publicada si tenía una versión pública previa, con el motivo de la propuesta rechazada).
- Durante la decisión se bloquean los botones. Ante un error se requiere volver a revisar antes de otra decisión. Si la RPC tuvo éxito pero falló la recarga, se conserva el mensaje de éxito y se reintenta solo el listado. No hay edición, eliminación ni reenvío desde esta sección.
- `node --test tests/moderacion.test.js tests/authGuard.test.js` verifica contrato REST, roles del guard, campos, filtros y errores con dobles. Ejecutar también `npm run build`. Estas pruebas no aprueban ni rechazan propuestas reales ni validan las funciones SQL del proyecto.

## Edición de propuestas y reenvío

- En Mis recetas, las tarjetas pendientes ofrecen **Editar** y las rechazadas **Corregir y reenviar**. Esas acciones utilizan el ID de la versión, no el de la receta. Las publicadas usan el flujo de nuevas propuestas descrito debajo, sin editar directamente su versión aprobada.
- La ruta `/mis-recetas/propuestas/:versionId/editar` requiere sesión. La precarga usa `GET /rest/v1/receta_versiones` filtrando `id=eq.ID_VERSION`, `estado=in.(pendiente,rechazada)`, `receta.autor_id=eq.UUID` y `receta.eliminada_en=is.null`, con `recetas!inner` y las relaciones de categorías, ingredientes y pasos. Una versión ajena, publicada o no disponible no abre el formulario.
- Alta y edición comparten `RecetaFormulario.vue` y sus validaciones. La edición precarga los campos, permite cambiar cantidades/unidades y conserva los ingredientes inactivos originales; el selector incorpora solo ingredientes activos. Los pasos precargados mantienen el orden y usan claves distintas de los pasos nuevos. El motivo de rechazo permanece visible durante la corrección. **Cancelar sin guardar** vuelve a Mis recetas sin enviar una escritura.
- El único guardado de edición es `POST /rest/v1/rpc/editar_propuesta_receta`, con `{ "p_version_id": ID_VERSION, "p_datos": { ... } }`, mediante Axios con `apikey` y JWT. No se envía autor, estado ni números de versión. La RPC actualiza la misma versión pendiente o conserva la rechazada y crea una nueva pendiente; Vue no duplica esa lógica ni escribe directamente en las tablas.
- Para probar con propuestas propias: editar una pendiente y comprobar que mantiene el ID de versión y estado pendiente; corregir una rechazada y verificar que el motivo se ve antes de enviar, que se crea una nueva pendiente y que la rechazada permanece en el historial de Supabase. Al volver a Mis recetas debe seguir apareciendo una sola tarjeta. Probar conservación de un ingrediente inactivo original, incorporación únicamente de activos y cancelación sin guardado. Una cuenta ajena o una versión publicada no pueden usar la ruta de edición directa de propuestas.
- `node --test tests/editarPropuesta.test.js tests/crearReceta.test.js tests/misRecetas.test.js` verifica precarga, ingredientes permitidos, contrato RPC y resumen de versiones con dobles; ejecutar además `npm run build`. No se editan ni reenvían recetas reales durante las pruebas automatizadas.

## Nuevas propuestas sobre recetas publicadas

- En Mis recetas, **Editar** en una publicación sin propuesta pendiente abre `/mis-recetas/:recetaId/editar-publicada`. La precarga utiliza `GET /rest/v1/recetas` por `id`, `autor_id` de la sesión y `eliminada_en=is.null`, con sus versiones `publicada` y `pendiente` y las relaciones completas de contenido. Si encuentra una pendiente, redirige a `/mis-recetas/propuestas/:versionId/editar` sin crear otra; la tarjeta también enlaza directamente a esa pendiente.
- Se reutiliza `RecetaFormulario.vue`, las validaciones y el manejo de ingredientes inactivos originales. Precarga la versión publicada, no una propuesta rechazada. La escritura de contenido es `POST /rest/v1/rpc/proponer_edicion_receta` con `{ "p_receta_id": ID_RECETA, "p_datos": { ... } }`, JWT y `apikey`. No se envía ID de versión, estado, autor ni imagen en esa RPC; si se selecciona una imagen diferente, se asocia después únicamente a la nueva pendiente mediante el flujo siguiente.
- Tras el éxito regresa automáticamente a Mis recetas con confirmación. Una sola tarjeta mantiene título y estado publicados y muestra **Modificaciones pendientes. La versión publicada sigue visible.** El catálogo y detalle público continúan consultando exclusivamente `estado=eq.publicada`; el panel de moderación existente revisa la nueva pendiente sin cambios.
- Prueba manual: como autor, editar una publicación de prueba sin pendientes, cambiar contenido y guardar. Comprobar en Supabase de prueba que se creó una nueva versión pendiente y que la publicada y su imagen siguen intactas. Volver a Editar debe abrir esa pendiente, no crear otra. Aprobar o rechazar con el panel existente y verificar el reemplazo o conservación de la publicada; también verificar la restricción de autor, una receta eliminada y dos sesiones que intenten proponer simultáneamente. No se prueban estas garantías SQL/RLS con escrituras sobre el proyecto principal.
- `tests/editarPublicada.spec.js` cubre los 14 escenarios solicitados y un caso adicional de autor ajeno/receta sin publicación, con datos y transporte simulados. Las pruebas anteriores de edición directa se mantienen: la versión publicada sigue sin poder guardarse mediante `editar_propuesta_receta`; ahora se comprueba su enlace al flujo específico de propuesta nueva.

## Baja lógica de recetas

- Mis recetas ofrece **Eliminar** para cada receta propia pendiente, publicada o rechazada. El panel `/admin` incluye **Gestión de recetas**, con título, identificador de autor y estado principal, sin restringir por autor ni estado. Las versiones anteriores o descartadas no generan tarjetas adicionales; una receta sin versión principal sigue siendo visible en la gestión administrativa.
- La única escritura es `POST /rest/v1/rpc/eliminar_receta` con `{ "p_receta_id": ID_RECETA }`, mediante el Axios existente con `apikey` y JWT. Se comparte la confirmación, bloqueo de solicitudes, mensajes y tratamiento de errores en `useEliminarReceta`; el botón también se reutiliza. No se hace PATCH, UPDATE ni DELETE desde Vue.
- El listado administrativo usa `GET /rest/v1/recetas?select=id,autor_id,creada_en,receta_versiones(id,numero,estado,titulo,motivo_rechazo)&eliminada_en=is.null&order=creada_en.desc,id.desc`, con versiones por número descendente, `offset` y `limit=1000`. Mis recetas conserva el filtro adicional `autor_id=eq.UUID`. Catálogo, detalle, formularios y moderación ya excluyen recetas eliminadas mediante `eliminada_en=is.null` en la tabla o su relación.
- Tras la baja se muestra éxito y se recarga el listado. La baja administrativa también remonta la moderación para cerrar una revisión abierta y consultar de nuevo las pendientes. Si falla solo la lectura posterior, el éxito se conserva y se puede reintentar el listado sin repetir la RPC. No hay restauración.
- Prueba manual en un entorno Supabase de prueba: cancelar primero; luego confirmar la baja de una receta propia y comprobar su ausencia en Mis recetas y catálogo. Como admin, eliminar una receta de otro autor desde Gestión de recetas. Verificar en modo lectura `recetas.eliminada_en`, las pendientes como `descartada` y la conservación de versiones/relaciones. Intentar volver a editar, revisar o aprobar la eliminada y repetir la baja: los controles SQL/RLS deben impedirlo; los mocks no demuestran esas garantías.
- `tests/eliminarReceta.spec.js` cubre los 12 escenarios solicitados y un caso adicional de error en la recarga, sin escrituras reales. También verifica la exclusión de eliminadas en detalle, edición y moderación, y el cierre de una revisión administrativa abierta tras la baja.

## Cierre de recetas e ingredientes (migración 15)

### Prerrequisitos y solicitudes

- La migración 15 suministrada debe estar instalada en Supabase por un operador; esta aplicación no ejecuta SQL ni configura buckets/RLS. La lectura anónima de `solicitudes_ingredientes` está denegada por diseño: se consulta con sesión y JWT. La baja lógica existente se conserva sin duplicarla.
- `/mis-solicitudes` requiere sesión y está enlazada desde la navegación y desde el editor de ingredientes. El formulario pide solo un nombre de 1–120 caracteres. Usa `POST /rest/v1/rpc/solicitar_ingrediente` con `{ "p_nombre": "nombre" }`. La lectura es `GET /rest/v1/solicitudes_ingredientes?select=*&solicitante_id=eq.UUID&order=id.desc`, con offset/limit; muestra pendiente, aprobada, rechazada y asociada. No hay edición ni eliminación de solicitudes.
- En `/admin`, Solicitudes de ingredientes consulta la misma tabla con `estado=eq.pendiente&order=id.asc`. Resolver usa `POST /rest/v1/rpc/resolver_solicitud_ingrediente` con `p_solicitud_id`, `p_accion` (`aprobar`, `rechazar`, `asociar`) y `p_ingrediente_id` (solo para asociar, de lo contrario `null`). El desplegable solo ofrece ingredientes activos. Una resolución exitosa retira la fila, refresca el listado y el ABM de ingredientes; no modifica estados por PATCH. Los nombres duplicados y solicitudes ya resueltas muestran errores, no éxito.

### Una imagen opcional

- El editor compartido acepta JPG/JPEG, PNG y WebP de hasta 5 MB, con vista previa y opción de quitar/mantener la imagen actual. La validación de extensión, MIME y tamaño se repite antes de subir. Storage usa el SDK oficial: bucket `recetas-imagenes`, objeto `UUID_USUARIO/UUID_ALEATORIO.ext`, `upsert: false`. No se sobrescriben ni se eliminan archivos históricos. El bucket es público: conocer la URL permite ver incluso imágenes pendientes; el formulario lo advierte.
- Para usuarios, primero se guarda el contenido por la RPC apropiada; después se sube y se invoca `POST /rest/v1/rpc/asignar_imagen_receta` con `p_version_id` y `p_imagen_path` (ruta del objeto, sin URL ni bucket; `null` para quitar). No se cambia directamente la imagen de una publicada. Catálogo, detalle y revisión construyen la URL con el bucket fijo y siguen ofreciendo imagen predeterminada si no existe.
- Contrato de identificación: las RPC que crean una versión deben devolver un objeto con `version_id`. Una pendiente editada puede usar su ID ya conocido si la respuesta no lo incluye. Si falta un ID inequívoco en un alta/reenvío/nueva propuesta, no se adivina un ID escalar de receta: se informa que el contenido quedó guardado y se puede continuar y adjuntar desde su propuesta pendiente en Mis recetas. Confirmar estas respuestas reales al integrar las RPC 01–14, que no estaban incluidas en el SQL 15 suministrado.
- Si falla Storage o la asociación, el contenido ya guardado no se reenvía. Se bloquea el formulario y se ofrece reintentar solamente la etapa de imagen o continuar sin cambiarla. Si el objeto subió y solo falló su asociación, se reutiliza su ruta al reintentar. No hay rollback del contenido ni limpieza de objetos huérfanos: el SQL suministrado no habilita DELETE de Storage. Tras un timeout puede quedar un objeto sin asociar; no se promete atomicidad entre REST y Storage.

### Edición directa administrativa

- En Gestión de recetas, una publicada sin pendiente ofrece **Editar directamente** y abre `/admin/recetas/:recetaId/editar`. El guard exige admin; el formulario vuelve a verificar el perfil antes de guardar. Se reutilizan la precarga, componentes y validaciones existentes, sin filtrar por autor en la lectura administrativa. Si encuentra una pendiente, bloquea el formulario y exige resolverla primero.
- La única escritura de contenido es `POST /rest/v1/rpc/admin_editar_receta` con `{ "p_receta_id": ID_RECETA, "p_datos": { ... } }`. La RPC crea una nueva publicada y conserva la anterior. Si no se cambia imagen, omite `imagen_path`; si se quita, envía `null`; si se cambia, primero sube una imagen bajo el UUID del admin y envía su ruta en `p_datos.imagen_path`. Nunca llama a asignar_imagen_receta para modificar una publicada.
- Al guardar vuelve al panel con confirmación. Al visitar el catálogo se vuelve a consultar la nueva publicada. El almacenamiento fallido permite reintentar o publicar sin cambiar la imagen; no se crea una versión administrativa antes de que la imagen elegida esté disponible.

### Validación real pendiente

- En un proyecto de prueba: verificar RPC/bucket instalados; leer solicitudes con cada rol, aprobar/rechazar/asociar, comprobar duplicados y concurrencia; subir con carpetas ajenas, tamaños y formatos inválidos para probar Storage/RLS; confirmar respuestas `version_id`, asociación a la pendiente correcta, conservación de la imagen aprobada al rechazar y cambio al aprobar; edición directa de otro autor con/sin pendiente y conservación del historial; bajas y bloqueo de versiones eliminadas. Las pruebas automáticas simulan estos servicios y no demuestran reglas SQL, persistencia ni permisos reales.
- Los escenarios 1–4 de esta etapa siguen cubiertos en `eliminarReceta.spec.js`; 5–12 están en `solicitudes.spec.js`, 13–20 en `imagenes.spec.js`, 21–26 en `adminEditar.spec.js`, con casos adicionales de fallos de asociación, recuperación y contrato de IDs. No se crean usuarios, solicitudes, recetas ni objetos en el Supabase principal durante los tests.

## Pruebas automatizadas

### Integración RLS real (opt-in)

`npm run test:rls` ejecuta ocho casos reales, separados de `npm test`, sin mocks ni frontend.
Requiere un proyecto exclusivo de testing y tres cuentas previamente configuradas.
Ver [configuración, controles de seguridad y resultados](docs/integracion/pruebas-rls.md).
Sin configuración inequívoca se detiene antes de autenticar o escribir; no significa que RLS haya pasado.

```sh
npm test                  # Vitest + suite existente de node:test, en ese orden
npm run test:unit         # componentes y navegación con Vitest
npm run test:watch        # Vitest en modo interactivo
npm run test:legacy       # pruebas unitarias/contratos REST existentes
npm run build
```

- `vitest.config.js` usa Vue, jsdom y el alias `@`; solo descubre `tests/**/*.spec.js`. `node:test` conserva `tests/*.test.js`, por lo que ninguna suite se ejecuta con el runner incorrecto. No se carga el plugin de DevTools para las pruebas.
- `tests/vitest.setup.js` reemplaza Supabase Auth y el transporte de Axios. Se conservan interceptores y serialización reales para comprobar JWT, apikey y payloads; todas las respuestas son explícitas y `fetch` real queda bloqueado. La configuración usa URL y clave públicas ficticias, nunca las credenciales del `.env`.
- `tests/edicion.spec.js` cubre TEST 01–12: edición pendiente, ID de versión/estado pendiente, RPC de corrección, respuesta con nuevo ID y una sola tarjeta al volver a Mis recetas, precarga completa y orden, duplicados, inactivos nuevos/originales, bloqueo de publicadas, errores visibles, doble envío y guards reales con Pinia/Router. También verifica cancelación y error de precarga. Se montan los componentes reales con Vue Test Utils; no solo se comprueban llamadas a mocks.
- Última ejecución: **72 pruebas Vitest + 78 pruebas node:test (150 en total), todas aprobadas**, sin omitidas. Por separado, **8 pruebas RLS reales aprobadas** con `npm run test:rls -- --single-project-test-only`, en el proyecto autorizado como exclusivo de testing, sin datos reales; ver el informe y las limitaciones de limpieza en la documentación de la suite.
- Límites: el estado persistido y la creación/conservación de versiones son responsabilidad de las RPC. Los tests verifican payloads, respuestas simuladas y resultado en la interfaz; no demuestran el comportamiento SQL ni RLS reales. Sigue pendiente validar con un proyecto Supabase de prueba que editar una pendiente conserva su ID, reenviar crea otra versión y conserva la rechazada, y un usuario ajeno no puede escribir. No se realizan escrituras, registros de usuarios ni llamadas al Supabase principal.
- `npm audit` informa cuatro avisos moderados en dependencias transitivas de desarrollo de Vue Test Utils (`js-beautify`, `editorconfig`, `glob`, `minimatch`). No se aplican cambios forzados ni actualizaciones de dependencias de producción para resolverlos dentro de esta tarea.

## Integración continua

El [workflow CI](.github/workflows/ci.yml) se ejecuta en cada push a `main`, en pull requests hacia `main` y manualmente desde **Actions → CI → Run workflow** una vez que está en la rama predeterminada.

En Ubuntu con Node.js 24.19.0 y caché de npm basada en `package-lock.json`, ejecuta `npm ci`, `npm test`, `npm run build` y `node tools/verificar-pwa.mjs` sobre el build recién generado. Los tests usan dobles y la verificación PWA inspecciona los archivos compilados. `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` se necesitan al usar la aplicación con Supabase. CI puede compilar y verificar la PWA sin configurarlas ni cargar credenciales. La suite `test:rls` queda fuera de CI.

En **GitHub → Actions → CI**, abrí la ejecución del commit y el job **Tests, build y PWA**. Si falla, abrí el primer paso en rojo y leé su log para identificar si el problema está en la preparación, la instalación, los tests, el build o la PWA. Las verificaciones siguientes se omiten cuando falla un paso anterior.

El despliegue automático queda pendiente.

## Docker

El `Dockerfile` compila el frontend con Node.js 24.19.0 y `npm ci`. La imagen final usa Nginx Alpine y sirve `dist/` desde la raíz del sitio.

Desde la raíz del repositorio, cargá en la terminal la URL del proyecto y la clave publicable `sb_publishable_…` de Supabase. Este ejemplo usa PowerShell y mantiene los valores fuera del comando de Docker.

```powershell
$env:VITE_SUPABASE_URL = Read-Host 'URL del proyecto Supabase'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = Read-Host 'Clave publicable de Supabase'
docker build --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_PUBLISHABLE_KEY -t recetapis:local .
docker run --rm -d --name recetapis -p 127.0.0.1:8080:80 recetapis:local
```

Vite incorpora esos dos valores públicos en el JavaScript durante el build. Si cambia la configuración de Supabase, reconstruí la imagen. Usá exclusivamente la clave publicable y mantené las claves secretas y `service_role` fuera del build. Los archivos `.env*` se excluyen del contexto de Docker.

Abrí `http://localhost:8080/` y recargá directamente `http://localhost:8080/login` en una ventana sin sesión. En DevTools → **Application**, comprobá que el manifest, los íconos y el service worker estén disponibles. Para probar la confirmación de registro por correo, el redirect `http://localhost:8080/login` debe estar permitido en el proyecto de Supabase. Fuera de localhost, la PWA requiere HTTPS.

```powershell
curl.exe -I http://localhost:8080/
curl.exe -I http://localhost:8080/login
curl.exe -I http://localhost:8080/manifest.webmanifest
curl.exe -I http://localhost:8080/sw.js
curl.exe -I http://localhost:8080/icons/pwa-192.png
curl.exe -I http://localhost:8080/assets/inexistente.js
docker stop recetapis
```

Las primeras cinco consultas deben devolver `200` y la última, `404`. El manifest debe tener tipo `application/manifest+json`. El HTML, el manifest y los scripts del service worker deben enviarse con `Cache-Control: no-cache` para que el navegador pueda revalidarlos. `docker stop` detiene el contenedor y `--rm` hace que Docker lo retire al salir.

### Validación automática del contenedor

Una vez que el [workflow Docker smoke](.github/workflows/docker-smoke.yml) esté en la rama predeterminada, abrí **GitHub → Actions → Docker smoke → Run workflow**, seleccioná la rama y ejecutalo. Usa una URL reservada bajo `.invalid` y una clave publicable ficticia. La imagen y el contenedor se usan dentro del runner.

La prueba construye la imagen, ejecuta `nginx -t` y comprueba por HTTP la portada, el fallback de `/login` y `/recetas/1`, el `404` de un asset faltante, el manifest, un ícono y el tipo y la caché de `sw.js`. Si un paso falla, revisá su log y el paso de logs de Nginx. El contenedor se retira al finalizar.

En un navegador real queda comprobar que Vue carga y navega, que el service worker se registra y controla la página, y que la PWA se puede instalar, abrir offline y actualizar entre dos builds sin perder un formulario. Seguí el [protocolo de PWA](docs/PWA.md) con una configuración pública válida para las comprobaciones que requieren datos.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
