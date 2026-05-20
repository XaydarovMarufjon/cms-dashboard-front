import { Component, inject, signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';

const SLIDING_ROUTES = new Set(['/', '/checker']);
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  protected readonly title = signal('cms-dashboard');
  readonly themeService = inject(ThemeService);

  private router = inject(Router);
  private auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private routeSub: Subscription | null = null;

  constructor() {
    if (!this.isBrowser) return;
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.syncHeartbeat(e.urlAfterRedirects.split('?')[0]));
  }

  private syncHeartbeat(path: string) {
    const shouldRun = this.auth.isLoggedIn() && SLIDING_ROUTES.has(path);
    if (shouldRun && !this.heartbeatId) {
      this.auth.refresh().subscribe({ next: () => {}, error: () => {} });
      this.heartbeatId = setInterval(() => {
        this.auth.refresh().subscribe({ next: () => {}, error: () => {} });
      }, REFRESH_INTERVAL_MS);
    } else if (!shouldRun && this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
  }

  ngOnDestroy() {
    if (this.heartbeatId) clearInterval(this.heartbeatId);
    this.routeSub?.unsubscribe();
  }
}
