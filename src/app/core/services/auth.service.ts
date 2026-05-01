// src/app/core/services/auth.service.ts
import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User, LoginDto, LoginResponse, ROLE_PERMISSIONS } from '../../shared/models/user.model';

const TOKEN_KEY = 'cms_token';
const USER_KEY = 'cms_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private api = environment.apiUrl;

  // ── STATE ──────────────────────────────────────
  currentUser = signal<User | null>(this.loadUser());
  token = signal<string | null>(this.loadToken());

  isLoggedIn = computed(() => !!this.currentUser());
  role = computed(() => this.currentUser()?.role ?? null);
  permissions = computed(() => {
    const r = this.role();
    return r ? ROLE_PERMISSIONS[r] : null;
  });

  // ── LOGIN ──────────────────────────────────────
  login(dto: LoginDto) {
    return this.http.post<LoginResponse>(`${this.api}/auth/login`, dto).pipe(
      tap(res => {
        this.token.set(res.access_token);
        this.currentUser.set(res.user);
        if (this.isBrowser) {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        }
      })
    );
  }

  // ── LOGOUT ─────────────────────────────────────
  logout() {
    this.token.set(null);
    this.currentUser.set(null);
    if (this.isBrowser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.token();
  }

  hasPermission(perm: keyof typeof ROLE_PERMISSIONS.ADMIN): boolean {
    return this.permissions()?.[perm] ?? false;
  }

  // ── LOAD FROM STORAGE ──────────────────────────
  private loadToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private loadUser(): User | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch { return null; }
  }
}