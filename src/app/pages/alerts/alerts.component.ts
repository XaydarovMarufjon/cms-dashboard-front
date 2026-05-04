import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ScannerService, Alert, AlertType } from '../../core/services/scanner.service';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './alerts.component.html',
  styleUrls: ['./alerts.component.scss'],
})
export class AlertsComponent implements OnInit {
  private scanner = inject(ScannerService);

  alerts    = signal<Alert[]>([]);
  loading   = signal(true);
  dismissing = signal<Set<string>>(new Set());

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.scanner.getAlerts());
      this.alerts.set(data);
    } catch { /* ignore */ }
    finally { this.loading.set(false); }
  }

  async dismiss(alert: Alert) {
    this.dismissing.update(s => { const n = new Set(s); n.add(alert.id); return n; });
    try {
      await firstValueFrom(this.scanner.dismissAlert(alert.id));
      this.alerts.update(list => list.filter(a => a.id !== alert.id));
    } catch { /* ignore */ }
    finally {
      this.dismissing.update(s => { const n = new Set(s); n.delete(alert.id); return n; });
    }
  }

  isDismissing(id: string): boolean {
    return this.dismissing().has(id);
  }

  daysLeft(dueDateStr: string): number {
    return Math.ceil((new Date(dueDateStr).getTime() - Date.now()) / 86_400_000);
  }

  isUrgent(type: AlertType): boolean {
    return type === 'expiry_urgent' || type === 'ssl_expiry_urgent' || type === 'site_down';
  }

  isSsl(type: AlertType): boolean {
    return type.startsWith('ssl_');
  }

  isCmsChange(type: AlertType): boolean {
    return type === 'cms_change';
  }

  isSiteDown(type: AlertType): boolean {
    return type === 'site_down';
  }

  typeLabel(type: AlertType): string {
    if (type === 'expiry_urgent'      || type === 'ssl_expiry_urgent')   return 'SHOSHILINCH';
    if (type === 'expiry_critical'    || type === 'ssl_expiry_critical') return 'Kritik';
    if (type === 'expiry_warning'     || type === 'ssl_expiry_warning')  return 'Ogohlantirish';
    if (type === 'cms_change') return 'CMS O\'zgardi';
    if (type === 'site_down')  return 'Sayt Ishlamayapti';
    return 'Eslatma';
  }

  cssType(type: AlertType): string {
    if (type === 'expiry_urgent'   || type === 'ssl_expiry_urgent' || type === 'site_down') return 'expiry_urgent';
    if (type === 'expiry_critical' || type === 'ssl_expiry_critical') return 'expiry_critical';
    if (type === 'expiry_warning'  || type === 'ssl_expiry_warning')  return 'expiry_warning';
    if (type === 'cms_change') return 'expiry_warning';
    return 'expiry_notice';
  }

  urgentCount()     { return this.alerts().filter(a => this.isUrgent(a.type)).length; }
  criticalCount()   { return this.alerts().filter(a => a.type === 'expiry_critical'  || a.type === 'ssl_expiry_critical').length; }
  warningCount()    { return this.alerts().filter(a => a.type === 'expiry_warning'   || a.type === 'ssl_expiry_warning').length; }
  noticeCount()     { return this.alerts().filter(a => a.type === 'expiry_notice'    || a.type === 'ssl_expiry_notice').length; }
  cmsChangeCount()  { return this.alerts().filter(a => a.type === 'cms_change').length; }
  siteDownCount()   { return this.alerts().filter(a => a.type === 'site_down').length; }
}
