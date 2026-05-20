import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LogsService, AuditEntry, SessionEntry } from '../../core/services/logs.service';
import { AuthService } from '../../core/services/auth.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

type Tab = 'activity' | 'sessions';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, SideNavComponent],
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.scss'],
})
export class LogsComponent implements OnInit {
  private api  = inject(LogsService);
  private auth = inject(AuthService);

  tab = signal<Tab>('activity');

  // ── Activity tab state ──────────────────
  audit       = signal<AuditEntry[]>([]);
  total       = signal(0);
  page        = signal(1);
  limit       = signal(50);
  loadingAct  = signal(false);

  fromDate   = signal<string>('');
  toDate     = signal<string>('');
  actionQ    = signal<string>('');
  userIdQ    = signal<string>('');

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));

  // ── Sessions tab state ──────────────────
  sessions    = signal<SessionEntry[]>([]);
  loadingSess = signal(false);
  revokingId  = signal<string | null>(null);

  async ngOnInit() {
    await this.loadActivity();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'activity' && this.audit().length === 0) this.loadActivity();
    if (t === 'sessions') this.loadSessions();
  }

  // ── Activity ────────────────────────────
  async loadActivity() {
    this.loadingAct.set(true);
    try {
      const res = await firstValueFrom(this.api.getActivity({
        from:   this.fromDate() || undefined,
        to:     this.toDate()   || undefined,
        action: this.actionQ()  || undefined,
        userId: this.userIdQ()  || undefined,
        page:   this.page(),
        limit:  this.limit(),
      }));
      this.audit.set(res.items);
      this.total.set(res.total);
    } catch { /* ignore */ }
    finally { this.loadingAct.set(false); }
  }

  applyFilters() {
    this.page.set(1);
    this.loadActivity();
  }

  clearFilters() {
    this.fromDate.set('');
    this.toDate.set('');
    this.actionQ.set('');
    this.userIdQ.set('');
    this.page.set(1);
    this.loadActivity();
  }

  nextPage() {
    if (this.page() < this.totalPages()) {
      this.page.update(p => p + 1);
      this.loadActivity();
    }
  }
  prevPage() {
    if (this.page() > 1) {
      this.page.update(p => p - 1);
      this.loadActivity();
    }
  }

  // ── Sessions ────────────────────────────
  async loadSessions() {
    this.loadingSess.set(true);
    try {
      const data = await firstValueFrom(this.api.getSessions());
      this.sessions.set(data);
    } catch { /* ignore */ }
    finally { this.loadingSess.set(false); }
  }

  async revoke(s: SessionEntry) {
    if (!confirm(`"${s.user.username}" seansi bekor qilinsinmi?`)) return;
    this.revokingId.set(s.id);
    try {
      await firstValueFrom(this.api.revokeSession(s.id));
      this.sessions.update(list => list.filter(x => x.id !== s.id));
    } catch { /* ignore */ }
    finally { this.revokingId.set(null); }
  }

  // ── Helpers ─────────────────────────────
  trackId(_: number, item: { id: string }) { return item.id; }

  currentUserId(): string | null {
    return this.auth.currentUser()?.id ?? null;
  }

  actionLabel(a: string): string {
    return a.replace(/\./g, ' · ');
  }

  actionTone(a: string): 'create' | 'update' | 'delete' | 'auth' | 'fail' | 'other' {
    if (a.endsWith('.fail') || a.includes('login.fail')) return 'fail';
    if (a.startsWith('auth.'))   return 'auth';
    if (a.endsWith('.create'))   return 'create';
    if (a.endsWith('.update'))   return 'update';
    if (a.endsWith('.delete'))   return 'delete';
    return 'other';
  }

  metaPreview(m: any): string {
    if (!m) return '';
    try {
      const s = JSON.stringify(m);
      return s.length > 160 ? s.slice(0, 160) + '…' : s;
    } catch { return ''; }
  }
}
