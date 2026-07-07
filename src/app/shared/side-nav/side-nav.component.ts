import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { ScannerService } from '../../core/services/scanner.service';
import { NetworkMonitorComponent } from '../network-monitor/network-monitor.component';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, NetworkMonitorComponent],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss'],
})
export class SideNavComponent implements OnInit, OnDestroy {
  auth          = inject(AuthService);
  themeService  = inject(ThemeService);
  private scanner = inject(ScannerService);

  sidebarCollapsed = signal(false);
  alertCount       = signal(0);
  cveCount         = signal(0);
  private badgeRefreshSub?: Subscription;

  ngOnInit() {
    this.loadBadgeCounts();
    this.badgeRefreshSub = this.scanner.scanBadgeRefresh$.subscribe(() => this.loadBadgeCounts());
  }

  ngOnDestroy() {
    this.badgeRefreshSub?.unsubscribe();
  }

  private loadBadgeCounts() {
    this.scanner.getAlertCount().subscribe({
      next: r => this.alertCount.set(r.count),
      error: () => {},
    });
    this.scanner.getOverviewStats().subscribe({
      next: r => this.cveCount.set(r.cve?.total ?? 0),
      error: () => {},
    });
  }

  logout() {
    this.auth.logout();
  }
}
