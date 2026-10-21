import type { RouteRecordRaw } from 'vue-router';

const adminRoutes: RouteRecordRaw[] = [
  { path: '', component: () => import('../views/admin/DashboardView.vue') },
  { path: 'users', component: () => import('../views/admin/UsersView.vue') },
];

export default adminRoutes;
