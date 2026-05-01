import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { User, UserRole } from '../../shared/models/user.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  private adminSvc = inject(AdminService);
  auth             = inject(AuthService);
  private fb       = inject(FormBuilder);

  users         = signal<User[]>([]);
  loading       = signal(false);
  saving        = signal(false);
  deletingId    = signal<string | null>(null);
  confirmDelete = signal<string | null>(null);
  showForm      = signal(false);
  editingUser   = signal<User | null>(null);
  successMsg    = signal<string | null>(null);
  error         = signal<string | null>(null);

  readonly ROLES: UserRole[] = ['ADMIN', 'WORKER', 'MONITORING'];

  createForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    role:     ['WORKER' as UserRole, Validators.required],
  });

  editForm = this.fb.group({
    password: [''],
    role:     ['' as UserRole, Validators.required],
  });

  ngOnInit() { this.loadUsers(); }

  loadUsers() {
    this.loading.set(true);
    this.adminSvc.getAll().subscribe({
      next:  users => { this.users.set(users); this.loading.set(false); },
      error: ()    => { this.error.set("Foydalanuvchilarni yuklab bo'lmadi"); this.loading.set(false); },
    });
  }

  submitCreate() {
    if (this.createForm.invalid) { this.createForm.markAllAsTouched(); return; }
    this.saving.set(true);
    const { username, password, role } = this.createForm.value;
    this.adminSvc.create({ username: username!, password: password!, role: role as UserRole }).subscribe({
      next: () => {
        this.saving.set(false);
        this.createForm.reset({ role: 'WORKER' });
        this.showForm.set(false);
        this.loadUsers();
        this.showSuccess("Foydalanuvchi yaratildi!");
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || "Foydalanuvchi yaratilmadi"); },
    });
  }

  openEdit(user: User) {
    this.editingUser.set(user);
    this.editForm.patchValue({ role: user.role, password: '' });
    this.showForm.set(false);
    this.confirmDelete.set(null);
  }

  closeEdit() { this.editingUser.set(null); this.editForm.reset(); }

  submitEdit() {
    const user = this.editingUser();
    if (!user || this.editForm.invalid) return;
    this.saving.set(true);
    const { password, role } = this.editForm.value;
    const dto: any = { role };
    if (password?.trim()) dto['password'] = password;
    this.adminSvc.update(user.id, dto).subscribe({
      next: () => { this.saving.set(false); this.closeEdit(); this.loadUsers(); this.showSuccess("Foydalanuvchi yangilandi!"); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || "Yangilashda xato"); },
    });
  }

  askDelete(user: User) { this.confirmDelete.set(user.id); this.editingUser.set(null); }
  cancelDelete()        { this.confirmDelete.set(null); }

  confirmDeleteUser() {
    const id = this.confirmDelete();
    if (!id) return;
    this.deletingId.set(id);
    this.confirmDelete.set(null);
    this.adminSvc.remove(id).subscribe({
      next:  () => { this.users.update(list => list.filter(u => u.id !== id)); this.deletingId.set(null); this.showSuccess("Foydalanuvchi o'chirildi!"); },
      error: err => { this.deletingId.set(null); this.error.set("O'chirishda xato: " + (err?.error?.message || '')); },
    });
  }

  logout() { this.auth.logout(); }

  clearError()  { this.error.set(null); }

  roleBadgeClass(role: UserRole): string {
    return { ADMIN: 'badge-admin', WORKER: 'badge-worker', MONITORING: 'badge-monitoring' }[role] ?? '';
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}
