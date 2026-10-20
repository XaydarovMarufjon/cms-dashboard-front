import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject, of } from 'rxjs';
import { Alert, OsintDorkFinding, ScannerService } from '../../core/services/scanner.service';
import { AlertsComponent } from './alerts.component';

const alert = (id: string, overrides: Partial<Alert> = {}): Alert => ({
  id, domain: `${id}.example.test`, websiteId: null, type: 'expiry_warning',
  message: 'Synthetic expiry warning', dueDate: '2030-01-15T00:00:00Z',
  dismissed: false, falsePositive: false, createdAt: '2030-01-01T00:00:00Z', ...overrides,
});
const finding = (id: string, overrides: Partial<OsintDorkFinding> = {}): OsintDorkFinding => ({
  id, domain: 'example.test', websiteId: null, url: `https://example.test/${id}`,
  title: null, category: 'manual_evidence', severity: 'MEDIUM', query: '', source: 'manual',
  evidence: null, sensitiveHits: [], rawSignals: {}, status: 'active', dismissed: false,
  falsePositive: false, foundAt: '2030-01-01T00:00:00Z', createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z', ...overrides,
});

// Component-logic contracts only. All records and responses are synthetic; this suite
// does not contact a scanner, validate backend persistence, or exercise the template.
describe('AlertsComponent review state', () => {
  let component: AlertsComponent;
  let scanner: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    scanner = Object.fromEntries([
      'getAlerts', 'getFalsePositiveAlerts', 'getOsintDorkConfig', 'getOsintDorkFindings',
      'getOsintDorkFalsePositive', 'dismissAlert', 'markAlertFalsePositive', 'restoreAlert',
      'dismissOsintDorkFinding', 'markOsintDorkFalsePositive', 'restoreOsintDorkFinding',
    ].map(name => [name, vi.fn().mockReturnValue(of([]))]));
    scanner['getOsintDorkConfig'].mockReturnValue(of(null));
    TestBed.configureTestingModule({ providers: [{ provide: ScannerService, useValue: scanner }] });
    component = TestBed.runInInjectionContext(() => new AlertsComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads both review lists and OSINT state, releasing loading only after all responses', async () => {
    const pending = new Subject<OsintDorkFinding[]>();
    const active = [alert('active')];
    const rejected = [alert('fp', { falsePositive: true })];
    const osint = [finding('osint')];
    scanner['getAlerts'].mockReturnValue(of(active));
    scanner['getFalsePositiveAlerts'].mockReturnValue(of(rejected));
    scanner['getOsintDorkFindings'].mockReturnValue(of(osint));
    scanner['getOsintDorkFalsePositive'].mockReturnValue(pending);
    const init = component.ngOnInit();
    await vi.waitFor(() => expect(pending.observed).toBe(true));
    expect(component.alerts()).toEqual(active);
    expect(component.falsePositiveAlerts()).toEqual(rejected);
    expect(component.loading()).toBe(true);
    const osintFp = [finding('osint-fp', { falsePositive: true })];
    pending.next(osintFp);
    await init;
    expect(component.osintFindings()).toEqual(osint);
    expect(component.osintFalsePositiveFindings()).toEqual(osintFp);
    expect(component.osintTabCount()).toBe(2);
    expect(component.loading()).toBe(false);
    expect(pending.observed).toBe(false);
  });

  it('releases loading after an initial read error without replacing existing lists', async () => {
    const previous = [alert('previous')];
    component.alerts.set(previous);
    const pending = new Subject<Alert[]>();
    scanner['getAlerts'].mockReturnValue(pending);
    const init = component.ngOnInit();
    pending.error(new Error('offline'));
    await init;
    expect(component.alerts()).toBe(previous);
    expect(component.loading()).toBe(false);
    expect(scanner['getOsintDorkFindings']).not.toHaveBeenCalled();
  });

  const operations = [
    ['dismiss', 'dismissAlert', 'alert', 'dismiss'],
    ['markFalsePositive', 'markAlertFalsePositive', 'alert', 'mark'],
    ['restore', 'restoreAlert', 'alert', 'restore'],
    ['dismissOsint', 'dismissOsintDorkFinding', 'osint', 'dismiss'],
    ['markOsintFalsePositive', 'markOsintDorkFalsePositive', 'osint', 'mark'],
    ['restoreOsint', 'restoreOsintDorkFinding', 'osint', 'restore'],
  ] as const;

  for (const [method, serviceMethod, kind, operation] of operations) {
    function seed() {
      const a = alert('target');
      const f = finding('target');
      component.alerts.set([alert('later', { dueDate: '2030-02-01T00:00:00Z' }), a]);
      component.falsePositiveAlerts.set([alert('target', { message: 'stale' }), alert('other-fp')]);
      component.osintFindings.set([finding('other'), f]);
      component.osintFalsePositiveFindings.set([finding('target', { title: 'stale' }), finding('other-fp')]);
      // Restore starts with the target only in the false-positive list.
      if (operation === 'restore') {
        if (kind === 'alert') component.alerts.update(list => list.filter(item => item.id !== 'target'));
        else component.osintFindings.update(list => list.filter(item => item.id !== 'target'));
      }
      return { a, f };
    }
    function invoke(a: Alert, f: OsintDorkFinding) {
      if (method === 'dismiss') return component.dismiss(a);
      if (method === 'markFalsePositive') return component.markFalsePositive(a);
      if (method === 'restore') return component.restore(a);
      if (method === 'dismissOsint') return component.dismissOsint(f);
      if (method === 'markOsintFalsePositive') return component.markOsintFalsePositive(f);
      return component.restoreOsint(f);
    }
    function busy() { return kind === 'alert' ? component.isActing('target') : component.isOsintActing('target'); }
    function lists() {
      return [component.alerts(), component.falsePositiveAlerts(), component.osintFindings(), component.osintFalsePositiveFindings()];
    }

    it(`${method} waits for acknowledgement and updates only the target review state`, async () => {
      const { a, f } = seed();
      const before = lists();
      const pending = new Subject<Alert | OsintDorkFinding>();
      scanner[serviceMethod].mockReturnValue(pending);
      const result = invoke(a, f);
      expect(scanner[serviceMethod]).toHaveBeenCalledExactlyOnceWith('target');
      expect(busy()).toBe(true);
      expect(lists()).toEqual(before);
      const updated = kind === 'alert'
        ? alert('target', { message: 'server record', falsePositive: operation === 'mark' })
        : finding('target', { title: 'server record', falsePositive: operation === 'mark' });
      pending.next(updated);
      await result;
      expect(busy()).toBe(false);
      expect(pending.observed).toBe(false);
      const [active, fp] = kind === 'alert'
        ? [component.alerts(), component.falsePositiveAlerts()]
        : [component.osintFindings(), component.osintFalsePositiveFindings()];
      if (operation === 'dismiss') {
        expect(active.map(item => item.id)).toEqual(kind === 'alert' ? ['later'] : ['other']);
        expect(fp).toBe(before[kind === 'alert' ? 1 : 3]);
      } else if (operation === 'mark') {
        expect(active.map(item => item.id)).toEqual(kind === 'alert' ? ['later'] : ['other']);
        expect(fp).toEqual([updated, before[kind === 'alert' ? 1 : 3][1]]);
      } else {
        expect(fp.map(item => item.id)).toEqual(['other-fp']);
        expect(active).toEqual([updated, before[kind === 'alert' ? 0 : 2][0]]);
      }
      expect(lists().slice(kind === 'alert' ? 2 : 0, kind === 'alert' ? 4 : 2))
        .toEqual(before.slice(kind === 'alert' ? 2 : 0, kind === 'alert' ? 4 : 2));
    });

    it(`${method} retains lists on failure and clears busy state for a successful retry`, async () => {
      const { a, f } = seed();
      const before = lists();
      const pending = new Subject<Alert | OsintDorkFinding>();
      scanner[serviceMethod].mockReturnValueOnce(pending);
      const result = invoke(a, f);
      pending.error(new Error('not saved'));
      await result;
      expect(busy()).toBe(false);
      expect(lists()).toEqual(before);
      scanner[serviceMethod].mockReturnValueOnce(of(kind === 'alert' ? a : f));
      await invoke(a, f);
      expect(scanner[serviceMethod]).toHaveBeenCalledTimes(2);
      expect(busy()).toBe(false);
      expect(lists()).not.toEqual(before);
    });
  }

  it('keeps unrelated alert IDs busy independently until their own requests finish', async () => {
    const first = new Subject<Alert>();
    const second = new Subject<Alert>();
    scanner['dismissAlert'].mockReturnValueOnce(first).mockReturnValueOnce(second);
    component.alerts.set([alert('first'), alert('second')]);
    const a = component.dismiss(alert('first'));
    const b = component.dismiss(alert('second'));
    first.next(alert('first'));
    await a;
    expect(component.isActing('first')).toBe(false);
    expect(component.isActing('second')).toBe(true);
    second.next(alert('second'));
    await b;
    expect(component.acting().size).toBe(0);
    expect(component.alerts()).toEqual([]);
  });

  it('keeps alert and OSINT busy state separate even for the same ID', async () => {
    const a = new Subject<Alert>();
    const f = new Subject<OsintDorkFinding>();
    scanner['dismissAlert'].mockReturnValue(a);
    scanner['dismissOsintDorkFinding'].mockReturnValue(f);
    const alertResult = component.dismiss(alert('same'));
    const osintResult = component.dismissOsint(finding('same'));
    a.next(alert('same'));
    await alertResult;
    expect(component.isActing('same')).toBe(false);
    expect(component.isOsintActing('same')).toBe(true);
    f.next(finding('same'));
    await osintResult;
    expect(component.isOsintActing('same')).toBe(false);
  });

  it('clears busy state without removing a row when a dismiss response completes empty', async () => {
    const row = alert('unchanged');
    component.alerts.set([row]);
    scanner['dismissAlert'].mockReturnValue(EMPTY);
    await component.dismiss(row);
    expect(component.alerts()).toEqual([row]);
    expect(component.isActing(row.id)).toBe(false);
  });

  it('filters both review lists by host labels, not path text or similar substrings', () => {
    component.alerts.set([
      alert('gov', { domain: 'HTTPS://WWW.PORTAL.GOV.UZ/path', type: 'expiry_urgent' }),
      alert('fake', { domain: 'https://nongov.example.test/gov.uz', type: 'expiry_urgent' }),
      alert('ssl', { domain: 'service.gov.uz', type: 'ssl_expiry_critical' }),
      alert('cms', { domain: 'service.gov.uz', type: 'cms_change' }),
    ]);
    component.falsePositiveAlerts.set([alert('fp', { domain: 'sub.gov.uz' }), alert('fp-other')]);
    component.filterTag.set('gov');
    expect(component.filteredAlerts().map(row => row.id)).toEqual(['gov', 'ssl', 'cms']);
    expect(component.filteredFalsePositiveAlerts().map(row => row.id)).toEqual(['fp']);
    expect(component.allAlertCount()).toBe(6);
    expect(component.alertTabCount()).toBe(4);
    expect(component.govTagCount()).toBe(4);
    expect(component.urgentCount()).toBe(1);
    expect(component.criticalCount()).toBe(1);
    expect(component.cmsChangeCount()).toBe(1);
    expect(component.falsePositiveCount()).toBe(1);
    component.filterTag.set('all');
    expect(component.alertTabCount()).toBe(6);
    expect(component.urgentCount()).toBe(2);
  });

  it('recomputes filtered counters after moving a record to false positives', async () => {
    const row = alert('gov', { domain: 'gov.uz', type: 'site_down' });
    component.alerts.set([row, alert('private')]);
    component.filterTag.set('gov');
    scanner['markAlertFalsePositive'].mockReturnValue(of({ ...row, falsePositive: true }));
    expect(component.siteDownCount()).toBe(1);
    await component.markFalsePositive(row);
    expect(component.siteDownCount()).toBe(0);
    expect(component.urgentCount()).toBe(0);
    expect(component.falsePositiveCount()).toBe(1);
    expect(component.alertTabCount()).toBe(1);
    expect(component.allAlertCount()).toBe(2);
  });
});
