import { Routes } from '@angular/router';
import { authGuard, roleGuard, unsavedChangesGuard } from './auth/guards';
import { HomeComponent } from './home/home.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { OrderDetailComponent } from './orders/order-detail.component';
import { OrderListComponent } from './orders/order-list.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'orders',
    canActivate: [authGuard],
    children: [
      { path: '', component: OrderListComponent },
      { path: ':id', component: OrderDetailComponent, canDeactivate: [unsavedChangesGuard] },
    ],
  },
  // { path: 'legacy', component: LegacyComponent },
  {
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [roleGuard('admin')],
    data: { roles: ['admin'] },
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: 'reports', loadChildren: () => import('./reports/reports.module').then((m) => m.ReportsModule) },
  { path: 'home', redirectTo: '', pathMatch: 'full' },
  { path: '**', component: NotFoundComponent },
];
