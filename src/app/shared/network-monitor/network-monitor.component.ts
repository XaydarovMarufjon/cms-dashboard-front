
import { Component, AfterViewInit, OnDestroy, NgZone, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

type NetworkConnection = EventTarget & {
  effectiveType?: string;
  type?: string;
  downlink?: number;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkConnection;
  mozConnection?: NetworkConnection;
  webkitConnection?: NetworkConnection;
};

@Component({
  selector: 'app-network-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './network-monitor.component.html',
  styleUrls: ['./network-monitor.component.scss'],
})
export class NetworkMonitorComponent implements AfterViewInit, OnDestroy {
  private zone = inject(NgZone);

  isOnline  = signal(navigator.onLine);
  latency   = signal<number | null>(null);
  speed     = signal<number | null>(null);
  measuring = signal(false);
  isp       = signal<string | null>(null);
  connectionType = signal('Online');
  browserDownlink = signal<number | null>(null);

  private pingId    = 0;
  private destroyed = false;
  private speedRunning = false;
  private connection: NetworkConnection | null = null;

  private onOnline  = () => this.zone.run(() => this.isOnline.set(true));
  private onOffline = () => this.zone.run(() => this.isOnline.set(false));
  private onConnectionChange = () => this.zone.run(() => this.updateConnectionInfo());

  status = computed(() => {
    if (!this.isOnline()) return 'offline';
    const s = this.speed();
    if (s === null) return 'connecting';
    if (s >= 50) return 'excellent';
    if (s >= 10) return 'good';
    if (s >= 2)  return 'slow';
    return 'bad';
  });

  statusLabel = computed(() => ({
    offline: 'Offline', connecting: 'Ulanmoqda…',
    excellent: 'A\'lo', good: 'Yaxshi', slow: 'Sekin', bad: 'Yomon',
  }[this.status()] ?? '…'));

  connectionLabel = computed(() => {
    if (!this.isOnline()) return 'Offline';
    return this.connectionType();
  });

  connectionTitle = computed(() => {
    const estimate = this.browserDownlink();
    if (estimate === null) return this.statusLabel();
    return `${this.statusLabel()} · brauzer taxmini: ${this.fmtSpeed(estimate)}`;
  });

  signalBars = computed(() => ({
    excellent:  4,
    good:       3,
    slow:       2,
    bad:        1,
    offline:    0,
    connecting: 0,
  }[this.status()] ?? 0));

  barColor = computed(() => ({
    excellent:  '#00e5c0',
    good:       '#00e5c0',
    slow:       '#ffc84a',
    bad:        '#fb923c',
    offline:    '#2a2b3d',
    connecting: '#5a7aff',
  }[this.status()] ?? '#2a2b3d'));

  ngAfterViewInit() {
    window.addEventListener('online',  this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.connection = this.getConnection();
    this.connection?.addEventListener('change', this.onConnectionChange);
    this.updateConnectionInfo();
    this.runPingLoop();
    this.runSpeedLoop();
    this.fetchIsp();
  }

  ngOnDestroy() {
    this.destroyed = true;
    window.removeEventListener('online',  this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    this.connection?.removeEventListener('change', this.onConnectionChange);
    clearInterval(this.pingId);
  }

  private getConnection(): NetworkConnection | null {
    const nav = navigator as NavigatorWithConnection;
    return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
  }

  private updateConnectionInfo() {
    const connection = this.connection ?? this.getConnection();
    const type = connection?.type || connection?.effectiveType;
    const downlink = typeof connection?.downlink === 'number' ? connection.downlink : null;

    this.connectionType.set(this.normalizeConnectionType(type));
    this.browserDownlink.set(downlink);
  }

  private normalizeConnectionType(type?: string): string {
    const value = type?.toLowerCase();
    if (!value || value === 'unknown' || value === 'other') return 'Online';

    const labels: Record<string, string> = {
      wifi: 'WiFi',
      ethernet: 'Ethernet',
      cellular: 'Mobile',
      bluetooth: 'Bluetooth',
      wimax: 'WiMAX',
      none: 'Offline',
      'slow-2g': '2G-',
      '2g': '2G',
      '3g': '3G',
      '4g': '4G',
      '5g': '5G',
    };

    return labels[value] ?? value.toUpperCase();
  }

  private async fetchIsp() {
    try {
      const r = await fetch(`${environment.apiUrl}/scanner/isp`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const d = await r.json();
      this.zone.run(() => this.isp.set(d?.isp || null));
    } catch {
      // silently ignore — ISP optional info
    }
  }

  private async runPingLoop() {
    const ping = async () => {
      const t0 = performance.now();
      try {
        await fetch('https://1.1.1.1', {
          method: 'HEAD', mode: 'no-cors', cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        const ms = Math.round(performance.now() - t0);
        this.zone.run(() => this.latency.set(ms));
      } catch {
        this.zone.run(() => this.latency.set(null));
      }
    };
    await ping();
    if (!this.destroyed)
      this.pingId = window.setInterval(ping, 3000);
  }

  private async runSpeedLoop() {
    if (this.speedRunning || this.destroyed) return;
    this.speedRunning = true;
    const measure = async () => {
      if (this.destroyed) return;
      this.zone.run(() => this.measuring.set(true));
      try {
        const url = `https://speed.cloudflare.com/__down?bytes=524288&_=${Date.now()}`;
        const t0  = performance.now();
        const r   = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        const buf = await r.arrayBuffer();
        const sec = (performance.now() - t0) / 1000;
        const mbps = parseFloat(((buf.byteLength * 8) / (sec * 1_000_000)).toFixed(2));
        this.zone.run(() => { this.speed.set(mbps > 0 ? mbps : null); this.measuring.set(false); });
      } catch {
        this.zone.run(() => this.measuring.set(false));
      }
      if (!this.destroyed) setTimeout(measure, 30000);
    };
    await measure();
  }

  fmtLatency(ms: number | null): string {
    return ms === null ? '—' : `${ms} ms`;
  }

  fmtSpeed(mbps: number | null): string {
    if (mbps === null) return '—';
    if (mbps < 1)    return `${(mbps * 1000).toFixed(0)} Kbps`;
    if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
    return `${mbps.toFixed(1)} Mbps`;
  }
}
