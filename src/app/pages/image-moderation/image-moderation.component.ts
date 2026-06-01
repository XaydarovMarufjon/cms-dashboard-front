import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  ImageModerationService, SiteOverviewEntry, ScanDetail, ImageResult,
} from '../../core/services/image-moderation.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-image-moderation',
  standalone: true,
  imports: [CommonModule, RouterLink, SideNavComponent],
  templateUrl: './image-moderation.component.html',
  styleUrls: ['./image-moderation.component.scss'],
})
export class ImageModerationComponent implements OnInit {
  private svc = inject(ImageModerationService);

  loading       = signal(true);
  scanning      = signal<Set<string>>(new Set());
  scanningAll   = signal(false);
  configured    = signal(true);
  running       = signal(false);
  maxPages      = signal(0);
  maxImages     = signal(0);

  sites         = signal<SiteOverviewEntry[]>([]);
  selectedSite  = signal<SiteOverviewEntry | null>(null);
  detail        = signal<ScanDetail | null>(null);
  detailLoading = signal(false);

  filter = signal<'all' | 'flagged' | 'sexual' | 'violent' | 'religious'>('all');

  totalSites    = computed(() => this.sites().length);
  totalFlagged  = computed(() =>
    this.sites().reduce((sum, s) => sum + (s.latestScan?.flaggedCount ?? 0), 0));
  totalSexual   = computed(() =>
    this.sites().reduce((sum, s) => sum + (s.latestScan?.sexualCount ?? 0), 0));
  totalViolent  = computed(() =>
    this.sites().reduce((sum, s) => sum + (s.latestScan?.violentCount ?? 0), 0));
  totalReligious = computed(() =>
    this.sites().reduce((sum, s) => sum + (s.latestScan?.religiousCount ?? 0), 0));

  filteredResults = computed<ImageResult[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const f = this.filter();
    if (f === 'all') return d.results;
    if (f === 'flagged') return d.results.filter(r => r.flagged);
    return d.results.filter(r => r.categories.includes(f));
  });

  async ngOnInit() {
    await Promise.all([this.loadStatus(), this.loadOverview()]);
  }

  private async loadStatus() {
    try {
      const s = await firstValueFrom(this.svc.getStatus());
      this.configured.set(s.configured);
      this.running.set(s.running);
      this.maxPages.set(s.maxPages ?? 0);
      this.maxImages.set(s.maxImages ?? 0);
    } catch { /* ignore */ }
  }

  private async loadOverview() {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.svc.getOverview());
      this.sites.set(data);
    } catch { /* ignore */ }
    finally { this.loading.set(false); }
  }

  async openSite(site: SiteOverviewEntry) {
    this.selectedSite.set(site);
    this.detail.set(null);
    if (!site.latestScan) return;
    this.detailLoading.set(true);
    try {
      const d = await firstValueFrom(this.svc.getScanDetail(site.latestScan.id));
      this.detail.set(d);
    } catch { /* ignore */ }
    finally { this.detailLoading.set(false); }
  }

  closeDetail() {
    this.selectedSite.set(null);
    this.detail.set(null);
    this.filter.set('all');
  }

  async rescan(site: SiteOverviewEntry, event?: Event) {
    event?.stopPropagation();
    this.scanning.update(s => { const n = new Set(s); n.add(site.id); return n; });
    try {
      await firstValueFrom(this.svc.scanOne(site.id, site.url));
      await this.loadOverview();
      if (this.selectedSite()?.id === site.id) {
        const fresh = this.sites().find(s => s.id === site.id);
        if (fresh) await this.openSite(fresh);
      }
    } catch { /* ignore */ }
    finally {
      this.scanning.update(s => { const n = new Set(s); n.delete(site.id); return n; });
    }
  }

  async runAll() {
    if (this.scanningAll()) return;
    this.scanningAll.set(true);
    try {
      await firstValueFrom(this.svc.scanAll());
      await this.loadOverview();
    } catch { /* ignore */ }
    finally { this.scanningAll.set(false); }
  }

  isScanning(id: string): boolean {
    return this.scanning().has(id);
  }

  hostOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  fmtScore(n: number): string {
    return (n * 100).toFixed(0) + '%';
  }

  statusLabel(status?: string | null): string {
    if (!status) return '—';
    if (status === 'COMPLETED') return 'Tugadi';
    if (status === 'RUNNING')   return 'Skanerda';
    if (status === 'FAILED')    return 'Xato';
    if (status === 'PENDING')   return 'Kutilmoqda';
    return status;
  }
}
