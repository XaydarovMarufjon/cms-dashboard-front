import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ScannerService, PortScanResult } from '../../core/services/scanner.service';
import { TasksService } from '../../core/services/tasks.service';
import { WebsiteService } from '../../core/services/website.service';
import { Website } from '../../shared/models/website.model';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-port-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SideNavComponent],
  templateUrl: './port-scanner.component.html',
  styleUrls: ['./port-scanner.component.scss'],
})
export class PortScannerComponent implements OnInit {
  private websitesService = inject(WebsiteService);
  private scanner = inject(ScannerService);
  private tasks = inject(TasksService);

  websites = signal<Website[]>([]);
  selectedWebsiteId = signal('');
  siteInput = signal('');
  portInput = signal('21,22,25,53,80,443,445,3306,3389,5432,6379,8000,8080,8443,9200,27017');
  results = signal<PortScanResult[]>([]);
  loadingSites = signal(false);
  loadingResults = signal(false);
  scanning = signal(false);
  preparingSite = signal(false);
  error = signal('');
  success = signal('');
  taskLoading = signal<string | null>(null);

  selectedWebsite = computed(() => {
    const id = this.selectedWebsiteId();
    return this.websites().find(site => site.id === id) ?? null;
  });

  openPorts = computed(() => this.results().filter(row => row.status === 'OPEN'));
  closedPorts = computed(() => this.results().filter(row => row.status === 'CLOSED'));
  filteredPorts = computed(() => this.results().filter(row => row.status === 'FILTERED'));

  ngOnInit() {
    this.loadWebsites();
  }

  loadWebsites() {
    this.loadingSites.set(true);
    this.error.set('');

    this.websitesService.getAll().subscribe({
      next: sites => {
        this.websites.set(sites);
        this.loadingSites.set(false);
        if (sites.length && !this.selectedWebsiteId() && !this.siteInput().trim()) {
          this.selectWebsite(sites[0].id);
        }
      },
      error: () => {
        this.loadingSites.set(false);
        this.error.set('Saytlar ro\'yxatini yuklab bo\'lmadi');
      },
    });
  }

  selectWebsite(id: string) {
    const site = this.websites().find(item => item.id === id);
    this.selectedWebsiteId.set(id);
    if (site) this.siteInput.set(site.url);
    this.results.set([]);
    this.success.set('');
    this.error.set('');
    this.loadResults();
  }

  onSiteInput(value: string) {
    this.siteInput.set(value);
    this.success.set('');
    this.error.set('');

    const matched = this.findWebsiteByText(value);
    if (matched) {
      if (matched.id !== this.selectedWebsiteId()) {
        this.selectedWebsiteId.set(matched.id);
        this.results.set([]);
        this.loadResults();
      }
      return;
    }

    this.selectedWebsiteId.set('');
    this.results.set([]);
  }

  loadResults() {
    const id = this.selectedWebsiteId();
    if (!id) return;
    this.loadingResults.set(true);
    this.scanner.getPortScanResults(id).subscribe({
      next: rows => {
        this.results.set(rows);
        this.loadingResults.set(false);
      },
      error: () => {
        this.loadingResults.set(false);
        this.error.set('Port scan natijalarini yuklab bo\'lmadi');
      },
    });
  }

  async runScan() {
    if (this.preparingSite() || this.scanning()) return;

    let website: Website;
    try {
      this.preparingSite.set(true);
      website = await this.resolveWebsiteFromInput();
    } catch (err: any) {
      this.preparingSite.set(false);
      this.error.set(err?.message || err?.error?.message || 'Website URL noto\'g\'ri. Masalan: example.com yoki https://example.com');
      return;
    }

    this.preparingSite.set(false);
    this.selectedWebsiteId.set(website.id);
    this.siteInput.set(website.url);
    this.runScanForWebsite(website.id);
  }

  private runScanForWebsite(websiteId: string) {
    if (this.scanning()) return;

    const ports = this.parsePorts(this.portInput());
    if (!ports.length) {
      this.error.set('Port ro\'yxati noto\'g\'ri. Masalan: 80,443,8080');
      return;
    }

    this.scanning.set(true);
    this.error.set('');
    this.success.set('');

    this.scanner.scanPorts(websiteId, { ports }).subscribe({
      next: rows => {
        this.results.set(rows);
        this.scanning.set(false);
        this.success.set('Port scan yakunlandi');
      },
      error: err => {
        this.scanning.set(false);
        this.error.set(err?.error?.message || 'Port scan bajarilmadi');
      },
    });
  }

