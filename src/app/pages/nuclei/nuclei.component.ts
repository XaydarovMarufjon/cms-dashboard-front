import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ScannerService, NucleiResult, NucleiProgress, ThreatFeed, ThreatFeedSyncConfig } from '../../core/services/scanner.service';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';
type ActiveTab = 'scanner' | 'monitoring' | 'rejected' | 'feeds';
type ThreatFeedType = ThreatFeed['type'];

@Component({
  selector: 'app-nuclei',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './nuclei.component.html',
  styleUrls: ['./nuclei.component.scss'],
})
export class NucleiComponent implements OnInit, OnDestroy {
  private scanner = inject(ScannerService);
  themeService    = inject(ThemeService);
  auth            = inject(AuthService);

  results           = signal<NucleiResult[]>([]);
  monitoringResults = signal<NucleiResult[]>([]);
  rejectedResults   = signal<NucleiResult[]>([]);
  feeds             = signal<ThreatFeed[]>([]);
  feedSyncConfig    = signal<ThreatFeedSyncConfig | null>(null);
  loading           = signal(true);
  monitoringLoading = signal(false);
  rejectedLoading   = signal(false);
  feedsLoading      = signal(false);
  scanning          = signal(false);
  syncingFeedId     = signal<string | null>(null);
  syncingAll        = signal(false);
  enrichingAll      = signal(false);
  error             = signal('');
  feedError         = signal('');
  progress          = signal<NucleiProgress | null>(null);
  activeTab         = signal<ActiveTab>('scanner');
  statusLoading     = signal<Set<string>>(new Set());

  showAddFeed       = signal(false);
  feedsViewMode       = signal<'grid' | 'table'>('grid');
  monitoringViewMode  = signal<'grid' | 'table'>('grid');
  rejectedViewMode    = signal<'grid' | 'table'>('table');
  configuringFeedId = signal<string | null>(null);
  addingFeed       = signal(false);
  configForm        = { url: '', apiKey: '' };
  newFeed = {
    name: '', type: 'NVD' as ThreatFeedType,
    url: '', apiKey: '', enabled: true,
  };

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  interval     = signal(1440);
  editInterval = signal(false);
  newInterval  = 1440;
  savingInterval = signal(false);

  severityFilter = signal<SeverityFilter>('all');
  showDocs       = signal(false);

  filtered = computed(() => {
    const f = this.severityFilter();
    return f === 'all'
      ? this.results()
      : this.results().filter(r => r.severity === f);
  });

