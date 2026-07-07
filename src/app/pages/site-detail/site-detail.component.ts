// src/app/pages/site-detail/site-detail.component.ts
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SafeUrlPipe } from '../../shared/pipes/safe-url.pipe';
import { firstValueFrom } from 'rxjs';
import { ScannerService, WhoisData, SiteInfoData, NucleiResult, SubdomainResult, PortScanResult } from '../../core/services/scanner.service';
import { TasksService } from '../../core/services/tasks.service';
import { ScanResult, CMS_COLORS, CATEGORY_META, SiteCategory, DetectionEvidence } from '../../shared/models/website.model';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

export interface DiscoveredSub {
  subdomain: string;
  alive: boolean;
  source: string[];
  statusCode?: number;
  title?: string;
  cached?: boolean;
  discoveredAt?: string;
  inDb: ScanResult | null;
}

type SubdomainPageSize = 5 | 10 | 50 | 'all';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, SafeUrlPipe, SideNavComponent],
  templateUrl: './site-detail.component.html',
  styleUrls: ['./site-detail.component.scss'],
})
export class SiteDetailComponent implements OnInit {
  private router  = inject(Router);
  private route   = inject(ActivatedRoute);
  private scanner = inject(ScannerService);
  private tasks   = inject(TasksService);

  result     = signal<ScanResult | null>(null);
  subdomains = signal<ScanResult[]>([]);   // already in DB
  loading    = signal(true);

  whois        = signal<WhoisData | null>(null);
  whoisLoading = signal(false);
  whoisError   = signal(false);

  siteInfo        = signal<SiteInfoData | null>(null);
  siteInfoLoading = signal(false);
  siteInfoError   = signal(false);

  private _fetchUrl       = '';
  private _fetchWebsiteId = '';

  canEmbed = signal<boolean | null>(null);

  // Port scanner
  portResults = signal<PortScanResult[]>([]);
  portRunning = signal(false);
  portError   = signal('');
  portTaskLoading = signal<string | null>(null);
  portTaskSuccess = signal<string | null>(null);
  portInput = signal('21,22,25,53,80,443,445,3306,3389,5432,6379,8000,8080,8443,9200,27017');
  openPorts = computed(() => this.portResults().filter(p => p.status === 'OPEN'));

  // Subdomain discovery state is kept in ScannerService so it survives navigation.
  private subdomainTargetError = signal('');
  private subdomainState = computed(() => this.scanner.getSubdomainDiscoveryState(this.rootDomain()));
  discovered    = computed<DiscoveredSub[]>(() => this.mergeDiscovered(this.subdomainState().results));
  discovering   = computed(() => this.subdomainState().running);
  discoverError = computed(() => this.subdomainTargetError() || this.subdomainState().error);
  discoverDone  = computed(() => this.subdomainState().done);
  btnPulse      = signal(false);

  readonly subdomainPageSizeOptions: readonly SubdomainPageSize[] = [5, 10, 50, 'all'];

  aliveSubdomains = computed(() => this.discovered().filter(s => s.alive));
  deadSubdomains  = computed(() => this.discovered().filter(s => !s.alive));
  totalDiscovered = computed(() => this.discovered().length);

  alivePageSize = signal<SubdomainPageSize>(5);
  deadPageSize  = signal<SubdomainPageSize>(5);
  alivePage     = signal(1);
  deadPage      = signal(1);

