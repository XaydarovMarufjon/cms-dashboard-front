import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CallRow, CallsService } from '../../core/services/calls.service';
import { CallsComponent } from './calls.component';

// Use local dates, matching the date inputs and the component's filter semantics.
function timestamp(month: number, day: number, hours = 12, year = 2026): string {
  return new Date(year, month - 1, day, hours).toISOString();
}

const ROW: CallRow = {
  id: 'edited-call',
  category: 'Support',
  phoneNumber: null,
  note: null,
  createdAt: timestamp(10, 9),
  updatedAt: timestamp(10, 9),
};
const BEFORE: CallRow = { ...ROW, id: 'before' };
const AFTER: CallRow = { ...ROW, id: 'after' };

describe('CallsComponent edits with active filters', () => {
  let component: CallsComponent;
  let updateCall: ReturnType<typeof vi.fn<CallsService['updateCall']>>;

  beforeEach(() => {
    updateCall = vi.fn<CallsService['updateCall']>();
    TestBed.configureTestingModule({
      providers: [{ provide: CallsService, useValue: { updateCall } }],
    });
    component = TestBed.runInInjectionContext(() => new CallsComponent());
    component.calls.set([BEFORE, ROW, AFTER]);
    component.startEdit(ROW);
  });

  async function save(changes: Partial<CallRow>): Promise<CallRow> {
    const updated = { ...ROW, ...changes };
    updateCall.mockReturnValue(of(updated));
    await component.saveEdit(ROW);
    return updated;
  }

  function expectRemoved() {
    expect(component.calls()).toEqual([BEFORE, AFTER]);
    expect(component.totalCount()).toBe(2);
    expect(component.editingId()).toBeNull();
  }

  it('removes an edited call that no longer matches the category and updates counts', async () => {
    component.catFilter.set('Support');
    component.editCategory.set('Sales');

    await save({ category: 'Sales' });

    expectRemoved();
    expect(component.categoryCount('Support')).toBe(2);
    expect(component.categoryCount('Sales')).toBe(0);
    expect(updateCall).toHaveBeenCalledWith(ROW.id, expect.objectContaining({ category: 'Sales' }));
  });

  it('updates a still-matching call in place without changing other rows', async () => {
    component.catFilter.set('Support');

    const updated = await save({ note: 'Follow up', phoneNumber: '123' });

    expect(component.calls()).toEqual([BEFORE, updated, AFTER]);
    expect(component.calls()[0]).toBe(BEFORE);
    expect(component.calls()[2]).toBe(AFTER);
    expect(component.totalCount()).toBe(3);
    expect(component.editingId()).toBeNull();
  });

  it.each([
    ['the previous month', timestamp(9, 30)],
    ['the next month', timestamp(11, 1)],
    ['the same month in another year', timestamp(10, 9, 12, 2027)],
  ])('removes a call moved to %s under a month filter', async (_, createdAt) => {
    component.mode.set('month');
    component.month.set('2026-10');

    await save({ createdAt });

    expectRemoved();
  });

  it('keeps a call moved within the selected month', async () => {
    component.mode.set('month');
    component.month.set('2026-10');

    const updated = await save({ createdAt: timestamp(10, 31, 23) });

    expect(component.calls()).toEqual([BEFORE, updated, AFTER]);
  });

  it.each([
    ['before the start date', timestamp(10, 7, 23), false],
    ['at the start date', timestamp(10, 8, 0), true],
    ['late on the inclusive end date', timestamp(10, 10, 23), true],
    ['at midnight after the end date', timestamp(10, 11, 0), false],
  ])('respects period boundaries when moved %s', async (_, createdAt, retained) => {
    component.mode.set('period');
    component.from.set('2026-10-08');
    component.to.set('2026-10-10');

    const updated = await save({ createdAt });

    expect(component.calls()).toEqual(retained ? [BEFORE, updated, AFTER] : [BEFORE, AFTER]);
    expect(component.editingId()).toBeNull();
  });

  it.each([
    ['from', '2026-10-08', timestamp(10, 7)],
    ['to', '2026-10-10', timestamp(10, 11)],
  ] as const)('respects an open-ended period with only %s set', async (boundary, date, createdAt) => {
    component.mode.set('period');
    component[boundary].set(date);

    await save({ createdAt });

    expectRemoved();
  });

  it('requires both category and date filters to match', async () => {
    component.mode.set('month');
    component.month.set('2026-10');
    component.catFilter.set('Support');

    await save({ category: 'Sales', createdAt: timestamp(10, 10) });

    expectRemoved();
  });

  it('ignores inactive date filters in all mode', async () => {
    component.month.set('2026-09');
    component.from.set('2026-09-01');
    component.to.set('2026-09-30');

    const updated = await save({ category: 'Sales', createdAt: timestamp(11, 1) });

    expect(component.calls()).toEqual([BEFORE, updated, AFTER]);
  });

  it('checks the server response against the filters active when the save completes', async () => {
    const response = new Subject<CallRow>();
    updateCall.mockReturnValue(response.asObservable());
    component.catFilter.set('Support');
    const pending = component.saveEdit(ROW);

    component.catFilter.set('Sales');
    response.next({ ...ROW, note: 'Saved while the filter changed' });
    await pending;

    expectRemoved();
    expect(response.observed).toBe(false);
  });

  it('does not reinsert an edited row removed from the list while saving', async () => {
    const response = new Subject<CallRow>();
    updateCall.mockReturnValue(response.asObservable());
    const pending = component.saveEdit(ROW);
    component.calls.set([BEFORE, AFTER]);

    response.next({ ...ROW, note: 'Saved' });
    await pending;

    expectRemoved();
  });

  it('keeps the original list and editor open when saving fails', async () => {
    component.catFilter.set('Support');
    component.editCategory.set('Sales');
    updateCall.mockReturnValue(throwError(() => new Error('offline')));

    await component.saveEdit(ROW);

    expect(component.calls()).toEqual([BEFORE, ROW, AFTER]);
    expect(component.editingId()).toBe(ROW.id);
    expect(component.editCategory()).toBe('Sales');
  });
});
