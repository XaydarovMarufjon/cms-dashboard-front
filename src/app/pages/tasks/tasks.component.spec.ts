import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY, Observable, Subject, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SecurityTask, TasksService } from '../../core/services/tasks.service';
import { WebsiteService } from '../../core/services/website.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { TasksComponent } from './tasks.component';

@Component({ selector: 'app-side-nav', template: '' })
class SideNavStub {}

const FIRST: SecurityTask = {
  id: 'first', title: 'First task', description: null, source: 'MANUAL',
  status: 'OPEN', priority: 'MEDIUM', dueDate: null, websiteId: null,
  assigneeId: null, createdById: null, createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
};
const SECOND: SecurityTask = { ...FIRST, id: 'second', title: 'Second task' };

describe('TasksComponent row writes', () => {
  let fixture: ComponentFixture<TasksComponent>;
  let component: TasksComponent;
  let response: Subject<SecurityTask>;
  let deletion: Subject<void>;
  let update: ReturnType<typeof vi.fn<() => Observable<SecurityTask>>>;
  let remove: ReturnType<typeof vi.fn<() => Observable<void>>>;
  let role: ReturnType<typeof signal<string>>;

  beforeEach(async () => {
    response = new Subject<SecurityTask>();
    deletion = new Subject<void>();
    update = vi.fn(() => response.asObservable());
    remove = vi.fn(() => deletion.asObservable());
    role = signal('ADMIN');
    TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [
        { provide: TasksService, useValue: {
          getAll: () => of([FIRST, SECOND]),
          getAssignees: () => of([{ id: 'user-1', username: 'Alice', role: 'WORKER' }]),
          update, remove,
        } },
        { provide: WebsiteService, useValue: { getAll: () => of([]) } },
        { provide: AuthService, useValue: { role } },
      ],
    }).overrideComponent(TasksComponent, {
      remove: { imports: [SideNavComponent] },
      add: { imports: [SideNavStub] },
    });
    fixture = TestBed.createComponent(TasksComponent);
    component = fixture.componentInstance;
    await render();
  });

  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  function controls(rowIndex: number): (HTMLSelectElement | HTMLButtonElement)[] {
    return Array.from(rows()[rowIndex].querySelectorAll('select, button'));
  }

  function expectDisabled(rowIndex: number, disabled: boolean) {
    expect(controls(rowIndex)).toHaveLength(3);
    expect(controls(rowIndex).map(control => control.disabled)).toEqual([disabled, disabled, disabled]);
  }

  function changeSelect(index: number, value: string) {
    const select = controls(0)[index] as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('disables only the pending row after changing status through the real select', async () => {
    changeSelect(1, 'DONE');
    await render();

    expect(update).toHaveBeenCalledExactlyOnceWith(FIRST.id, { status: 'DONE' });
    expectDisabled(0, true);
    expectDisabled(1, false);
    (controls(0)[2] as HTMLButtonElement).click();
    expect(remove).not.toHaveBeenCalled();
  });

  it('disables the row after changing assignee through the real select', async () => {
    changeSelect(0, 'user-1');
    await render();

    expect(update).toHaveBeenCalledExactlyOnceWith(FIRST.id, { assigneeId: 'user-1' });
    expectDisabled(0, true);
    expectDisabled(1, false);
  });

  it('disables the row after clicking delete and removes it when deletion succeeds', async () => {
    (controls(0)[2] as HTMLButtonElement).click();
    await render();
    expectDisabled(0, true);
    expectDisabled(1, false);

    deletion.next();
    deletion.complete();
    await render();
    expect(remove).toHaveBeenCalledExactlyOnceWith(FIRST.id);
    expect(component.tasks()).toEqual([SECOND]);
    expect(rows()).toHaveLength(1);
    expectDisabled(0, false);
  });

  for (const action of ['status', 'assignee', 'delete'] as const) {
    it(`blocks every conflicting same-task action while ${action} is pending`, () => {
      if (action === 'status') component.updateStatus(FIRST, 'DONE');
      if (action === 'assignee') component.updateAssignee(FIRST, 'user-1');
      if (action === 'delete') component.remove(FIRST);

      component.updateStatus(FIRST, 'CANCELLED');
      component.updateAssignee(FIRST, 'user-2');
      component.remove(FIRST);
      component.remove(FIRST);

      expect(update).toHaveBeenCalledTimes(action === 'delete' ? 0 : 1);
      expect(remove).toHaveBeenCalledTimes(action === 'delete' ? 1 : 0);
    });
  }

  it('allows different tasks to save concurrently and releases each row independently', async () => {
    const secondResponse = new Subject<SecurityTask>();
    update.mockReturnValueOnce(response).mockReturnValueOnce(secondResponse);
    component.updateStatus(FIRST, 'DONE');
    component.updateAssignee(SECOND, 'user-1');
    await render();
    expectDisabled(0, true);
    expectDisabled(1, true);

    const savedFirst = { ...FIRST, status: 'DONE' };
    response.next(savedFirst);
    response.complete();
    await render();
    expectDisabled(0, false);
    expectDisabled(1, true);

    const savedSecond = { ...SECOND, assigneeId: 'user-1' };
    secondResponse.next(savedSecond);
    secondResponse.complete();
    await render();
    expectDisabled(1, false);
    expect(component.tasks()).toEqual([savedFirst, savedSecond]);
  });

  for (const action of ['status', 'assignee'] as const) {
    it(`releases a failed ${action} write, preserves stored data, and allows retry`, async () => {
      const write = () => action === 'status'
        ? component.updateStatus(FIRST, 'DONE')
        : component.updateAssignee(FIRST, 'user-1');
      write();
      response.error({ error: { message: 'Please retry' } });
      await render();

      expectDisabled(0, false);
      expect(component.tasks()).toEqual([FIRST, SECOND]);
      expect(fixture.nativeElement.querySelector('.alert.error').textContent).toContain('Please retry');

      const retry = new Subject<SecurityTask>();
      update.mockReturnValue(retry);
      write();
      await render();
      expect(update).toHaveBeenCalledTimes(2);
      expectDisabled(0, true);
      retry.next({ ...FIRST, status: 'DONE' });
      retry.complete();
      await render();
      expectDisabled(0, false);
    });
  }

  it('releases a failed delete and permits another attempt', async () => {
    component.remove(FIRST);
    deletion.error({ error: { message: 'Delete failed' } });
    await render();
    expectDisabled(0, false);
    expect(component.tasks()).toEqual([FIRST, SECOND]);
    expect(component.error()).toBe('Delete failed');

    const retry = new Subject<void>();
    remove.mockReturnValue(retry);
    component.remove(FIRST);
    await render();
    expect(remove).toHaveBeenCalledTimes(2);
    expectDisabled(0, true);
    retry.next();
    retry.complete();
    await render();
    expect(component.tasks()).toEqual([SECOND]);
  });

  it('unlocks empty-completing update and delete requests without changing rows', async () => {
    update.mockReturnValue(EMPTY);
    remove.mockReturnValue(EMPTY);
    component.updateStatus(FIRST, 'DONE');
    component.updateAssignee(FIRST, 'user-1');
    component.remove(FIRST);
    component.remove(FIRST);
    await render();

    expect(update).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expectDisabled(0, false);
    expect(component.tasks()).toEqual([FIRST, SECOND]);
  });

  for (const action of ['status', 'assignee', 'delete'] as const) {
    it(`releases the guard if the ${action} service throws synchronously`, async () => {
      const service = action === 'delete' ? remove : update;
      service.mockImplementationOnce(() => { throw new Error('Request setup failed'); });
      const write = () => {
        if (action === 'status') component.updateStatus(FIRST, 'DONE');
        if (action === 'assignee') component.updateAssignee(FIRST, 'user-1');
        if (action === 'delete') component.remove(FIRST);
      };

      expect(write).not.toThrow();
      await render();
      expectDisabled(0, false);
      expect(component.error()).not.toBe('');
      expect(component.tasks()).toEqual([FIRST, SECOND]);

      write();
      await render();
      expect(service).toHaveBeenCalledTimes(2);
      expectDisabled(0, true);
    });
  }

  it('keeps the row locked until the pending request completes', async () => {
    component.updateStatus(FIRST, 'DONE');
    response.next({ ...FIRST, status: 'DONE' });
    await render();
    expectDisabled(0, true);
    component.updateAssignee(FIRST, 'user-1');
    expect(update).toHaveBeenCalledTimes(1);

    response.complete();
    await render();
    expectDisabled(0, false);
    component.updateAssignee(FIRST, '');
    expect(update).toHaveBeenLastCalledWith(FIRST.id, { assigneeId: null });
  });

  it('handles synchronous saves and sends a later edit using the latest row', async () => {
    const saved = { ...FIRST, status: 'IN_PROGRESS' };
    update.mockReturnValueOnce(of(saved)).mockReturnValueOnce(response);
    component.updateStatus(FIRST, 'IN_PROGRESS');
    await render();
    expectDisabled(0, false);

    changeSelect(0, 'user-1');
    await render();
    expect(update).toHaveBeenLastCalledWith(FIRST.id, { assigneeId: 'user-1' });
    expectDisabled(0, true);
    response.next({ ...saved, assigneeId: 'user-1' });
    response.complete();
    await render();
    expect((controls(0)[1] as HTMLSelectElement).value).toBe('IN_PROGRESS');
    expect((controls(0)[0] as HTMLSelectElement).value).toBe('user-1');
    expectDisabled(0, false);
  });

  it('preserves filtering and counts after a successful status change', async () => {
    component.statusFilter.set('OPEN');
    component.updateStatus(FIRST, 'DONE');
    response.next({ ...FIRST, status: 'DONE' });
    response.complete();
    await render();

    expect(component.filteredTasks()).toEqual([SECOND]);
    expect(component.stats()).toMatchObject({ total: 2, open: 1, done: 1 });
    expect(rows()).toHaveLength(1);
    expectDisabled(0, false);
  });

  it('preserves the admin-only delete guard without blocking allowed edits', async () => {
    role.set('WORKER');
    component.remove(FIRST);
    component.updateStatus(FIRST, 'DONE');
    await render();

    expect(remove).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith(FIRST.id, { status: 'DONE' });
    expect(rows()[0].querySelector('button')).toBeNull();
    expect(controls(0).map(control => control.disabled)).toEqual([true, true]);
  });
});
