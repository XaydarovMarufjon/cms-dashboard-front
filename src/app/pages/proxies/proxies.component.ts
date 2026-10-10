import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { ScannerService, ProxyEntry, ProxyStats, ProxyTestResult } from '../../core/services/scanner.service';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

interface IspInfo { isp: string | null; ip: string | null; country: string | null; city: string | null; }

type ProtocolFilter = 'all' | 'socks5' | 'socks4' | 'https' | 'http';

@Component({
  selector: 'app-proxies',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './proxies.component.html',
  styleUrls: ['./proxies.component.scss'],
})
export class ProxiesComponent implements OnInit, OnDestroy {
  private scanner = inject(ScannerService);
  themeService    = inject(ThemeService);
  auth            = inject(AuthService);

  stats      = signal<ProxyStats | null>(null);
  loading    = signal(true);
  refreshing = signal(false);
  error      = signal('');
  filter     = signal<ProtocolFilter>('all');
  showDocs   = signal(false);

  // Live indicator state
  ispInfo       = signal<IspInfo | null>(null);
  rotationRate  = signal(0);              // rot/sek
  private lastRotations = 0;
  private lastRotationTs = 0;
  private pollTimer: any = null;
  private destroyed = false;
  private readonly destroy$ = new Subject<void>();
  private polling = false;
  private loadingIsp = false;

  activeProxy = computed<ProxyEntry | null>(() => {
    const s = this.stats();
    if (!s || !s.total) return null;
    return s.proxies.find(p => p.active) ?? s.proxies[0] ?? null;
  });

  liveMode = computed<'proxy' | 'own-ip'>(() => {
    const s = this.stats();
    return s && s.total > 0 ? 'proxy' : 'own-ip';
  });

  filtered = computed<ProxyEntry[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const f = this.filter();
    return f === 'all' ? s.proxies : s.proxies.filter(p => p.protocol === f);
  });

  socks5Count = computed(() => this.stats()?.proxies.filter(p => p.protocol === 'socks5').length ?? 0);
  socks4Count = computed(() => this.stats()?.proxies.filter(p => p.protocol === 'socks4').length ?? 0);
  httpsCount  = computed(() => this.stats()?.proxies.filter(p => p.protocol === 'https').length  ?? 0);
  httpCount   = computed(() => this.stats()?.proxies.filter(p => p.protocol === 'http').length   ?? 0);
  authCount   = computed(() => this.stats()?.proxies.filter(p => p.hasAuth).length ?? 0);

  async ngOnInit() {
    await this.load();
    if (this.destroyed) return;
    this.loadIsp();
    this.startPolling();
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startPolling() {
    if (this.destroyed || this.pollTimer !== null || typeof window === 'undefined') return;
    this.pollTimer = setInterval(() => {
      if (document.hidden) return;
      this.poll();
    }, 2500);
  }

  private async poll() {
    if (this.destroyed || this.polling) return;
    this.polling = true;
    try {
      const data = await firstValueFrom(this.scanner.getProxies().pipe(takeUntil(this.destroy$)));
      if (this.destroyed) return;
      const now  = performance.now();
      if (this.lastRotationTs > 0) {
        const dt   = (now - this.lastRotationTs) / 1000;
        const drot = data.rotations - this.lastRotations;
        if (dt > 0) this.rotationRate.set(Math.max(0, drot / dt));
      }
      this.lastRotations  = data.rotations;
      this.lastRotationTs = now;
      this.stats.set(data);

      // Refresh ISP only when in own-ip mode and we don't have it yet
      if ((!data.autoRefresh.enabled || data.total === 0) && !this.ispInfo()) {
        this.loadIsp();
      }
    } catch { /* ignore */ }
    finally { this.polling = false; }
  }

  private async loadIsp() {
    if (this.destroyed || this.loadingIsp) return;
    this.loadingIsp = true;
    try {
      const data = await firstValueFrom(this.scanner.getIsp().pipe(takeUntil(this.destroy$)));
      if (this.destroyed) return;
      this.ispInfo.set(data);
    } catch { /* ignore */ }
    finally { this.loadingIsp = false; }
  }

  async load() {
    if (this.destroyed) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.scanner.getProxies().pipe(takeUntil(this.destroy$)));
      if (this.destroyed) return;
      this.stats.set(data);
    } catch (e: any) {
      if (this.destroyed) return;
      this.error.set(e?.error?.message || 'Proxy malumotini yuklab bolmadi');
    } finally {
      if (!this.destroyed) this.loading.set(false);
    }
  }

  setFilter(f: ProtocolFilter) { this.filter.set(f); }

  async refresh() {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.scanner.refreshProxies());
      this.stats.set(data);
    } catch (e: any) {
      this.error.set(e?.error?.message || 'Yangilab bolmadi');
    } finally {
      this.refreshing.set(false);
    }
  }

  toggling = signal(false);

  testing    = signal(false);
  testResult = signal<ProxyTestResult | null>(null);

  async testCurrent() {
    if (this.testing()) return;
    this.testing.set(true);
    try {
      const p = this.activeProxy();
      const input = p ? { index: p.index } : {};
      const r = await firstValueFrom(this.scanner.testProxy(input));
      this.testResult.set(r);
    } catch (e: any) {
      this.testResult.set({
        mode: 'proxy', proxy: null, working: false,
        latencyMs: 0, outboundIp: null,
        error: e?.message || 'tarmoq xatosi',
      });
    } finally {
      this.testing.set(false);
    }
  }
  async toggleAutoRefresh() {
    if (this.toggling()) return;
    const next = !this.stats()?.autoRefresh?.enabled;
    this.toggling.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.scanner.setAutoRefreshEnabled(next));
      this.stats.set(data);
    } catch (e: any) {
      this.error.set(e?.error?.message || 'O\'zgartirib bolmadi');
    } finally {
      this.toggling.set(false);
    }
  }

  protocolClass(p: string): string {
    if (p === 'socks5') return 'badge-socks5';
    if (p === 'socks4') return 'badge-socks4';
    if (p === 'https')  return 'badge-https';
    return 'badge-http';
  }

  logout() { this.auth.logout(); }
}
