import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ScannerService, NucleiResult, NucleiProgress, ThreatFeed } from '../../core/services/scanner.service';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'info';
type ActiveTab = 'scanner' | 'monitoring' | 'rejected' | 'feeds';

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
  configForm        = { url: '', apiKey: '' };
  newFeed = {
    name: '', type: 'NVD' as ThreatFeed['type'],
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
      const data = await firstValueFrom(this.scanner.getFeeds());
      this.feeds.set(data);
    } catch { /* ignore */ }
    finally { this.feedsLoading.set(false); }
  }

  async addFeed() {
    this.feedError.set('');
    try {
      const created = await firstValueFrom(this.scanner.upsertFeed({
        name:    this.newFeed.name,
        type:    this.newFeed.type,
        url:     this.newFeed.url || undefined,
        apiKey:  this.newFeed.apiKey || undefined,
        enabled: this.newFeed.enabled,
      }));
      this.feeds.update(list => [...list, created]);
      this.showAddFeed.set(false);
      this.newFeed = { name: '', type: 'NVD', url: '', apiKey: '', enabled: true };
    } catch (e: any) {
      this.feedError.set(e?.error?.message ?? 'Feed qo\'shilmadi');
    }
  }

  async toggleFeed(id: string, enabled: boolean) {
    try {
      const updated = await firstValueFrom(this.scanner.toggleFeed(id, enabled));
      this.feeds.update(list => list.map(f => f.id === id ? { ...f, enabled: updated.enabled } : f));
    } catch { /* ignore */ }
  }

  async deleteFeed(id: string) {
    try {
      await firstValueFrom(this.scanner.deleteFeed(id));
      this.feeds.update(list => list.filter(f => f.id !== id));
    } catch { /* ignore */ }
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
