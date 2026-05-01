// src/app/pages/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';
import { ScannerService } from '../../core/services/scanner.service';
import { WebsiteService } from '../../core/services/website.service';
import { AuthService } from '../../core/services/auth.service';
import { ScanResult, Website, CMS_COLORS, CATEGORY_META, SiteCategory } from '../../shared/models/website.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {

  // ── DI ────────────────────────────────────────
  private scanner        = inject(ScannerService);
  private websiteService = inject(WebsiteService);
  private fb             = inject(FormBuilder);
  private sanitizer      = inject(DomSanitizer);
  private router         = inject(Router);
  auth                   = inject(AuthService);

  // ── SIGNALS ───────────────────────────────────
  results         = signal<ScanResult[]>([]);
  loading         = signal(false);
  scanning        = signal<string | null>(null);
  scanningAll     = signal(false);
  showAddForm     = signal(false);
  addingWebsite   = signal(false);
  searchQuery     = signal('');
  filterCms       = signal('all');
  successMsg      = signal<string | null>(null);
  error           = signal<string | null>(null);
  editingWebsite  = signal<Website | null>(null);
  savingEdit      = signal(false);
  deletingId      = signal<string | null>(null);
  confirmDeleteId = signal<string | null>(null);

  // ── AUTO REFRESH SIGNALS ───────────────────────
  autoRefresh     = signal(false);
  refreshInterval = signal(60);
  countdown       = signal(0);
  showScheduler   = signal(false);

  private refreshSub?: Subscription;
  private countSub?:   Subscription;

  readonly INTERVAL_OPTIONS = [
    { label: '5 daqiqa',  value: 5    },
    { label: '15 daqiqa', value: 15   },
    { label: '30 daqiqa', value: 30   },
    { label: '1 soat',    value: 60   },
    { label: '6 soat',    value: 360  },
    { label: '12 soat',   value: 720  },
    { label: 'Har kuni',  value: 1440 },
  ];

  // ── PREVIEW SIGNALS ───────────────────────────
  previewSites  = signal<{ id: string; url: string; label?: string }[]>([]);
  previewNewUrl = signal('');

  // ── IFRAME RELOAD SIGNALS ─────────────────────
  iframeReloadMs  = signal(30000);
  iframeReloading = signal(false);
  iframeCountdown = signal(0);
  showIframeCfg   = signal(false);

  // Faqat bitta timer — countdown + reload birgalikda
  private iframeCountId?: ReturnType<typeof setInterval>;
  // Auto refresh timers
  private iframeTimerId?: ReturnType<typeof setInterval>;

  readonly IFRAME_RELOAD_OPTIONS = [
    { label: '10s',   value: 10000  },
    { label: '30s',   value: 30000  },
    { label: '1 min', value: 60000  },
    { label: '5 min', value: 300000 },
    { label: 'Off',   value: 0      },
  ];

  // ── COMPUTED ──────────────────────────────────
  filteredResults = computed(() => {
    let list = this.results();
    const q   = this.searchQuery().toLowerCase();
    const cms = this.filterCms();
    if (q) list = list.filter(r =>
      r.website?.url.toLowerCase().includes(q) ||
      r.website?.label?.toLowerCase().includes(q) ||
      r.cms?.toLowerCase().includes(q)
    );
    if (cms !== 'all') list = list.filter(r => (r.cms ?? 'unknown') === cms);
    return list;
  });

  stats = computed(() => {
    const r = this.results();
    const cms: Record<string, number> = {};
    r.forEach(s => { const k = s.cms ?? 'unknown'; cms[k] = (cms[k] || 0) + 1; });
    return {
      total:    r.length,
      detected: r.filter(s => s.cms).length,
      unknown:  r.filter(s => !s.cms).length,
      cms,
    };
  });

  cmsTypes = computed(() => Object.keys(this.stats().cms));

  // ── FORMALAR ──────────────────────────────────
  addForm = this.fb.group({
    url:   ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    label: [''],
  });

  editForm = this.fb.group({
    url:   ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    label: [''],
  });

  // ── LIFECYCLE ─────────────────────────────────
  ngOnInit() {
    this.loadResults();
    this.scanner.getInterval().subscribe(r => this.refreshInterval.set(r.interval));
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
    this.stopIframeReload();
  }

  // ── LOAD ──────────────────────────────────────
  loadResults() {
    this.loading.set(true);
    this.scanner.getLatestResults().subscribe({
      next:  data => { this.results.set(data); this.loading.set(false); },
      error: ()   => { this.error.set("Serverga ulanib bo'lmadi"); this.loading.set(false); },
    });
  }

  // ── SCAN ──────────────────────────────────────
  scanAll() {
    this.scanningAll.set(true);
    this.scanner.scanAll().subscribe({
      next:  () => { this.loadResults(); this.scanningAll.set(false); this.showSuccess('Barcha saytlar skanerlandi!'); },
      error: () => this.scanningAll.set(false),
    });
  }

  scanOne(result: ScanResult) {
    if (!result.website) return;
    this.scanning.set(result.websiteId);
    this.scanner.scanOne(result.websiteId, result.website.url).subscribe({
      next:  () => { this.scanning.set(null); this.loadResults(); this.showSuccess('Skaner tugadi!'); },
      error: () => this.scanning.set(null),
    });
  }

  // ── ADD ───────────────────────────────────────
  submitAddForm() {
    if (this.addForm.invalid) return;
    this.addingWebsite.set(true);
    const { url, label } = this.addForm.value;
    this.websiteService.create({ url: url!, label: label || undefined }).subscribe({
      next: website => {
        this.scanner.scanOne(website.id, website.url).subscribe({
          next:  () => { this.addForm.reset(); this.showAddForm.set(false); this.addingWebsite.set(false); this.loadResults(); this.showSuccess("Sayt qo'shildi va skanerlandi!"); },
          error: () => { this.addingWebsite.set(false); this.loadResults(); },
        });
      },
      error: err => { this.addingWebsite.set(false); this.error.set('Xato: ' + (err?.error?.message || "Sayt qo'shilmadi")); },
    });
  }

  // ── EDIT ──────────────────────────────────────
  openEdit(result: ScanResult) {
    if (!result.website) return;
    this.editingWebsite.set(result.website);
    this.editForm.patchValue({ url: result.website.url, label: result.website.label || '' });
    this.showAddForm.set(false);
    this.confirmDeleteId.set(null);
  }

  closeEdit() {
    this.editingWebsite.set(null);
    this.editForm.reset();
  }

  submitEditForm() {
    if (this.editForm.invalid || !this.editingWebsite()) return;
    this.savingEdit.set(true);
    const { url, label } = this.editForm.value;
    const id = this.editingWebsite()!.id;
    this.websiteService.update(id, { url: url!, label: label || undefined }).subscribe({
      next:  () => { this.savingEdit.set(false); this.closeEdit(); this.loadResults(); this.showSuccess("Sayt ma'lumotlari yangilandi!"); },
      error: err => { this.savingEdit.set(false); this.error.set('Tahrirlashda xato: ' + (err?.error?.message || '')); },
    });
  }

  // ── DELETE ────────────────────────────────────
  askDelete(result: ScanResult) {
    this.confirmDeleteId.set(result.websiteId);
    this.editingWebsite.set(null);
  }

  cancelDelete() { this.confirmDeleteId.set(null); }

  confirmDelete() {
    const id = this.confirmDeleteId();
    if (!id) return;
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.websiteService.delete(id).subscribe({
      next:  () => { this.results.update(list => list.filter(r => r.websiteId !== id)); this.deletingId.set(null); this.showSuccess("Sayt o'chirildi!"); },
      error: err => { this.deletingId.set(null); this.error.set("O'chirishda xato: " + (err?.error?.message || '')); },
    });
  }

  // ── AUTO REFRESH ──────────────────────────────
  toggleAutoRefresh() {
    if (this.autoRefresh()) this.stopAutoRefresh();
    else {
      this.scanner.setInterval(this.refreshInterval()).subscribe();
      this.startAutoRefresh();
    }
  }

  private startAutoRefresh() {
    this.autoRefresh.set(true);
    const ms = this.refreshInterval() * 60 * 1000;
    this.countdown.set(this.refreshInterval() * 60);

    this.countSub = interval(1000).subscribe(() => {
      this.countdown.update(n => (n > 0 ? n - 1 : 0));
    });

    this.refreshSub = interval(ms).subscribe(() => {
      this.loadResults();
      this.countdown.set(this.refreshInterval() * 60);
    });
  }

  private stopAutoRefresh() {
    this.autoRefresh.set(false);
    this.refreshSub?.unsubscribe();
    this.countSub?.unsubscribe();
    this.countdown.set(0);
  }

  setRefreshInterval(minutes: number) {
    this.refreshInterval.set(minutes);
    this.scanner.setInterval(minutes).subscribe({
      next: () => this.showSuccess(`Interval ${minutes} daqiqaga o'rnatildi`),
      error: () => {},
    });
    if (this.autoRefresh()) { this.stopAutoRefresh(); this.startAutoRefresh(); }
  }

  formatCountdown(seconds: number): string {
    if (seconds === 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getIntervalLabel(): string {
    return this.INTERVAL_OPTIONS.find(o => o.value === this.refreshInterval())?.label || '';
  }

  // ── PREVIEW SITES ─────────────────────────────
  addPreviewSite() {
    const url = this.previewNewUrl().trim();
    if (!url) return;
    const full = url.startsWith('http') ? url : 'https://' + url;
    if (this.previewSites().some(s => s.url === full)) return;
    this.previewSites.update(list => [...list, { id: Date.now().toString(), url: full }]);
    this.previewNewUrl.set('');
  }

  removePreviewSite(id: string) {
    this.previewSites.update(list => list.filter(s => s.id !== id));
  }

  // ── IFRAME RELOAD ─────────────────────────────
  private iframeCounter = 0;  // signal emas — oddiy variable

  startIframeReload() {
    this.stopIframeReload();
    const ms = this.iframeReloadMs();
    if (!ms) return;

    this.iframeReloading.set(true);
    const totalSec = Math.floor(ms / 1000);
    this.iframeCounter = totalSec;
    this.iframeCountdown.set(totalSec);

    // Har soniyada faqat countdown kamayadi
    this.iframeCountId = setInterval(() => {
      this.iframeCounter--;
      this.iframeCountdown.set(this.iframeCounter);

      // Vaqt tugaganda — reload va qayta boshlash
      if (this.iframeCounter <= 0) {
        this.reloadIframes();
        this.iframeCounter = totalSec;
        this.iframeCountdown.set(totalSec);
      }
    }, 1000);
  }

  private reloadIframes() {
    document.querySelectorAll<HTMLIFrameElement>('.preview-iframe').forEach(f => {
      const src = f.src;
      f.src = '';
      setTimeout(() => { f.src = src; }, 200);
    });
  }

  stopIframeReload() {
    clearInterval(this.iframeCountId);
    clearInterval(this.iframeTimerId);
    this.iframeCounter = 0;
    this.iframeReloading.set(false);
    this.iframeCountdown.set(0);
  }

  setIframeReloadMs(ms: number) {
    this.iframeReloadMs.set(ms);
    if (ms === 0) this.stopIframeReload();
    else if (this.iframeReloading()) this.startIframeReload();
  }

  formatIframeCountdown(): string {
    const s = this.iframeCountdown();
    if (s === 0) return '--';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  getIframeLabel(): string {
    return this.IFRAME_RELOAD_OPTIONS.find(o => o.value === this.iframeReloadMs())?.label || '--';
  }

  // ── AUTH ──────────────────────────────────────
  logout() { this.auth.logout(); }

  // ── HELPERS ───────────────────────────────────
  clearError() { this.error.set(null); }

  openUrl(url?: string | null) {
    if (url) window.open(url, '_blank');
  }

  safeUrl(url: string | null | undefined) {
    if (!url) return '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getCmsColor(cms: string | null): string {
    return CMS_COLORS[cms ?? 'unknown'] ?? '#6b6c80';
  }

  getCategoryColor(category: string | null): string {
    return CATEGORY_META[category as SiteCategory]?.color ?? '#6b6c80';
  }

  getCategoryIcon(category: string | null): string {
    return CATEGORY_META[category as SiteCategory]?.icon ?? '?';
  }

  openDetail(result: ScanResult) {
    this.router.navigate(['/site', result.websiteId], { state: { result } });
  }

  stripProtocol(url: string | undefined | null): string {
    return (url ?? '').replace(/^https?:\/\//, '');
  }

  getHttpStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'http-ok';
    if (status >= 300 && status < 400) return 'http-redirect';
    if (status >= 400 && status < 500) return 'http-client-error';
    return 'http-server-error';
  }

  getConfidenceClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  getSiteStatus(result: ScanResult): 'error' | 'unknown' | 'high' | 'mid' | 'low' {
    if (result.errorMessage) return 'error';
    if (!result.cms)         return 'unknown';
    if (result.confidence >= 80) return 'high';
    if (result.confidence >= 50) return 'mid';
    return 'low';
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}