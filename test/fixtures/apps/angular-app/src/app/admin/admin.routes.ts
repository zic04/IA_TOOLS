import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { FeatureService } from '../features/feature.service';
import { AdminDashboardComponent } from './dashboard.component';
import { UserListComponent } from './user-list.component';

export const ADMIN_ROUTES: Routes = [
  { path: '', component: AdminDashboardComponent },
  {
    path: 'users',
    component: UserListComponent,
    canMatch: [() => inject(FeatureService).enabled('users')],
  },
];
