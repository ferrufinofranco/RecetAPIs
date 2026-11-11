import { createRouter, createWebHistory } from 'vue-router'
import CatalogoView from '@/views/CatalogoView.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'catalogo', component: CatalogoView },
    {
      path: '/recetas/:id',
      name: 'receta',
      component: () => import('@/views/RecetaDetalleView.vue'),
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'no-encontrada',
      component: () => import('@/views/NoEncontradaView.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
