# Migraciones SQL del recetario — copia de referencia para OpenCode

Estos son los scripts SQL utilizados durante el desarrollo, incluidos los contratos de las funciones RPC.

**No ejecutar ni aplicar automáticamente.** Solo lectura/auditoría. El estado real de la base de datos debe verificarse en Supabase.

- `09_recetario_alta_recetas.sql`: `crear_receta(p_datos jsonb)` devuelve JSON con `receta_id`, `version_id`, `estado`.
- `12_recetario_edicion_reenvio.sql`: `editar_propuesta_receta(p_version_id bigint, p_datos jsonb)` devuelve `receta_id`, `version_id`, `estado`, `accion`.
- `13_recetario_proponer_edicion_publicada.sql`: `proponer_edicion_receta(p_receta_id bigint, p_datos jsonb)` devuelve los campos anteriores y `version_publicada_id`.
- `15_recetario_cierre_modulos.sql`: `admin_editar_receta(p_receta_id bigint, p_datos jsonb)` devuelve `receta_id`, `version_id`, `estado`, `version_anterior_id`.

La migración 06 renombró `version_ingredientes`, `version_categorias`, `version_pasos` a `receta_ingredientes`, `receta_categorias`, `receta_pasos`. `version_id` sigue apuntando a `receta_versiones.id`.

No confundir el contrato documentado en los scripts con la definición efectiva desplegada. Si el SQL de la base difiere, informar la discrepancia.
