import { createRouter, createWebHistory } from 'vue-router'
import CatalogoView from '@/views/CatalogoView.vue'
import { crearAuthGuard } from './authGuard'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'catalogo', component: CatalogoView },
    {
      path: '/login', name: 'login', meta: { soloInvitados: true },
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/registro', name: 'registro', meta: { soloInvitados: true },
      component: () => import('@/views/RegistroView.vue'),
    },
    {
      path: '/acceso-denegado', name: 'acceso-denegado',
      component: () => import('@/views/AccesoDenegadoView.vue'),
    },
    {
      path: '/admin', name: 'admin', meta: { requiereAuth: true, rol: 'admin' },
      component: () => import('@/views/AdminView.vue'),
    },
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

router.beforeEach((to) => crearAuthGuard(useAuthStore())(to))

export default router
