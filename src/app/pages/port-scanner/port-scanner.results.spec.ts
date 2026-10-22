import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, of, Subject } from 'rxjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PortScannerComponent } from './port-scanner.component';
import { PortScanResult, ScannerService } from '../../core/services/scanner.service';
import { WebsiteService } from '../../core/services/website.service';
import { TasksService } from '../../core/services/tasks.service';

const row = (websiteId: string): PortScanResult => ({
  id: `result-${websiteId}`, websiteId, host: `${websiteId}.example`, port: 443,
  protocol: 'tcp', status: 'OPEN', service: 'https', latencyMs: 12,
  error: null, scanId: 'synthetic', scannedAt: '2026-01-01T00:00:00Z',
});

describe('Port scanner saved-result read ownership', () => {
  let component: PortScannerComponent;
  let reads: Subject<PortScanResult[]>[];
  let getResults: ReturnType<typeof vi.fn>;
  let scan: Subject<PortScanResult[]>;
  let scanPorts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reads = [];
    getResults = vi.fn((): Observable<PortScanResult[]> => {
      const read = new Subject<PortScanResult[]>();
      reads.push(read);
      return read.asObservable();
    });
    scan = new Subject<PortScanResult[]>();
    scanPorts = vi.fn(() => scan.asObservable());
    TestBed.configureTestingModule({ providers: [
      { provide: ScannerService, useValue: { getPortScanResults: getResults, scanPorts } },
      { provide: WebsiteService, useValue: { getAll: vi.fn(() => EMPTY), create: vi.fn() } },
      { provide: TasksService, useValue: { create: vi.fn() } },
    ] });
    component = TestBed.runInInjectionContext(() => new PortScannerComponent());
    component.websites.set(['a', 'b'].map(id => ({ id, url: `https://${id}.example`, createdAt: '' })));
  });

  afterEach(() => {
    (component as unknown as { ngOnDestroy?: () => void }).ngOnDestroy?.();
  });

  it('loads the selected site and displays its results', () => {
    component.selectWebsite('a');
    expect(getResults).toHaveBeenCalledWith('a');
    expect(component.loadingResults()).toBe(true);
    reads[0].next([row('a')]); reads[0].complete();
    expect(component.results()).toEqual([row('a')]);
    expect(component.openPorts()).toEqual([row('a')]);
    expect(component.loadingResults()).toBe(false);
  });

  it('cancels an older site read and retains the newer site results', () => {
    component.selectWebsite('a'); component.selectWebsite('b');
    expect(reads[0].observed).toBe(false);
    reads[1].next([row('b')]); reads[1].complete();
    reads[0].next([row('a')]); reads[0].complete();
    expect(component.results()).toEqual([row('b')]);
  });

  it('does not let an old error clear a newer loading indicator or set an error', () => {
    component.selectWebsite('a'); component.selectWebsite('b');
    reads[0].error(new Error('old'));
    expect(component.loadingResults()).toBe(true);
    expect(component.error()).toBe('');
    reads[1].complete();
    expect(component.loadingResults()).toBe(false);
  });

  it('cancels a same-site reload rather than allowing its stale data to win', () => {
    component.selectWebsite('a'); component.loadResults();
    expect(reads[0].observed).toBe(false);
    reads[1].next([row('a')]); reads[1].complete();
    reads[0].next([]);
    expect(component.results()).toEqual([row('a')]);
  });

  it.each(['', 'not-a-saved-site.example'])('clears an active read for unmatched input %j', value => {
    component.selectWebsite('a'); component.onSiteInput(value);
    expect(reads[0].observed).toBe(false);
    expect(component.selectedWebsiteId()).toBe('');
    expect(component.loadingResults()).toBe(false);
    reads[0].next([row('a')]);
    expect(component.results()).toEqual([]);
  });

  it('switches saved-result ownership when typed input matches another site', () => {
    component.selectWebsite('a'); component.onSiteInput('b.example');
    expect(getResults).toHaveBeenLastCalledWith('b');
    expect(reads[0].observed).toBe(false);
    reads[1].next([row('b')]); reads[1].complete();
    expect(component.results()).toEqual([row('b')]);
  });

  it('keeps the pending read when typing the already-selected site', () => {
    component.selectWebsite('a'); component.onSiteInput('a.example');
    expect(getResults).toHaveBeenCalledTimes(1);
    expect(reads[0].observed).toBe(true);
  });

  it('cleans up on empty completion and allows a retry', () => {
    component.selectWebsite('a'); reads[0].complete();
    expect(component.loadingResults()).toBe(false);
    component.loadResults();
    expect(component.loadingResults()).toBe(true);
    reads[1].next([row('a')]); reads[1].complete();
    expect(component.results()).toEqual([row('a')]);
  });

  it('reports a current error, releases loading, and can retry', () => {
    component.selectWebsite('a'); reads[0].error(new Error('current'));
    expect(component.loadingResults()).toBe(false);
    expect(component.error()).toContain('natijalarini');
    component.selectWebsite('a');
    expect(component.error()).toBe('');
    reads[1].next([row('a')]); reads[1].complete();
    expect(component.results()).toEqual([row('a')]);
  });

  it('handles synchronous result completion without a stuck loading state', () => {
    getResults.mockReturnValueOnce(of([row('a')]));
    component.selectWebsite('a');
    expect(component.results()).toEqual([row('a')]);
    expect(component.loadingResults()).toBe(false);
    component.loadResults();
    expect(component.loadingResults()).toBe(true);
  });

  it('does not request results with no selected site', () => {
    component.loadResults();
    expect(getResults).not.toHaveBeenCalled();
    expect(component.loadingResults()).toBe(false);
  });

  it('cancels reads on destruction and ignores later data', () => {
    component.selectWebsite('a'); (component as unknown as { ngOnDestroy?: () => void }).ngOnDestroy?.();
    expect(reads[0].observed).toBe(false);
    expect(component.loadingResults()).toBe(false);
    reads[0].next([row('a')]);
    expect(component.results()).toEqual([]);
    (component as unknown as { ngOnDestroy?: () => void }).ngOnDestroy?.(); component.loadResults();
    expect(getResults).toHaveBeenCalledTimes(1);
  });

  it('cancels saved results before a valid scan so old data cannot replace scan output', async () => {
    component.selectWebsite('a'); await component.runScan();
    expect(scanPorts).toHaveBeenCalledTimes(1);
    expect(reads[0].observed).toBe(false);
    expect(component.loadingResults()).toBe(false);
    scan.next([row('a')]); scan.complete();
    reads[0].next([]);
    expect(component.results()).toEqual([row('a')]);
    expect(component.scanning()).toBe(false);
  });

  it('does not cancel the saved read when scan validation rejects the input', async () => {
    component.selectWebsite('a'); component.portInput.set('invalid');
    await component.runScan();
    expect(scanPorts).not.toHaveBeenCalled();
    expect(reads[0].observed).toBe(true);
    reads[0].next([row('a')]); reads[0].complete();
    expect(component.results()).toEqual([row('a')]);
  });
});
