import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LogsService, AuditEntry, SessionEntry, DatabaseDump, DatabaseDumpList } from '../../core/services/logs.service';
import { AuthService } from '../../core/services/auth.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

type Tab = 'activity' | 'sessions' | 'dumps';

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

  // ── Dumps tab state ─────────────────────
  dumpList       = signal<DatabaseDumpList | null>(null);
  loadingDumps   = signal(false);
  creatingDump   = signal(false);
  deletingDumpId = signal<string | null>(null);
  downloadingId  = signal<string | null>(null);
  dumpError      = signal<string | null>(null);
  dumps          = computed(() => this.dumpList()?.items ?? []);

  async ngOnInit() {
    await this.loadActivity();
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'activity' && this.audit().length === 0) this.loadActivity();
    if (t === 'sessions') this.loadSessions();
    if (t === 'dumps') this.loadDumps();
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

  // ── Dumps ───────────────────────────────
  async loadDumps() {
    this.loadingDumps.set(true);
    this.dumpError.set(null);
    try {
      const data = await firstValueFrom(this.api.getDumps());
      this.dumpList.set(data);
    } catch (err: any) {
      this.dumpError.set(err?.error?.message || 'Dump ro\'yxatini olib bo\'lmadi');
    } finally {
      this.loadingDumps.set(false);
    }
  }

  async createDump() {
    if (this.creatingDump()) return;
    this.creatingDump.set(true);
    this.dumpError.set(null);
    try {
      await firstValueFrom(this.api.createDump());
      await this.loadDumps();
    } catch (err: any) {
      this.dumpError.set(err?.error?.message || 'Dump olishda xatolik');
    } finally {
      this.creatingDump.set(false);
    }
  }

  async downloadDump(dump: DatabaseDump) {
    if (dump.status !== 'SUCCESS') return;
    this.downloadingId.set(dump.id);
    this.dumpError.set(null);
    try {
      const blob = await firstValueFrom(this.api.downloadDump(dump.id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dump.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      this.dumpError.set(err?.error?.message || 'Dump yuklab bo\'lmadi');
    } finally {
      this.downloadingId.set(null);
    }
  }

  async deleteDump(dump: DatabaseDump) {
    if (dump.status === 'RUNNING') return;
    if (!confirm(`"${dump.filename}" dump o'chirilsinmi?`)) return;
    this.deletingDumpId.set(dump.id);
    this.dumpError.set(null);
    try {
      await firstValueFrom(this.api.deleteDump(dump.id));
      await this.loadDumps();
    } catch (err: any) {
      this.dumpError.set(err?.error?.message || 'Dump o\'chirilmadi');
    } finally {
      this.deletingDumpId.set(null);
    }
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

  formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    const digits = value >= 10 || i === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[i]}`;
  }

  dumpStatusLabel(status: string): string {
    if (status === 'SUCCESS') return 'Tayyor';
    if (status === 'RUNNING') return 'Jarayonda';
    if (status === 'FAILED') return 'Xato';
    return status;
  }

  dumpTriggerLabel(trigger: string): string {
    return trigger === 'AUTO' ? 'Avtomatik' : 'Qo\'lda';
  }

  dumpDuration(dump: DatabaseDump): string {
    if (!dump.finishedAt) return '—';
    const ms = new Date(dump.finishedAt).getTime() - new Date(dump.startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
  }

  shortHash(hash: string | null): string {
    return hash ? `${hash.slice(0, 10)}…` : '—';
  }
}