  alivePageCount = computed(() => this.pageCount(this.aliveSubdomains().length, this.alivePageSize()));
  deadPageCount  = computed(() => this.pageCount(this.deadSubdomains().length, this.deadPageSize()));
  aliveDisplayPage = computed(() => this.clampPage(this.alivePage(), this.aliveSubdomains().length, this.alivePageSize()));
  deadDisplayPage  = computed(() => this.clampPage(this.deadPage(), this.deadSubdomains().length, this.deadPageSize()));
  aliveRangeStart = computed(() => this.rangeStart(this.aliveSubdomains().length, this.aliveDisplayPage(), this.alivePageSize()));
  aliveRangeEnd   = computed(() => this.rangeEnd(this.aliveSubdomains().length, this.aliveDisplayPage(), this.alivePageSize()));
  deadRangeStart  = computed(() => this.rangeStart(this.deadSubdomains().length, this.deadDisplayPage(), this.deadPageSize()));
  deadRangeEnd    = computed(() => this.rangeEnd(this.deadSubdomains().length, this.deadDisplayPage(), this.deadPageSize()));
  paginatedAliveSubdomains = computed(() => this.paginate(this.aliveSubdomains(), this.aliveDisplayPage(), this.alivePageSize()));
  paginatedDeadSubdomains  = computed(() => this.paginate(this.deadSubdomains(), this.deadDisplayPage(), this.deadPageSize()));

  // Nuclei CVE scan state is kept in ScannerService so it survives navigation.
  private nucleiState = computed(() => this.scanner.getNucleiScanState(this._fetchWebsiteId));
  private nucleiTargetError = signal('');
  nucleiResults = computed<NucleiResult[]>(() => this.nucleiState().results);
  nucleiRunning = computed(() => this.nucleiState().running);
  nucleiError   = computed(() => this.nucleiTargetError() || this.nucleiState().error);
  nucleiDone    = computed(() => this.nucleiState().done);

  /** Root domain of the current site (e.g. "gov.uz") */
  rootDomain = computed(() => {
    const url = this.result()?.website?.url;
    return url ? this.extractRootDomain(url) : '';
  });

  /** All scan results from DB keyed by hostname for fast lookup */
  private allResults: ScanResult[] = [];

  async ngOnInit() {
    const state =
      this.router.getCurrentNavigation()?.extras.state as { result?: ScanResult } | undefined
      ?? (history.state as { result?: ScanResult });

    let selectedResult = state?.result ?? null;
    let prefetchedResults: ScanResult[] | null = null;

    if (!selectedResult) {
      const websiteId = this.route.snapshot.paramMap.get('id');
      if (websiteId) {
        try {
          prefetchedResults = await firstValueFrom(this.scanner.getLatestResults());
          selectedResult = prefetchedResults.find(r => r.websiteId === websiteId) ?? null;
        } catch { /* ignore */ }
      }
    }

    if (!selectedResult) { this.router.navigate(['/sites']); return; }
    this.result.set(selectedResult);

    this._fetchUrl       = selectedResult.website?.url ?? '';
    this._fetchWebsiteId = selectedResult.websiteId;

    // Fetch WHOIS + site-info + canEmbed in parallel (fire-and-forget)
    this.fetchWhois(this._fetchUrl);
    this.fetchSiteInfo(this._fetchUrl, this._fetchWebsiteId);
    this.fetchCanEmbed(this._fetchUrl);
    this.loadPortResults();

    try {
      this.allResults = prefetchedResults ?? await firstValueFrom(this.scanner.getLatestResults());
      const root   = this.rootDomain();
      const selfId = selectedResult.websiteId;

      // Subdomains already in DB
      this.subdomains.set(
        this.allResults.filter(r => {
          if (r.websiteId === selfId) return false;
          const h = this.hostname(r.website?.url ?? '');
          return h === root || h.endsWith('.' + root);
        }),
      );
    } catch { /* ignore */ }
    finally { this.loading.set(false); }

    await this.loadCachedSubdomains();

    // Load saved nuclei results (fire-and-forget)
    try {
      const saved = await firstValueFrom(this.scanner.getNucleiResults(this._fetchWebsiteId));
      this.scanner.setCachedNucleiResults(
        this._fetchWebsiteId,
        saved,
        saved.length > 0 || !!selectedResult.website?.cveScannedAt,
      );
    } catch { /* ignore */ }
  }

  // ── Subdomain discovery ───────────────────────────────────────────────────
  private async loadCachedSubdomains() {
    const domain = this.rootDomain();
    if (!domain) return;

    try {
      const cached = await firstValueFrom(this.scanner.getCachedSubdomains(domain));
      this.scanner.setCachedSubdomainResults(
        domain,
        cached,
        cached.length > 0 || !!this.result()?.website?.subdomainsScannedAt,
      );
      this.resetSubdomainPages();
    } catch { /* ignore */ }
  }

