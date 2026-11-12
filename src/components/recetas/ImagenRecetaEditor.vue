<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { validarImagen } from '@/services/imagenes'
import { resolverImagen } from '@/utils/recetas'
import RecetaImagen from '@/components/RecetaImagen.vue'

const props = defineProps({ archivo: { default: null }, quitar: Boolean, rutaInicial: { type: String, default: '' } })
const emit = defineEmits(['update:archivo', 'update:quitar'])
const error = ref('')
const blob = ref('')
const entrada = ref(null)
const vista = computed(() => props.quitar ? '' : blob.value || resolverImagen(props.rutaInicial, import.meta.env.VITE_SUPABASE_URL))
watch(() => props.archivo, (archivo) => {
  if (blob.value) URL.revokeObjectURL(blob.value)
  blob.value = archivo ? URL.createObjectURL(archivo) : ''
}, { immediate: true })
onBeforeUnmount(() => { if (blob.value) URL.revokeObjectURL(blob.value) })

function seleccionar(event) {
  error.value = ''
  const archivo = event.target.files?.[0]
  if (!archivo) return
  try {
    validarImagen(archivo)
    emit('update:archivo', archivo)
    emit('update:quitar', false)
  } catch (err) { error.value = err.message; event.target.value = '' }
}
function limpiar(quitar) {
  emit('update:archivo', null)
  emit('update:quitar', quitar)
  if (entrada.value) entrada.value.value = ''
  error.value = ''
}
</script>

<template>
  <section aria-labelledby="imagen-receta">
    <h2 id="imagen-receta">Imagen (opcional)</h2>
    <p id="ayuda-imagen-receta">Una imagen JPG, PNG o WebP de hasta 5 MB. El archivo será público por URL, incluso mientras la receta esté pendiente.</p>
    <div class="imagen-editor-grid">
      <div>
        <label for="archivo-receta">Seleccionar imagen</label>
        <input id="archivo-receta" ref="entrada" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          :aria-invalid="!!error" :aria-describedby="error ? 'ayuda-imagen-receta error-imagen-receta' : 'ayuda-imagen-receta'" @change="seleccionar">
        <div class="acciones-imagen">
          <button type="button" class="boton-secundario" @click="limpiar(true)">Quitar imagen</button>
          <button v-if="rutaInicial && (archivo || quitar)" type="button" class="boton-secundario" @click="limpiar(false)">Mantener imagen actual</button>
        </div>
      </div>
      <RecetaImagen class="preview-imagen" :src="vista" alt="Vista previa de la imagen de la receta" />
    </div>
    <p v-if="error" id="error-imagen-receta" role="alert" class="mensaje-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.imagen-editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) 128px; align-items: start; gap: .75rem; }
.preview-imagen { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 10px; }
input { margin-block: .25rem .5rem; max-width: 100%; }
.acciones-imagen { display: flex; flex-wrap: wrap; gap: .5rem; }
@media (max-width: 480px) {
  .imagen-editor-grid { grid-template-columns: minmax(0, 1fr); }
  .preview-imagen { max-width: 128px; }
}
</style>
