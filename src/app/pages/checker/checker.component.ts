// src/app/pages/checker/checker.component.ts
import { Component, signal, computed, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SafeUrlPipe } from '../../shared/pipes/safe-url.pipe';
import { ScannerService } from '../../core/services/scanner.service';

interface CheckSite {
  id:     string;
  url:    string;
  label?: string;
}

type SiteStatus = 'idle' | 'checking' | 'done' | 'error';

interface SiteResult {
  id:      string;
  url:     string;
  label?:  string;
  status:  SiteStatus;
  elapsed?: number;  // ms
}

@Component({
  selector: 'app-checker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, SafeUrlPipe],
  templateUrl: './checker.component.html',
  styleUrls: ['./checker.component.scss'],
})
export class CheckerComponent implements OnDestroy {
  private scannerService = inject(ScannerService);

  // ── SITES ─────────────────────────────────────
  sites = signal<CheckSite[]>([
    { id: '1', url: 'https://senat.uz/',          label: 'Senat' },
    { id: '2', url: 'https://president.uz/',       label: 'Prezident' },
    { id: '3', url: 'https://gov.uz/',             label: 'Hukumat' },
    { id: '4', url: 'https://my.gov.uz/',          label: 'My Gov' },
    { id: '5', url: 'https://saylov.uz/',          label: 'Saylov' },
    { id: '6', url: 'https://ijro.gov.uz/',        label: 'Ijro' },
    { id: '7', url: 'https://parliament.gov.uz/',  label: 'Parlament' },
    { id: '8', url: 'https://e-saylov.uz/',        label: 'E-Saylov' },
  ]);

  // ── URL QOSHISH ───────────────────────────────
  newUrl   = signal('');
  newLabel = signal('');
  urlError = signal('');

  // ── CHECKER STATE ─────────────────────────────
  results        = signal<SiteResult[]>([]);
  isRunning      = signal(false);
  isPaused       = signal(false);
  currentIndex   = signal(-1);
  intervalMs     = signal(20000);   // ms — har sayt uchun vaqt
  countdown      = signal(0);
  iframeUrl      = signal<string>('');
  openedInWindow = signal(false);

  private timerId?: ReturnType<typeof setInterval>;
  private countId?: ReturnType<typeof setInterval>;
  private openWin?: Window | null;
  private doneTimer?: ReturnType<typeof setTimeout>;

  // ── COMPUTED ──────────────────────────────────
  progress = computed(() => {
    const total = this.sites().length;
    if (!total) return 0;
    return Math.round(((this.currentIndex() + 1) / total) * 100);
  });

  currentSite = computed(() => {
    const i = this.currentIndex();
    return i >= 0 ? this.sites()[i] : null;
  });

  readonly INTERVAL_OPTIONS = [
    { label: '10 son', value: 10000 },
    { label: '20 son', value: 20000 },
    { label: '30 son', value: 30000 },
    { label: '1 min',  value: 60000 },
  ];

  // ── SAYT QO'SHISH ─────────────────────────────
  addSite() {
    const url = this.newUrl().trim();
    if (!url) { this.urlError.set('URL kiriting'); return; }
    if (!/^https?:\/\/.+/.test(url)) { this.urlError.set('https:// bilan boshlash kerak'); return; }
    if (this.sites().some(s => s.url === url)) { this.urlError.set('Bu URL allaqachon bor'); return; }

    this.urlError.set('');
    this.sites.update(list => [...list, {
      id:    Date.now().toString(),
      url,
      label: this.newLabel().trim() || undefined,
    }]);
    this.newUrl.set('');
    this.newLabel.set('');
  }

  removeSite(id: string) {
    if (this.isRunning()) return;
    this.sites.update(list => list.filter(s => s.id !== id));
  }

