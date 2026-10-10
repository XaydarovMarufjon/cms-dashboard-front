import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ProxyStats, ScannerService } from '../../core/services/scanner.service';
import { ThemeService } from '../../core/services/theme.service';
import { ProxiesComponent } from './proxies.component';

const STATS: ProxyStats = {
  total: 0, alive: 0, dead: 0, currentIndex: 0, rotations: 0, proxies: [],
  autoRefresh: {
    enabled: false, available: true, intervalMinutes: 5, maxProxies: 10,
    lastRefresh: null, refreshing: false, sources: [],
  },
  domainCooldowns: [],
  health: { deadAfterFails: 3, reviveMinutes: 5, domainCooldownSec: 10 },
};
const ISP = { isp: 'Example ISP', ip: '192.0.2.1', country: null, city: null };

// Exercise lifecycle hooks and timer callbacks with controlled read responses.
// Mutating proxy operations and browser rendering are outside this suite's scope.
describe('ProxiesComponent polling lifecycle', () => {
  let component: ProxiesComponent;
  let getProxies: ReturnType<typeof vi.fn<ScannerService['getProxies']>>;
  let getIsp: ReturnType<typeof vi.fn<ScannerService['getIsp']>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    getProxies = vi.fn<ScannerService['getProxies']>().mockReturnValue(of(STATS));
    getIsp = vi.fn<ScannerService['getIsp']>().mockReturnValue(of(ISP));
    TestBed.configureTestingModule({
      providers: [
        { provide: ScannerService, useValue: { getProxies, getIsp } },
        { provide: ThemeService, useValue: {} },
        { provide: AuthService, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ProxiesComponent());
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads initial data and keeps polling while mounted', async () => {
    await component.ngOnInit();
    expect(component.stats()).toBe(STATS);
    expect(component.ispInfo()).toEqual(ISP);
    expect(component.loading()).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    const updated = { ...STATS, rotations: 7 };
    getProxies.mockReturnValue(of(updated));
    await vi.advanceTimersByTimeAsync(2500);

    expect(getProxies).toHaveBeenCalledTimes(2);
    expect(component.stats()).toBe(updated);
    expect(getIsp).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending initial read without starting polling after destruction', async () => {
    const initial = new Subject<ProxyStats>();
    getProxies.mockReturnValue(initial);
    const init = component.ngOnInit();
    expect(initial.observed).toBe(true);

    component.ngOnDestroy();
    expect(initial.observed).toBe(false);
    await init;
    await vi.advanceTimersByTimeAsync(10000);

    expect(getProxies).toHaveBeenCalledTimes(1);
    expect(getIsp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(component.stats()).toBeNull();
    expect(component.error()).toBe('');
  });

  it('ignores an initial response already queued when destruction occurs', async () => {
    const initial = new Subject<ProxyStats>();
    getProxies.mockReturnValue(initial);
    const init = component.ngOnInit();
    initial.next(STATS);
    component.ngOnDestroy();
    await init;

    expect(component.stats()).toBeNull();
    expect(getIsp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('updates stats through polling after an initial read error while still mounted', async () => {
    getProxies.mockReturnValueOnce(throwError(() => new Error('offline')));
    await component.ngOnInit();
    expect(component.loading()).toBe(false);
    expect(component.error()).not.toBe('');

    await vi.advanceTimersByTimeAsync(2500);
    expect(getProxies).toHaveBeenCalledTimes(2);
    expect(component.stats()).toBe(STATS);
  });

  it('clears the active interval when destroyed', async () => {
    await component.ngOnInit();
    component.ngOnDestroy();
    await vi.advanceTimersByTimeAsync(10000);

    expect(vi.getTimerCount()).toBe(0);
    expect(getProxies).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight poll when destroyed', async () => {
    await component.ngOnInit();
    const poll = new Subject<ProxyStats>();
    getProxies.mockReturnValue(poll);
    await vi.advanceTimersByTimeAsync(2500);
    expect(poll.observed).toBe(true);

    component.ngOnDestroy();
    expect(poll.observed).toBe(false);
    poll.next({ ...STATS, rotations: 99 });
    await vi.advanceTimersByTimeAsync(10000);

    expect(component.stats()).toBe(STATS);
    expect(getProxies).toHaveBeenCalledTimes(2);
  });

  it('ignores a poll result already queued when destroyed', async () => {
    await component.ngOnInit();
    const poll = new Subject<ProxyStats>();
    getProxies.mockReturnValue(poll);
    await vi.advanceTimersByTimeAsync(2500);
    // Force the late poll down the ISP-loading path if it is not guarded.
    component.ispInfo.set(null);
    poll.next({ ...STATS, rotations: 99 });
    component.ngOnDestroy();
    await Promise.resolve();

    expect(component.stats()).toBe(STATS);
    expect(component.rotationRate()).toBe(0);
    expect(getIsp).toHaveBeenCalledTimes(1);
  });

  it('keeps at most one poll in flight and resumes after it completes', async () => {
    await component.ngOnInit();
    const poll = new Subject<ProxyStats>();
    getProxies.mockReturnValueOnce(poll);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getProxies).toHaveBeenCalledTimes(2);

    const updated = { ...STATS, rotations: 10 };
    poll.next(updated);
    await Promise.resolve();
    expect(component.stats()).toBe(updated);
    expect(poll.observed).toBe(false);

    await vi.advanceTimersByTimeAsync(2500);
    expect(getProxies).toHaveBeenCalledTimes(3);
    expect(component.stats()).toBe(STATS);
  });

  it('releases the polling guard after an error so the next tick can recover', async () => {
    await component.ngOnInit();
    getProxies.mockReturnValueOnce(throwError(() => new Error('offline')));
    await vi.advanceTimersByTimeAsync(2500);
    expect(component.stats()).toBe(STATS);

    const recovered = { ...STATS, rotations: 5 };
    getProxies.mockReturnValue(of(recovered));
    await vi.advanceTimersByTimeAsync(2500);
    expect(getProxies).toHaveBeenCalledTimes(3);
    expect(component.stats()).toBe(recovered);
  });

  it('continues skipping hidden tabs and resumes when visible', async () => {
    await component.ngOnInit();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(getProxies).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(2500);
    expect(getProxies).toHaveBeenCalledTimes(2);
  });

  it('shares a pending ISP read across polls and retries it after failure', async () => {
    const isp = new Subject<typeof ISP>();
    getIsp.mockReturnValueOnce(isp);
    await component.ngOnInit();
    await vi.advanceTimersByTimeAsync(7500);
    expect(getIsp).toHaveBeenCalledTimes(1);

    isp.error(new Error('offline'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2500);
    expect(getIsp).toHaveBeenCalledTimes(2);
    expect(component.ispInfo()).toEqual(ISP);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getIsp).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending ISP read when destroyed', async () => {
    const isp = new Subject<typeof ISP>();
    getIsp.mockReturnValue(isp);
    await component.ngOnInit();
    expect(isp.observed).toBe(true);

    component.ngOnDestroy();
    expect(isp.observed).toBe(false);
    isp.next(ISP);
    await Promise.resolve();
    expect(component.ispInfo()).toBeNull();
  });

  it('ignores an ISP result already queued when destroyed', async () => {
    const isp = new Subject<typeof ISP>();
    getIsp.mockReturnValue(isp);
    await component.ngOnInit();
    isp.next(ISP);
    component.ngOnDestroy();
    await Promise.resolve();
    expect(component.ispInfo()).toBeNull();
  });

  it('does not start a new read after destruction', async () => {
    component.ngOnDestroy();
    await component.load();
    await component.ngOnInit();

    expect(getProxies).not.toHaveBeenCalled();
    expect(getIsp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