  async discoverSubdomains() {
    const domain = this.rootDomain();
    if (this.discovering()) return;
    if (!domain) {
      this.subdomainTargetError.set('Domen topilmadi.');
      return;
    }

    // Button pulse animation
    this.btnPulse.set(true);
    setTimeout(() => this.btnPulse.set(false), 700);

    this.subdomainTargetError.set('');
    this.resetSubdomainPages();

    try {
      await this.scanner.startSubdomainDiscovery(domain, this._fetchWebsiteId);
      this.resetSubdomainPages();
    } catch { /* ScannerService keeps the visible error state */ }
  }

  private mergeDiscovered(raw: SubdomainResult[]): DiscoveredSub[] {
    const dbByHost = new Map<string, ScanResult>();
    for (const r of this.allResults) {
      const h = this.hostname(r.website?.url ?? '');
      dbByHost.set(h, r);
    }

    return raw.map(s => ({
      subdomain:  s.subdomain,
      alive:      s.alive,
      source:     s.source,
      statusCode: s.statusCode,
      title:      s.title,
      cached:     s.cached,
      discoveredAt: s.discoveredAt,
      inDb:       dbByHost.get(s.subdomain) ?? null,
    }));
  }

  pageSizeLabel(size: SubdomainPageSize): string {
    return size === 'all' ? 'Hammasi' : String(size);
  }

  setAlivePageSize(size: SubdomainPageSize) {
    this.alivePageSize.set(size);
    this.alivePage.set(1);
  }

  setDeadPageSize(size: SubdomainPageSize) {
    this.deadPageSize.set(size);
    this.deadPage.set(1);
  }

  changeAlivePage(delta: number) {
    this.alivePage.set(this.clampPage(this.aliveDisplayPage() + delta, this.aliveSubdomains().length, this.alivePageSize()));
  }

  changeDeadPage(delta: number) {
    this.deadPage.set(this.clampPage(this.deadDisplayPage() + delta, this.deadSubdomains().length, this.deadPageSize()));
  }

  private resetSubdomainPages() {
    this.alivePage.set(1);
    this.deadPage.set(1);
  }

  private pageCount(total: number, size: SubdomainPageSize): number {
    if (total <= 0 || size === 'all') return 1;
    return Math.ceil(total / size);
  }

  private clampPage(page: number, total: number, size: SubdomainPageSize): number {
    return Math.min(Math.max(1, page), this.pageCount(total, size));
  }

  private rangeStart(total: number, page: number, size: SubdomainPageSize): number {
    if (total <= 0) return 0;
    return size === 'all' ? 1 : ((page - 1) * size) + 1;
  }

  private rangeEnd(total: number, page: number, size: SubdomainPageSize): number {
    if (total <= 0) return 0;
    return size === 'all' ? total : Math.min(total, page * size);
  }

  private paginate(list: DiscoveredSub[], page: number, size: SubdomainPageSize): DiscoveredSub[] {
    if (size === 'all') return list;
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  }

  openDetail(r: ScanResult) {
    this.router.navigate(['/site', r.websiteId], { state: { result: r } });
  }

  openSubdomainCard(sub: DiscoveredSub) {
    if (sub.inDb) this.openDetail(sub.inDb);
  }

  // ── Nuclei CVE scan ───────────────────────────────────────────────────────
  async runNuclei() {
    if (this.nucleiRunning()) return;
    const targets = [
      this._fetchUrl,
      ...this.aliveSubdomains().map(s => s.subdomain),
    ].filter(Boolean);
    if (!targets.length) {
      this.nucleiTargetError.set('Nuclei uchun target topilmadi.');
      return;
    }
    this.nucleiTargetError.set('');
    try {
      await this.scanner.startNucleiScan(this._fetchWebsiteId, targets);
    } catch { /* ScannerService keeps the visible error state */ }
  }

