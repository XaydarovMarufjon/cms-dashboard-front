
import { Component, AfterViewInit, OnDestroy, NgZone, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  private pingId    = 0;
  private destroyed = false;
  private speedRunning = false;

  private onOnline  = () => this.zone.run(() => this.isOnline.set(true));
  private onOffline = () => this.zone.run(() => this.isOnline.set(false));

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
    this.runPingLoop();
    this.runSpeedLoop();
    this.fetchIsp();
  }

  ngOnDestroy() {
    this.destroyed = true;
    window.removeEventListener('online',  this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    clearInterval(this.pingId);
  }

  private async fetchIsp() {
    try {
      const r = await fetch('https://ipapi.co/json/', {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      const d = await r.json();
      const raw: string = d.org ?? d.isp ?? '';
      // strip "AS12345 " prefix
      const name = raw.replace(/^AS\d+\s+/i, '').trim();
      this.zone.run(() => this.isp.set(name || null));
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
