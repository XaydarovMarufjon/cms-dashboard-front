// src/app/pages/site-detail/site-detail.component.ts
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SafeUrlPipe } from '../../shared/pipes/safe-url.pipe';
import { firstValueFrom } from 'rxjs';
import { ScannerService, WhoisData, SiteInfoData } from '../../core/services/scanner.service';
import { ScanResult, CMS_COLORS, CATEGORY_META, SiteCategory } from '../../shared/models/website.model';

export interface DiscoveredSub {
  subdomain: string;
  alive: boolean;
  source: string[];
  statusCode?: number;
  title?: string;
  inDb: ScanResult | null;
}

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, SafeUrlPipe],
  templateUrl: './site-detail.component.html',
  styleUrls: ['./site-detail.component.scss'],
})
export class SiteDetailComponent implements OnInit {
  private router  = inject(Router);
  private scanner = inject(ScannerService);

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

  // Subdomain discovery
  discovered    = signal<DiscoveredSub[]>([]);
  discovering   = signal(false);
  discoverError = signal('');
  discoverDone  = signal(false);
  btnPulse      = signal(false);

  aliveSubdomains = computed(() => this.discovered().filter(s => s.alive));
  deadSubdomains  = computed(() => this.discovered().filter(s => !s.alive));

  // inline scan state — keyed by subdomain hostname
  scanningSet   = signal<Set<string>>(new Set());
  scanResultMap = signal<Map<string, ScanResult>>(new Map());
  scanErrorMap  = signal<Map<string, string>>(new Map());

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

    if (!state?.result) { this.router.navigate(['/']); return; }
    this.result.set(state.result);

    this._fetchUrl       = state.result.website?.url ?? '';
    this._fetchWebsiteId = state.result.websiteId;

    // Fetch WHOIS + site-info + canEmbed in parallel (fire-and-forget)
    this.fetchWhois(this._fetchUrl);
    this.fetchSiteInfo(this._fetchUrl, this._fetchWebsiteId);
    this.fetchCanEmbed(this._fetchUrl);

    try {
      this.allResults = await firstValueFrom(this.scanner.getLatestResults());
      const root   = this.rootDomain();
      const selfId = state.result.websiteId;

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
  }

  // ── Subdomain discovery ───────────────────────────────────────────────────
  async discoverSubdomains() {
    const domain = this.rootDomain();
    if (!domain || this.discovering()) return;

    // Button pulse animation
    this.btnPulse.set(true);
    setTimeout(() => this.btnPulse.set(false), 700);

    this.discovering.set(true);
    this.discoverError.set('');
    this.discoverDone.set(false);
    this.discovered.set([]);

    try {
      const raw = await firstValueFrom(this.scanner.discoverSubdomains(domain));

      // Cross-reference with what's already in DB
      const dbByHost = new Map<string, ScanResult>();
      for (const r of this.allResults) {
        const h = this.hostname(r.website?.url ?? '');
        dbByHost.set(h, r);
      }

      const merged: DiscoveredSub[] = raw.map(s => ({
        subdomain:  s.subdomain,
        alive:      s.alive,
        source:     s.source,
        statusCode: (s as any).statusCode,
        title:      (s as any).title,
        inDb:       dbByHost.get(s.subdomain) ?? null,
      }));

      this.discovered.set(merged);
      this.discoverDone.set(true);
    } catch (err) {
      this.discoverError.set('Subdomen qidirish muvaffaqiyatsiz tugadi');
    } finally {
      this.discovering.set(false);
    }
  }

  openDetail(r: ScanResult) {
    this.router.navigate(['/site', r.websiteId], { state: { result: r } });
  }

  // ── Inline scan for alive-but-not-yet-scanned subdomains ─────────────────
  isScanning(subdomain: string): boolean {
    return this.scanningSet().has(subdomain);
  }

  getScanResult(subdomain: string): ScanResult | null {
    return this.scanResultMap().get(subdomain) ?? null;
  }

  getScanError(subdomain: string): string {
    return this.scanErrorMap().get(subdomain) ?? '';
  }

  async quickScan(sub: DiscoveredSub) {
    // Already scanned inline → navigate to detail
    const existing = this.getScanResult(sub.subdomain);
    if (existing) { this.openDetail(existing); return; }

    // Already in DB → navigate to detail
    if (sub.inDb) { this.openDetail(sub.inDb); return; }

    // Already scanning → do nothing
    if (this.isScanning(sub.subdomain)) return;

    // Mark scanning
    this.scanningSet.update(s => { const n = new Set(s); n.add(sub.subdomain); return n; });
    this.scanErrorMap.update(m => { const n = new Map(m); n.delete(sub.subdomain); return n; });

    try {
      const url = `https://${sub.subdomain}`;

      // 1. Create website record
      const website = await firstValueFrom(this.scanner.createWebsite(url));

      // 2. Scan it
      const result = await firstValueFrom(this.scanner.scanOne(website.id, url));

      // Attach website info so openDetail works
      const enriched: ScanResult = { ...result, website: { ...website, createdAt: new Date().toISOString() } };

      this.scanResultMap.update(m => { const n = new Map(m); n.set(sub.subdomain, enriched); return n; });

      // Also update allResults so future cross-reference works
      this.allResults = [...this.allResults, enriched];
    } catch {
      this.scanErrorMap.update(m => { const n = new Map(m); n.set(sub.subdomain, 'Skanerlab bo\'lmadi'); return n; });
    } finally {
      this.scanningSet.update(s => { const n = new Set(s); n.delete(sub.subdomain); return n; });
    }
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

  categorizeMethod(method: string): { icon: string; label: string; cls: string } {
    if (method.startsWith('File probe') || method.startsWith('RSS'))
      return { icon: '◈', label: 'Fayl tekshiruvi', cls: 'ev-file' };
    if (method === 'meta generator')
      return { icon: '◉', label: 'Meta generator', cls: 'ev-meta' };
    if (method === 'Cookie')
      return { icon: '◇', label: 'Cookie', cls: 'ev-cookie' };
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
      String.fromCodePoint(0x1F1E0 - 65 + c.charCodeAt(0))
    );
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