  nucleiSevClass(sev: string): string {
    const map: Record<string, string> = {
      critical: 'sev-critical', high: 'sev-high',
      medium: 'sev-medium',    low: 'sev-low',
      info: 'sev-info',
    };
    return map[sev] ?? 'sev-unknown';
  }

  cveSourceLabel(hit: NucleiResult): string {
    const source = hit.source || 'NUCLEI';
    const map: Record<string, string> = {
      NUCLEI: 'Nuclei',
      OSV: 'OSV',
      NVD: 'NVD',
      LOCAL_RULE: 'Rule',
    };
    return map[source] ?? source;
  }

  cveSourceClass(hit: NucleiResult): string {
    return `source-${(hit.source || 'NUCLEI').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  // ── Port scanner ─────────────────────────────────────────────────────────
  loadPortResults() {
    if (!this._fetchWebsiteId) return;
    this.scanner.getPortScanResults(this._fetchWebsiteId).subscribe({
      next: rows => this.portResults.set(rows),
      error: () => {},
    });
  }

  runPortScan() {
    if (this.portRunning() || !this._fetchWebsiteId) return;
    const ports = this.parsePorts(this.portInput());
    if (!ports.length) {
      this.portError.set('Port ro\'yxati noto\'g\'ri.');
      return;
    }

    this.portRunning.set(true);
    this.portError.set('');
    this.portTaskSuccess.set(null);
    this.scanner.scanPorts(this._fetchWebsiteId, { ports }).subscribe({
      next: rows => {
        this.portResults.set(rows);
        this.portRunning.set(false);
      },
      error: err => {
        this.portError.set(err?.error?.message || 'Port skan muvaffaqiyatsiz tugadi');
        this.portRunning.set(false);
      },
    });
  }

  createPortTask(port: PortScanResult, event?: Event) {
    event?.stopPropagation();
    if (this.portTaskLoading()) return;
    this.portTaskLoading.set(port.id);
    this.portTaskSuccess.set(null);
    this.tasks.create({
      title: `${port.host}:${port.port} ochiq port tekshiruvi`,
      description: `${port.host}:${port.port}/${port.protocol} ${port.service ? `(${port.service}) ` : ''}ochiq holatda topildi. Kerak bo'lmasa yopish yoki firewall bilan cheklash kerak.`,
      source: 'PORT',
      priority: this.portPriority(port.port),
      websiteId: this._fetchWebsiteId,
    }).subscribe({
      next: () => {
        this.portTaskLoading.set(null);
        this.portTaskSuccess.set(`${port.port} port bo'yicha vazifa yaratildi`);
      },
      error: err => {
        this.portTaskLoading.set(null);
        this.portError.set(err?.error?.message || 'Vazifa yaratilmadi');
      },
    });
  }

  portStatusLabel(status: string): string {
    return { OPEN: 'Ochiq', CLOSED: 'Yopiq', FILTERED: 'Filtrlangan' }[status] ?? status;
  }

  portStatusClass(status: string): string {
    return status.toLowerCase();
  }

  private parsePorts(value: string): number[] {
    return [...new Set(value.split(/[,\s]+/)
      .map(part => Number(part.trim()))
      .filter(port => Number.isInteger(port) && port > 0 && port <= 65535))]
      .slice(0, 100);
  }

  private portPriority(port: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if ([21, 22, 445, 1433, 2375, 3306, 3389, 5432, 5900, 6379, 9200, 9300, 27017].includes(port)) {
      return 'HIGH';
    }
    if ([80, 443, 8080, 8443].includes(port)) return 'MEDIUM';
    return 'LOW';
  }

  // ── CAN EMBED ─────────────────────────────────────────────────────────────
  private async fetchCanEmbed(siteUrl: string) {
    if (!siteUrl) return;
    try {
      const { canEmbed } = await firstValueFrom(this.scanner.checkCanEmbed(siteUrl));
      this.canEmbed.set(canEmbed);
    } catch {
      this.canEmbed.set(false);
    }
  }

  // ── SITE INFO ─────────────────────────────────────────────────────────────
  private async fetchSiteInfo(siteUrl: string, websiteId?: string) {
    if (!siteUrl) return;
    try {
      this.siteInfoLoading.set(true);
      this.siteInfoError.set(false);
      const data = await firstValueFrom(this.scanner.getSiteInfo(siteUrl, websiteId));
      this.siteInfo.set(data);
    } catch { this.siteInfoError.set(true); }
    finally { this.siteInfoLoading.set(false); }
  }

  retrySiteInfo() { this.fetchSiteInfo(this._fetchUrl, this._fetchWebsiteId); }

  // ── WHOIS ─────────────────────────────────────────────────────────────────
  private async fetchWhois(siteUrl: string) {
    if (!siteUrl) return;
    try {
      const host = this.hostname(siteUrl);
      this.whoisLoading.set(true);
      this.whoisError.set(false);
      const data = await firstValueFrom(this.scanner.getWhois(host));
      this.whois.set(data);
    } catch { this.whoisError.set(true); }
    finally { this.whoisLoading.set(false); }
  }

  retryWhois() { this.fetchWhois(this._fetchUrl); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private hostname(url: string): string {
    try   { return new URL(url).hostname.toLowerCase(); }
    catch { return url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase(); }
  }

  private extractRootDomain(url: string): string {
    const host  = this.hostname(url);
    const parts = host.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : host;
  }

  stripProtocol(url: string | undefined | null): string {
    return (url ?? '').replace(/^https?:\/\//, '');
  }

  getCmsColor(cms: string | null): string {
    return CMS_COLORS[cms ?? 'unknown'] ?? '#6b6c80';
  }

  getCategoryColor(cat: string | null): string {
    return CATEGORY_META[cat as SiteCategory]?.color ?? '#6b6c80';
  }

  getCategoryLabel(cat: string | null): string {
    return CATEGORY_META[cat as SiteCategory]?.label ?? (cat ?? 'Unknown');
  }

  getConfidenceClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  getConfidenceLevel(score: number): { label: string; desc: string; cls: string } {
    if (score >= 90) return { label: 'Juda yuqori', desc: '2+ mustaqil usul bir xil CMS ni tasdiqladi', cls: 'level-high' };
    if (score >= 70) return { label: 'Yuqori',      desc: 'Kuchli signal aniqlandi, ehtimol to\'g\'ri', cls: 'level-high' };
    if (score >= 50) return { label: 'O\'rta',      desc: 'Bir nechta zaif signal, qo\'shimcha tekshiruv kerak', cls: 'level-mid' };
    if (score >= 1)  return { label: 'Past',         desc: 'Zaif signal, aniqlik past', cls: 'level-low' };
    return             { label: 'Aniqlanmadi',        desc: 'Hech qanday signal topilmadi', cls: 'level-none' };
  }

  evidenceRows(result: ScanResult): DetectionEvidence[] {
    const rawEvidence = result.rawSignals?.['_evidence'];
    if (typeof rawEvidence === 'string') {
      try {
        const parsed = JSON.parse(rawEvidence);
        if (Array.isArray(parsed)) return parsed.filter(this.isDetectionEvidence);
      } catch { /* fallback below */ }
    }

    return (result.detectionMethods || []).map(method => ({
      name: result.cms ?? 'Unknown',
      method,
      type: this.methodType(method),
      confidence: result.confidence,
      version: null,
      source: null,
    }));
  }

  versionSource(result: ScanResult): string | null {
    const value = result.rawSignals?.['_version_source'];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  rawSignalEntries(result: ScanResult): Array<{ key: string; value: string }> {
    return Object.entries(result.rawSignals || {})
      .filter(([key]) => !key.startsWith('_'))
      .slice(0, 14)
      .map(([key, value]) => ({ key, value: this.rawSignalValue(value) }));
  }

  private isDetectionEvidence(value: unknown): value is DetectionEvidence {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<DetectionEvidence>;
    return typeof row.method === 'string' && typeof row.confidence === 'number';
  }

  private rawSignalValue(value: unknown): string {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); }
    catch { return String(value); }
  }

  private methodType(method: string): DetectionEvidence['type'] {
    if (method.startsWith('File probe') || method.startsWith('RSS')) return 'file';
    if (method === 'meta generator' || method.startsWith('Wappalyzer meta')) return 'meta';
    if (method === 'Cookie' || method.startsWith('Wappalyzer cookie')) return 'cookie';
    if (method === 'Inline version') return 'inline';
    if (method.includes('Header') || method.startsWith('Wappalyzer header')) return 'header';
    if (method.startsWith('Asset') || method.includes('asset') || method.startsWith('Wappalyzer scriptSrc')) return 'asset';
    if (method.startsWith('JS bundle') || method.startsWith('Wappalyzer scripts')) return 'bundle';
    if (method.includes('robots') || method.includes('sitemap')) return 'crawl';
    if (method.includes('HTML comment')) return 'comment';
    if (method.startsWith('Pattern') || method.startsWith('Wappalyzer html') || method.startsWith('Wappalyzer text') || method.startsWith('Wappalyzer url') || method.startsWith('Wappalyzer dom')) return 'pattern';
    return 'other';
  }

  categorizeEvidence(evidence: DetectionEvidence): { icon: string; label: string; cls: string } {
    const map: Record<DetectionEvidence['type'], { icon: string; label: string; cls: string }> = {
      file:    { icon: '◈', label: 'Fayl tekshiruvi', cls: 'ev-file' },
      meta:    { icon: '◉', label: 'Meta generator', cls: 'ev-meta' },
      cookie:  { icon: '◇', label: 'Cookie', cls: 'ev-cookie' },
      inline:  { icon: '◈', label: 'Inline versiya', cls: 'ev-inline' },
      header:  { icon: '▷', label: 'Header', cls: 'ev-header' },
      asset:   { icon: '▷', label: 'Asset', cls: 'ev-header' },
      bundle:  { icon: '◇', label: 'JS bundle', cls: 'ev-bundle' },
      crawl:   { icon: '○', label: 'Crawl signal', cls: 'ev-crawl' },
      comment: { icon: '◫', label: 'HTML comment', cls: 'ev-pattern' },
      pattern: { icon: '◫', label: 'HTML pattern', cls: 'ev-pattern' },
      other:   { icon: '·', label: 'Signal', cls: 'ev-other' },
    };
    return map[evidence.type] ?? map.other;
  }

  categorizeMethod(method: string): { icon: string; label: string; cls: string } {
    if (method.startsWith('File probe') || method.startsWith('RSS'))
      return { icon: '◈', label: 'Fayl tekshiruvi', cls: 'ev-file' };
    if (method === 'meta generator')
      return { icon: '◉', label: 'Meta generator', cls: 'ev-meta' };
    if (method === 'Cookie')
      return { icon: '◇', label: 'Cookie', cls: 'ev-cookie' };
    if (method.startsWith('Wappalyzer'))
      return { icon: '◇', label: 'Wappalyzer fingerprint', cls: 'ev-bundle' };
    if (method === 'Inline version')
      return { icon: '◈', label: 'Inline versiya', cls: 'ev-inline' };
    if (method.startsWith('Header') || method.startsWith('Asset'))
      return { icon: '▷', label: 'HTTP signal', cls: 'ev-header' };
    if (method.includes('robots') || method.includes('sitemap'))
      return { icon: '○', label: 'Crawl signal', cls: 'ev-crawl' };
    if (method.startsWith('Pattern'))
      return { icon: '◫', label: 'HTML pattern', cls: 'ev-pattern' };
    return { icon: '·', label: method, cls: 'ev-other' };
  }

  getHttpStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'http-ok';
    if (status >= 300 && status < 400) return 'http-redirect';
    if (status >= 400 && status < 500) return 'http-client-error';
    return 'http-server-error';
  }

  countryFlag(code: string): string {
    return code.toUpperCase().replace(/./g, c =>
      String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
    );
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
