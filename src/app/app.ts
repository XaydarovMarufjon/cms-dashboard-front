import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { SideNavComponent } from './shared/side-nav/side-nav.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SideNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('cms-dashboard');
  readonly themeService = inject(ThemeService); // triggers init on bootstrap
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly routeUrl = signal(this.router.url);

  readonly showShell = computed(() =>
    this.auth.isLoggedIn() && !this.routeUrl().startsWith('/login')
  );

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.routeUrl.set(event.urlAfterRedirects));
  }
}
