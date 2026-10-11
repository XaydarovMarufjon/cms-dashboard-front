import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AuditEntry, AuditList, LogsService } from '../../core/services/logs.service';
import { LogsComponent } from './logs.component';

const result = (id: string, total = 1): AuditList => ({
  items: [{ id, action: 'user.update' } as AuditEntry], total, page: 1, limit: 50,
});

describe('LogsComponent activity request ordering', () => {
  let component: LogsComponent & { ngOnDestroy?: () => void };
  let getActivity: ReturnType<typeof vi.fn<LogsService['getActivity']>>;

  beforeEach(() => {
    getActivity = vi.fn<LogsService['getActivity']>().mockReturnValue(of(result('initial')));
    TestBed.configureTestingModule({ providers: [
      { provide: LogsService, useValue: { getActivity } },
      { provide: AuthService, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new LogsComponent());
  });

  afterEach(() => component.ngOnDestroy?.());

  it('loads initial activity and clears the loading state', async () => {
    await component.ngOnInit();
    expect(getActivity).toHaveBeenCalledWith({
      from: undefined, to: undefined, action: undefined, userId: undefined, page: 1, limit: 50,
    });
    expect(component.audit()).toEqual(result('initial').items);
    expect(component.total()).toBe(1);
    expect(component.loadingAct()).toBe(false);
  });

  it('unsubscribes the old read when new filters are applied', async () => {
    const old = new Subject<AuditList>();
    const latest = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(old).mockReturnValueOnce(latest);
    const first = component.loadActivity();
    component.actionQ.set('user.create');
    component.applyFilters();
    expect(old.observed).toBe(false);
    expect(latest.observed).toBe(true);
    old.next(result('stale', 500));
    latest.next(result('filtered', 7));
    await Promise.resolve();
    await first;
    expect(component.audit()).toEqual(result('filtered').items);
    expect(component.total()).toBe(7);
  });

  it('ignores a response queued before a newer filter request', async () => {
    const latest = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(of(result('stale', 500))).mockReturnValueOnce(latest);
    const first = component.loadActivity();
    component.actionQ.set('user.create');
    const second = component.loadActivity();
    await first;
    expect(component.audit()).toEqual([]);
    expect(component.total()).toBe(0);
    expect(component.loadingAct()).toBe(true);
    latest.next(result('latest', 3));
    await second;
    expect(component.audit()).toEqual(result('latest').items);
    expect(component.total()).toBe(3);
    expect(component.loadingAct()).toBe(false);
  });

  it('does not let a queued old error clear newer loading state', async () => {
    const latest = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(throwError(() => new Error('old failure'))).mockReturnValueOnce(latest);
    const first = component.loadActivity();
    const second = component.loadActivity();
    await first;
    expect(component.loadingAct()).toBe(true);
    latest.next(result('latest'));
    await second;
    expect(component.audit()).toEqual(result('latest').items);
    expect(component.loadingAct()).toBe(false);
  });

  it('keeps the newest page when a superseded page responds last', async () => {
    component.total.set(200);
    const pageTwo = new Subject<AuditList>();
    const pageThree = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(pageTwo).mockReturnValueOnce(pageThree);
    component.nextPage();
    component.nextPage();
    pageThree.next(result('third-page', 200));
    await Promise.resolve();
    pageTwo.next(result('second-page', 100));
    await Promise.resolve();
    expect(component.page()).toBe(3);
    expect(component.audit()).toEqual(result('third-page').items);
    expect(component.total()).toBe(200);
    expect(getActivity.mock.calls.map(([filter]) => filter?.page)).toEqual([2, 3]);
  });

  it('captures all filters and resets page on apply', async () => {
    component.page.set(4);
    component.fromDate.set('2026-10-01');
    component.toDate.set('2026-10-11');
    component.actionQ.set('user.create');
    component.userIdQ.set('user-id');
    component.limit.set(25);
    component.applyFilters();
    await Promise.resolve();
    expect(getActivity).toHaveBeenCalledWith({
      from: '2026-10-01', to: '2026-10-11', action: 'user.create', userId: 'user-id', page: 1, limit: 25,
    });
  });

  it('clears filters without allowing the previous filtered result back in', async () => {
    const old = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(old).mockReturnValueOnce(of(result('unfiltered', 90)));
    component.actionQ.set('user.create');
    component.fromDate.set('2026-10-01');
    component.toDate.set('2026-10-11');
    component.userIdQ.set('user-id');
    component.page.set(2);
    const first = component.loadActivity();
    component.clearFilters();
    await Promise.resolve();
    old.next(result('filtered', 1));
    await first;
    expect(getActivity).toHaveBeenLastCalledWith({
      from: undefined, to: undefined, action: undefined, userId: undefined, page: 1, limit: 50,
    });
    expect(component.audit()).toEqual(result('unfiltered').items);
    expect(component.total()).toBe(90);
  });

  it('preserves existing rows on the current request failure and can retry', async () => {
    await component.loadActivity();
    getActivity.mockReturnValueOnce(throwError(() => new Error('offline')));
    await component.loadActivity();
    expect(component.audit()).toEqual(result('initial').items);
    expect(component.loadingAct()).toBe(false);
    getActivity.mockReturnValueOnce(of(result('recovered', 9)));
    await component.loadActivity();
    expect(component.audit()).toEqual(result('recovered').items);
    expect(component.total()).toBe(9);
  });

  it('does not commit an older queued success after the newest request fails', async () => {
    getActivity.mockReturnValueOnce(of(result('stale', 9)))
      .mockReturnValueOnce(throwError(() => new Error('latest failure')));
    await Promise.all([component.loadActivity(), component.loadActivity()]);
    expect(component.audit()).toEqual([]);
    expect(component.total()).toBe(0);
    expect(component.loadingAct()).toBe(false);
  });

  it('settles loading when the current read completes without a response', async () => {
    getActivity.mockReturnValueOnce(EMPTY);
    await component.loadActivity();
    expect(component.loadingAct()).toBe(false);
    expect(component.audit()).toEqual([]);
  });

  it('cancels an active read when the component is destroyed', async () => {
    const pending = new Subject<AuditList>();
    getActivity.mockReturnValueOnce(pending);
    const request = component.loadActivity();
    component.ngOnDestroy?.();
    expect(pending.observed).toBe(false);
    pending.next(result('late'));
    await request;
    expect(component.audit()).toEqual([]);
    expect(component.loadingAct()).toBe(false);
  });

  it('ignores a success already queued at destruction', async () => {
    const request = component.loadActivity();
    component.ngOnDestroy?.();
    await request;
    expect(component.audit()).toEqual([]);
    expect(component.total()).toBe(0);
  });

  it('does not start another activity read after destruction', async () => {
    component.ngOnDestroy?.();
    await component.loadActivity();
    expect(getActivity).not.toHaveBeenCalled();
    expect(component.loadingAct()).toBe(false);
  });
});
