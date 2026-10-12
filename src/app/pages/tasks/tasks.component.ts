import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { defer, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TasksService, SecurityTask, TaskPriority, TaskSource, TaskStatus } from '../../core/services/tasks.service';
import { WebsiteService } from '../../core/services/website.service';
import { User } from '../../shared/models/user.model';
import { Website } from '../../shared/models/website.model';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, SideNavComponent],
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss'],
})
export class TasksComponent implements OnInit {
  private tasksService = inject(TasksService);
  private websiteService = inject(WebsiteService);
  private pendingTaskIds = signal<ReadonlySet<string>>(new Set());
  auth = inject(AuthService);

  tasks = signal<SecurityTask[]>([]);
  users = signal<User[]>([]);
  websites = signal<Website[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal('');
  success = signal('');
  statusFilter = signal<'all' | TaskStatus>('all');
  showForm = signal(false);

  title = signal('');
  description = signal('');
  priority = signal<TaskPriority>('MEDIUM');
  source = signal<TaskSource>('MANUAL');
  assigneeId = signal('');
  websiteId = signal('');
  dueDate = signal('');

  readonly statuses: Array<'all' | TaskStatus> = ['all', 'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
  readonly priorities: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  readonly sources: TaskSource[] = ['MANUAL', 'CVE', 'PORT', 'SUBDOMAIN', 'SSL', 'CMS'];

  filteredTasks = computed(() => {
    const status = this.statusFilter();
    return status === 'all' ? this.tasks() : this.tasks().filter(task => task.status === status);
  });

  stats = computed(() => {
    const tasks = this.tasks();
    return {
      total: tasks.length,
      open: tasks.filter(t => t.status === 'OPEN').length,
      progress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      done: tasks.filter(t => t.status === 'DONE').length,
      critical: tasks.filter(t => t.priority === 'CRITICAL').length,
    };
  });

  ngOnInit() {
    this.load();
    this.tasksService.getAssignees().subscribe({ next: users => this.users.set(users), error: () => {} });
    this.websiteService.getAll().subscribe({ next: sites => this.websites.set(sites), error: () => {} });
  }

  load() {
    this.loading.set(true);
    this.tasksService.getAll().subscribe({
      next: tasks => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Vazifalarni yuklab bo\'lmadi');
        this.loading.set(false);
      },
    });
  }

  createTask() {
    if (!this.title().trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.tasksService.create({
      title: this.title().trim(),
      description: this.description().trim() || undefined,
      priority: this.priority(),
      source: this.source(),
      assigneeId: this.assigneeId() || null,
      websiteId: this.websiteId() || null,
      dueDate: this.dueDate() || null,
    }).subscribe({
      next: task => {
        this.tasks.update(list => [task, ...list]);
        this.resetForm();
        this.showForm.set(false);
        this.saving.set(false);
        this.showSuccess('Vazifa yaratildi');
      },
      error: err => {
        this.error.set(err?.error?.message || 'Vazifa yaratilmadi');
        this.saving.set(false);
      },
    });
  }

  updateStatus(task: SecurityTask, status: TaskStatus) {
    if (!this.beginTaskWrite(task.id)) return;
    defer(() => this.tasksService.update(task.id, { status })).pipe(
      finalize(() => this.finishTaskWrite(task.id)),
    ).subscribe({
      next: updated => this.tasks.update(list => list.map(item => item.id === task.id ? updated : item)),
      error: err => this.error.set(err?.error?.message || 'Status yangilanmadi'),
    });
  }

  updateAssignee(task: SecurityTask, assigneeId: string) {
    if (!this.beginTaskWrite(task.id)) return;
    defer(() => this.tasksService.update(task.id, { assigneeId: assigneeId || null })).pipe(
      finalize(() => this.finishTaskWrite(task.id)),
    ).subscribe({
      next: updated => this.tasks.update(list => list.map(item => item.id === task.id ? updated : item)),
      error: err => this.error.set(err?.error?.message || 'Javobgar yangilanmadi'),
    });
  }

  remove(task: SecurityTask) {
    if (this.auth.role() !== 'ADMIN') return;
    if (!this.beginTaskWrite(task.id)) return;
    defer(() => this.tasksService.remove(task.id)).pipe(
      finalize(() => this.finishTaskWrite(task.id)),
    ).subscribe({
      next: () => this.tasks.update(list => list.filter(item => item.id !== task.id)),
      error: err => this.error.set(err?.error?.message || 'Vazifa o\'chirilmadi'),
    });
  }

  isTaskPending(id: string): boolean {
    return this.pendingTaskIds().has(id);
  }

  private beginTaskWrite(id: string): boolean {
    // A response replaces the whole row, so all writes for one task share a guard.
    if (this.isTaskPending(id)) return false;
    this.pendingTaskIds.update(ids => new Set([...ids, id]));
    return true;
  }

  private finishTaskWrite(id: string) {
    this.pendingTaskIds.update(ids => {
      const remaining = new Set(ids);
      remaining.delete(id);
      return remaining;
    });
  }

  statusLabel(status: string): string {
    return {
      all: 'Hammasi',
      OPEN: 'Ochiq',
      IN_PROGRESS: 'Jarayonda',
      DONE: 'Bajarildi',
      CANCELLED: 'Bekor',
    }[status] ?? status;
  }

  priorityLabel(priority: string): string {
    return { LOW: 'Past', MEDIUM: 'O‘rta', HIGH: 'Yuqori', CRITICAL: 'Kritik' }[priority] ?? priority;
  }

  sourceLabel(source: string): string {
    return { MANUAL: 'Qo‘lda', CVE: 'CVE', PORT: 'Port', SUBDOMAIN: 'Subdomen', SSL: 'SSL', CMS: 'CMS' }[source] ?? source;
  }

  private resetForm() {
    this.title.set('');
    this.description.set('');
    this.priority.set('MEDIUM');
    this.source.set('MANUAL');
    this.assigneeId.set('');
    this.websiteId.set('');
    this.dueDate.set('');
  }

  private showSuccess(message: string) {
    this.success.set(message);
    setTimeout(() => this.success.set(''), 2500);
  }
}
