# RecetAPIs

This template should help get you started developing with Vue 3 in Vite.

## Autenticación y roles

- Usar Node `^22.18.0 || >=24.12.0`, `npm ci` y las variables existentes `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env`. No usar claves secretas ni service-role en el frontend.
- `npm run dev` inicia la app. `/` y `/recetas/:id` siguen siendo públicos. `/registro` y `/login` son para visitantes; `/admin` requiere sesión y un perfil propio con `rol = 'admin'`.
- El SDK oficial de Supabase persiste y renueva la sesión. Pinia mantiene usuario, perfil y estado de inicialización; no persiste roles por su cuenta. Axios conserva `apikey` y agrega `Authorization: Bearer <access_token>` solo cuando hay sesión.
- El registro envía únicamente `nombre` en los metadatos. El trigger existente de Supabase debe crear `profiles` con rol `usuario`. La app solo lee perfiles con `GET /rest/v1/profiles?select=id,email,nombre,rol&id=eq.<user-id>&limit=1`; nunca asigna ni modifica roles.
- Para probar registro, usar un correo accesible. Si la confirmación está habilitada, confirmar desde el email antes del login. En Supabase Auth, permitir el redirect real de la app a `/login` (por ejemplo `http://localhost:5173/login`). Si se despliega en un subdirectorio, incluirlo en esa URL.
- Después del login, recargar para comprobar la restauración de sesión y usar **Cerrar sesión**. Sin sesión, visitar `/admin` debe llevar a Login; con rol `usuario`, a Acceso denegado; con una cuenta `admin` ya existente, a la pantalla provisional. No se crean administradores desde Vue.
- Antes de cada acceso a `/admin` se vuelve a consultar el perfil. Un perfil ausente o un fallo REST deniega el acceso; una revocación de rol se refleja en la próxima navegación protegida o recarga. Los guards no sustituyen RLS: las políticas existentes deben proteger cada operación y evitar que los usuarios cambien su propio rol. No se modifican tablas ni políticas desde esta implementación.
- Ejecutar `node --test tests/authGuard.test.js tests/authStore.test.js tests/recetas.test.js` y `npm run build`. Las pruebas de Auth/REST usan dobles: no registran usuarios ni verifican las políticas reales de Supabase. El despliegue con history requiere fallback de rutas a `index.html`.

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
