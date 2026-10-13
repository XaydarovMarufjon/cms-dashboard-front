import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageModerationService, ImageScan, ScanDetail, SiteOverviewEntry,
} from '../../core/services/image-moderation.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { ImageModerationComponent } from './image-moderation.component';

@Component({ selector: 'app-side-nav', standalone: true, template: '' })
class SideNavStub {}

function site(id: string): SiteOverviewEntry {
  const scan: ImageScan = {
    id: `scan-${id}`, websiteId: id, status: 'COMPLETED', totalImages: 1,
    scannedImages: 1, flaggedCount: 0, sexualCount: 0, violentCount: 0,
    religiousCount: 0, errorMessage: null, startedAt: '2026-10-13T08:00:00Z',
    finishedAt: '2026-10-13T08:01:00Z',
  };
  return { id, url: `https://${id}.example`, label: null, latestScan: scan };
}
function detail(s: SiteOverviewEntry): ScanDetail {
  return {
    scan: { ...s.latestScan!, website: { id: s.id, url: s.url, label: s.label } },
    results: [{
      id: `image-${s.id}`, scanId: s.latestScan!.id, imageUrl: `${s.url}/image.png`,
      pageUrl: null, sexualScore: 0, violentScore: 0, religiousScore: 0,
      categories: [], flagged: false, errorMessage: null, scannedAt: '2026-10-13T08:00:00Z',
    }],
  };
}

describe('image moderation detail lifecycle', () => {
  let fixture: ComponentFixture<ImageModerationComponent>;
  let component: ImageModerationComponent;
  const a = site('a');
  const b = site('b');
  let responses: Subject<ScanDetail>[];
  let svc: { getStatus: ReturnType<typeof vi.fn>; getOverview: ReturnType<typeof vi.fn>;
    getScanDetail: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    responses = [];
    svc = {
      getStatus: vi.fn(() => of({ configured: true, running: false })),
      getOverview: vi.fn(() => of([a, b])),
      getScanDetail: vi.fn(() => {
        const response = new Subject<ScanDetail>();
        responses.push(response);
        return response;
      }),
    };
    await TestBed.configureTestingModule({
      imports: [ImageModerationComponent],
      providers: [provideRouter([]), { provide: ImageModerationService, useValue: svc }],
    }).overrideComponent(ImageModerationComponent, {
      remove: { imports: [SideNavComponent] }, add: { imports: [SideNavStub] },
    }).compileComponents();
    fixture = TestBed.createComponent(ImageModerationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => fixture.destroy());

  async function render() {
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
  }
  function close() {
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.btn-close') as HTMLButtonElement).click();
  }

  it('renders the current response under the selected site heading', async () => {
    const pending = component.openSite(a);
    responses[0].next(detail(a));
    await pending;
    await render();
    expect(fixture.nativeElement.querySelector('.detail-title').textContent).toBe('a.example');
    expect(fixture.nativeElement.querySelector('.image-thumb').getAttribute('href')).toBe(`${a.url}/image.png`);
    expect(component.detailLoading()).toBe(false);
  });

  it('cancels a superseded request without clearing the newer loading indicator', async () => {
    const old = component.openSite(a);
    const current = component.openSite(b);
    await old;
    expect(responses[0].observed).toBe(false);
    expect(component.detailLoading()).toBe(true);
    responses[0].next(detail(a));
    responses[1].next(detail(b));
    await current;
    expect(component.detail()).toEqual(detail(b));
  });

  it('ignores a queued old success when a newer site opens', async () => {
    const old = component.openSite(a);
    responses[0].next(detail(a));
    const current = component.openSite(b);
    await old;
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(true);
    responses[1].next(detail(b));
    await current;
    await render();
    expect(fixture.nativeElement.querySelector('.detail-title').textContent).toBe('b.example');
    expect(fixture.nativeElement.querySelector('.image-thumb').getAttribute('href')).toBe(`${b.url}/image.png`);
  });

  it('ignores a queued old failure while a newer site is loading', async () => {
    const old = component.openSite(a);
    responses[0].error(new Error('old failure'));
    const current = component.openSite(b);
    await old;
    expect(component.detailLoading()).toBe(true);
    responses[1].next(detail(b));
    await current;
    expect(component.detail()).toEqual(detail(b));
  });

  it('cancels a pending request when the close button is clicked', async () => {
    const pending = component.openSite(a);
    component.filter.set('flagged');
    close();
    expect(responses[0].observed).toBe(false);
    responses[0].next(detail(a));
    await pending;
    await render();
    expect(component.selectedSite()).toBeNull();
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(false);
    expect(component.filter()).toBe('all');
    expect(fixture.nativeElement.querySelector('.detail-overlay')).toBeNull();
  });

  it('does not restore a queued result after closing', async () => {
    const pending = component.openSite(a);
    responses[0].next(detail(a));
    close();
    await pending;
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(false);
  });

  it('keeps a reopened same-site request independent of the dismissed request', async () => {
    const old = component.openSite(a);
    responses[0].next(detail(a));
    close();
    const current = component.openSite(a);
    await old;
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(true);
    responses[1].next(detail(a));
    await current;
    expect(component.detail()).toEqual(detail(a));
  });

  it('shows the no-scan state immediately when switching from a loading site', async () => {
    const old = component.openSite(a);
    responses[0].next(detail(a));
    await component.openSite({ ...b, latestScan: null });
    await old;
    await render();
    expect(component.detailLoading()).toBe(false);
    expect(component.detail()).toBeNull();
    expect(svc.getScanDetail).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.detail-modal .empty-title').textContent).toContain("Skan ma'lumotlari yo'q");
  });

  it('clears loading on a current failure and allows retry', async () => {
    const failed = component.openSite(a);
    responses[0].error(new Error('failed'));
    await failed;
    expect(component.detailLoading()).toBe(false);
    expect(component.detail()).toBeNull();
    const retry = component.openSite(a);
    responses[1].next(detail(a));
    await retry;
    expect(component.detail()).toEqual(detail(a));
  });

  it('clears loading when the current request completes without a value', async () => {
    svc.getScanDetail.mockReturnValueOnce(EMPTY);
    await component.openSite(a);
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(false);
  });

  it('clears loading on a synchronous service exception', async () => {
    svc.getScanDetail.mockImplementationOnce(() => { throw new Error('sync failure'); });
    await component.openSite(a);
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(false);
  });

  it('cancels the pending detail request on destruction', async () => {
    const pending = component.openSite(a);
    fixture.destroy();
    expect(responses[0].observed).toBe(false);
    responses[0].next(detail(a));
    await pending;
    expect(component.detail()).toBeNull();
    expect(component.detailLoading()).toBe(false);
  });

  it('ignores a queued result and later detail opens after destruction', async () => {
    const pending = component.openSite(a);
    responses[0].next(detail(a));
    fixture.destroy();
    await pending;
    await component.openSite(b);
    expect(component.detail()).toBeNull();
    expect(component.selectedSite()).toBeNull();
    expect(svc.getScanDetail).toHaveBeenCalledTimes(1);
  });
});
