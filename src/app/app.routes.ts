import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        // Lazy loading — kerak bo'lganda yuklanadi
        loadComponent: () =>
            import('./pages/dashboard/dashboard.component')
                .then(m => m.DashboardComponent),
    },
    { path: '**', redirectTo: '' },
];