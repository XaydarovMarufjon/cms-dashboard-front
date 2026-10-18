import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocsComponent } from './docs.component';

describe('Docs salary calculator', () => {
  let component: DocsComponent;

  beforeEach(() => { component = new DocsComponent(); });

  it('starts empty without recommending a payment or a below-minimum warning', () => {
    expect(component.salaryResult()).toMatchObject({
      totalVulnerabilities: 0, totalScore: 0, stageOne: false, stageOneReasons: [],
      rawPercent: 0, cappedBasePercent: 0, belowMinimum: false, eligible: false,
      bonusPercent: 0, finalPercent: 0, salary: 0,
    });
  });

  it.each([
    ['tier1', 'low', 1, 'I-toifa:'],
    ['tier2', 'high', 3, 'yuqori yoki kritik'],
    ['tier2', 'medium', 4, 'o‘rta yoki undan yuqori'],
    ['tier2', 'low', 5, 'past yoki undan yuqori'],
    ['tier3', 'low', 10, 'III-toifa:'],
  ] as const)('activates the %s/%s first-stage rule at %i findings', (category, severity, threshold, reason) => {
    component.setFinding(category, severity, threshold - 1);
    expect(component.salaryResult().stageOne).toBe(false);
    expect(component.salaryResult().stageOneReasons).toEqual([]);
    component.setFinding(category, severity, threshold);
    expect(component.salaryResult()).toMatchObject({
      stageOne: true, rawPercent: 100, cappedBasePercent: 100, eligible: true, belowMinimum: false,
    });
    expect(component.salaryResult().stageOneReasons).toHaveLength(1);
    expect(component.salaryResult().stageOneReasons[0]).toContain(reason);
    component.setFinding(category, severity, threshold - 1);
    expect(component.salaryResult().stageOne).toBe(false);
  });

  it('combines critical and high findings for the tier-two high threshold', () => {
    component.setFinding('tier2', 'critical', 1);
    component.setFinding('tier2', 'high', 1);
    component.setFinding('tier2', 'low', 1);
    expect(component.salaryResult().stageOne).toBe(false);
    component.setFinding('tier2', 'high', 2);
    expect(component.salaryResult().stageOneReasons).toEqual([
      'II-toifa: yuqori yoki kritik darajadagi kamida 3 ta zaiflik',
    ]);
  });

  it('combines critical, high and medium findings but excludes low from the medium threshold', () => {
    component.setFinding('tier2', 'critical', 1);
    component.setFinding('tier2', 'high', 1);
    component.setFinding('tier2', 'medium', 1);
    component.setFinding('tier2', 'low', 1);
    expect(component.salaryResult().stageOne).toBe(false);
    component.setFinding('tier2', 'low', 0);
    component.setFinding('tier2', 'medium', 2);
    expect(component.salaryResult().stageOneReasons).toEqual([
      'II-toifa: o‘rta yoki undan yuqori darajadagi kamida 4 ta zaiflik',
    ]);
  });

  it.each([
    ['critical', 40, 20], ['high', 24, 12], ['medium', 12, 6], ['low', 4, 2],
  ] as const)('weights %s by its severity and category without awarding tier-one points', (severity, tier2, tier3) => {
    component.setFinding('tier1', severity, 1);
    component.setFinding('tier2', severity, 1);
    component.setFinding('tier3', severity, 1);
    expect(component.categoryScore('tier1')).toBe(0);
    expect(component.categoryScore('tier2')).toBe(tier2);
    expect(component.categoryScore('tier3')).toBe(tier3);
    expect(component.salaryResult().totalScore).toBe(tier2 + tier3);
    expect(component.salaryResult().totalVulnerabilities).toBe(3);
  });

  it('keeps 56% unpaid and recomputes eligibility at the next attainable 60%', () => {
    // Integer findings and even category weights cannot produce exactly 56.6%.
    component.setFinding('tier2', 'high', 1);
    component.setFinding('tier2', 'low', 1);
    expect(component.salaryResult()).toMatchObject({
      totalScore: 28, rawPercent: expect.closeTo(56), cappedBasePercent: expect.closeTo(56),
      stageOne: false, belowMinimum: true, eligible: false, finalPercent: 0, salary: 0,
    });
    component.setFinding('tier3', 'low', 1);
    expect(component.salaryResult()).toMatchObject({
      totalScore: 30, rawPercent: 60, stageOne: false,
      belowMinimum: false, eligible: true, finalPercent: 60, salary: 1_200_000,
    });
  });

  it('caps the scored base at 100% without treating it as a first-stage award', () => {
    component.setFinding('tier3', 'high', 5);
    expect(component.salaryResult()).toMatchObject({
      totalScore: 60, rawPercent: 120, cappedBasePercent: 100, stageOne: false,
      stageOneReasons: [], bonusPercent: 0, finalPercent: 100, salary: 2_000_000,
    });
  });

  it.each([[9, 0, 100, 2_000_000], [10, 20, 120, 2_400_000],
    [19, 20, 120, 2_400_000], [20, 30, 130, 2_600_000], [21, 30, 130, 2_600_000]])(
    'awards the correct bonus at %i total findings', (total, bonus, percent, salary) => {
      component.setFinding('tier1', 'low', 1);
      component.setFinding('tier3', 'low', total - 1);
      expect(component.salaryResult()).toMatchObject({
        totalVulnerabilities: total, eligible: true, cappedBasePercent: 100,
        bonusPercent: bonus, finalPercent: percent, salary,
      });
    },
  );

  it('does not let ten findings bypass minimum payment eligibility', () => {
    component.setFinding('tier2', 'low', 4);
    component.setFinding('tier3', 'low', 6);
    expect(component.salaryResult()).toMatchObject({
      totalVulnerabilities: 10, totalScore: 28, stageOne: false, rawPercent: expect.closeTo(56),
      eligible: false, belowMinimum: true, bonusPercent: 0, finalPercent: 0, salary: 0,
    });
    component.setFinding('tier3', 'low', 5);
    component.setFinding('tier3', 'medium', 1);
    expect(component.salaryResult()).toMatchObject({
      totalVulnerabilities: 10, stageOne: false, rawPercent: 64,
      eligible: true, bonusPercent: 20, finalPercent: 84, salary: 1_680_000,
    });
  });

  it('lists every satisfied first-stage reason without stacking base awards', () => {
    component.setFinding('tier1', 'medium', 1);
    component.setFinding('tier2', 'critical', 5);
    component.setFinding('tier3', 'high', 10);
    expect(component.salaryResult().stageOneReasons).toHaveLength(5);
    expect(component.salaryResult()).toMatchObject({
      totalVulnerabilities: 16, cappedBasePercent: 100, bonusPercent: 20,
      finalPercent: 120, salary: 2_400_000,
    });
  });

  it.each([['3.9', 3], [-2, 0], ['', 0], ['not a number', 0], [' 4 ', 4]] as const)(
    'normalizes %j to %i without changing other inputs', (input, expected) => {
      component.setFinding('tier2', 'high', 2);
      component.setFinding('tier3', 'medium', 1);
      const previous = component.findingCounts();
      component.setFinding('tier3', 'low', input);
      expect(component.getFinding('tier3', 'low')).toBe(expected);
      expect(component.getFinding('tier2', 'high')).toBe(2);
      expect(component.getFinding('tier3', 'medium')).toBe(1);
      expect(component.categoryTotal('tier3')).toBe(expected + 1);
      expect(previous.tier3.low).toBe(0);
    },
  );

  it('resets all twelve inputs, cached totals, payment and reasons, then permits a fresh calculation', () => {
    for (const category of component.categoryRows) {
      for (const severity of component.severityRows) component.setFinding(category.key, severity.key, 2);
    }
    expect(component.salaryResult().salary).toBe(2_600_000);
    component.resetSalaryCalculator();
    for (const category of component.categoryRows) {
      for (const severity of component.severityRows) expect(component.getFinding(category.key, severity.key)).toBe(0);
      expect(component.categoryTotal(category.key)).toBe(0);
      expect(component.categoryScore(category.key)).toBe(0);
    }
    expect(component.salaryResult()).toMatchObject({
      totalVulnerabilities: 0, totalScore: 0, stageOneReasons: [], eligible: false,
      belowMinimum: false, bonusPercent: 0, finalPercent: 0, salary: 0,
    });
    component.setFinding('tier2', 'critical', 1);
    expect(component.salaryResult().salary).toBe(1_600_000);
  });
});