  private async findOrCreateWebsite(url: string): Promise<Website> {
    const existing = this.findWebsiteByUrl(url);
    if (existing) return existing;

    const created = await firstValueFrom(this.websitesService.create({ url }));
    this.websites.update(list => [created, ...list]);
    return created;
  }

  private async resolveWebsiteFromInput(): Promise<Website> {
    const typed = this.siteInput().trim();
    if (!typed) throw new Error('Website URL kiriting');

    const exact = this.findWebsiteByText(typed);
    if (exact) return exact;

    const url = this.normalizeUrl(typed);
    if (!url) throw new Error('Website URL noto\'g\'ri. Masalan: example.com yoki https://example.com');

    return this.findOrCreateWebsite(url);
  }

  private findWebsiteByUrl(url: string): Website | null {
    const key = this.urlKey(url);
    return this.websites().find(site => this.urlKey(site.url) === key) ?? null;
  }

  private findWebsiteByText(value: string): Website | null {
    const text = value.trim().toLowerCase();
    if (!text) return null;

    const normalized = this.normalizeUrl(value);
    const key = normalized ? this.urlKey(normalized) : '';

    return this.websites().find(site => {
      const label = this.siteLabel(site).toLowerCase();
      const url = site.url.toLowerCase();
      const bareUrl = this.stripProtocol(site.url).toLowerCase();
      return label === text || url === text || bareUrl === text || (!!key && this.urlKey(site.url) === key);
    }) ?? null;
  }

  createTask(row: PortScanResult) {
    const websiteId = this.selectedWebsiteId();
    if (!websiteId || this.taskLoading()) return;

    this.taskLoading.set(row.id);
    this.error.set('');
    this.success.set('');

    this.tasks.create({
      title: `${row.host}:${row.port} ochiq port tekshiruvi`,
      description: `${row.host}:${row.port}/${row.protocol} ${row.service ? `(${row.service}) ` : ''}ochiq holatda topildi. Kerak bo'lmasa yopish yoki firewall bilan cheklash kerak.`,
      source: 'PORT',
      priority: this.portPriority(row.port),
      websiteId,
    }).subscribe({
      next: () => {
        this.taskLoading.set(null);
        this.success.set(`${row.port} port bo'yicha vazifa yaratildi`);
      },
      error: err => {
        this.taskLoading.set(null);
        this.error.set(err?.error?.message || 'Vazifa yaratilmadi');
      },
    });
  }

  siteLabel(site: Website): string {
    return site.label || this.stripProtocol(site.url);
  }

  statusLabel(status: string): string {
    return { OPEN: 'Ochiq', CLOSED: 'Yopiq', FILTERED: 'Filtrlangan' }[status] ?? status;
  }

  statusClass(status: string): string {
    return status.toLowerCase();
  }

  private parsePorts(value: string): number[] {
    return [...new Set(
      value
        .split(/[,\s]+/)
        .map(part => Number(part.trim()))
        .filter(port => Number.isInteger(port) && port > 0 && port <= 65535),
    )].slice(0, 100);
  }

  private normalizeUrl(value: string): string {
    const raw = value.trim();
    if (!raw) return '';

    try {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const parsed = new URL(withProtocol);
      if (!parsed.hostname || parsed.hostname.includes(' ')) return '';
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`;
    } catch {
      return '';
    }
  }

  private urlKey(url: string): string {
    const normalized = this.normalizeUrl(url);
    if (!normalized) return url.trim().toLowerCase().replace(/\/$/, '');
    try {
      const parsed = new URL(normalized);
      return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    } catch {
      return normalized;
    }
  }

  private portPriority(port: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if ([21, 22, 445, 1433, 2375, 3306, 3389, 5432, 5900, 6379, 9200, 9300, 27017].includes(port)) {
      return 'HIGH';
    }
    if ([80, 443, 8080, 8443].includes(port)) return 'MEDIUM';
    return 'LOW';
  }

  private stripProtocol(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}
