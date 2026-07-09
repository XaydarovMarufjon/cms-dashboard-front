import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ScannerService, Alert, AlertType, OsintDorkConfig, OsintDorkFinding } from '../../core/services/scanner.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SideNavComponent],
  templateUrl: './alerts.component.html',
  styleUrls: ['./alerts.component.scss'],
})
export class AlertsComponent implements OnInit {
  private scanner = inject(ScannerService);

  alerts    = signal<Alert[]>([]);
  falsePositiveAlerts = signal<Alert[]>([]);
  osintFindings = signal<OsintDorkFinding[]>([]);
  osintFalsePositiveFindings = signal<OsintDorkFinding[]>([]);
  osintConfig = signal<OsintDorkConfig | null>(null);
  loading   = signal(true);
  acting = signal<Set<string>>(new Set());
  osintActing = signal<Set<string>>(new Set());
  filterTag = signal('all');
  activeTab = signal<'alerts' | 'osint'>('alerts');
  osintScanning = signal(false);
  osintScanMessage = signal('');
  manualOsintUrl = signal('');
  manualOsintTitle = signal('');
  manualOsintEvidence = signal('');
  manualSaving = signal(false);

  readonly TAG_LABELS: Record<string, string> = {
    gov: 'Gov saytlar',
  };

  readonly OSINT_CATEGORY_LABELS: Record<string, string> = {
    personal_data: 'Shaxsiy ma\'lumot',
    confidential_file: 'Maxfiy fayl',
    secret_config: 'Secret/config',
    backup_dump: 'Backup/dump',
    admin_surface: 'Admin yuza',
    manual_evidence: 'Qo\'lda saqlangan',
  };

  filteredAlerts = computed(() => this.filterAlerts(this.alerts()));
  filteredFalsePositiveAlerts = computed(() => this.filterAlerts(this.falsePositiveAlerts()));
  allAlertCount = computed(() => this.alerts().length + this.falsePositiveAlerts().length);
  alertTabCount = computed(() => this.filteredAlerts().length + this.filteredFalsePositiveAlerts().length);
  osintTabCount = computed(() => this.osintFindings().length + this.osintFalsePositiveFindings().length);
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
      const [config, osint, osintFalsePositive] = await Promise.all([
        firstValueFrom(this.scanner.getOsintDorkConfig()),
        firstValueFrom(this.scanner.getOsintDorkFindings()),
        firstValueFrom(this.scanner.getOsintDorkFalsePositive()),
      ]);
      this.osintConfig.set(config);
      this.osintFindings.set(osint);
      this.osintFalsePositiveFindings.set(osintFalsePositive);
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

  async runOsintScan() {
    this.osintScanning.set(true);
    this.osintScanMessage.set('');
    try {
      const result = await firstValueFrom(this.scanner.runOsintDorkScan({ limitPerQuery: 5 }));
      if (result.providerConfigured) {
        const errorText = result.errors?.length ? ` · ${result.errors.length} xato` : '';
        this.osintScanMessage.set(`${result.scannedDomains} domen tekshirildi · ${result.saved} dalil saqlandi${errorText}`);
      } else {
        this.osintScanMessage.set(`${result.queries.length} query tayyor. Google CSE API sozlangandan keyin avtomatik natija saqlanadi.`);
      }
      const [osint, osintFalsePositive] = await Promise.all([
        firstValueFrom(this.scanner.getOsintDorkFindings()),
        firstValueFrom(this.scanner.getOsintDorkFalsePositive()),
      ]);
      this.osintFindings.set(osint);
      this.osintFalsePositiveFindings.set(osintFalsePositive);
    } catch (e: any) {
      this.osintScanMessage.set(e?.error?.message || 'OSINT scan bajarilmadi');
    } finally {
      this.osintScanning.set(false);
    }
  }

  async saveManualOsint() {
    const url = this.manualOsintUrl().trim();
    if (!url) return;
    this.manualSaving.set(true);
    this.osintScanMessage.set('');
    try {
      const finding = await firstValueFrom(this.scanner.createOsintDorkFinding({
        url,
        title: this.manualOsintTitle().trim() || undefined,
        evidence: this.manualOsintEvidence().trim() || undefined,
        category: 'manual_evidence',
        severity: 'MEDIUM',
      }));
      this.osintFindings.update(list => [finding, ...list.filter(item => item.id !== finding.id)]);
      this.manualOsintUrl.set('');
      this.manualOsintTitle.set('');
      this.manualOsintEvidence.set('');
      this.osintScanMessage.set('Dalil saqlandi');
    } catch (e: any) {
      this.osintScanMessage.set(e?.error?.message || 'Dalil saqlanmadi');
    } finally {
      this.manualSaving.set(false);
    }
  }

  async dismissOsint(finding: OsintDorkFinding) {
    this.setOsintActing(finding.id, true);
    try {
      await firstValueFrom(this.scanner.dismissOsintDorkFinding(finding.id));
      this.osintFindings.update(list => list.filter(item => item.id !== finding.id));
    } catch { /* ignore */ }
    finally {
      this.setOsintActing(finding.id, false);
    }
  }

  async markOsintFalsePositive(finding: OsintDorkFinding) {
    this.setOsintActing(finding.id, true);
    try {
      const updated = await firstValueFrom(this.scanner.markOsintDorkFalsePositive(finding.id));
      this.osintFindings.update(list => list.filter(item => item.id !== finding.id));
      this.osintFalsePositiveFindings.update(list => [updated, ...list.filter(item => item.id !== finding.id)]);
    } catch { /* ignore */ }
    finally {
      this.setOsintActing(finding.id, false);
    }
  }

  async restoreOsint(finding: OsintDorkFinding) {
    this.setOsintActing(finding.id, true);
    try {
      const updated = await firstValueFrom(this.scanner.restoreOsintDorkFinding(finding.id));
      this.osintFalsePositiveFindings.update(list => list.filter(item => item.id !== finding.id));
      this.osintFindings.update(list => [updated, ...list.filter(item => item.id !== finding.id)]);
    } catch { /* ignore */ }
    finally {
      this.setOsintActing(finding.id, false);
    }
  }

  isActing(id: string): boolean {
    return this.acting().has(id);
  }

  isOsintActing(id: string): boolean {
    return this.osintActing().has(id);
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

  private setOsintActing(id: string, value: boolean) {
    this.osintActing.update(s => {
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

  osintCriticalCount() { return this.osintFindings().filter(f => f.severity === 'CRITICAL').length; }
  osintHighCount() { return this.osintFindings().filter(f => f.severity === 'HIGH').length; }

  osintCategoryLabel(category: string): string {
    return this.OSINT_CATEGORY_LABELS[category] ?? category;
  }

  osintSeverityLabel(severity: string): string {
    if (severity === 'CRITICAL') return 'Kritik';
    if (severity === 'HIGH') return 'Yuqori';
    if (severity === 'LOW') return 'Past';
    return 'O‘rta';
  }

  osintSeverityClass(severity: string): string {
    if (severity === 'CRITICAL') return 'critical';
    if (severity === 'HIGH') return 'high';
    if (severity === 'LOW') return 'low';
    return 'medium';
  }

  hostFromUrl(value: string): string {
    return this.extractHostname(value);
  }

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