describe('Docs salary calculator template', () => {
  let fixture: ComponentFixture<DocsComponent>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DocsComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(DocsComponent);
    root = fixture.nativeElement;
    fixture.detectChanges();
  });

  function enter(label: string, value: string) {
    const input = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(input).not.toBeNull();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('renders below-minimum, eligible and first-stage states from real input events', () => {
    expect(root.querySelectorAll('.salary-input-table input')).toHaveLength(12);
    enter('II-toifa Yuqori', '1');
    expect(root.querySelector('.salary-result-panel')?.classList.contains('is-low')).toBe(true);
    expect(root.querySelector('.result-main strong')?.textContent).toBe('0 so‘m');
    enter('III-toifa O‘rta', '1');
    expect(root.querySelector('.salary-result-panel')?.classList.contains('is-low')).toBe(false);
    expect(root.querySelector('.result-main strong')?.textContent).toBe(`${(1_200_000).toLocaleString('uz-UZ')} so‘m`);
    enter('I-toifa Past', '1');
    expect(root.querySelector('.salary-result-panel')?.classList.contains('is-stage-one')).toBe(true);
    expect(root.querySelector('.stage-reasons')?.textContent).toContain('I-toifa:');
    expect(root.querySelector('.result-main strong')?.textContent).toBe(`${(2_000_000).toLocaleString('uz-UZ')} so‘m`);
  });

  it('clears rendered inputs and payment through the reset button and allows reuse', () => {
    enter('III-toifa Past', '20');
    expect(root.querySelector('.result-main strong')?.textContent).toBe(`${(2_600_000).toLocaleString('uz-UZ')} so‘m`);
    (root.querySelector('.salary-panel-head button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect([...root.querySelectorAll<HTMLInputElement>('.salary-input-table input')].map(input => input.value)).toEqual(Array(12).fill('0'));
    expect(root.querySelector('.result-main strong')?.textContent).toBe('0 so‘m');
    expect(root.querySelector('.salary-result-panel')?.classList.contains('is-stage-one')).toBe(false);
    expect(root.querySelector('.stage-reasons.neutral')).not.toBeNull();
    enter('II-toifa Kritik', '1');
    expect(root.querySelector('.result-main strong')?.textContent).toBe(`${(1_600_000).toLocaleString('uz-UZ')} so‘m`);
  });
});
