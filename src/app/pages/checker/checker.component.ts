// src/app/pages/checker/checker.component.ts
import { Component, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { SafeUrlPipe } from '../../shared/pipes/safe-url.pipe';

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
  private fb = new (class { group = (v: any) => ({ value: v, invalid: false, reset: () => {}, get: (k: string) => ({ invalid: false, touched: false }) }) })();

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
  results       = signal<SiteResult[]>([]);
  isRunning     = signal(false);
  currentIndex  = signal(-1);
  intervalMs    = signal(20000);   // ms — har sayt uchun vaqt
  countdown     = signal(0);
  iframeUrl     = signal<string>('');

  private timerId?: ReturnType<typeof setInterval>;
  private countId?: ReturnType<typeof setInterval>;

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
    if (this.isRunning() || !this.sites().length) return;
    this.isRunning.set(true);
    this.currentIndex.set(-1);

    // Natijalarni boshlang'ich holga keltiramiz
    this.results.set(this.sites().map(s => ({
      id: s.id, url: s.url, label: s.label, status: 'idle',
    })));

    this.next();
    this.timerId = setInterval(() => this.next(), this.intervalMs());
  }

  private next() {
    const idx = this.currentIndex() + 1;

    if (idx >= this.sites().length) {
      this.stop();
      return;
    }

    this.currentIndex.set(idx);
    const site = this.sites()[idx];

    // Natijani yangilaymiz
    this.results.update(list => list.map(r =>
      r.id === site.id ? { ...r, status: 'checking' } : r
    ));

    // Countdown
    this.countdown.set(Math.floor(this.intervalMs() / 1000));
    clearInterval(this.countId);
    this.countId = setInterval(() => {
      this.countdown.update(n => (n > 0 ? n - 1 : 0));
    }, 1000);

    // Iframe da ko'rsatamiz
    const start = Date.now();
    this.iframeUrl.set(site.url);
    setTimeout(() => {
      const elapsed = Date.now() - start;
      this.results.update(list => list.map(r =>
        r.id === site.id ? { ...r, status: 'done', elapsed } : r
      ));
    }, this.intervalMs() - 2000);
  }

  // ── TO'XTATISH ────────────────────────────────
  stop() {
    clearInterval(this.timerId);
    clearInterval(this.countId);
    this.isRunning.set(false);
    this.currentIndex.set(-1);
    this.countdown.set(0);

    // Tugamagan natijalarni reset
    this.results.update(list => list.map(r =>
      r.status === 'checking' ? { ...r, status: 'idle' } : r
    ));
  }

  setIntervalMs(ms: number) {
    if (this.isRunning()) return;
    this.intervalMs.set(ms);
  }

  ngOnDestroy() {
    this.stop();
  }
}