  // ── ISHGA TUSHIRISH ───────────────────────────
  start() {
    if (this.isRunning() && !this.isPaused()) return;
    if (!this.sites().length) return;

    this.clearTimers();
    this.isRunning.set(true);
    this.isPaused.set(false);
    this.currentIndex.set(-1);
    this.iframeUrl.set('');
    this.openedInWindow.set(false);
    this.results.set(this.sites().map(s => ({
      id: s.id, url: s.url, label: s.label, status: 'idle',
    })));

    this.next();
    this.timerId = setInterval(() => this.next(), this.intervalMs());
  }

  private async next() {
    const idx = this.currentIndex() + 1;

    if (idx >= this.sites().length) {
      clearInterval(this.timerId);
      clearInterval(this.countId);
      this.currentIndex.set(-1);
      this.results.set(this.sites().map(s => ({
        id: s.id, url: s.url, label: s.label, status: 'idle',
      })));
      await this.next();
      this.timerId = setInterval(() => this.next(), this.intervalMs());
      return;
    }

    this.currentIndex.set(idx);
    const site = this.sites()[idx];

    this.results.update(list => list.map(r =>
      r.id === site.id ? { ...r, status: 'checking' } : r
    ));

    this.countdown.set(Math.floor(this.intervalMs() / 1000));
    clearInterval(this.countId);
    this.countId = setInterval(() => {
      this.countdown.update(n => (n > 0 ? n - 1 : 0));
    }, 1000);

    const start = Date.now();

    let canEmbed = true;
    try {
      const res = await firstValueFrom(this.scannerService.checkCanEmbed(site.url));
      canEmbed = res.canEmbed;
    } catch { canEmbed = true; }

    this.openWin?.close();
    this.openWin = null;
    clearTimeout(this.doneTimer);

    if (canEmbed) {
      this.iframeUrl.set(site.url);
      this.openedInWindow.set(false);
    } else {
      this.iframeUrl.set('');
      this.openedInWindow.set(true);
      this.openWin = window.open(site.url, '_blank');
    }

    this.doneTimer = setTimeout(() => {
      const elapsed = Date.now() - start;
      this.openWin?.close();
      this.openWin = null;
      this.openedInWindow.set(false);
      this.results.update(list => list.map(r =>
        r.id === site.id ? { ...r, status: 'done', elapsed } : r
      ));
    }, this.intervalMs() - 2000);
  }

  // ── PAUZA / DAVOM ETISH ───────────────────────
  togglePause() {
    if (!this.isRunning()) return;
    if (this.isPaused()) {
      this.resume();
    } else {
      this.pause();
    }
  }

  private pause() {
    this.clearTimers();
    this.openWin?.close();
    this.openWin = null;
    this.openedInWindow.set(false);
    this.iframeUrl.set('');
    this.countdown.set(0);
    // Mark current site idle and step back so resume re-checks it
    this.results.update(list => list.map(r =>
      r.status === 'checking' ? { ...r, status: 'idle' } : r
    ));
    this.currentIndex.update(i => Math.max(-1, i - 1));
    this.isPaused.set(true);
  }

  private resume() {
    this.isPaused.set(false);
    this.next();
    this.timerId = setInterval(() => this.next(), this.intervalMs());
  }

  // ── TO'LIQ TO'XTATISH ─────────────────────────
  stop() {
    this.clearTimers();
    this.openWin?.close();
    this.openWin = null;
    this.openedInWindow.set(false);
    this.iframeUrl.set('');
    this.isRunning.set(false);
    this.isPaused.set(false);
    this.currentIndex.set(-1);
    this.countdown.set(0);
    this.results.update(list => list.map(r =>
      r.status === 'checking' ? { ...r, status: 'idle' } : r
    ));
  }

  private clearTimers() {
    clearInterval(this.timerId);
    clearInterval(this.countId);
    clearTimeout(this.doneTimer);
  }

  setIntervalMs(ms: number) {
    if (this.isRunning() && !this.isPaused()) return;
    this.intervalMs.set(ms);
  }

  ngOnDestroy() {
    this.stop();
  }
}
