import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { CallsService, CallCategory, CallRow, CategoryColor } from '../../core/services/calls.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

type FilterMode = 'all' | 'month' | 'period';

@Component({
  selector: 'app-calls',
  standalone: true,
  imports: [CommonModule, FormsModule, SideNavComponent],
  templateUrl: './calls.component.html',
  styleUrls: ['./calls.component.scss'],
})
export class CallsComponent implements OnInit {
  private api = inject(CallsService);

  categories = signal<CallCategory[]>([]);
  calls      = signal<CallRow[]>([]);
  loading    = signal(true);
  busyCatId  = signal<string | null>(null);

  // Filter state
  mode      = signal<FilterMode>('all');
  month     = signal<string>(this.currentMonth());
  from      = signal<string>('');
  to        = signal<string>('');
  catFilter = signal<string>('');

  // Add-category UI
  showAddCat   = signal(false);
  newCatName   = signal('');
  newCatColor  = signal<CategoryColor>('normal');
  addingCat    = signal(false);
  addCatError  = signal<string | null>(null);

  // Per-category color editor popover
  colorEditCatId = signal<string | null>(null);

  // Manage categories modal
  showManage = signal(false);

  // Edit-row state
  editingId    = signal<string | null>(null);
  editPhone    = signal<string>('');
  editCategory = signal<string>('');
  editDate     = signal<string>('');   // YYYY-MM-DD
  editTime     = signal<string>('');   // HH:mm

  totalCount = computed(() => this.calls().length);

