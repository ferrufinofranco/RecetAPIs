# PWA de RecetAPIs

## Alcance y configuración

- Única dependencia directa agregada: `vite-plugin-pwa@^2.0.0` (desarrollo), compatible con Vite 8. Workbox es una dependencia transitiva de generación del service worker.
- Manifest generado: nombre y nombre corto `RecetAPIs`, idioma `es-AR`, `standalone`, identidad/inicio/scope `/`. Colores del diseño existente: `#365f40` y `#faf9f5`.
- PNG de 192 y 512 px, ícono maskable de 512 px (contenido en zona segura) y apple-touch-icon de 180 px. Se regeneran sin instalar herramientas con `node tools/generar-iconos-pwa.mjs`.
- `generateSW` genera `dist/sw.js` y el módulo Workbox. Registro nativo explícito desde `AvisosPwa`, sólo en producción; no hay registros duplicados ni SW en desarrollo.
- Precache exclusivo del HTML, JS/CSS compilados (incluidas rutas lazy), manifest e íconos. No se cachean imágenes remotas ni respuestas de Auth, REST, Storage, RPC o administración. `runtimeCaching` está vacío.
- El fallback de navegación entrega **la interfaz pública compilada**, no datos ni HTML administrativo personalizado. Vue Router y sus guards siguen decidiendo el acceso. Se excluyen `/api` y los endpoints versionados de Supabase del fallback.
- No se modifica Supabase, autenticación, roles, SQL, RLS, RPC ni versionado. La persistencia de sesión existente del SDK no es una caché del service worker.
- No existen colas, Background Sync, escrituras offline ni reintentos de escrituras al reconectar. Consultar o modificar recetas requiere internet. La caché de interfaz sólo está disponible después de una primera visita online y una instalación correcta del SW; el navegador puede desalojarla.
- Avisos con los estilos existentes: pérdida de conexión, nueva versión y fallo de registro. El indicador de conexión del navegador no garantiza que el servidor esté accesible; los errores y reintentos existentes siguen vigentes. Se simplifica el mensaje de error de red del catálogo.

## Actualización sin perder formularios

`skipWaiting` y `clientsClaim` no son automáticos. Una versión nueva queda esperando y ofrece **Actualizar ahora** / **Más tarde**. Se comprueba el registro al recuperar conexión o enfocar la ventana, sin refrescar la página ni enviar datos.

Actualizar consulta el registro de borradores que ya utiliza `App.vue`, incluidos formularios conservados con KeepAlive. Si hay cambios, no activa ni recarga: primero hay que guardarlos o descartarlos desde el formulario. Se vuelve a comprobar antes de la recarga por si se editó durante la activación.

Sólo la pestaña que acepta envía `SKIP_WAITING` y puede recargarse. Un `controllerchange` causado por otra pestaña no recarga ésta. Si otra pestaña ya activó la versión, aceptar el aviso recarga explícitamente. **Más tarde** oculta el aviso en esa sesión, no fuerza una actualización. Sin pestañas abiertas, el ciclo normal del navegador puede activar el SW al volver a abrir.

## Verificaciones ejecutadas

```powershell
npm.cmd test
npm.cmd run build
node tools/verificar-pwa.mjs
```

- Tests unitarios y legacy aprobados; los nuevos tests cubren conexión, posposición, protección de borradores, errores de registro, primera instalación, detección de nuevas versiones y activación desde otra pestaña.
- Build con comprobación de tipos aprobado. Se generan manifest, SW y módulo Workbox; 35 entradas estáticas de precache.
- `verificar-pwa.mjs` valida propiedades del manifest, dimensiones PNG, archivos precacheados y el código generado mediante dobles de Workbox: sólo precache/fallback, sin caché runtime y activación exclusivamente por mensaje explícito.
- Edge Chromium headless, perfil temporal limpio y servidor preview local: manifest sin errores y sin errores de instalabilidad reportados; SW registrado/controlando; navegación directa y recarga de `/login` online; recarga de `/login` offline (incluido su chunk lazy); fallback en `/recetas/999999` offline; aviso de conexión y recuperación; Cache Storage con 35 recursos locales, sin respuestas de Supabase. Los fetch offline a `/auth/v1/token`, `/rest/v1/profiles` y `/api/privado` fallaron por red, sin HTML de fallback.
- No se hicieron escrituras de negocio ni pruebas contra RLS. No se declara aprobada una instalación gráfica en Chrome, rutas con sesión real ni una actualización entre builds con formularios reales en múltiples ventanas: quedan como pruebas manuales abajo.
- `npm ci` no pudo completarse en este entorno: Windows devolvió `EPERM` porque el servidor de desarrollo del usuario tenía cargado el binario nativo de Rolldown. No se detuvo ese proceso. Se restauraron las dependencias con `npm install --ignore-scripts` y se volvieron a aprobar tests y build. Para verificar una instalación limpia, cerrar voluntariamente ese servidor y repetir `npm ci`.
- La instalación informa 8 alertas de auditoría en dependencias de desarrollo (2 bajas y 6 moderadas); `npm audit --omit=dev --json` no informó vulnerabilidades de producción. No se aplicó `audit fix` ni se actualizaron dependencias ajenas al alcance PWA.

