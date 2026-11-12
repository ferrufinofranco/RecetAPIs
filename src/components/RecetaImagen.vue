<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, required: true },
  prioritaria: { type: Boolean, default: false },
})
const fallback = `${import.meta.env.BASE_URL}images/receta-default.svg`
const fallo = ref(false)
watch(() => props.src, () => { fallo.value = false })
</script>

<template>
  <img :src="!src || fallo ? fallback : src" :alt="alt" :loading="prioritaria ? 'eager' : 'lazy'"
    :fetchpriority="prioritaria ? 'high' : undefined" @error="fallo = true">
</template>
