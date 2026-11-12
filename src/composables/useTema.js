import { onBeforeUnmount, onMounted, ref } from 'vue'

const claveTema = 'recetapis-tema'
const temaValido = valor => valor === 'claro' || valor === 'oscuro' ? valor : null

export function useTema() {
  const sistema = window.matchMedia?.('(prefers-color-scheme: dark)')
  let preferencia = null
  try { preferencia = temaValido(localStorage.getItem(claveTema)) } catch { /* Almacenamiento bloqueado. */ }
  const temaSistema = () => sistema?.matches ? 'oscuro' : 'claro'
  const tema = ref(preferencia ?? temaSistema())

  function aplicar(valor) {
    tema.value = valor
    document.documentElement.dataset.tema = valor
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', valor === 'oscuro' ? '#151d18' : '#365f40')
  }
  function alternar() {
    preferencia = tema.value === 'oscuro' ? 'claro' : 'oscuro'
    aplicar(preferencia)
    try { localStorage.setItem(claveTema, preferencia) } catch { /* La elección sigue vigente en esta pestaña. */ }
  }
  function cambioSistema(evento) {
    if (!preferencia) aplicar(evento.matches ? 'oscuro' : 'claro')
  }
  function cambioAlmacenamiento(evento) {
    if (evento.key !== claveTema && evento.key !== null) return
    preferencia = temaValido(evento.newValue)
    aplicar(preferencia ?? temaSistema())
  }

  aplicar(tema.value)
  onMounted(() => {
    sistema?.addEventListener('change', cambioSistema)
    window.addEventListener('storage', cambioAlmacenamiento)
  })
  onBeforeUnmount(() => {
    sistema?.removeEventListener('change', cambioSistema)
    window.removeEventListener('storage', cambioAlmacenamiento)
  })
  return { tema, alternar }
}
