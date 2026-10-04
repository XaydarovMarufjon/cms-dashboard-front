import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ScannerService } from '../../core/services/scanner.service';
import { UrlCheckerSiteService } from '../../core/services/url-checker-site.service';
import { CheckerComponent } from './checker.component';

describe('CheckerComponent asynchronous checks', () => {
  let component: CheckerComponent;
  let requests: Subject<{ canEmbed: boolean }>[];
  let checkCanEmbed: ReturnType<typeof vi.fn>;
  let openWindow: ReturnType<typeof vi.spyOn>;
  let closeWindow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    checkCanEmbed = vi.fn(() => {
      const request = new Subject<{ canEmbed: boolean }>();
      requests.push(request);
      return request;
    });
    closeWindow = vi.fn();
    openWindow = vi.spyOn(window, 'open').mockReturnValue({ close: closeWindow } as unknown as Window);
    TestBed.configureTestingModule({
      providers: [
        { provide: ScannerService, useValue: { checkCanEmbed } },
        { provide: UrlCheckerSiteService, useValue: {} },
      ],
    });
    component = TestBed.runInInjectionContext(() => new CheckerComponent());
    component.sites.set([{ id: 'first', url: 'https://first.example' }]);
    component.loadingSites.set(false);
    component.setIntervalMs(10000);
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function resolve(index: number, canEmbed: boolean) {
    requests[index].next({ canEmbed });
    await vi.advanceTimersByTimeAsync(0);
  }

  it('displays an active embedded site and records its completion', async () => {
    component.start();
    await resolve(0, true);

    expect(component.iframeUrl()).toBe('https://first.example');
    expect(openWindow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000);
    expect(component.results()[0].status).toBe('done');
  });

  it('opens a non-embeddable site and closes its window on stop', async () => {
    component.start();
    await resolve(0, false);

    expect(openWindow).toHaveBeenCalledWith('https://first.example', '_blank');
    expect(component.openedInWindow()).toBe(true);
    component.stop();
    expect(closeWindow).toHaveBeenCalledOnce();
    expect(component.openedInWindow()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('opens a forced-window site without an embed request and closes it on completion', async () => {
    component.sites.set([{ id: 'first', url: 'https://first.example', forceWindow: true }]);
    component.start();

    expect(checkCanEmbed).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith('https://first.example', '_blank');
    await vi.advanceTimersByTimeAsync(8000);
    expect(closeWindow).toHaveBeenCalledOnce();
    expect(component.openedInWindow()).toBe(false);
    expect(component.results()[0].status).toBe('done');
  });

  it('ignores duplicate Start clicks while checking a site', async () => {
    component.start();
    component.start();
    expect(checkCanEmbed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(2);

    await resolve(0, true);
    component.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(checkCanEmbed).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('keeps a single checking interval across successful wraparound cycles', async () => {
    component.start();
    await resolve(0, true);

    for (let cycle = 1; cycle <= 4; cycle += 1) {
      await vi.advanceTimersByTimeAsync(10000);
      expect(checkCanEmbed).toHaveBeenCalledTimes(cycle + 1);
      await resolve(cycle, true);
      expect(component.currentIndex()).toBe(0);
      expect(component.results()[0].status).toBe('checking');
      expect(component.iframeUrl()).toBe('https://first.example');
      // One checking interval, one countdown interval, and one completion timer.
      expect(vi.getTimerCount()).toBe(3);
    }
  });

  it.each([true, false])('ignores a pending response after pause (canEmbed=%s)', async canEmbed => {
    component.start();
    component.togglePause();
    await resolve(0, canEmbed);

    expect(component.isPaused()).toBe(true);
    expect(component.iframeUrl()).toBe('');
    expect(component.openedInWindow()).toBe(false);
    expect(component.results()[0].status).toBe('idle');
    expect(openWindow).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stop', 'ngOnDestroy'] as const)('ignores a failed pending request after %s', async action => {
    component.start();
    component[action]();
    requests[0].error(new Error('Request failed'));
    await vi.advanceTimersByTimeAsync(0);

    expect(component.isRunning()).toBe(false);
    expect(component.iframeUrl()).toBe('');
    expect(openWindow).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['restart', 'resume'])('ignores the older response after %s', async action => {
    component.start();
    if (action === 'restart') {
      component.stop();
      component.start();
    } else {
      component.togglePause();
      component.togglePause();
    }
    await resolve(1, true);
    await resolve(0, false);

    expect(component.iframeUrl()).toBe('https://first.example');
    expect(component.openedInWindow()).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
    expect(checkCanEmbed).toHaveBeenCalledTimes(2);
  });

  it('does not let an older site response replace the current site', async () => {
    component.sites.update(sites => [...sites, { id: 'second', url: 'https://second.example' }]);
    component.start();
    await vi.advanceTimersByTimeAsync(10000);
    await resolve(1, true);
    await resolve(0, false);

    expect(component.currentIndex()).toBe(1);
    expect(component.iframeUrl()).toBe('https://second.example');
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('does not restart the loop when stopped during a pending wraparound check', async () => {
    component.start();
    await resolve(0, true);
    await vi.advanceTimersByTimeAsync(10000);
    component.stop();
    await resolve(1, false);
    await vi.advanceTimersByTimeAsync(30000);

    expect(component.isRunning()).toBe(false);
    expect(component.currentIndex()).toBe(-1);
    expect(openWindow).not.toHaveBeenCalled();
    expect(checkCanEmbed).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
