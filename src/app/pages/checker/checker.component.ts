// src/app/pages/checker/checker.component.ts
import { Component, signal, computed, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SafeUrlPipe } from '../../shared/pipes/safe-url.pipe';
import { ScannerService } from '../../core/services/scanner.service';
import { UrlCheckerSiteService } from '../../core/services/url-checker-site.service';
import { UrlCheckerSite } from '../../shared/models/website.model';

interface CheckSite {
  id: string;
  url: string;
  label?: string;
  forceWindow?: boolean;
}

type SiteStatus = 'idle' | 'checking' | 'done' | 'error';

interface SiteResult {
  id: string;
  url: string;
  label?: string;
  status: SiteStatus;
  elapsed?: number;  // ms
}

@Component({
  selector: 'app-checker',
  standalone: true,
  imports: [CommonModule, RouterLink, SafeUrlPipe],
  templateUrl: './checker.component.html',
  styleUrls: ['./checker.component.scss'],
})
export class CheckerComponent implements OnInit, OnDestroy {
  private scannerService = inject(ScannerService);
  private urlCheckerSites = inject(UrlCheckerSiteService);

  // ── SITES ─────────────────────────────────────
  sites = signal<CheckSite[]>([]);
  loadingSites = signal(true);
  sitesError = signal('');

  // ── URL QOSHISH ───────────────────────────────
  newUrl = signal('');
  newLabel = signal('');
  urlError = signal('');
  savingSite = signal(false);
  deletingSite = signal<string | null>(null);

  // ── URL TAHRIRLASH ────────────────────────────
  editingId = signal<string | null>(null);
  editUrl = signal('');
  editLabel = signal('');
  editError = signal('');

  // ── CHECKER STATE ─────────────────────────────
  results = signal<SiteResult[]>([]);
  isRunning = signal(false);
  isPaused = signal(false);
  currentIndex = signal(-1);
  intervalMs = signal(20000);   // ms — har sayt uchun vaqt
  countdown = signal(0);
  iframeUrl = signal<string>('');
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
    { label: '1 min', value: 60000 },
  ];

  ngOnInit() {
    void this.loadSites();
  }

  private async loadSites() {
    this.loadingSites.set(true);
    this.sitesError.set('');

    try {
      const sites = await firstValueFrom(this.urlCheckerSites.getAll());
      this.sites.set(sites.map(site => this.toCheckSite(site)));
    } catch (err: any) {
      this.sitesError.set(err?.error?.message || "Saytlar ro'yxati yuklanmadi");
    } finally {
      this.loadingSites.set(false);
    }
  }

  // ── SAYT QO'SHISH ─────────────────────────────
  async addSite() {
    if (this.isRunning() || this.savingSite()) return;

    const url = this.normalizeUrlInput(this.newUrl());
    if (!url) { this.urlError.set("URL noto'g'ri. Masalan: example.uz yoki https://example.uz"); return; }
    if (this.isDuplicateUrl(url)) { this.urlError.set('Bu URL allaqachon bor'); return; }

    this.urlError.set('');
    this.sitesError.set('');
    this.savingSite.set(true);

    try {
      const label = this.newLabel().trim();
      const saved = await firstValueFrom(this.urlCheckerSites.create({
        url,
        label: label || undefined,
      }));
      const checkSite = this.toCheckSite(saved);
      this.sites.update(list => [checkSite, ...list]);
      if (this.results().length) {
        this.results.update(list => [{ id: checkSite.id, url: checkSite.url, label: checkSite.label, status: 'idle' }, ...list]);
      }
      this.newUrl.set('');
      this.newLabel.set('');
    } catch (err: any) {
      this.urlError.set(err?.error?.message || "Sayt DBga saqlanmadi");
    } finally {
      this.savingSite.set(false);
    }
  }

  startEdit(site: CheckSite) {
    if (this.isRunning() || this.deletingSite()) return;
    this.editingId.set(site.id);
    this.editUrl.set(site.url);
    this.editLabel.set(site.label || '');
    this.editError.set('');
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editUrl.set('');
    this.editLabel.set('');
    this.editError.set('');
  }

  async saveEdit(site: CheckSite) {
    if (this.isRunning() || this.savingSite()) return;

    const url = this.normalizeUrlInput(this.editUrl());
    if (!url) { this.editError.set("URL noto'g'ri. Masalan: example.uz yoki https://example.uz"); return; }
    if (this.isDuplicateUrl(url, site.id)) { this.editError.set('Bu URL allaqachon bor'); return; }

    this.editError.set('');
    this.sitesError.set('');
    this.savingSite.set(true);

    try {
      const label = this.editLabel().trim();
      const saved = await firstValueFrom(this.urlCheckerSites.update(site.id, {
        url,
        label: label || null,
      }));
      const checkSite = this.toCheckSite(saved);
      this.sites.update(list => list.map(row => row.id === site.id ? checkSite : row));
      this.results.update(list => list.map(row => row.id === site.id
        ? { ...row, url: checkSite.url, label: checkSite.label }
        : row
      ));
      this.cancelEdit();
    } catch (err: any) {
      this.editError.set(err?.error?.message || "Sayt ma'lumotlari yangilanmadi");
    } finally {
      this.savingSite.set(false);
    }
  }

  async removeSite(id: string) {
    if (this.isRunning() || this.deletingSite()) return;

    this.sitesError.set('');
    this.deletingSite.set(id);
    try {
      await firstValueFrom(this.urlCheckerSites.delete(id));
      this.sites.update(list => list.filter(s => s.id !== id));
      this.results.update(list => list.filter(s => s.id !== id));
      if (this.editingId() === id) this.cancelEdit();
    } catch (err: any) {
      this.sitesError.set(err?.error?.message || "Sayt o'chirilmadi");
    } finally {
      this.deletingSite.set(null);
    }
  }

  // ── ISHGA TUSHIRISH ───────────────────────────
  start() {
    if (this.isRunning() && !this.isPaused()) return;
    if (this.loadingSites()) return;
    if (!this.sites().length) return;
    this.cancelEdit();

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

    let canEmbed = !site.forceWindow;
    if (canEmbed) {
      try {
        const res = await firstValueFrom(this.scannerService.checkCanEmbed(site.url));
        canEmbed = res.canEmbed;
      } catch { canEmbed = false; }
    }

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

  private toCheckSite(site: UrlCheckerSite): CheckSite {
    return {
      id: site.id,
      url: site.url,
      label: site.label || undefined,
      forceWindow: this.shouldForceWindow(site.url),
    };
  }

  private shouldForceWindow(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '') === 'gov.uz';
    } catch {
      return false;
    }
  }

  private normalizeUrlInput(value: string): string | null {
    const text = value.trim();
    if (!text) return null;

    const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    try {
      const url = new URL(withProtocol);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      if (!url.hostname.includes('.')) return null;
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }

  private isDuplicateUrl(url: string, excludeId?: string) {
    const key = this.urlKey(url);
    return this.sites().some(site => site.id !== excludeId && this.urlKey(site.url) === key);
  }

  private urlKey(url: string) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/$/, '');
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${parsed.search}`;
    } catch {
      return url.trim().toLowerCase().replace(/\/$/, '');
    }
  }

  ngOnDestroy() {
    this.stop();
  }
}
