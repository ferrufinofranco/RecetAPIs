# RecetAPIs

This template should help get you started developing with Vue 3 in Vite.

## Autenticación y roles

- Usar Node `^22.18.0 || >=24.12.0`, `npm ci` y las variables existentes `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env`. No usar claves secretas ni service-role en el frontend.
- `npm run dev` inicia la app. `/` y `/recetas/:id` siguen siendo públicos. `/registro` y `/login` son para visitantes; `/admin` requiere sesión y un perfil propio con `rol = 'admin'`.
- El SDK oficial de Supabase persiste y renueva la sesión. Pinia mantiene usuario, perfil y estado de inicialización; no persiste roles por su cuenta. Axios conserva `apikey` y agrega `Authorization: Bearer <access_token>` solo cuando hay sesión.
- El registro envía únicamente `nombre` en los metadatos. El trigger existente de Supabase debe crear `profiles` con rol `usuario`. La app solo lee perfiles con `GET /rest/v1/profiles?select=id,email,nombre,rol&id=eq.<user-id>&limit=1`; nunca asigna ni modifica roles.
- Para probar registro, usar un correo accesible. Si la confirmación está habilitada, confirmar desde el email antes del login. En Supabase Auth, permitir el redirect real de la app a `/login` (por ejemplo `http://localhost:5173/login`). Si se despliega en un subdirectorio, incluirlo en esa URL.
- Después del login, recargar para comprobar la restauración de sesión y usar **Cerrar sesión**. Sin sesión, visitar `/admin` debe llevar a Login; con rol `usuario`, a Acceso denegado; con una cuenta `admin` ya existente, al panel de categorías. No se crean administradores desde Vue.
- Antes de cada acceso a `/admin` se vuelve a consultar el perfil. Un perfil ausente o un fallo REST deniega el acceso; una revocación de rol se refleja en la próxima navegación protegida o recarga. Los guards no sustituyen RLS: las políticas existentes deben proteger cada operación y evitar que los usuarios cambien su propio rol. No se modifican tablas ni políticas desde esta implementación.
- Ejecutar `node --test tests/authGuard.test.js tests/authStore.test.js tests/recetas.test.js tests/categorias.test.js` y `npm run build`. Las pruebas de Auth/REST usan dobles: no registran usuarios ni verifican las políticas reales de Supabase. El despliegue con history requiere fallback de rutas a `index.html`.

## Categorías administrativas

- En `/admin`, crear una categoría con nombre, editarla y comprobar el listado actualizado. Probar nombre vacío, solo espacios y un nombre ya existente: debe aparecer un error sin informar éxito. General no ofrece edición. No hay eliminación ni desactivación.
- Se reutiliza Axios y su JWT de sesión: `GET /rest/v1/categorias?select=id,nombre&activa=eq.true&order=nombre.asc`; alta con `POST` enviando únicamente `nombre` (el estado inicial lo resuelve Supabase); edición con `PATCH` por `id`, restringida a categorías activas distintas de General, enviando únicamente `nombre`. Las escrituras solicitan `Prefer: return=representation`; un UPDATE con cero filas no se considera exitoso. Si falla la lectura posterior, se mantiene el aviso de guardado y se permite reintentar solo el listado.
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
