// src/app/pages/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { interval, timer, Subscription } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';
import { ScannerService, BulkScanJob, BulkScanMode } from '../../core/services/scanner.service';
import { WebsiteService } from '../../core/services/website.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService, Theme } from '../../core/services/theme.service';
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
  themeService           = inject(ThemeService);

  // ── SIGNALS ───────────────────────────────────
  results         = signal<ScanResult[]>([]);
  loading         = signal(false);
  scanning        = signal<string | null>(null);
  bulkJob         = signal<BulkScanJob | null>(null);
  bulkLoading     = signal(false);
  bulkCancelling  = signal(false);
  bulkMode        = signal<BulkScanMode>('FAST');
  bulkConcurrency = signal(16);
  bulkTimeoutMs   = signal(5000);
  bulkSkipRecent  = signal(true);
  bulkAccordionOpen = signal(false);
  showAddForm     = signal(false);
  addingWebsite   = signal(false);
  searchQuery     = signal('');
  filterCms       = signal('all');
  controlsOpen    = signal(false);
  sortBy          = signal<'confidence' | 'date' | 'url'>('confidence');
  successMsg      = signal<string | null>(null);
  error           = signal<string | null>(null);
  editingWebsite  = signal<Website | null>(null);
  savingEdit      = signal(false);
  deletingId      = signal<string | null>(null);
  confirmDeleteId = signal<string | null>(null);

  // ── ALERTS ────────────────────────────────────
  alertCount = signal(0);

  // ── SIDEBAR ───────────────────────────────────
  sidebarCollapsed = signal(false);

  // ── AUTO REFRESH SIGNALS ───────────────────────
  autoRefresh     = signal(false);
  refreshInterval = signal(360);
  countdown       = signal(0);
  showScheduler   = signal(false);
  viewMode        = signal<'grid' | 'table'>('grid');

  private refreshSub?: Subscription;
  private countSub?:   Subscription;
  private pollSub?:    Subscription;
  private badgeRefreshSub?: Subscription;
  private bulkPollSub?: Subscription;

  readonly INTERVAL_OPTIONS = [
    { label: '15 daqiqa', value: 15,   dangerous: true  },
    { label: '30 daqiqa', value: 30,   dangerous: true  },
    { label: '1 soat',    value: 60,   dangerous: true  },
    { label: '6 soat',    value: 360,  dangerous: false },
    { label: '12 soat',   value: 720,  dangerous: false },
    { label: 'Har kuni',  value: 1440, dangerous: false },
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
    let list = [...this.results()];
    const q   = this.searchQuery().toLowerCase();
    const cms = this.filterCms();
    const sort = this.sortBy();

    if (q) list = list.filter(r =>
      r.website?.url.toLowerCase().includes(q) ||
      r.website?.label?.toLowerCase().includes(q) ||
      r.cms?.toLowerCase().includes(q)
    );
    if (cms === 'no-cms')   list = list.filter(r => !r.cms);
    else if (cms !== 'all') list = list.filter(r => (r.cms ?? 'unknown') === cms);

    if (sort === 'confidence') list.sort((a, b) => b.confidence - a.confidence);
    else if (sort === 'date')  list.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
    else if (sort === 'url')   list.sort((a, b) => (a.website?.url ?? '').localeCompare(b.website?.url ?? ''));

    return list;
  });

  stats = computed(() => {
    const r = this.results();
    const cms: Record<string, number> = {};
    r.filter(s => s.cms).forEach(s => { const k = s.cms!; cms[k] = (cms[k] || 0) + 1; });
    return {
      total:    r.length,
      detected: r.filter(s => s.cms).length,
      unknown:  r.filter(s => !s.cms).length,
      cms,
    };
  });

  cmsTypes = computed(() =>
    Object.entries(this.stats().cms)
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0])
  );

  dashboardMetrics = computed(() => {
    const rows = this.results();
    const total = rows.length;
    const detected = rows.filter(r => !!r.cms).length;
    const unknown = rows.filter(r => !r.cms && !r.errorMessage).length;
    const offline = rows.filter(r => !!r.errorMessage || (r.httpStatus ?? 0) >= 500).length;
    const httpProblem = rows.filter(r => (r.httpStatus ?? 0) >= 400).length;
    const unhealthy = rows.filter(r => !!r.errorMessage || (r.httpStatus ?? 0) >= 400).length;
    const highConfidence = rows.filter(r => !!r.cms && r.confidence >= 80).length;
    const lowConfidence = rows.filter(r => !!r.cms && r.confidence > 0 && r.confidence < 50).length;
    const cveScanned = rows.filter(r => !!r.website?.cveScannedAt).length;
    const cveFindings = rows.reduce((sum, r) => sum + (r.website?.cveFindingsCount ?? 0), 0);
    const subdomainScanned = rows.filter(r => !!r.website?.subdomainsScannedAt).length;
    const timestamps = rows
      .map(r => new Date(r.scannedAt).getTime())
      .filter(t => Number.isFinite(t));
    const latestScan = timestamps.length ? Math.max(...timestamps) : null;
    const staleAfterMs = 6 * 60 * 60 * 1000;
    const staleScans = timestamps.length
      ? rows.filter(r => Date.now() - new Date(r.scannedAt).getTime() > staleAfterMs).length
      : 0;
    const avgConfidence = detected
      ? Math.round(rows.filter(r => !!r.cms).reduce((sum, r) => sum + r.confidence, 0) / detected)
      : 0;

    return {
      total,
      detected,
      unknown,
      offline,
      httpProblem,
      highConfidence,
      lowConfidence,
      cveScanned,
      cveFindings,
      subdomainScanned,
      latestScan,
      staleScans,
      avgConfidence,
      coveragePct: total ? Math.round((detected / total) * 100) : 0,
      healthPct: total ? Math.max(0, Math.round(((total - unhealthy) / total) * 100)) : 0,
      cveCoveragePct: total ? Math.round((cveScanned / total) * 100) : 0,
      subdomainCoveragePct: total ? Math.round((subdomainScanned / total) * 100) : 0,
    };
  });

  topCmsSummary = computed(() => {
    const total = this.dashboardMetrics().total || 1;
    return Object.entries(this.stats().cms)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));
  });

  categorySummary = computed(() => {
    const total = this.dashboardMetrics().total || 1;
    const counts: Record<string, number> = {};
    for (const row of this.results()) {
      const key = row.category || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));
  });

  attentionSites = computed(() =>
    this.results()
      .filter(r =>
        !!r.errorMessage ||
        (r.httpStatus ?? 0) >= 400 ||
        !r.cms ||
        (!!r.cms && r.confidence < 50)
      )
      .sort((a, b) => this.attentionWeight(b) - this.attentionWeight(a))
      .slice(0, 5)
  );

  bulkRunning = computed(() => this.isBulkStatusRunning(this.bulkJob()?.status));

  bulkDone = computed(() => {
    const job = this.bulkJob();
    return job ? job.completed + job.failed + job.skipped : 0;
  });

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
    this.scanner.getInterval().subscribe(r => {
      this.refreshInterval.set(r.interval);
      this.startBackgroundPoll();
      if (this.scanner.autoRefreshEnabled) this.startAutoRefresh();
    });
    this.scanner.getAlertCount().subscribe({ next: r => this.alertCount.set(r.count), error: () => {} });
    this.badgeRefreshSub = this.scanner.scanBadgeRefresh$.subscribe(() => this.loadResults());
    this.loadBulkJob();
  }

  ngOnDestroy() {
    // Faqat RxJS unsub — visual state service'da saqlanadi
    this.refreshSub?.unsubscribe();
    this.countSub?.unsubscribe();
    this.pollSub?.unsubscribe();
    this.badgeRefreshSub?.unsubscribe();
    this.bulkPollSub?.unsubscribe();
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
    this.startBulkScan();
  }

  scanOne(result: ScanResult) {
    if (!result.website) return;
    this.scanning.set(result.websiteId);
    this.scanner.scanOne(result.websiteId, result.website.url).subscribe({
      next:  () => { this.scanning.set(null); this.loadResults(); this.showSuccess('Skaner tugadi!'); },
      error: () => this.scanning.set(null),
    });
  }

  // ── BULK SCAN ─────────────────────────────────
  loadBulkJob() {
    this.scanner.getCurrentBulkScan().subscribe({
      next: job => {
        this.bulkJob.set(job);
        if (this.isBulkStatusRunning(job?.status)) {
          this.bulkAccordionOpen.set(true);
          this.startBulkPolling();
        }
      },
      error: () => {},
    });
  }

  startBulkScan() {
    if (this.bulkRunning()) return;
    this.bulkLoading.set(true);
    this.scanner.startBulkScan({
      mode: this.bulkMode(),
      concurrency: this.bulkConcurrency(),
      timeoutMs: this.bulkTimeoutMs(),
      includeRecentlyScanned: !this.bulkSkipRecent(),
      skipRecentHours: 6,
    }).subscribe({
      next: job => {
        this.bulkJob.set(job);
        this.bulkLoading.set(false);
        this.bulkAccordionOpen.set(true);
        this.startBulkPolling();
        this.showSuccess('Bulk skan boshlandi');
      },
      error: err => {
        this.bulkLoading.set(false);
        this.error.set(err?.error?.message || 'Bulk skan boshlanmadi');
      },
    });
  }

  cancelBulkScan() {
    const job = this.bulkJob();
    if (!job) return;
    this.bulkCancelling.set(true);
    this.scanner.cancelBulkScan(job.id).subscribe({
      next: updated => {
        this.bulkJob.set(updated);
        this.bulkCancelling.set(false);
      },
      error: () => this.bulkCancelling.set(false),
    });
  }

  setBulkMode(mode: BulkScanMode) {
    this.bulkMode.set(mode);
    this.bulkConcurrency.set(mode === 'FAST' ? 16 : 4);
    this.bulkTimeoutMs.set(mode === 'FAST' ? 5000 : 20000);
  }

  updateBulkConcurrency(value: string) {
    const max = this.bulkMode() === 'FAST' ? 50 : 10;
    this.bulkConcurrency.set(Math.min(max, Math.max(1, Math.round(Number(value) || 1))));
  }

  updateBulkTimeout(value: string) {
    const mode = this.bulkMode();
    const min = mode === 'FAST' ? 2000 : 5000;
    const max = mode === 'FAST' ? 15000 : 30000;
    this.bulkTimeoutMs.set(Math.min(max, Math.max(min, Math.round(Number(value) || min))));
  }

  private startBulkPolling() {
    if (this.bulkPollSub) return;
    this.bulkPollSub = timer(0, 2500).subscribe(() => {
      this.scanner.getCurrentBulkScan().subscribe({
        next: job => {
          const wasRunning = this.bulkRunning();
          this.bulkJob.set(job);
          const runningNow = this.isBulkStatusRunning(job?.status);
          if (wasRunning && !runningNow) {
            this.stopBulkPolling();
            this.loadResults();
          }
        },
        error: () => {},
      });
    });
  }

  private stopBulkPolling() {
    this.bulkPollSub?.unsubscribe();
    this.bulkPollSub = undefined;
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
    this.scanner.autoRefreshEnabled = true;
    this.autoRefresh.set(true);
    const ms = this.refreshInterval() * 60 * 1000;

    const now = Date.now();
    const remainingMs = this.scanner.nextPollAt > now ? this.scanner.nextPollAt - now : ms;
    this.countdown.set(Math.ceil(remainingMs / 1000));

    this.countSub = interval(1000).subscribe(() => {
      this.countdown.update(n => (n > 0 ? n - 1 : 0));
    });

    this.refreshSub = timer(remainingMs, ms).subscribe(() => {
      this.scanner.nextPollAt = Date.now() + ms;
      this.loadResults();
      this.countdown.set(this.refreshInterval() * 60);
    });
  }

  private stopAutoRefresh() {
    this.scanner.autoRefreshEnabled = false;
    this.autoRefresh.set(false);
    this.refreshSub?.unsubscribe();
    this.countSub?.unsubscribe();
    this.countdown.set(0);
  }

  setRefreshInterval(minutes: number) {
    this.refreshInterval.set(minutes);
    this.scanner.setInterval(minutes).subscribe({
      next: () => {
        if (this.isDangerousInterval(minutes)) {
          this.error.set("6 soatdan kam auto scan interval xavfli: saytlar bloklashi yoki server zo'riqishi mumkin");
        } else {
          this.showSuccess(`Interval ${minutes} daqiqaga o'rnatildi`);
        }
      },
      error: () => {},
    });
    this.scanner.nextPollAt = 0; // Eski interval qoldig'ini tozala
    this.startBackgroundPoll();
    if (this.autoRefresh()) { this.stopAutoRefresh(); this.startAutoRefresh(); }
  }

  private startBackgroundPoll() {
    this.pollSub?.unsubscribe();
    const ms = this.refreshInterval() * 60 * 1000;
    this.scanner.pollIntervalMs = ms;

    const now = Date.now();
    const delay = this.scanner.nextPollAt > now ? this.scanner.nextPollAt - now : ms;
    if (this.scanner.nextPollAt <= now) {
      this.scanner.nextPollAt = now + ms;
    }

    this.pollSub = timer(delay, ms).subscribe(() => {
      this.scanner.nextPollAt = Date.now() + ms;
      this.loadResults();
      this.scanner.getAlertCount().subscribe({ next: r => this.alertCount.set(r.count), error: () => {} });
    });
  }

  formatCountdown(seconds: number): string {
    if (seconds === 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  isBulkStatusRunning(status: string | undefined): boolean {
    return status === 'PENDING' || status === 'RUNNING';
  }

  bulkStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'PENDING': return 'Kutilmoqda';
      case 'RUNNING': return 'Ishlayapti';
      case 'COMPLETED': return 'Tugadi';
      case 'CANCELLED': return 'Bekor qilingan';
      case 'FAILED': return 'Xato';
      default: return 'Boshlanmagan';
    }
  }

  bulkModeLabel(mode: BulkScanMode | undefined): string {
    return mode === 'FULL' ? 'FULL' : 'FAST';
  }

  formatRelativeTime(value: number | string | null | undefined): string {
    if (!value) return 'hali yoq';
    const time = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(time)) return 'hali yoq';
    const diff = Math.max(0, Date.now() - time);
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'hozir';
    if (minutes < 60) return `${minutes} daqiqa oldin`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat oldin`;
    const days = Math.floor(hours / 24);
    return `${days} kun oldin`;
  }

  getAttentionLabel(result: ScanResult): string {
    if (result.errorMessage) return 'Offline';
    if ((result.httpStatus ?? 0) >= 500) return 'Server xato';
    if ((result.httpStatus ?? 0) >= 400) return 'HTTP xato';
    if (!result.cms) return 'CMS topilmadi';
    if (result.confidence < 50) return 'Past ishonch';
    return 'Tekshiruv';
  }

  getAttentionClass(result: ScanResult): string {
    if (result.errorMessage || (result.httpStatus ?? 0) >= 500) return 'critical';
    if ((result.httpStatus ?? 0) >= 400 || !result.cms) return 'warning';
    return 'notice';
  }

  getIntervalLabel(): string {
    return this.INTERVAL_OPTIONS.find(o => o.value === this.refreshInterval())?.label || '';
  }

  isDangerousInterval(minutes: number): boolean {
    return minutes < 360;
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

  // ── EXPORT ────────────────────────────────────
  exportCsv() {
    this.scanner.exportCsv().subscribe(csv => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cms-scan-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

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

  getCardAccentColor(result: ScanResult): string {
    if (result.errorMessage) return '#ef4444';
    if (result.httpStatus !== null && result.httpStatus !== undefined) {
      if (result.httpStatus >= 500) return '#ef4444';
      if (result.httpStatus >= 400) return '#f97316';
    }
    return 'transparent';
  }

  hasCveFindings(result: ScanResult): boolean {
    return (result.website?.cveFindingsCount ?? 0) > 0;
  }

  cveBadgeTitle(result: ScanResult): string {
    const count = result.website?.cveFindingsCount ?? 0;
    return count > 0
      ? `${count} ta CVE topilgan`
      : 'CVE scan qilingan, CVE topilmadi';
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }

  private attentionWeight(result: ScanResult): number {
    if (result.errorMessage) return 100;
    if ((result.httpStatus ?? 0) >= 500) return 90;
    if ((result.httpStatus ?? 0) >= 400) return 75;
    if (!result.cms) return 60;
    if (result.confidence < 50) return 45;
    return 0;
  }
}
