import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'night' | 'light' | 'mixed';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platform = inject(PLATFORM_ID);
  private readonly KEY = 'cms-theme';

  theme = signal<Theme>('night');

  constructor() {
    if (isPlatformBrowser(this.platform)) {
      const saved = localStorage.getItem(this.KEY) as Theme | null;
      this.apply(saved ?? 'night');
    }
  }

  setTheme(t: Theme) {
    this.apply(t);
    if (isPlatformBrowser(this.platform)) {
      localStorage.setItem(this.KEY, t);
    }
  }

  private apply(t: Theme) {
    this.theme.set(t);
    if (isPlatformBrowser(this.platform)) {
      document.documentElement.setAttribute('data-theme', t);
    }
  }
}
