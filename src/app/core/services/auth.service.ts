// src/app/core/services/auth.service.ts
import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { User, LoginDto, LoginResponse, ROLE_PERMISSIONS } from '../../shared/models/user.model';

const TOKEN_KEY = 'cms_token';
const USER_KEY = 'cms_user';
const TOKENLESS_USER: User = {
  id: 'local-admin',
  username: 'admin',
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // ── STATE ──────────────────────────────────────
  currentUser = signal<User | null>(TOKENLESS_USER);
  token = signal<string | null>(null);

  isLoggedIn = computed(() => !!this.currentUser());
  role = computed(() => this.currentUser()?.role ?? null);
  permissions = computed(() => {
    const r = this.role();
    return r ? ROLE_PERMISSIONS[r] : null;
  });

  constructor() {
    this.clearStoredAuth();
  }

  // ── LOGIN ──────────────────────────────────────
  login(_dto: LoginDto) {
    this.token.set(null);
    this.currentUser.set(TOKENLESS_USER);
    this.clearStoredAuth();
    return of<LoginResponse>({ access_token: '', user: TOKENLESS_USER });
  }

  // ── LOGOUT ─────────────────────────────────────
  logout() {
    this.token.set(null);
    this.currentUser.set(TOKENLESS_USER);
    this.clearStoredAuth();
    this.router.navigate(['/']);
  }

  // ── REFRESH ────────────────────────────────────
  refresh() {
    return of({ access_token: '', expiresAt: '' });
  }

  getToken(): string | null {
    return null;
  }

  hasPermission(perm: keyof typeof ROLE_PERMISSIONS.ADMIN): boolean {
    return this.permissions()?.[perm] ?? false;
  }

  private clearStoredAuth() {
    if (!this.isBrowser) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}
