// src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '../services/auth.service';

// Login bo'lmagan foydalanuvchini /login ga yuboradi
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  if (auth.isLoggedIn()) return true;

  router.navigate(['/login']);
  return false;
};

// Login bo'lgan foydalanuvchi /login ga kira olmaydi
export const guestGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  if (!auth.isLoggedIn()) return true;

  router.navigate(['/']);
  return false;
};

// Faqat ADMIN rolidagi foydalanuvchi kiradi
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  if (auth.role() === 'ADMIN') return true;

  router.navigate(['/']);
  return false;
};
