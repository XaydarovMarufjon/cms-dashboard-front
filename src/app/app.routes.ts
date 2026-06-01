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
    // Dashboard - asosiy sahifa
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/overview/overview.component').then(m => m.OverviewComponent),
    },
    // Saytlar skaner dashboard
    {
        path: 'sites',
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
        path: 'dork',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/dork/dork.component').then(m => m.DorkComponent),
    },
    {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
            import('./pages/admin/admin.component').then(m => m.AdminComponent),
    },
    {
        path: 'nuclei',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/nuclei/nuclei.component').then(m => m.NucleiComponent),
    },
    {
        path: 'vulnerabilities',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/vulnerabilities/vulnerabilities.component').then(m => m.VulnerabilitiesComponent),
    },
    {
        path: 'ports',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/port-scanner/port-scanner.component').then(m => m.PortScannerComponent),
    },
    {
        path: 'tasks',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/tasks/tasks.component').then(m => m.TasksComponent),
    },
    {
        path: 'image-moderation',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/image-moderation/image-moderation.component').then(m => m.ImageModerationComponent),
    },
    {
        path: 'statistics',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/vulnerabilities/vulnerabilities.component').then(m => m.VulnerabilitiesComponent),
    },
    {
        path: 'proxies',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/proxies/proxies.component').then(m => m.ProxiesComponent),
    },
    {
        path: 'calls',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/calls/calls.component').then(m => m.CallsComponent),
    },
    {
        path: 'transliterator',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./pages/transliterator/transliterator.component').then(m => m.TransliteratorComponent),
    },
    {
        path: 'logs',
        canActivate: [adminGuard],
        loadComponent: () =>
            import('./pages/logs/logs.component').then(m => m.LogsComponent),
    },
    { path: '**', redirectTo: '' },
];
