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
    <p>Una imagen JPG, PNG o WebP de hasta 5 MB. El archivo será público por URL, incluso mientras la receta esté pendiente.</p>
    <label for="archivo-receta">Seleccionar imagen</label>
    <input id="archivo-receta" ref="entrada" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" @change="seleccionar">
    <RecetaImagen class="preview-imagen" :src="vista" alt="Vista previa de la imagen de la receta" />
    <button type="button" class="boton-secundario" @click="limpiar(true)">Quitar imagen</button>
    <button v-if="rutaInicial && (archivo || quitar)" type="button" class="boton-secundario" @click="limpiar(false)">Mantener imagen actual</button>
    <p v-if="error" role="alert" class="mensaje-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.preview-imagen { display: block; width: min(100%, 320px); aspect-ratio: 4 / 3; object-fit: cover; margin-block: 1rem; border-radius: 12px; }
button { margin: .25rem; }
</style>
