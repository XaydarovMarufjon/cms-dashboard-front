import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'night' | 'light' | 'mixed';
export type ThemeMode = Theme | 'auto';
export type Accent = 'default' | 'teal' | 'blue' | 'violet' | 'amber';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platform = inject(PLATFORM_ID);
  private readonly KEY = 'cms-theme';
  private readonly MODE_KEY = 'cms-theme-mode';
  private readonly ACCENT_KEY = 'cms-accent';

  /** haqiqiy qo'llanayotgan tema (auto → night/light) */
  theme = signal<Theme>('night');
  /** foydalanuvchi tanlagan rejim (auto bo'lishi mumkin) */
  mode = signal<ThemeMode>('night');
  accent = signal<Accent>('default');

  private media?: MediaQueryList;

  constructor() {
    if (isPlatformBrowser(this.platform)) {
      const savedMode = (localStorage.getItem(this.MODE_KEY) as ThemeMode | null)
        ?? (localStorage.getItem(this.KEY) as Theme | null)
        ?? 'night';
      const savedAccent = (localStorage.getItem(this.ACCENT_KEY) as Accent | null) ?? 'default';

      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      this.media.addEventListener('change', () => {
        if (this.mode() === 'auto') this.apply('auto');
      });

      this.setAccent(savedAccent);
      this.setMode(savedMode);
    }
  }

  /** eski API saqlanadi — to'g'ridan-to'g'ri tema tanlash */
  setTheme(t: Theme) { this.setMode(t); }

  setMode(m: ThemeMode) {
    this.mode.set(m);
    this.apply(m);
    if (isPlatformBrowser(this.platform)) {
      localStorage.setItem(this.MODE_KEY, m);
      localStorage.setItem(this.KEY, this.theme()); // legacy
    }
  }

  setAccent(a: Accent) {
    this.accent.set(a);
    if (isPlatformBrowser(this.platform)) {
      localStorage.setItem(this.ACCENT_KEY, a);
      if (a === 'default') document.documentElement.removeAttribute('data-accent');
      else document.documentElement.setAttribute('data-accent', a);
    }
  }

  private apply(m: ThemeMode) {
    const effective: Theme = m === 'auto'
      ? (this.media?.matches ? 'night' : 'light')
      : m;
    this.theme.set(effective);
    if (isPlatformBrowser(this.platform)) {
      document.documentElement.setAttribute('data-theme', effective);
    }
  }
}
