import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ScannerService, Alert, AlertType } from '../../core/services/scanner.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, RouterLink, SideNavComponent],
  templateUrl: './alerts.component.html',
  styleUrls: ['./alerts.component.scss'],
})
export class AlertsComponent implements OnInit {
  private scanner = inject(ScannerService);

  alerts    = signal<Alert[]>([]);
  falsePositiveAlerts = signal<Alert[]>([]);
  loading   = signal(true);
  acting = signal<Set<string>>(new Set());
  filterTag = signal('all');

  readonly TAG_LABELS: Record<string, string> = {
    gov: 'Gov saytlar',
  };

  filteredAlerts = computed(() => this.filterAlerts(this.alerts()));
  filteredFalsePositiveAlerts = computed(() => this.filterAlerts(this.falsePositiveAlerts()));
  allAlertCount = computed(() => this.alerts().length + this.falsePositiveAlerts().length);
  govTagCount = computed(() =>
    [...this.alerts(), ...this.falsePositiveAlerts()].filter(alert => this.isGovAlert(alert)).length
  );

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const [active, falsePositive] = await Promise.all([
        firstValueFrom(this.scanner.getAlerts()),
        firstValueFrom(this.scanner.getFalsePositiveAlerts()),
      ]);
      this.alerts.set(active);
      this.falsePositiveAlerts.set(falsePositive);
    } catch { /* ignore */ }
    finally { this.loading.set(false); }
  }

  async dismiss(alert: Alert) {
    this.setActing(alert.id, true);
    try {
      await firstValueFrom(this.scanner.dismissAlert(alert.id));
      this.alerts.update(list => list.filter(a => a.id !== alert.id));
    } catch { /* ignore */ }
    finally {
      this.setActing(alert.id, false);
    }
  }

  async markFalsePositive(alert: Alert) {
    this.setActing(alert.id, true);
    try {
      const updated = await firstValueFrom(this.scanner.markAlertFalsePositive(alert.id));
      this.alerts.update(list => list.filter(a => a.id !== alert.id));
      this.falsePositiveAlerts.update(list => [updated, ...list.filter(a => a.id !== alert.id)]);
    } catch { /* ignore */ }
    finally {
      this.setActing(alert.id, false);
    }
  }

  async restore(alert: Alert) {
    this.setActing(alert.id, true);
    try {
      const updated = await firstValueFrom(this.scanner.restoreAlert(alert.id));
      this.falsePositiveAlerts.update(list => list.filter(a => a.id !== alert.id));
      this.alerts.update(list => [...list, updated].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    } catch { /* ignore */ }
    finally {
      this.setActing(alert.id, false);
    }
  }

  isActing(id: string): boolean {
    return this.acting().has(id);
  }

  tagLabel(tag: string): string {
    return this.TAG_LABELS[tag] ?? tag;
  }

  isGovAlert(alert: Alert): boolean {
    const host = this.extractHostname(alert.domain);
    return /(^|\.)gov(\.|$)/.test(host);
  }

  private setActing(id: string, value: boolean) {
    this.acting.update(s => {
      const n = new Set(s);
      if (value) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  daysLeft(dueDateStr: string): number {
    return Math.ceil((new Date(dueDateStr).getTime() - Date.now()) / 86_400_000);
  }

  isUrgent(type: AlertType): boolean {
    return type === 'expiry_urgent' || type === 'ssl_expiry_urgent' || type === 'site_down' || type === 'defacement_change';
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

  isDefacement(type: AlertType): boolean {
    return type === 'defacement_change';
  }

  typeLabel(type: AlertType): string {
    if (type === 'expiry_urgent'      || type === 'ssl_expiry_urgent')   return 'SHOSHILINCH';
    if (type === 'expiry_critical'    || type === 'ssl_expiry_critical') return 'Kritik';
    if (type === 'expiry_warning'     || type === 'ssl_expiry_warning')  return 'Ogohlantirish';
    if (type === 'cms_change') return 'CMS O\'zgardi';
    if (type === 'site_down')  return 'Sayt Ishlamayapti';
    if (type === 'defacement_change') return 'Defacement';
    return 'Eslatma';
  }

  expiredLabel(type: AlertType): string {
    if (this.isSsl(type))      return 'SSL sertifikati muddati tugagan';
    if (this.isSiteDown(type)) return 'Sayt ishlamayapti';
    if (this.isCmsChange(type)) return 'CMS o\'zgargan';
    if (this.isDefacement(type)) return 'Defacement gumoni';
    return 'Domen muddati tugagan';
  }

  cssType(type: AlertType): string {
    if (type === 'expiry_urgent'   || type === 'ssl_expiry_urgent' || type === 'site_down' || type === 'defacement_change') return 'expiry_urgent';
    if (type === 'expiry_critical' || type === 'ssl_expiry_critical') return 'expiry_critical';
    if (type === 'expiry_warning'  || type === 'ssl_expiry_warning')  return 'expiry_warning';
    if (type === 'cms_change') return 'expiry_warning';
    return 'expiry_notice';
  }

  urgentCount()     { return this.filteredAlerts().filter(a => this.isUrgent(a.type)).length; }
  criticalCount()   { return this.filteredAlerts().filter(a => a.type === 'expiry_critical'  || a.type === 'ssl_expiry_critical').length; }
  warningCount()    { return this.filteredAlerts().filter(a => a.type === 'expiry_warning'   || a.type === 'ssl_expiry_warning').length; }
  noticeCount()     { return this.filteredAlerts().filter(a => a.type === 'expiry_notice'    || a.type === 'ssl_expiry_notice').length; }
  cmsChangeCount()  { return this.filteredAlerts().filter(a => a.type === 'cms_change').length; }
  siteDownCount()   { return this.filteredAlerts().filter(a => a.type === 'site_down').length; }
  defacementCount() { return this.filteredAlerts().filter(a => a.type === 'defacement_change').length; }
  falsePositiveCount() { return this.filteredFalsePositiveAlerts().length; }

  private filterAlerts(list: Alert[]): Alert[] {
    const tag = this.filterTag();
    if (tag === 'gov') return list.filter(alert => this.isGovAlert(alert));
    return list;
  }

  private extractHostname(value: string | null | undefined): string {
    const raw = (value ?? '').trim();
    if (!raw) return '';
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
      return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase().replace(/^www\./, '');
    }
  }
}
