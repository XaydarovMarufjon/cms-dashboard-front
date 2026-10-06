import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subject, of } from 'rxjs';
import { WebsiteService } from '../../core/services/website.service';
import { Website } from '../models/website.model';
import { CommandPaletteComponent } from './command-palette.component';

const SITE: Website = {
  id: 'example-site',
  url: 'https://example.test',
  label: 'Example site',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('CommandPaletteComponent loading and focus', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;
  let response: Subject<Website[]>;
  let getAll: ReturnType<typeof vi.fn<() => Observable<Website[]>>>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    response = new Subject<Website[]>();
    getAll = vi.fn(() => response.asObservable());
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [
        { provide: WebsiteService, useValue: { getAll } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function open() {
    const pending = component.open();
    fixture.detectChanges();
    return pending;
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  it('focuses the search input and exposes pages while the sites request is pending', async () => {
    const pending = open();
    vi.advanceTimersByTime(30);

    expect(document.activeElement).toBe(input());
    expect(component.hits().some(hit => hit.title === 'Dashboard')).toBe(true);
    expect(response.observed).toBe(true);

    response.next([]);
    await pending;
  });

  it('retries a failed load on reopen and makes the recovered sites searchable', async () => {
    const pending = open();
    response.error(new Error('offline'));
    await pending;
    component.close();
    getAll.mockReturnValue(of([SITE]));

    await open();
    component.onQuery('example');

    expect(getAll).toHaveBeenCalledTimes(2);
    expect(component.hits()).toEqual([
      { kind: 'site', title: SITE.label, sub: SITE.url, link: ['/site', SITE.id] },
    ]);
  });

  it('retries when a request completes without a response', async () => {
    getAll.mockReturnValueOnce(EMPTY).mockReturnValueOnce(of([SITE]));
    await open();
    component.close();
    await open();
    component.onQuery('example');

    expect(getAll).toHaveBeenCalledTimes(2);
    expect(component.hits()[0]?.link).toEqual(['/site', SITE.id]);
  });

  it('shares an in-flight load across repeated opens and close/reopen', async () => {
    const first = open();
    await open();
    component.close();
    await open();
    expect(getAll).toHaveBeenCalledTimes(1);

    response.next([SITE]);
    await first;
    component.onQuery('example');
    expect(component.hits()[0]?.title).toBe(SITE.label);
  });

  it('caches a successful response even when the site list is empty', async () => {
    getAll.mockReturnValue(of([]));
    await open();
    component.close();
    await open();

    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('does not refocus a newer open or reset its query when the old request finishes', async () => {
    const first = open();
    component.close();
    await open();
    const focus = vi.spyOn(input(), 'focus');
    vi.advanceTimersByTime(30);
    focus.mockClear();
    component.onQuery('example');

    response.next([SITE]);
    await first;
    vi.advanceTimersByTime(30);

    expect(focus).not.toHaveBeenCalled();
    expect(component.query()).toBe('example');
    expect(component.hits()[0]?.title).toBe(SITE.label);
  });

  it('does not focus the input after Escape while a focus timer is pending', async () => {
    getAll.mockReturnValue(of([]));
    await open();
    const focus = vi.spyOn(input(), 'focus');
    component.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.advanceTimersByTime(30);

    expect(component.isOpen()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it('cancels pending focus when the overlay is dismissed', async () => {
    getAll.mockReturnValue(of([]));
    await open();
    const focus = vi.spyOn(input(), 'focus');
    fixture.nativeElement.querySelector('.cp-overlay').dispatchEvent(new MouseEvent('mousedown'));
    vi.advanceTimersByTime(30);

    expect(component.isOpen()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it('closes and cancels focus when a page is chosen', async () => {
    getAll.mockReturnValue(of([]));
    await open();
    const focus = vi.spyOn(input(), 'focus');
    component.choose(component.hits()[0]);
    vi.advanceTimersByTime(30);

    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(component.isOpen()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it('replaces an earlier focus timer when reopening', async () => {
    getAll.mockReturnValue(of([]));
    await open();
    vi.advanceTimersByTime(10);
    component.close();
    await open();
    const focus = vi.spyOn(input(), 'focus');

    vi.advanceTimersByTime(20);
    expect(focus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the pending sites request and cancels focus on destruction', async () => {
    const pending = open();
    const focus = vi.spyOn(input(), 'focus');
    fixture.destroy();
    const stillObserved = response.observed;
    // Complete the baseline request too, so this regression never leaves a hanging promise.
    response.next([SITE]);
    await pending;
    vi.advanceTimersByTime(30);

    expect(stillObserved).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it('does not reopen or focus after a dismissed request finishes', async () => {
    const pending = open();
    const focus = vi.spyOn(input(), 'focus');
    component.close();
    response.next([SITE]);
    await pending;
    vi.advanceTimersByTime(30);

    expect(component.isOpen()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});