  grouped = computed(() => {
    const map = new Map<string, { url: string; label: string | null; items: NucleiResult[] }>();
    for (const r of this.filtered()) {
      const key = r.websiteId;
      if (!map.has(key)) {
        map.set(key, {
          url:   (r as any).website?.url ?? r.subdomain,
          label: (r as any).website?.label ?? null,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    }
    return [...map.values()].sort((a, b) => {
      const sevA = this.topSeverity(a.items);
      const sevB = this.topSeverity(b.items);
      return sevA - sevB;
    });
  });

  monitoringGrouped = computed(() => {
    const map = new Map<string, { url: string; label: string | null; items: NucleiResult[] }>();
    for (const r of this.monitoringResults()) {
      const key = r.websiteId;
      if (!map.has(key)) {
        map.set(key, {
          url:   (r as any).website?.url ?? r.subdomain,
          label: (r as any).website?.label ?? null,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    }
    return [...map.values()].sort((a, b) => {
      const sevA = this.topSeverity(a.items);
      const sevB = this.topSeverity(b.items);
      return sevA - sevB;
    });
  });

  stats = computed(() => {
    const all = this.results();
    return {
      total:    all.length,
      critical: all.filter(r => r.severity === 'critical').length,
      high:     all.filter(r => r.severity === 'high').length,
      medium:   all.filter(r => r.severity === 'medium').length,
      low:      all.filter(r => r.severity === 'low').length,
      info:     all.filter(r => r.severity === 'info').length,
      domains:  new Set(all.map(r => r.websiteId)).size,
    };
  });

  monitoringStats = computed(() => {
    const all = this.monitoringResults();
    return {
      total:    all.length,
      critical: all.filter(r => r.severity === 'critical').length,
      high:     all.filter(r => r.severity === 'high').length,
      domains:  new Set(all.map(r => r.websiteId)).size,
    };
  });

  rejectedGrouped = computed(() => {
    const map = new Map<string, { url: string; label: string | null; items: NucleiResult[] }>();
    for (const r of this.rejectedResults()) {
      const key = r.websiteId;
      if (!map.has(key)) {
        map.set(key, {
          url:   (r as any).website?.url ?? r.subdomain,
          label: (r as any).website?.label ?? null,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    }
    return [...map.values()];
  });

  readonly INTERVALS = [
    { label: '1 soat',   value: 60 },
    { label: '6 soat',   value: 360 },
    { label: '12 soat',  value: 720 },
    { label: '24 soat',  value: 1440 },
    { label: '3 kun',    value: 4320 },
    { label: '7 kun',    value: 10080 },
  ];
  readonly feedTypeOptions: Array<{ type: ThreatFeedType; label: string }> = [
    { type: 'NVD', label: 'NVD' },
    { type: 'CISA_KEV', label: 'CISA KEV' },
    { type: 'EPSS', label: 'EPSS' },
    { type: 'OSV', label: 'OSV' },
    { type: 'CIRCL', label: 'CIRCL' },
    { type: 'MITRE_CVE', label: 'MITRE CVE' },
    { type: 'MISP', label: 'MISP' },
    { type: 'OTX', label: 'AlienVault OTX' },
    { type: 'VIRUSTOTAL', label: 'VirusTotal' },
  ];

  recentFeeds = computed(() => {
    const used = this.feeds().filter(f => !!f.lastSync);
    const sorted = [...used].sort((a, b) =>
      new Date(b.lastSync!).getTime() - new Date(a.lastSync!).getTime()
    ).slice(0, 6);
    const now = Date.now();
    return sorted.map(f => {
      const ageMs = now - new Date(f.lastSync!).getTime();
      const ageH  = ageMs / 3_600_000;
      let pct: number;
      if      (ageH <= 1)   pct = 100;
      else if (ageH <= 24)  pct = 80 - ((ageH - 1)  / 23)  * 25;   // 80 → 55
      else if (ageH <= 168) pct = 55 - ((ageH - 24) / 144) * 25;   // 55 → 30
      else                  pct = Math.max(12, 30 - Math.min(18, (ageH - 168) / 24));
      return {
        id:        f.id,
        name:      f.name,
        type:      f.type,
        typeLabel: this.feedTypeLabel(f.type),
        lastSync:  f.lastSync!,
        status:    f.lastStatus,
        ago:       this.relativeAgo(ageMs),
        pct,
      };
    });
  });

  relativeAgo(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    if (s < 60)     return `${s} soniya oldin`;
    const m = Math.floor(s / 60);
    if (m < 60)     return `${m} daqiqa oldin`;
    const h = Math.floor(m / 60);
    if (h < 24)     return `${h} soat oldin`;
    const d = Math.floor(h / 24);
    if (d < 7)      return `${d} kun oldin`;
    const w = Math.floor(d / 7);
    if (w < 5)      return `${w} hafta oldin`;
    const mo = Math.floor(d / 30);
    if (mo < 12)    return `${mo} oy oldin`;
    return `${Math.floor(d / 365)} yil oldin`;
  }

  async ngOnInit() {
    await Promise.all([this.loadResults(), this.loadInterval(), this.loadMonitoring(), this.loadRejected(), this.loadFeeds()]);
  }

  private async loadResults() {
    try {
      this.loading.set(true);
      const data = await firstValueFrom(this.scanner.getAllNucleiResults());
      this.results.set(data);
    } catch { this.error.set('Natijalar yuklanmadi'); }
    finally { this.loading.set(false); }
  }

  async loadMonitoring() {
    try {
      this.monitoringLoading.set(true);
      const data = await firstValueFrom(this.scanner.getCveMonitoring());
      this.monitoringResults.set(data);
    } catch { /* ignore */ }
    finally { this.monitoringLoading.set(false); }
  }

  async loadRejected() {
    try {
      this.rejectedLoading.set(true);
      const data = await firstValueFrom(this.scanner.getCveRejected());
      this.rejectedResults.set(data);
    } catch { /* ignore */ }
    finally { this.rejectedLoading.set(false); }
  }

  async loadFeeds() {
    try {
      this.feedsLoading.set(true);
      const [feeds, config] = await Promise.all([
        firstValueFrom(this.scanner.getFeeds()),
        firstValueFrom(this.scanner.getFeedSyncConfig()),
      ]);
      this.feeds.set(feeds);
      this.feedSyncConfig.set(config);
    } catch { /* ignore */ }
    finally { this.feedsLoading.set(false); }
  }

  async addFeed() {
    this.feedError.set('');
    const name = this.newFeed.name.trim();
    const url = this.newFeed.url.trim();
    const apiKey = this.newFeed.apiKey.trim();
    if (!name) {
      this.feedError.set('Feed nomini kiriting');
      return;
    }
    if (this.needsUrl(this.newFeed.type) && !url) {
      this.feedError.set(`${this.feedTypeLabel(this.newFeed.type)} uchun URL kerak`);
      return;
    }
    if (this.needsKey(this.newFeed.type) && !apiKey) {
      this.feedError.set(`${this.feedTypeLabel(this.newFeed.type)} uchun API kalit kerak`);
      return;
    }

    try {
      this.addingFeed.set(true);
      const created = await firstValueFrom(this.scanner.upsertFeed({
        name,
        type:    this.newFeed.type,
        url:     url || undefined,
        apiKey:  apiKey || undefined,
        enabled: this.newFeed.enabled,
      }));
      this.feeds.update(list => [...list, created]);
      this.closeAddFeed();
    } catch (e: any) {
      this.feedError.set(e?.error?.message ?? 'Feed qo\'shilmadi');
    } finally {
      this.addingFeed.set(false);
    }
  }

  openAddFeed() {
    this.feedError.set('');
    this.showAddFeed.set(true);
    this.configuringFeedId.set(null);
  }

  closeAddFeed() {
    this.showAddFeed.set(false);
    this.newFeed = { name: '', type: 'NVD', url: '', apiKey: '', enabled: true };
  }

  onNewFeedTypeChange() {
    this.newFeed.url = this.needsUrl(this.newFeed.type) ? this.newFeed.url : '';
    this.newFeed.apiKey = this.needsKey(this.newFeed.type) || this.keyOptional(this.newFeed.type)
      ? this.newFeed.apiKey
      : '';
  }

  canAddFeed(): boolean {
    if (this.addingFeed()) return false;
    if (!this.newFeed.name.trim()) return false;
    if (this.needsUrl(this.newFeed.type) && !this.newFeed.url.trim()) return false;
    if (this.needsKey(this.newFeed.type) && !this.newFeed.apiKey.trim()) return false;
    return true;
  }

  async toggleFeed(id: string, enabled: boolean) {
    try {
      const updated = await firstValueFrom(this.scanner.toggleFeed(id, enabled));
      this.feeds.update(list => list.map(f => f.id === id ? { ...f, enabled: updated.enabled } : f));
    } catch { /* ignore */ }
  }

  async deleteFeed(id: string) {
    const feed = this.feeds().find(f => f.id === id);
    if (!feed) return;
    if (!window.confirm(`"${feed.name}" feedi o'chirilsinmi?`)) return;
    try {
      await firstValueFrom(this.scanner.deleteFeed(id));
      this.feeds.update(list => list.filter(f => f.id !== id));
    } catch (e: any) {
      this.feedError.set(e?.error?.message ?? 'Feed o\'chirilmadi');
    }
  }

  async syncFeed(id: string) {
    if (this.syncingFeedId()) return;
    this.syncingFeedId.set(id);
    this.feeds.update(list => list.map(f => f.id === id ? { ...f, lastStatus: 'syncing' } : f));
    try {
      await firstValueFrom(this.scanner.syncFeed(id));
      await this.loadFeeds();
    } catch (e: any) {
      this.feeds.update(list => list.map(f => f.id === id ? { ...f, lastStatus: 'error' } : f));
    } finally {
      this.syncingFeedId.set(null);
    }
  }

  async syncAllFeeds() {
    if (this.syncingAll()) return;
    this.syncingAll.set(true);
    try {
      await firstValueFrom(this.scanner.syncAllFeeds());
      await this.loadFeeds();
    } catch { /* ignore */ }
    finally { this.syncingAll.set(false); }
  }

  async enrichAll() {
    if (this.enrichingAll()) return;
    this.enrichingAll.set(true);
    try {
      await firstValueFrom(this.scanner.enrichAll());
      await this.loadResults();
      await this.loadMonitoring();
    } catch { /* ignore */ }
    finally { this.enrichingAll.set(false); }
  }

  feedTypeLabel(type: string): string {
    const map: Record<string, string> = {
      NVD: 'NVD', CISA_KEV: 'CISA KEV', EPSS: 'EPSS',
      OSV: 'OSV', CIRCL: 'CIRCL', MITRE_CVE: 'MITRE',
      MISP: 'MISP', OTX: 'OTX', VIRUSTOTAL: 'VirusTotal',
    };
    return map[type] ?? type;
  }

  needsUrl(type: string): boolean { return ['MISP'].includes(type); }
  needsKey(type: string): boolean { return ['MISP', 'OTX', 'VIRUSTOTAL'].includes(type); }
  keyOptional(type: string): boolean { return type === 'NVD'; }
  canDeleteFeeds(): boolean { return this.auth.role() === 'ADMIN'; }
  feedHasApiConnection(feed: ThreatFeed): boolean { return !!feed.apiKey; }

  feedIsConfigured(feed: ThreatFeed): boolean {
    if (['NVD', 'CISA_KEV', 'EPSS', 'OSV', 'CIRCL', 'MITRE_CVE'].includes(feed.type)) return true;
    if (feed.type === 'MISP') return !!(feed.url && feed.apiKey);
    return !!feed.apiKey; // OTX, VIRUSTOTAL
  }

  openConfigForm(feed: ThreatFeed) {
    this.configuringFeedId.set(feed.id);
    this.configForm = { url: feed.url ?? '', apiKey: '' };
  }

  closeConfigForm() {
    this.configuringFeedId.set(null);
    this.configForm = { url: '', apiKey: '' };
  }

  async saveConfigForm(feed: ThreatFeed) {
    try {
      const updated = await firstValueFrom(this.scanner.configureFeed(feed.id, {
        url:    this.configForm.url    || undefined,
        apiKey: this.configForm.apiKey || undefined,
      }));
      this.feeds.update(list => list.map(f => f.id === feed.id ? { ...f, ...updated } : f));
      this.closeConfigForm();
    } catch (e: any) {
      this.feedError.set(e?.error?.message ?? 'Saqlash xatosi');
    }
  }

  cvssColor(score: number | null): string {
    if (score === null) return '';
    if (score >= 9) return 'cvss-critical';
    if (score >= 7) return 'cvss-high';
    if (score >= 4) return 'cvss-medium';
    return 'cvss-low';
  }

  sourceLabel(hit: NucleiResult): string {
    const source = hit.source || 'NUCLEI';
    const map: Record<string, string> = {
      NUCLEI: 'Nuclei',
      OSV: 'OSV',
      NVD: 'NVD',
      LOCAL_RULE: 'Rule',
    };
    return map[source] ?? source;
  }

  sourceClass(hit: NucleiResult): string {
    const source = (hit.source || 'NUCLEI').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `source-${source}`;
  }

  sourceTitle(hit: NucleiResult): string {
    const confidence = hit.confidence ?? 90;
    return `${this.sourceLabel(hit)} manbasi, ishonchlilik ${confidence}%`;
  }

  private async loadInterval() {
    try {
      const { interval } = await firstValueFrom(this.scanner.getNucleiInterval());
      this.interval.set(interval);
      this.newInterval = interval;
    } catch { /* ignore */ }
  }

  async scanAll() {
    if (this.scanning()) return;
    this.scanning.set(true);
    this.error.set('');
    this.progress.set(null);

    this.startPolling();

    try {
      await firstValueFrom(this.scanner.runNucleiAll());
      this.scanner.notifyScanBadgesChanged();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Skan muvaffaqiyatsiz tugadi');
    } finally {
      await this.pollOnce();
      this.stopPolling();
      this.scanning.set(false);
      await this.loadResults();
    }
  }

  async markFalsePositive(id: string) {
    if (this.statusLoading().has(id)) return;
    this.statusLoading.update(s => { s.add(id); return new Set(s); });
    try {
      await firstValueFrom(this.scanner.updateCveStatus(id, 'FALSE_POSITIVE'));
      const item = this.results().find(r => r.id === id);
      if (item) {
        this.results.update(list => list.filter(r => r.id !== id));
        this.rejectedResults.update(list => [{ ...item, status: 'FALSE_POSITIVE' }, ...list]);
      }
    } catch { /* ignore */ }
    finally {
      this.statusLoading.update(s => { s.delete(id); return new Set(s); });
    }
  }

  async restoreFromRejected(id: string) {
    if (this.statusLoading().has(id)) return;
    this.statusLoading.update(s => { s.add(id); return new Set(s); });
    try {
      await firstValueFrom(this.scanner.updateCveStatus(id, 'PENDING'));
      const item = this.rejectedResults().find(r => r.id === id);
      if (item) {
        this.rejectedResults.update(list => list.filter(r => r.id !== id));
        this.results.update(list => [{ ...item, status: 'PENDING' }, ...list]);
      }
    } catch { /* ignore */ }
    finally {
      this.statusLoading.update(s => { s.delete(id); return new Set(s); });
    }
  }

  async confirmCve(id: string) {
    if (this.statusLoading().has(id)) return;
    this.statusLoading.update(s => { s.add(id); return new Set(s); });
    try {
      await firstValueFrom(this.scanner.updateCveStatus(id, 'CONFIRMED'));
      const confirmed = this.results().find(r => r.id === id);
      if (confirmed) {
        this.results.update(list => list.filter(r => r.id !== id));
        this.monitoringResults.update(list => [{ ...confirmed, status: 'CONFIRMED' }, ...list]);
      }
    } catch { /* ignore */ }
    finally {
      this.statusLoading.update(s => { s.delete(id); return new Set(s); });
    }
  }

  async markMonitoringPending(id: string) {
    if (this.statusLoading().has(id)) return;
    this.statusLoading.update(s => { s.add(id); return new Set(s); });
    try {
      await firstValueFrom(this.scanner.updateCveStatus(id, 'PENDING'));
      const item = this.monitoringResults().find(r => r.id === id);
      if (item) {
        this.monitoringResults.update(list => list.filter(r => r.id !== id));
        this.results.update(list => [{ ...item, status: 'PENDING' }, ...list]);
      }
    } catch { /* ignore */ }
    finally {
      this.statusLoading.update(s => { s.delete(id); return new Set(s); });
    }
  }

  switchTab(tab: ActiveTab) {
    this.activeTab.set(tab);
  }

  isStatusLoading(id: string): boolean {
    return this.statusLoading().has(id);
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollOnce(), 1500);
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce() {
    try {
      const p = await firstValueFrom(this.scanner.getNucleiProgress());
      this.progress.set(p);
    } catch { /* ignore */ }
  }

  ngOnDestroy() { this.stopPolling(); }

  async saveInterval() {
    this.savingInterval.set(true);
    try {
      await firstValueFrom(this.scanner.setNucleiInterval(this.newInterval));
      this.interval.set(this.newInterval);
      this.editInterval.set(false);
    } catch { /* ignore */ }
    finally { this.savingInterval.set(false); }
  }

  sevClass(sev: string): string {
    const map: Record<string, string> = {
      critical: 'sev-critical', high: 'sev-high',
      medium: 'sev-medium', low: 'sev-low', info: 'sev-info',
    };
    return map[sev] ?? 'sev-unknown';
  }

  intervalLabel(min: number): string {
    const found = this.INTERVALS.find(i => i.value === min);
    if (found) return found.label;
    if (min < 60) return `${min} daqiqa`;
    if (min < 1440) return `${Math.round(min / 60)} soat`;
    return `${Math.round(min / 1440)} kun`;
  }

  private topSeverity(items: NucleiResult[]): number {
    const order: Record<string, number> = {
      critical: 0, high: 1, medium: 2, low: 3, info: 4, unknown: 5,
    };
    return Math.min(...items.map(i => order[i.severity] ?? 5));
  }

  logout() {
    this.auth.logout();
  }
}
