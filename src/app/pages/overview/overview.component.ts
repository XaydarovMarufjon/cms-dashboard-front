// src/app/pages/overview/overview.component.ts
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription, timer } from 'rxjs';

import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { WebsiteService } from '../../core/services/website.service';
import {
  ScannerService, Alert, AlertType, ProxyStats, SystemStatus, OverviewStats,
} from '../../core/services/scanner.service';
import { TasksService, SecurityTask } from '../../core/services/tasks.service';
import { CallsService, CallRow } from '../../core/services/calls.service';
import {
  Website, ScanResult, CMS_COLORS, CATEGORY_META, SiteCategory,
} from '../../shared/models/website.model';

interface DonutSeg {
  label: string;
  count: number;
  pct: number;
  color: string;
  dash: string;
  offset: number;
}
interface BarRow { label: string; count: number; pct: number; color: string; }
interface SearchHit { kind: 'site' | 'page'; title: string; sub: string; link: any[]; }

const DONUT_C = 2 * Math.PI * 54; // r = 54

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SideNavComponent],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class OverviewComponent implements OnInit, OnDestroy {
  private websiteSvc = inject(WebsiteService);
  private scanner    = inject(ScannerService);
  private tasksSvc   = inject(TasksService);
  private callsSvc   = inject(CallsService);
  private router     = inject(Router);

  readonly DONUT_C = DONUT_C;

  // ── raw data ──────────────────────────────────
  websites = signal<Website[]>([]);
  results  = signal<ScanResult[]>([]);
  alerts   = signal<Alert[]>([]);
  tasks    = signal<SecurityTask[]>([]);
  calls    = signal<CallRow[]>([]);
  proxy    = signal<ProxyStats | null>(null);
  systemStatus  = signal<SystemStatus | null>(null);
  overviewStats = signal<OverviewStats | null>(null);
  systemLoading = signal(false);
  systemError   = signal<string | null>(null);

  loading  = signal(true);
  private systemPollSub?: Subscription;

  // ── search ────────────────────────────────────
  query    = signal('');
  focused  = signal(false);

  // pages registry for global search / quick-links
  readonly PAGES = [
    { title: 'Saytlar', sub: 'Skaner dashboard',  link: ['/sites'],          icon: 'grid' },
    { title: 'URL Checker', sub: 'Havola tekshir', link: ['/checker'],        icon: 'check' },
    { title: 'Dork', sub: 'Google dorking',        link: ['/dork'],           icon: 'search' },
    { title: 'Alertlar', sub: 'Muddat / SSL',      link: ['/alerts'],         icon: 'bell' },
    { title: 'Nuclei', sub: 'Zaiflik skaneri',     link: ['/nuclei'],         icon: 'spark' },
    { title: 'Portlar', sub: 'Port skaner',        link: ['/ports'],          icon: 'ports' },
    { title: 'Vazifalar', sub: 'Security tasks',   link: ['/tasks'],          icon: 'tasks' },
    { title: 'Statistika', sub: 'Hisobotlar',      link: ['/statistics'],     icon: 'chart' },
    { title: 'Proksilar', sub: 'Proxy pool',       link: ['/proxies'],        icon: 'proxy' },
    { title: "Qo'ng'iroqlar", sub: 'Call jurnali', link: ['/calls'],          icon: 'phone' },
    { title: 'Translit', sub: 'Transliterator',    link: ['/transliterator'], icon: 'text' },
    { title: 'Loglar', sub: 'Audit / sessiya',     link: ['/logs'],           icon: 'log' },
  ];

  async ngOnInit() {
    this.loading.set(true);
    const settle = async <T>(p: Promise<T>, set: (v: T) => void) => {
      try { set(await p); } catch { /* graceful */ }
    };
    await Promise.allSettled([
      settle(firstValueFrom(this.websiteSvc.getAll()),         v => this.websites.set(v ?? [])),
      settle(firstValueFrom(this.scanner.getLatestResults()),  v => this.results.set(v ?? [])),
      settle(firstValueFrom(this.scanner.getAlerts()),         v => this.alerts.set(v ?? [])),
      settle(firstValueFrom(this.tasksSvc.getAll()),           v => this.tasks.set(v ?? [])),
      settle(firstValueFrom(this.callsSvc.getCalls()),         v => this.calls.set(v ?? [])),
      settle(firstValueFrom(this.scanner.getProxies()),        v => this.proxy.set(v)),
      settle(firstValueFrom(this.scanner.getSystemStatus()),   v => this.systemStatus.set(v)),
      settle(firstValueFrom(this.scanner.getOverviewStats()),  v => this.overviewStats.set(v)),
    ]);
    this.loading.set(false);
    this.startSystemPolling();
  }

  ngOnDestroy() {
    this.systemPollSub?.unsubscribe();
  }

  private startSystemPolling() {
    this.systemPollSub?.unsubscribe();
    this.systemPollSub = timer(30000, 30000).subscribe(() => this.loadLiveOverview());
  }

  loadLiveOverview() {
    this.loadSystemStatus();
    this.scanner.getOverviewStats().subscribe({
      next: data => this.overviewStats.set(data),
      error: () => {},
    });
  }

  loadSystemStatus() {
    this.systemLoading.set(!this.systemStatus());
    this.scanner.getSystemStatus().subscribe({
      next: data => {
        this.systemStatus.set(data);
        this.systemError.set(null);
        this.systemLoading.set(false);
      },
      error: err => {
        this.systemError.set(err?.error?.message || "Tizim holatini olib bo'lmadi");
        this.systemLoading.set(false);
      },
    });
  }

  // ── KPI numbers ───────────────────────────────
  totalSites    = computed(() => this.websites().length);
  scannedSites  = computed(() => new Set(this.results().map(r => r.websiteId)).size);
  coveragePct   = computed(() => {
    const t = this.totalSites();
    return t ? Math.round((this.scannedSites() / t) * 100) : 0;
  });
  cveTotal      = computed(() => this.websites().reduce((s, w) => s + (w.cveFindingsCount ?? 0), 0));
  cveSites      = computed(() => this.websites().filter(w => (w.cveFindingsCount ?? 0) > 0).length);

  alertTotal    = computed(() => this.alerts().length);
  alertUrgent   = computed(() => this.alerts().filter(a => this.sev(a.type) === 'urgent').length);
  alertsBySev   = computed<BarRow[]>(() => {
    const buckets: Record<string, { label: string; color: string }> = {
      urgent:   { label: 'Shoshilinch', color: 'var(--red)' },
      critical: { label: 'Kritik',      color: '#fb923c' },
      warning:  { label: 'Ogohlantirish', color: 'var(--yellow)' },
      notice:   { label: 'Eslatma',     color: 'var(--accent)' },
    };
    const counts: Record<string, number> = { urgent: 0, critical: 0, warning: 0, notice: 0 };
    for (const a of this.alerts()) counts[this.sev(a.type)]++;
    const max = Math.max(1, ...Object.values(counts));
    return Object.keys(buckets).map(k => ({
      label: buckets[k].label,
      count: counts[k],
      pct: Math.round((counts[k] / max) * 100),
      color: buckets[k].color,
    }));
  });

  openTasks     = computed(() => this.tasks().filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length);
  criticalTasks = computed(() => this.tasks().filter(t => t.priority === 'CRITICAL').length);
  tasksByStatus = computed<BarRow[]>(() => {
    const meta: { key: string; label: string; color: string }[] = [
      { key: 'OPEN',        label: 'Ochiq',     color: 'var(--accent)' },
      { key: 'IN_PROGRESS', label: 'Jarayonda', color: 'var(--yellow)' },
      { key: 'DONE',        label: 'Bajarildi', color: '#22c55e' },
      { key: 'CANCELLED',   label: 'Bekor',     color: 'var(--muted)' },
    ];
    const total = Math.max(1, this.tasks().length);
    return meta.map(m => {
      const count = this.tasks().filter(t => t.status === m.key).length;
      return { label: m.label, count, pct: Math.round((count / total) * 100), color: m.color };
    });
  });

  proxyAlive    = computed(() => this.proxy()?.alive ?? 0);
  proxyTotal    = computed(() => this.proxy()?.total ?? 0);
  proxyAlivePct = computed(() => {
    const t = this.proxyTotal();
    return t ? Math.round((this.proxyAlive() / t) * 100) : 0;
  });
  proxyRotations = computed(() => this.proxy()?.rotations ?? 0);

  callsTotal     = computed(() => this.calls().length);
  callsThisMonth = computed(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return this.calls().filter(c => (c.createdAt ?? '').slice(0, 7) === key).length;
  });

  // ── CMS donut ─────────────────────────────────
  cmsDonut = computed<DonutSeg[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this.results()) {
      const k = r.cms || 'Unknown';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let arr = [...counts.entries()].map(([label, count]) => ({ label, count }));
    arr.sort((a, b) => b.count - a.count);
    if (arr.length > 6) {
      const head = arr.slice(0, 6);
      const restCount = arr.slice(6).reduce((s, x) => s + x.count, 0);
      arr = [...head, { label: 'Boshqa', count: restCount }];
    }
    const total = arr.reduce((s, x) => s + x.count, 0) || 1;
    let acc = 0;
    return arr.map(x => {
      const pct = x.count / total;
      const seg: DonutSeg = {
        label: x.label,
        count: x.count,
        pct: Math.round(pct * 100),
        color: CMS_COLORS[x.label] ?? CMS_COLORS['unknown'],
        dash: `${(pct * DONUT_C).toFixed(2)} ${DONUT_C.toFixed(2)}`,
        offset: -(acc * DONUT_C),
      };
      acc += pct;
      return seg;
    });
  });
  cmsTotal = computed(() => this.results().length);

  // ── category bars ─────────────────────────────
  categoryBars = computed<BarRow[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this.results()) {
      const k = (r.category as string) || 'Unknown';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let arr = [...counts.entries()].map(([label, count]) => ({ label, count }));
    arr.sort((a, b) => b.count - a.count);
    arr = arr.slice(0, 8);
    const max = Math.max(1, ...arr.map(x => x.count));
    return arr.map(x => ({
      label: CATEGORY_META[x.label as SiteCategory]?.label ?? x.label,
      count: x.count,
      pct: Math.round((x.count / max) * 100),
      color: CATEGORY_META[x.label as SiteCategory]?.color ?? 'var(--accent)',
    }));
  });

  // ── calls sparkline (last 14 days) ────────────
  callsSpark = computed(() => {
    const days = 14, W = 280, H = 70, pad = 4;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const buckets: { key: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      buckets.push({ key: d.toISOString().slice(0, 10), count: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const c of this.calls()) {
      const k = (c.createdAt ?? '').slice(0, 10);
      const i = idx.get(k);
      if (i !== undefined) buckets[i].count++;
    }
    const max = Math.max(1, ...buckets.map(b => b.count));
    const stepX = (W - pad * 2) / (days - 1);
    const pts = buckets.map((b, i) => {
      const x = pad + i * stepX;
      const y = H - pad - (b.count / max) * (H - pad * 2);
      return { x: +x.toFixed(1), y: +y.toFixed(1) };
    });
    const line = pts.map(p => `${p.x},${p.y}`).join(' ');
    const area = `${pad},${H - pad} ${line} ${(W - pad)},${H - pad}`;
    const last = buckets[buckets.length - 1].count;
    return { line, area, max, W, H, total: buckets.reduce((s, b) => s + b.count, 0), last };
  });

  trendMax(kind: keyof OverviewStats['trends']): number {
    const data = this.overviewStats()?.trends[kind] ?? [];
    return Math.max(1, ...data.map(row => row.count));
  }

  trendHeight(count: number, kind: keyof OverviewStats['trends']): number {
    return Math.max(4, Math.round((count / this.trendMax(kind)) * 44));
  }

  severityLabel(label: string): string {
    switch (label.toLowerCase()) {
      case 'critical': return 'Kritik';
      case 'high': return 'Yuqori';
      case 'medium': return 'O\'rta';
      case 'low': return 'Past';
      case 'info': return 'Info';
      default: return label;
    }
  }

  attackSeverityLabel(label: string): string {
    switch ((label || '').toLowerCase()) {
      case 'critical': return 'Kritik';
      case 'high': return 'Yuqori';
      case 'medium': return 'O\'rta';
      case 'low': return 'Past';
      default: return label || 'Noma\'lum';
    }
  }

  defacementStatusLabel(status: string | null | undefined): string {
    switch (status) {
      case 'SUSPECTED': return 'Gumonli';
      case 'CHANGED': return 'O\'zgargan';
      case 'STABLE': return 'Barqaror';
      case 'BASELINE': return 'Baseline';
      default: return 'Noma\'lum';
    }
  }

  postureClass(score: number): string {
    if (score < 50) return 'critical';
    if (score < 70) return 'high';
    if (score < 85) return 'warn';
    return 'good';
  }

  // ── global search ─────────────────────────────
  searchHits = computed<SearchHit[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const w of this.websites()) {
      const hay = `${w.url} ${w.label ?? ''}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({ kind: 'site', title: w.label || w.url, sub: w.url, link: ['/site', w.id] });
      }
      if (hits.length >= 6) break;
    }
    for (const p of this.PAGES) {
      if (`${p.title} ${p.sub}`.toLowerCase().includes(q)) {
        hits.push({ kind: 'page', title: p.title, sub: p.sub, link: p.link });
      }
    }
    return hits.slice(0, 10);
  });

  go(link: any[]) {
    this.query.set('');
    this.focused.set(false);
    this.router.navigate(link);
  }
  onSearchEnter() {
    const first = this.searchHits()[0];
    if (first) this.go(first.link);
  }
  blurSoon() { setTimeout(() => this.focused.set(false), 150); }

  formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    const digits = value >= 10 || unit === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unit]}`;
  }

  formatUptime(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '0s';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days} kun ${hours} soat`;
    if (hours > 0) return `${hours} soat ${minutes} daqiqa`;
    if (minutes > 0) return `${minutes} daqiqa`;
    return `${seconds}s`;
  }

  formatRelativeTime(value: string | null | undefined): string {
    if (!value) return 'hali yoq';
    const time = new Date(value).getTime();
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

  formatIpList(ips: string[] | null | undefined): string {
    if (!ips?.length) return 'local IP topilmadi';
    return ips.slice(0, 3).join(', ');
  }

  systemStatusLabel(status: SystemStatus['status'] | undefined): string {
    switch (status) {
      case 'OK': return 'Barqaror';
      case 'WARN': return 'Ogohlantirish';
      case 'ERROR': return 'Xato';
      default: return 'Noma\'lum';
    }
  }

  // ── helpers ───────────────────────────────────
  private sev(t: AlertType): 'urgent' | 'critical' | 'warning' | 'notice' {
    if (t.endsWith('urgent') || t === 'site_down') return 'urgent';
    if (t.endsWith('critical')) return 'critical';
    if (t.endsWith('warning') || t === 'cms_change') return 'warning';
    return 'notice';
  }
}