  async ngOnInit() {
    await Promise.all([this.loadCategories(), this.loadCalls()]);
    this.loading.set(false);
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // ── Loading ──────────────────────────────
  async loadCategories() {
    try {
      const data = await firstValueFrom(this.api.getCategories());
      this.categories.set(data);
    } catch { /* ignore */ }
  }

  async loadCalls() {
    try {
      const filter: any = {};
      if (this.mode() === 'month' && this.month()) filter.month = this.month();
      else if (this.mode() === 'period') {
        if (this.from()) filter.from = this.from();
        if (this.to())   filter.to = this.to();
      }
      if (this.catFilter()) filter.category = this.catFilter();
      const data = await firstValueFrom(this.api.getCalls(filter));
      this.calls.set(data);
    } catch { /* ignore */ }
  }

  // ── Add call by clicking category ────────
  async addCall(cat: CallCategory) {
    this.busyCatId.set(cat.id);
    try {
      const row = await firstValueFrom(this.api.createCall(cat.name));
      this.calls.update(list => this.matchesFilter(row) ? [row, ...list] : list);
    } catch { /* ignore */ }
    finally { this.busyCatId.set(null); }
  }

  private matchesFilter(row: CallRow): boolean {
    if (this.catFilter() && row.category !== this.catFilter()) return false;
    const d = new Date(row.createdAt);
    if (this.mode() === 'month' && this.month()) {
      const [y, m] = this.month().split('-').map(Number);
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return false;
    }
    if (this.mode() === 'period') {
      if (this.from() && d < new Date(this.from() + 'T00:00:00')) return false;
      if (this.to())   {
        const end = new Date(this.to() + 'T00:00:00');
        end.setDate(end.getDate() + 1);
        if (d >= end) return false;
      }
    }
    return true;
  }

  // ── Add new category ─────────────────────
  openAddCat()  {
    this.showAddCat.set(true);
    this.newCatName.set('');
    this.newCatColor.set('normal');
    this.addCatError.set(null);
  }
  closeAddCat() { this.showAddCat.set(false); this.addCatError.set(null); }

  async submitNewCat() {
    const name = this.newCatName().trim();
    if (!name) { this.addCatError.set('Kategoriya nomi bo\'sh'); return; }
    this.addingCat.set(true);
    this.addCatError.set(null);
    try {
      const cat = await firstValueFrom(this.api.createCategory(name, this.newCatColor()));
      this.categories.update(list => [...list, cat]);
      this.closeAddCat();
    } catch (e: any) {
      this.addCatError.set(e?.error?.message || 'Xatolik');
    } finally {
      this.addingCat.set(false);
    }
  }

  async removeCategory(cat: CallCategory, ev: Event) {
    ev.stopPropagation();
    if (!confirm(`"${cat.name}" kategoriyasi o'chirilsinmi?`)) return;
    try {
      await firstValueFrom(this.api.deleteCategory(cat.id));
      this.categories.update(list => list.filter(c => c.id !== cat.id));
      if (this.catFilter() === cat.name) { this.catFilter.set(''); this.loadCalls(); }
    } catch { /* ignore */ }
  }

  // ── Color editing for existing category ──
  toggleColorEditor(cat: CallCategory, ev: Event) {
    ev.stopPropagation();
    this.colorEditCatId.set(this.colorEditCatId() === cat.id ? null : cat.id);
  }
  closeColorEditor() { this.colorEditCatId.set(null); }

  async setCategoryColor(cat: CallCategory, color: CategoryColor, ev: Event) {
    ev.stopPropagation();
    if (cat.color === color) { this.closeColorEditor(); return; }
    const prev = cat.color;
    // Optimistic update
    this.categories.update(list => list.map(c => c.id === cat.id ? { ...c, color } : c));
    this.closeColorEditor();
    try {
      const updated = await firstValueFrom(this.api.updateCategory(cat.id, { color }));
      this.categories.update(list => list.map(c => c.id === cat.id ? updated : c));
    } catch {
      // rollback
      this.categories.update(list => list.map(c => c.id === cat.id ? { ...c, color: prev } : c));
    }
  }

  // ── Edit row ─────────────────────────────
  startEdit(row: CallRow) {
    const d = new Date(row.createdAt);
    this.editingId.set(row.id);
    this.editPhone.set(row.phoneNumber ?? '');
    this.editCategory.set(row.category);
    this.editDate.set(this.toDateInput(d));
    this.editTime.set(this.toTimeInput(d));
  }
  cancelEdit() { this.editingId.set(null); }

  async saveEdit(row: CallRow) {
    const phone = this.editPhone().trim();
    const cat   = this.editCategory().trim();
    const date  = this.editDate();
    const time  = this.editTime();

    let createdAt: string | undefined;
    if (date) {
      const combined = new Date(`${date}T${(time || '00:00')}:00`);
      if (!isNaN(combined.getTime())) createdAt = combined.toISOString();
    }

    try {
      const updated = await firstValueFrom(this.api.updateCall(row.id, {
        phoneNumber: phone || null,
        category: cat || row.category,
        createdAt,
      }));
      this.calls.update(list => list.map(c => c.id === row.id ? updated : c));
      this.editingId.set(null);
    } catch { /* ignore */ }
  }

  private toDateInput(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private toTimeInput(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async deleteRow(row: CallRow) {
    if (!confirm(`Ushbu qo'ng'iroq o'chirilsinmi?`)) return;
    try {
      await firstValueFrom(this.api.deleteCall(row.id));
      this.calls.update(list => list.filter(c => c.id !== row.id));
    } catch { /* ignore */ }
  }

  // ── Filter UI handlers ───────────────────
  setMode(m: FilterMode) {
    this.mode.set(m);
    this.loadCalls();
  }
  onMonthChange(v: string) { this.month.set(v); this.loadCalls(); }
  onFromChange(v: string)  { this.from.set(v);  this.loadCalls(); }
  onToChange(v: string)    { this.to.set(v);    this.loadCalls(); }
  onCatFilterChange(v: string) { this.catFilter.set(v); this.loadCalls(); }
  clearFilters() {
    this.mode.set('all');
    this.from.set('');
    this.to.set('');
    this.catFilter.set('');
    this.loadCalls();
  }

  categoryColor(name: string): CategoryColor {
    return this.categories().find(c => c.name === name)?.color ?? 'normal';
  }
  isGreen(name: string): boolean { return this.categoryColor(name) === 'green'; }

  // ── Manage modal ─────────────────────────
  openManage()  { this.showManage.set(true); }
  closeManage() { this.showManage.set(false); }

  // ── Excel export ─────────────────────────
  exportExcel() {
    const rows = this.calls();
    if (!rows.length) return;

    const data = rows.map(r => {
      const d = new Date(r.createdAt);
      return {
        'Sana':       this.formatDate(d),
        'Vaqt':       this.formatTime(d),
        'Kategoriya': r.category,
        'Tel. raqam': r.phoneNumber ?? '',
        'Izoh':       r.note ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Qo\'ng\'iroqlar');
    XLSX.writeFile(wb, `qongiroqlar-${this.filenameSuffix()}.xlsx`);
  }

  private formatDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  }
  private formatTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  private filenameSuffix(): string {
    if (this.mode() === 'month' && this.month()) return this.month();
    if (this.mode() === 'period') {
      const f = this.from() || 'boshidan';
      const t = this.to()   || 'oxirigacha';
      return `${f}_${t}`;
    }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  categoryCount(name: string): number {
    return this.calls().filter(c => c.category === name).length;
  }

  trackId(_: number, item: { id: string }) { return item.id; }
}
