// src/app/pages/dashboard/dashboard.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ScannerService } from '../../core/services/scanner.service';
import { WebsiteService } from '../../core/services/website.service';
import { ScanResult, Website, CMS_COLORS, CATEGORY_META, SiteCategory } from '../../shared/models/website.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {

  private scanner        = inject(ScannerService);
  private websiteService = inject(WebsiteService);
  private fb             = inject(FormBuilder);

  // ── SIGNALS ───────────────────────────────────
  results         = signal<ScanResult[]>([]);
  loading         = signal(false);
  scanning        = signal<string | null>(null);
  scanningAll     = signal(false);
  showAddForm     = signal(false);
  addingWebsite   = signal(false);
  searchQuery     = signal('');
  filterCms       = signal('all');
  successMsg      = signal<string | null>(null);
  error           = signal<string | null>(null);
  editingWebsite  = signal<Website | null>(null);
  savingEdit      = signal(false);
  deletingId      = signal<string | null>(null);
  confirmDeleteId = signal<string | null>(null);

  // ── COMPUTED ──────────────────────────────────
  filteredResults = computed(() => {
    let list = this.results();
    const q   = this.searchQuery().toLowerCase();
    const cms = this.filterCms();
    if (q) list = list.filter(r =>
      r.website?.url.toLowerCase().includes(q) ||
      r.website?.label?.toLowerCase().includes(q) ||
      r.cms?.toLowerCase().includes(q)
    );
    if (cms !== 'all') list = list.filter(r => (r.cms ?? 'unknown') === cms);
    return list;
  });

  stats = computed(() => {
    const r = this.results();
    const cms: Record<string, number> = {};
    r.forEach(s => { const k = s.cms ?? 'unknown'; cms[k] = (cms[k] || 0) + 1; });
    return { total: r.length, detected: r.filter(s => s.cms).length, unknown: r.filter(s => !s.cms).length, cms };
  });

  cmsTypes = computed(() => Object.keys(this.stats().cms));

  // ── FORMALAR ──────────────────────────────────
  addForm = this.fb.group({
    url:   ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    label: [''],
  });

  editForm = this.fb.group({
    url:   ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    label: [''],
  });

  ngOnInit() { this.loadResults(); }

  loadResults() {
    this.loading.set(true);
    this.scanner.getLatestResults().subscribe({
      next:  (data) => { this.results.set(data); this.loading.set(false); },
      error: ()     => { this.error.set("Serverga ulanib bo'lmadi"); this.loading.set(false); },
    });
  }

  scanAll() {
    this.scanningAll.set(true);
    this.scanner.scanAll().subscribe({
      next:  () => { this.loadResults(); this.scanningAll.set(false); this.showSuccess('Barcha saytlar skanerlandi!'); },
      error: () => this.scanningAll.set(false),
    });
  }

  scanOne(result: ScanResult) {
    if (!result.website) return;
    this.scanning.set(result.websiteId);
    this.scanner.scanOne(result.websiteId, result.website.url).subscribe({
      next: (updated) => {
        this.results.update(list => list.map(r => r.websiteId === updated.websiteId ? updated : r));
        this.scanning.set(null);
        this.showSuccess('Skaner tugadi!');
      },
      error: () => this.scanning.set(null),
    });
  }

  submitAddForm() {
    if (this.addForm.invalid) return;
    this.addingWebsite.set(true);
    const { url, label } = this.addForm.value;
    this.websiteService.create({ url: url!, label: label || undefined }).subscribe({
      next: (website) => {
        this.scanner.scanOne(website.id, website.url).subscribe({
          next:  () => { this.addForm.reset(); this.showAddForm.set(false); this.addingWebsite.set(false); this.loadResults(); this.showSuccess("Sayt qo'shildi va skanerlandi!"); },
          error: () => { this.addingWebsite.set(false); this.loadResults(); },
        });
      },
      error: (err) => { this.addingWebsite.set(false); this.error.set('Xato: ' + (err?.error?.message || "Sayt qo'shilmadi")); },
    });
  }

  openEdit(result: ScanResult) {
    if (!result.website) return;
    this.editingWebsite.set(result.website);
    this.editForm.patchValue({ url: result.website.url, label: result.website.label || '' });
    this.showAddForm.set(false);
    this.confirmDeleteId.set(null);
  }

  closeEdit() {
    this.editingWebsite.set(null);
    this.editForm.reset();
  }

  submitEditForm() {
    if (this.editForm.invalid || !this.editingWebsite()) return;
    this.savingEdit.set(true);
    const { url, label } = this.editForm.value;
    const id = this.editingWebsite()!.id;
    this.websiteService.update(id, { url: url!, label: label || undefined }).subscribe({
      next: () => { this.savingEdit.set(false); this.closeEdit(); this.loadResults(); this.showSuccess("Sayt ma'lumotlari yangilandi!"); },
      error: (err) => { this.savingEdit.set(false); this.error.set('Tahrirlashda xato: ' + (err?.error?.message || '')); },
    });
  }

  askDelete(result: ScanResult) {
    this.confirmDeleteId.set(result.websiteId);
    this.editingWebsite.set(null);
  }

  cancelDelete() { this.confirmDeleteId.set(null); }

  confirmDelete() {
    const id = this.confirmDeleteId();
    if (!id) return;
    this.deletingId.set(id);
    this.confirmDeleteId.set(null);
    this.websiteService.delete(id).subscribe({
      next:  () => { this.results.update(list => list.filter(r => r.websiteId !== id)); this.deletingId.set(null); this.showSuccess("Sayt o'chirildi!"); },
      error: (err) => { this.deletingId.set(null); this.error.set("O'chirishda xato: " + (err?.error?.message || '')); },
    });
  }

  clearError() { this.error.set(null); }

  getCmsColor(cms: string | null): string {
    return CMS_COLORS[cms ?? 'unknown'] ?? '#6b6c80';
  }

  getCategoryColor(category: string | null): string {
    return CATEGORY_META[category as SiteCategory]?.color ?? '#6b6c80';
  }

  getCategoryIcon(category: string | null): string {
    return CATEGORY_META[category as SiteCategory]?.icon ?? '?';
  }

  getConfidenceClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}