## Instalar y verificar en Chrome (pendiente manual)

1. Ejecutar `npm.cmd run build`, `node tools/verificar-pwa.mjs` y `npm.cmd run preview -- --host 127.0.0.1 --port 4173`. Abrir `http://127.0.0.1:4173/` en Chrome normal, no incógnito. Localhost es un contexto seguro; fuera de localhost una PWA requiere HTTPS. No usar `npm run dev` para probar el SW.
2. En DevTools → **Application → Manifest**, revisar nombre, colores e íconos. En **Service Workers**, comprobar scope `/`, estado activado y ausencia de registros duplicados; recargar una vez tras la primera instalación si aún no controla la página.
3. Usar **Instalar RecetAPIs** en la barra de direcciones o el menú de Chrome. Abrir desde el acceso instalado y comprobar ventana standalone e ícono.
4. Online, navegar y recargar directamente `/login`, `/registro`, una receta existente y, con sesión y permisos válidos, `/mis-recetas`, edición y `/admin`. Comprobar que los guards no cambian y que las rutas siguen abriendo en la ventana instalada.
5. Visitar online primero. Activar **Network → Offline**, recargar una ruta pública y comprobar que carga la interfaz y aparece el aviso de que los datos requieren internet. Con sesión, revisar que consultas/guardados fallidos no muestran éxito ni descartan el borrador. Reconectar: el aviso debe desaparecer, **sin enviar operaciones automáticamente**; reintentar explícitamente desde la pantalla.
6. Después de navegar por datos públicos y privados, revisar **Application → Cache Storage**: sólo `index.html`, `assets/*`, `icons/*` y manifest. No debe haber URLs de Supabase, tokens, respuestas de perfiles, recetas ni datos administrativos. No confundir Local Storage del SDK con Cache Storage.
7. Para probar actualizaciones, mantener la app abierta con un formulario modificado. En otra terminal generar un segundo build con un cambio estático temporal de PWA (por ejemplo, descripción del manifest); conservarlo sólo para esa prueba y luego restaurar únicamente ese cambio propio. Volver a enfocar la app: debe aparecer el aviso **sin recargar**. No activar **Update on reload**, **Skip waiting** ni **Bypass for network** desde DevTools: eludirían el flujo a probar.
8. Probar **Más tarde**: el texto del formulario permanece. Volver a mostrar el aviso reabriendo la app si se pospuso. **Actualizar ahora** con un borrador debe bloquearse sin descartar datos; guardar o descartar explícitamente desde el formulario y aceptar debe actualizar y recargar. Repetir con dos pestañas/ventanas: aceptar en una no debe recargar la otra que contiene cambios; luego actualizarla explícitamente.

No se configura CI/CD ni despliegue. Un servidor que sirva el build necesita fallback SPA para visitas directas cuando todavía no hay SW; `vite preview` lo proporciona. El scope y las URLs actuales están configurados para la raíz `/`.

## Archivos de esta implementación

- Configuración: `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`.
- Integración mínima: `src/App.vue`, `src/components/AvisosPwa.vue`, `src/pwa/registro.js`; mensaje de red en `src/views/CatalogoView.vue`.
- Íconos: `public/icons/*.png`; generador `tools/generar-iconos-pwa.mjs`.
- Verificación: `tests/pwa.spec.js`, `tests/pwaRegistro.spec.js`, `tools/verificar-pwa.mjs`, este documento.

Los cambios locales previos de UX/formularios se conservaron; no forman parte de esta implementación.
