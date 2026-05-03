import { Routes } from '@angular/router';
import { authGuard, guestGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    // Login sahifasi — faqat login bo'lmaganlar kiradi
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () =>
            import('./pages/login/login.component').then(m => m.LoginComponent),
    },
    // Dashboard — faqat login bo'lganlar kiradi
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
    },
    {
        path: 'checker',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/checker/checker.component').then(m => m.CheckerComponent),
    },
    {
        path: 'site/:id',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/site-detail/site-detail.component').then(m => m.SiteDetailComponent),
    },
    {
        path: 'alerts',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/alerts/alerts.component').then(m => m.AlertsComponent),
    },
    {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
            import('./pages/admin/admin.component').then(m => m.AdminComponent),
    },
    { path: '**', redirectTo: '' },
];