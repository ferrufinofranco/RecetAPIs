# RecetAPIs

This template should help get you started developing with Vue 3 in Vite.

## Autenticación y roles

- Usar Node `^22.18.0 || >=24.12.0`, `npm ci` y las variables existentes `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env`. No usar claves secretas ni service-role en el frontend.
- `npm run dev` inicia la app. `/` y `/recetas/:id` siguen siendo públicos. `/registro` y `/login` son para visitantes; `/admin` requiere sesión y un perfil propio con `rol = 'admin'`.
- El SDK oficial de Supabase persiste y renueva la sesión. Pinia mantiene usuario, perfil y estado de inicialización; no persiste roles por su cuenta. Axios conserva `apikey` y agrega `Authorization: Bearer <access_token>` solo cuando hay sesión.
- El registro envía únicamente `nombre` en los metadatos. El trigger existente de Supabase debe crear `profiles` con rol `usuario`. La app solo lee perfiles con `GET /rest/v1/profiles?select=id,email,nombre,rol&id=eq.<user-id>&limit=1`; nunca asigna ni modifica roles.
- Para probar registro, usar un correo accesible. Si la confirmación está habilitada, confirmar desde el email antes del login. En Supabase Auth, permitir el redirect real de la app a `/login` (por ejemplo `http://localhost:5173/login`). Si se despliega en un subdirectorio, incluirlo en esa URL.
- Después del login, recargar para comprobar la restauración de sesión y usar **Cerrar sesión**. Sin sesión, visitar `/admin` debe llevar a Login; con rol `usuario`, a Acceso denegado; con una cuenta `admin` ya existente, al panel de categorías e ingredientes. No se crean administradores desde Vue.
- Antes de cada acceso a `/admin` se vuelve a consultar el perfil. Un perfil ausente o un fallo REST deniega el acceso; una revocación de rol se refleja en la próxima navegación protegida o recarga. Los guards no sustituyen RLS: las políticas existentes deben proteger cada operación y evitar que los usuarios cambien su propio rol. No se modifican tablas ni políticas desde esta implementación.
- Ejecutar `node --test tests/authGuard.test.js tests/authStore.test.js tests/recetas.test.js tests/categorias.test.js tests/ingredientes.test.js` y `npm run build`. Las pruebas de Auth/REST usan dobles: no registran usuarios ni verifican las políticas reales de Supabase. El despliegue con history requiere fallback de rutas a `index.html`.

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
- Para comprobar el guardado real, usar una receta de prueba con título identificable. En Network, verificar una sola petición a `rpc/crear_receta`. Luego consultar **en modo lectura** `receta_versiones` en el Table Editor de Supabase y comprobar `estado = 'pendiente'` y su `receta_id`; en `recetas`, el `autor_id` debe ser el usuario autenticado. Verificar que las relaciones en `receta_categorias`, `receta_ingredientes` y `receta_pasos` referencien esa versión mediante `version_id`. La receta no debe aparecer en el catálogo público mientras esté pendiente. No cambiar su estado para esta prueba.
- Ejecutar `node --test tests/crearReceta.test.js` para las validaciones, acceso y contrato RPC, y `npm run build`. Las pruebas automatizadas simulan la escritura; no crean recetas ni verifican el estado real en Supabase. Ante un timeout o fallo de conexión, comprobar el guardado antes de reenviar: el bloqueo del botón evita dobles clics, pero no reemplaza idempotencia del servidor.

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
