import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';
import { ThemeService } from '../../core/services/theme.service';
import { StatisticsComponent } from './statistics.component';

describe('Technical incident workbook timestamps', () => {
  let component: StatisticsComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: ThemeService, useValue: {} }] });
    component = TestBed.runInInjectionContext(() => new StatisticsComponent());
  });

  async function importRows(rows: unknown[][]) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['№', 'Наименование', 'Веб-сайт', 'Хостинг', 'Начало', 'Завершение', 'час:мин', 'Примечание'],
      ...rows,
    ]), 'Tech');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    // jsdom File has no arrayBuffer; keep real workbook bytes and parser.
    await component.parseFile({ name: 'incidents.xlsx', arrayBuffer: async () => bytes } as File);
    expect(component.uniError()).toBe('');
    expect(component.tech()?.rows).toHaveLength(rows.length);
  }

  function row(start: string, finish: string, duration = '', website = 'example.test') {
    return [1, 'Example', website, 'Host', start, finish, duration, 'Maintenance'];
  }

  it.each([
    ['19.10.2026 09:15', '19.10.2026 11:45'],
    ['19/10/2026 09:15', '19/10/2026 11:45'],
    ['19-10-26 09:15', '19-10-26 11:45'],
    ['2026-10-19 09:15', '2026-10-19 11:45'],
    ['2026-10-19T09:15:00', '2026-10-19T11:45:00'],
  ])('preserves same-day time in %s', async (start, finish) => {
    await importRows([row(start, finish)]);
    const incident = component.tech()!.rows[0];
    expect(incident.start?.getHours()).toBe(9);
    expect(incident.start?.getMinutes()).toBe(15);
    expect(incident.duration).toBe('02:30');
    expect(component.techTotalHours()).toBe(2.5);
    expect(component.techDurations()).toMatchObject({ avgHours: 2.5, maxHours: 2.5, withDuration: 1 });
    expect(component.techDurations().maxRow).toBe(incident);
  });

  it('preserves stored time in date-only Excel cells and fractional seconds', async () => {
    await importRows([row('unused', 'unused').map((value, index) =>
      index === 4 || index === 5
        ? { t: 'd', v: new Date(2026, 9, 19, index === 4 ? 9 : 10, 15), z: 'dd.mm.yyyy' }
        : value,
    )]);
    expect(component.tech()!.rows[0].duration).toBe('01:00');
    expect(component.techTotalHours()).toBe(1);
    await importRows([row('2026-10-19T09:15:30.25', '2026-10-19T09:16:30.25')]);
    expect(component.tech()!.rows[0].start?.getMilliseconds()).toBe(250);
    expect(component.tech()!.rows[0].duration).toBe('00:01');
  });

  it('calculates elapsed time across midnight instead of counting a full day', async () => {
    await importRows([row('31.03.2026 23:45', '01.04.2026 00:15')]);
    expect(component.tech()!.rows[0].duration).toBe('00:30');
    expect(component.techTotalHours()).toBe(0.5);
    component.setTechPeriod('q1');
    expect(component.techFiltered()).toHaveLength(1);
    component.setTechPeriod('q2');
    expect(component.techFiltered()).toEqual([]);
  });

  it('honors explicit ISO offsets and seconds', async () => {
    await importRows([row('2026-10-19T09:15:30.250+05:00', '2026-10-19T05:45:30.250Z')]);
    expect(component.tech()!.rows[0].start?.toISOString()).toBe('2026-10-19T04:15:30.250Z');
    expect(component.tech()!.rows[0].duration).toBe('01:30');
    expect(component.techTotalHours()).toBe(1.5);
  });

  it('keeps date-only input at local midnight and explicit duration text unchanged', async () => {
    await importRows([row('19.10.2026', '20.10.2026', 'provided duration')]);
    const incident = component.tech()!.rows[0];
    expect(incident.start?.getHours()).toBe(0);
    expect(incident.start?.getDate()).toBe(19);
    expect(incident.duration).toBe('provided duration');
    expect(component.techTotalHours()).toBe(24);
  });

  it.each(['19.10.2026 24:15', '19.10.2026 09:60', '19.10.2026 09:15:60',
    '19.10.2026 09:15garbage', '2026-10-19T09:15:00+99:00', '31.02.2026 09:15', '2026-02-31T09:15:00', 'not a date', ''])(
    'does not count an invalid start %j as elapsed time', async start => {
      await importRows([row(start, '19.10.2026 11:45')]);
      expect(component.tech()!.rows[0].start).toBeNull();
      expect(component.tech()!.rows[0].duration).toBe('');
      expect(component.techTotalHours()).toBe(0);
      expect(component.techDurations()).toMatchObject({ avgHours: 0, maxHours: 0, withDuration: 0, maxRow: null });
    },
  );

  it('does not invent a duration for a malformed finish', async () => {
    await importRows([row('19.10.2026 09:15', '19.10.2026 25:00')]);
    expect(component.tech()!.rows[0].finish).toBeNull();
    expect(component.tech()!.rows[0].duration).toBe('');
    expect(component.techTotalHours()).toBe(0);
    expect(component.techDurations().withDuration).toBe(0);
  });

  it('excludes reversed and zero intervals while recomputing filtered totals', async () => {
    await importRows([
      row('19.10.2026 09:00', '19.10.2026 10:30', '', 'first.test'),
      row('19.10.2026 11:00', '19.10.2026 14:00', '', 'second.test'),
      row('19.10.2026 15:00', '19.10.2026 14:00'),
      row('19.10.2026 15:00', '19.10.2026 15:00'),
    ]);
    expect(component.techTotalHours()).toBe(4.5);
    expect(component.techDurations()).toMatchObject({ avgHours: 2.3, maxHours: 3, withDuration: 2 });
    component.setTechFilter('website', 'first.test');
    expect(component.techTotalHours()).toBe(1.5);
    expect(component.techDurations()).toMatchObject({ avgHours: 1.5, maxHours: 1.5, withDuration: 1 });
    component.resetAll();
    expect(component.techTotalHours()).toBe(0);
    expect(component.techDurations().withDuration).toBe(0);
  });
});
