import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitorComponent } from './network-monitor.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('NetworkMonitorComponent request lifecycle', () => {
  let component: NetworkMonitorComponent;
  let requests: { url: string; signal: AbortSignal; response: ReturnType<typeof deferred<Response>> }[];
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const response = (extra: Partial<Response> = {}) => ({ ...extra }) as Response;
  const find = (part: string) => requests.find(request => request.url.includes(part))!;

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit) => {
      const pending = deferred<Response>();
      requests.push({ url, signal: options.signal!, response: pending });
      // Deliberately do not honor abort here: queued continuations still need guards.
      return pending.promise;
    }));
    component = TestBed.runInInjectionContext(() => new NetworkMonitorComponent());
    component.ngAfterViewInit();
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aborts every pending request when destroyed', () => {
    expect(requests).toHaveLength(3);
    expect(requests.every(request => !request.signal.aborted)).toBe(true);
    component.ngOnDestroy();
    expect(requests.every(request => request.signal.aborted)).toBe(true);
  });

  it('does not install timers or update signals after late successes', async () => {
    component.latency.set(25);
    component.speed.set(10);
    component.isp.set('Original ISP');
    component.ngOnDestroy();
    find('1.1.1.1').response.resolve(response());
    find('speed.cloudflare').response.resolve(response({ arrayBuffer: async () => new ArrayBuffer(512) }));
    find('/scanner/isp').response.resolve(response({ json: async () => ({ isp: 'Late ISP' }) }));
    await flush();
    expect(component.latency()).toBe(25);
    expect(component.speed()).toBe(10);
    expect(component.isp()).toBe('Original ISP');
    expect(component.measuring()).toBe(true);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(requests).toHaveLength(3);
  });

  it('ignores failures after destruction', async () => {
    component.latency.set(25);
    component.ngOnDestroy();
    requests.forEach(request => request.response.reject(new Error('aborted')));
    await flush();
    expect(component.latency()).toBe(25);
    expect(component.measuring()).toBe(true);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(requests).toHaveLength(3);
  });

  it('guards ISP body parsing that completes after destruction', async () => {
    const body = deferred<unknown>();
    find('/scanner/isp').response.resolve(response({ json: () => body.promise }));
    await flush();
    component.ngOnDestroy();
    body.resolve({ isp: 'Late ISP' });
    await flush();
    expect(component.isp()).toBeNull();
  });

  it('guards speed body parsing that completes after destruction', async () => {
    const body = deferred<ArrayBuffer>();
    find('speed.cloudflare').response.resolve(response({ arrayBuffer: () => body.promise }));
    await flush();
    component.ngOnDestroy();
    body.resolve(new ArrayBuffer(512));
    await flush();
    expect(component.speed()).toBeNull();
    expect(component.measuring()).toBe(true);
  });

  it('clears scheduled speed and ping callbacks after successful measurements', async () => {
    await vi.advanceTimersByTimeAsync(100);
    find('1.1.1.1').response.resolve(response());
    find('speed.cloudflare').response.resolve(response({ arrayBuffer: async () => new ArrayBuffer(524288) }));
    find('/scanner/isp').response.resolve(response({ json: async () => ({ isp: 'Example ISP' }) }));
    await flush();
    expect(component.latency()).toBe(100);
    expect(component.speed()).toBeGreaterThan(0);
    expect(component.measuring()).toBe(false);
    expect(component.isp()).toBe('Example ISP');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    component.ngOnDestroy();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
    clearTimeoutSpy.mockRestore();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(requests).toHaveLength(3);
  });

  it('keeps mounted polling and retry after failures', async () => {
    requests.forEach(request => request.response.reject(new Error('network')));
    await flush();
    expect(component.latency()).toBeNull();
    expect(component.measuring()).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests.filter(request => request.url.includes('1.1.1.1'))).toHaveLength(11);
    expect(requests.filter(request => request.url.includes('speed.cloudflare'))).toHaveLength(2);
    component.ngOnDestroy();
    expect(requests.every(request => request.signal.aborted)).toBe(true);
  });

  it('removes online and offline listeners on destruction', () => {
    window.dispatchEvent(new Event('offline'));
    expect(component.isOnline()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(component.isOnline()).toBe(true);
    component.ngOnDestroy();
    window.dispatchEvent(new Event('offline'));
    expect(component.isOnline()).toBe(true);
  });
});
