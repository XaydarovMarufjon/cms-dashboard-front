import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { VulnerabilityImportsService } from '../../core/services/vulnerability-imports.service';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { StatisticsComponent } from '../statistics/statistics.component';
import { VulnerabilitiesComponent } from './vulnerabilities.component';

@Component({ selector: 'app-side-nav', template: '' })
class SideNavStub {}

@Component({ selector: 'app-statistics', template: '' })
class StatisticsStub {
  @Input() embedded = false;
}

const STORAGE_KEY = 'csec-vulnerabilities-sheet-v1';
const columns = ['title', 'severity', 'note'].map(id => ({ id, label: id, width: 160 }));
const rows = ['hidden before', 'match first', 'hidden middle', 'match last', 'hidden after']
  .map((title, index) => ({
    id: `row-${index}`, height: 35,
    cells: { title, severity: 'Low', note: `note-${index}` },
  }));

describe('Vulnerabilities workbook keyboard navigation', () => {
  let fixture: ComponentFixture<VulnerabilitiesComponent>;
  let component: VulnerabilitiesComponent;
  let root: HTMLElement;
  let previousStorage: string | null;
  let syncSnapshot: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    previousStorage = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sheets: [{
        id: 'sheet', name: 'Findings', workbookId: 'workbook', workbookName: 'Synthetic findings',
        columns, rows, selection: { row: 1, col: 0 },
      }],
      activeSheetId: 'sheet', activeWorkbookId: 'workbook',
    }));
    syncSnapshot = vi.fn(() => of({ workbooks: 1, sheets: 1, rows: 5 }));
    await TestBed.configureTestingModule({
      imports: [VulnerabilitiesComponent],
      providers: [{ provide: VulnerabilityImportsService, useValue: { syncSnapshot } }],
    }).overrideComponent(VulnerabilitiesComponent, {
      remove: { imports: [SideNavComponent, StatisticsComponent] },
      add: { imports: [SideNavStub, StatisticsStub] },
    }).compileComponents();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fixture = TestBed.createComponent(VulnerabilitiesComponent);
    component = fixture.componentInstance;
    root = fixture.nativeElement;
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    if (previousStorage === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, previousStorage);
  });

  function filter(query = 'match') {
    // Exercise the real search input rather than setting the computed filter directly.
    const search = root.querySelector<HTMLInputElement>('.search-box input')!;
    search.value = query;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function cell(row: number, col: number): HTMLElement {
    const element = root.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
    expect(element, `rendered cell ${row}-${col}`).not.toBeNull();
    return element!;
  }

  function flushFocus() {
    fixture.detectChanges();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
  }

  function start(row: number, col: number, edit = false) {
    cell(row, col).dispatchEvent(new MouseEvent(edit ? 'dblclick' : 'click', { bubbles: true }));
    flushFocus();
    expect(cell(row, col).tagName).toBe(edit ? 'TEXTAREA' : 'BUTTON');
    expect(document.activeElement).toBe(cell(row, col));
  }

  function key(row: number, col: number, key = 'Tab', shiftKey = false) {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    cell(row, col).dispatchEvent(event);
    flushFocus();
    expect(event.defaultPrevented).toBe(true);
  }

  function expectSelection(row: number, col: number) {
    expect(component.selected()).toEqual({ row, col });
    expect(component.editing()).toBeNull();
    expect(document.activeElement).toBe(cell(row, col));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.sheets[0].selection).toEqual({ row, col });
  }

  function expectUnchangedRows() {
    expect(component.rows()).toEqual(rows);
    expect(component.columns()).toEqual(columns);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).sheets[0].rows).toEqual(rows);
    vi.advanceTimersByTime(900);
    expect(syncSnapshot).not.toHaveBeenCalled();
  }

  it.each([false, true])('skips hidden rows when tabbing forward from edit=%s', edit => {
    filter();
    start(1, 2, edit);
    key(1, 2);
    expectSelection(3, 0);
    expectUnchangedRows();
  });

  it.each([false, true])('skips hidden rows when tabbing backward from edit=%s', edit => {
    filter();
    start(3, 0, edit);
    key(3, 0, 'Tab', true);
    expectSelection(1, 2);
    expectUnchangedRows();
  });

  it.each([false, true])('moves within the same visible row from edit=%s', edit => {
    filter();
    start(1, 0, edit);
    key(1, 0);
    expectSelection(1, 1);
    start(1, 1, edit);
    key(1, 1, 'Tab', true);
    expectSelection(1, 0);
    expectUnchangedRows();
  });

  it('clamps forward wrapping to the last visible row, not a hidden trailing row', () => {
    filter();
    start(3, 2);
    key(3, 2);
    expectSelection(3, 0);
    expectUnchangedRows();
  });

  it('clamps backward wrapping to the first visible row, not a hidden leading row', () => {
    filter();
    start(1, 0);
    key(1, 0, 'Tab', true);
    expectSelection(1, 2);
    expectUnchangedRows();
  });

  it('keeps both directions on the only matching row', () => {
    filter('match last');
    start(3, 2);
    key(3, 2);
    expectSelection(3, 0);
    key(3, 0, 'Tab', true);
    expectSelection(3, 2);
    expectUnchangedRows();
  });

  it('uses the same trimmed, case-insensitive results as the rendered filter', () => {
    filter('  MATCH  ');
    expect(component.visibleRows().map(entry => entry.index)).toEqual([1, 3]);
    start(1, 2);
    key(1, 2);
    expectSelection(3, 0);
    key(3, 0, 'Tab', true);
    expectSelection(1, 2);
    expectUnchangedRows();
  });

  it('honors matches by displayed row number as well as cell text', () => {
    filter('4');
    expect(component.visibleRows().map(entry => entry.index)).toEqual([3, 4]);
    start(3, 0);
    key(3, 0, 'Tab', true);
    expectSelection(3, 2);
    key(3, 2);
    expectSelection(4, 0);
    expectUnchangedRows();
  });

  it.each(['', '   '])('preserves unfiltered row insertion with query %j', query => {
    filter(query);
    start(1, 2);
    key(1, 2);
    expectSelection(2, 0);
    expect(component.rows()).toHaveLength(rows.length + 1);
    expect(component.rows()[2].cells).toEqual({ title: '', severity: '', note: '' });
    expect(component.rows().filter(row => row.id !== component.rows()[2].id)).toEqual(rows);
    vi.advanceTimersByTime(900);
    expect(syncSnapshot).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates changed filters and resumes ordinary traversal after clearing search', () => {
    filter();
    start(1, 2);
    key(1, 2);
    expectSelection(3, 0);
    filter('hidden');
    start(4, 0);
    key(4, 0, 'Tab', true);
    expectSelection(2, 2);
    filter('');
    key(2, 2);
    expectSelection(3, 0);
    expect(component.rows()).toHaveLength(rows.length + 1);
  });

  it.each(['Enter', 'ArrowDown'])('keeps %s navigation aligned with filtered Tab', keyName => {
    filter();
    start(1, 0);
    key(1, 0, keyName);
    expectSelection(3, 0);
    key(3, 0, 'ArrowUp');
    expectSelection(1, 0);
    expectUnchangedRows();
  });
});
