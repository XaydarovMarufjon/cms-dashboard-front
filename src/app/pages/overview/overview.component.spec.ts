import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { finalize, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallsService } from '../../core/services/calls.service';
import { ScannerService } from '../../core/services/scanner.service';
import { TasksService } from '../../core/services/tasks.service';
import { WebsiteService } from '../../core/services/website.service';
import { OverviewComponent } from './overview.component';

const readNames = [
  'websites', 'results', 'alerts', 'tasks', 'calls', 'proxy',
  'systemStatus', 'overviewStats', 'liveScanActivity',
] as const;
type ReadName = typeof readNames[number];

interface PendingRead {
  name: ReadName;
  source: Subject<unknown>;
  stopped: ReturnType<typeof vi.fn>;
}

const initialData: Record<ReadName, unknown> = {
  websites: [{ id: 'site-1', url: 'https://example.test' }],
  results: [{ id: 'result-1', websiteId: 'site-1' }],
  alerts: [{ id: 'alert-1' }],
  tasks: [{ id: 'task-1' }],
  calls: [{ id: 'call-1' }],
  proxy: { alive: 2, total: 3 },
  systemStatus: { status: 'OK' },
  overviewStats: { generatedAt: '2026-10-15T00:00:00Z' },
  liveScanActivity: { active: [], recent: [] },
};

