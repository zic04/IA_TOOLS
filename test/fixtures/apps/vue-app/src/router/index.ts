import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import adminRoutes from './admin';
import { requireAuth } from './guards';
import HomeView from '../views/HomeView.vue';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/orders', component: () => import('../views/OrdersView.vue'), meta: { requiresAuth: true } },
  {
    path: '/orders/:id',
    component: () => import('../views/OrderView.vue'),
    beforeEnter: requireAuth,
  },
  // { path: '/legacy', component: () => import('../views/LegacyView.vue') },
  { path: '/admin', component: AdminLayout, meta: { requiresAuth: true, roles: ['admin'] }, children: adminRoutes },
  {
    path: '/account',
    redirect: '/account/profile',
    children: [
      { path: 'profile', component: () => import('../views/ProfileView.vue') },
      { path: 'security', component: () => import('../views/SecurityView.vue'), beforeEnter: [requireAuth, (to) => !!to.query.ok] },
    ],
  },
  { path: '/old-orders', redirect: '/orders' },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
];

export default createRouter({ history: createWebHistory(), routes });