describe('OverviewComponent request lifecycle', () => {
  let component: OverviewComponent;
  let requests: PendingRead[];

  const snapshot = () => Object.fromEntries(readNames.map(name => [name, component[name]()]));
  const requestsFor = (name: ReadName) => requests.filter(request => request.name === name);
  const resolveInitial = () => {
    for (const request of requests.slice(0, readNames.length)) {
      request.source.next(initialData[request.name]);
      request.source.complete();
    }
  };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    const read = (name: ReadName) => vi.fn(() => {
      const source = new Subject<unknown>();
      const stopped = vi.fn();
      requests.push({ name, source, stopped });
      return source.pipe(finalize(stopped));
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: WebsiteService, useValue: { getAll: read('websites') } },
        { provide: TasksService, useValue: { getAll: read('tasks') } },
        { provide: CallsService, useValue: { getCalls: read('calls') } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ScannerService,
          useValue: {
            getLatestResults: read('results'),
            getAlerts: read('alerts'),
            getProxies: read('proxy'),
            getSystemStatus: read('systemStatus'),
            getOverviewStats: read('overviewStats'),
            getLiveScanActivity: read('liveScanActivity'),
          },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new OverviewComponent());
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('unsubscribes all nine pending initial reads and settles initialization on destruction', async () => {
    const initializing = component.ngOnInit();
    expect(requests.map(request => request.name)).toEqual(readNames);
    expect(requests.every(request => request.source.observed)).toBe(true);

    component.ngOnDestroy();

    for (const request of requests) {
      expect(request.stopped).toHaveBeenCalledOnce();
      expect(request.source.observed).toBe(false);
    }
    await initializing;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not update initial state or start polling after late initial responses', async () => {
    const before = snapshot();
    const initializing = component.ngOnInit();
    component.ngOnDestroy();
    resolveInitial();
    await initializing;

    expect(snapshot()).toEqual(before);
    expect(component.loading()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(9);
  });

  it('ignores initial successes already queued for promise continuation before destruction', async () => {
    const before = snapshot();
    const initializing = component.ngOnInit();
    resolveInitial();
    component.ngOnDestroy();
    await initializing;

    expect(snapshot()).toEqual(before);
    expect(component.loading()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart polling after the last initial request fails following destruction', async () => {
    const initializing = component.ngOnInit();
    for (const request of requests.slice(0, -1)) {
      request.source.next(initialData[request.name]);
    }
    await flush();
    expect(component.websites()).toEqual(initialData.websites);
    const before = snapshot();
    component.ngOnDestroy();
    requests.at(-1)!.source.error(new Error('late failure'));
    await initializing;

    expect(snapshot()).toEqual(before);
    expect(component.loading()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(9);
  });

  it('loads initial data and retains the mounted 1-second and 30-second polling cadence', async () => {
    const initializing = component.ngOnInit();
    resolveInitial();
    await initializing;
    expect(snapshot()).toEqual(initialData);
    expect(component.loading()).toBe(false);

    await vi.advanceTimersByTimeAsync(0);
    expect(requestsFor('liveScanActivity')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(requestsFor('liveScanActivity')).toHaveLength(31);
    expect(requestsFor('systemStatus')).toHaveLength(1);
    expect(requestsFor('overviewStats')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestsFor('liveScanActivity')).toHaveLength(32);
    expect(requestsFor('systemStatus')).toHaveLength(2);
    expect(requestsFor('overviewStats')).toHaveLength(2);

    const status = { status: 'WARN' };
    const stats = { generatedAt: '2026-10-15T00:00:30Z' };
    const live = { active: [{ id: 'running' }], recent: [] };
    requestsFor('systemStatus').at(-1)!.source.next(status);
    requestsFor('overviewStats').at(-1)!.source.next(stats);
    requestsFor('liveScanActivity').at(-1)!.source.next(live);
    expect(component.systemStatus()).toEqual(status);
    expect(component.overviewStats()).toEqual(stats);
    expect(component.liveScanActivity()).toEqual(live);
  });

  it('stops established timers and every in-flight poll when destroyed', async () => {
    const initializing = component.ngOnInit();
    resolveInitial();
    await initializing;
    await vi.advanceTimersByTimeAsync(30_000);
    const count = requests.length;
    const pending = requests.slice(9);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every(request => request.source.observed)).toBe(true);

    component.ngOnDestroy();

    expect(vi.getTimerCount()).toBe(0);
    for (const request of pending) {
      expect(request.stopped).toHaveBeenCalledOnce();
      expect(request.source.observed).toBe(false);
    }
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(count);
  });

  it('cancels manually requested reads and ignores their late successes', () => {
    component.loadLiveOverview();
    component.loadLiveScanActivity();
    expect(requests.map(request => request.name)).toEqual([
      'systemStatus', 'overviewStats', 'liveScanActivity',
    ]);
    const before = snapshot();
    component.ngOnDestroy();
    for (const request of requests) request.source.next(initialData[request.name]);

    expect(snapshot()).toEqual(before);
    expect(component.systemLoading()).toBe(true);
    expect(component.systemError()).toBeNull();
    expect(requests.every(request => !request.source.observed)).toBe(true);
  });

  it('ignores late errors from reads cancelled on destruction', () => {
    component.loadLiveOverview();
    component.loadLiveScanActivity();
    component.ngOnDestroy();
    for (const request of requests) {
      request.source.error({ error: { message: 'late error' } });
    }

    expect(component.systemError()).toBeNull();
    expect(component.systemLoading()).toBe(true);
  });

  it('does not start new initial, manual or live reads after destruction', async () => {
    component.ngOnDestroy();
    // A retained callback must also be safe after the cancellation Subject completed.
    component.ngOnInit();
    component.loadLiveOverview();
    component.loadSystemStatus();
    component.loadLiveScanActivity();
    await flush();

    expect(requests).toHaveLength(0);
    expect(component.systemLoading()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues polling after initial errors and empty completions while mounted', async () => {
    const initializing = component.ngOnInit();
    requests.forEach((request, index) => {
      if (index % 2) request.source.complete();
      else request.source.error(new Error('unavailable'));
    });
    await initializing;

    expect(component.loading()).toBe(false);
    expect(component.websites()).toEqual([]);
    expect(component.systemStatus()).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requestsFor('liveScanActivity')).toHaveLength(32);
    expect(requestsFor('systemStatus')).toHaveLength(2);
    expect(requestsFor('overviewStats')).toHaveLength(2);
  });

  it('allows live reads to retry and clear the system error after failure', () => {
    component.loadLiveOverview();
    component.loadLiveScanActivity();
    for (const request of requests) {
      request.source.error({ error: { message: 'temporarily unavailable' } });
    }
    expect(component.systemError()).toBe('temporarily unavailable');
    expect(component.systemLoading()).toBe(false);

    component.loadLiveOverview();
    component.loadLiveScanActivity();
    for (const request of requests.slice(3)) {
      request.source.next(initialData[request.name]);
      request.source.complete();
    }
    expect(component.systemStatus()).toEqual(initialData.systemStatus);
    expect(component.overviewStats()).toEqual(initialData.overviewStats);
    expect(component.liveScanActivity()).toEqual(initialData.liveScanActivity);
    expect(component.systemError()).toBeNull();
    expect(component.systemLoading()).toBe(false);
  });
});
