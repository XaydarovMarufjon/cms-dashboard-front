import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type SalaryCategory = 'tier1' | 'tier2' | 'tier3';
type SalarySeverity = 'critical' | 'high' | 'medium' | 'low';
type SalaryCounts = Record<SalaryCategory, Record<SalarySeverity, number>>;

interface DocStep {
  number: string;
  title: string;
  body: string;
}

interface DocModule {
  name: string;
  tag: string;
  body: string;
}

interface DocRole {
  name: string;
  access: string;
  note: string;
}

interface DocCommand {
  label: string;
  command: string;
  hint: string;
}

interface SalarySeverityRow {
  key: SalarySeverity;
  label: string;
  score: number;
}

interface SalaryCategoryRow {
  key: SalaryCategory;
  label: string;
  coefficient: number | null;
  hint: string;
}

interface SalaryRuleRow {
  category: string;
  severity: string;
  condition: string;
}

@Component({
  selector: 'app-docs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss'],
})
export class DocsComponent {
  readonly baseSalary = 2_000_000;
  readonly basePointTarget = 50;
  readonly minPercent = 56.6;

  readonly severityRows: SalarySeverityRow[] = [
    { key: 'critical', label: 'Kritik', score: 10 },
    { key: 'high',     label: 'Yuqori', score: 6 },
    { key: 'medium',   label: 'O‘rta',  score: 3 },
    { key: 'low',      label: 'Past',   score: 1 },
  ];

  readonly categoryRows: SalaryCategoryRow[] = [
    { key: 'tier1', label: 'I-toifa',   coefficient: null, hint: '1-bosqichda kamida 1 ta topilma 100% beradi' },
    { key: 'tier2', label: 'II-toifa',  coefficient: 4,    hint: 'Davlat organlari va muhim veb-resurslar' },
    { key: 'tier3', label: 'III-toifa', coefficient: 2,    hint: 'Oddiy .uz domen saytlar' },
  ];

  readonly firstStageRules: SalaryRuleRow[] = [
    { category: 'I-toifa',   severity: 'Istalgan daraja',       condition: '1 ta' },
    { category: 'II-toifa',  severity: 'Yuqori yoki kritik',    condition: '3 ta' },
    { category: 'II-toifa',  severity: 'O‘rta yoki undan yuqori', condition: '4 ta' },
    { category: 'II-toifa',  severity: 'Past yoki undan yuqori', condition: '5 ta' },
    { category: 'III-toifa', severity: 'Istalgan daraja',       condition: '10 ta' },
  ];

  readonly findingCounts = signal<SalaryCounts>(this.emptyCounts());

  readonly salaryResult = computed(() => {
    const counts = this.findingCounts();
    const totalVulnerabilities = this.totalVulnerabilities(counts);
    const totalScore = this.scoreFor(counts, 'tier2') + this.scoreFor(counts, 'tier3');
    const stageOneReasons = this.stageOneReasons(counts);
    const stageOne = stageOneReasons.length > 0;
    const rawPercent = stageOne ? 100 : (totalScore / this.basePointTarget) * 100;
    const cappedBasePercent = stageOne ? 100 : Math.min(100, rawPercent);
    const belowMinimum = !stageOne && rawPercent > 0 && rawPercent < this.minPercent;
    const eligible = stageOne || rawPercent >= this.minPercent;
    const bonusPercent = eligible ? this.bonusFor(totalVulnerabilities) : 0;
    const payableBasePercent = eligible ? cappedBasePercent : 0;
    const finalPercent = payableBasePercent + bonusPercent;

    return {
      totalVulnerabilities,
      totalScore,
      stageOne,
      stageOneReasons,
      rawPercent,
      cappedBasePercent,
      belowMinimum,
      eligible,
      bonusPercent,
      finalPercent,
      salary: (finalPercent * this.baseSalary) / 100,
      mode: stageOne ? '1-bosqich: to‘g‘ridan-to‘g‘ri 100%' : '2-bosqich: ball asosida',
    };
  });

  readonly flow: DocStep[] = [
    {
      number: '01',
      title: '1-bosqich tekshiruvi',
      body: 'Avval yuqori ahamiyatli shartlar tekshiriladi. I-toifada 1 ta, II-toifada belgilangan limitlar yoki III-toifada 10 ta zaiflik bo‘lsa, baza oylik 100% bo‘ladi.',
    },
    {
      number: '02',
      title: '2-bosqich ball',
      body: '1-bosqich bajarilmasa, har bir topilma daraja balli va veb-resurs toifasi koeffitsienti bo‘yicha hisoblanadi.',
    },
    {
      number: '03',
      title: 'Foiz va minimum',
      body: 'Foiz = (umumiy ball / 50) × 100. 56.6% dan past natija to‘lovga tavsiya qilinmaydi, 100% dan yuqori baza foiz MAX sifatida 100% ga yopiladi.',
    },
    {
      number: '04',
      title: 'Bonus',
      body: '10+ zaiflik uchun +20%, 20+ zaiflik uchun +30% bonus qo‘shiladi. Yakuniy oylik = final foiz × 2 000 000 / 100.',
    },
  ];

  readonly modules: DocModule[] = [
    {
      name: 'Dashboard',
      tag: 'Umumiy holat',
      body: 'Saytlar soni, alertlar, vazifalar, CVE topilmalari, server resurslari va oxirgi scan faolligini jamlaydi.',
    },
    {
      name: 'Saytlar',
      tag: 'Reyestr',
      body: 'Monitoring qilinadigan domenlarni qo‘shish, tahrirlash, o‘chirish va alohida sahifa orqali batafsil ko‘rish uchun ishlatiladi.',
    },
    {
      name: 'CMS Scanner',
      tag: 'Fingerprint',
      body: 'HTML, header, generator meta, ma’lum pathlar va CMS belgilarini solishtirib WordPress, Joomla, Drupal va boshqa texnologiyalarni aniqlaydi.',
    },
    {
      name: 'CVE Scanner',
      tag: 'Nuclei',
      body: 'Nuclei natijalarini yig‘adi, monitoring ro‘yxatini ko‘rsatadi va topilmalarni PENDING, CONFIRMED yoki FALSE_POSITIVE statuslariga ajratadi.',
    },
    {
      name: 'Port Scanner',
      tag: 'Tarmoq',
      body: 'Sayt hosti bo‘yicha tanlangan portlarni tekshiradi. Natijada OPEN, CLOSED yoki FILTERED statuslari saqlanadi.',
    },
    {
      name: 'URL Checker',
      tag: 'Havola nazorati',
      body: 'Alohida URL ro‘yxatini yuritadi va ularning javob berishini, status kodini va mavjudligini nazorat qiladi.',
    },
    {
      name: 'Rasm moderatsiyasi',
      tag: 'Kontent',
      body: 'Saytdagi rasmlarni yig‘adi va moderatsiya servisiga yuborib, xavfli yoki nomaqbul kontent bo‘yicha belgilaydi.',
    },
    {
      name: 'Proxy',
      tag: 'Rotation',
      body: 'Proxy pool holatini, alive/dead sonini, refresh jarayonini va test so‘rovini ko‘rsatadi. Ishlamaydigan proxylar vaqtincha chetga chiqariladi.',
    },
    {
      name: 'Vazifalar',
      tag: 'Ish jarayoni',
      body: 'Topilmalar yoki qo‘lda kiritilgan ishlarni prioritet, javobgar, muddat va status bilan yuritish uchun ishlatiladi.',
    },
    {
      name: 'Alertlar va loglar',
      tag: 'Audit',
      body: 'SSL, muddat, xavf va tizim voqealari bo‘yicha ogohlantirishlar hamda foydalanuvchi/API harakatlari tarixini ko‘rsatadi.',
    },
  ];

  readonly roles: DocRole[] = [
    {
      name: 'ADMIN',
      access: 'To‘liq boshqaruv',
      note: 'Foydalanuvchilar, interval sozlamalari, scan, delete, loglar va barcha admin amallarini bajaradi.',
    },
    {
      name: 'WORKER',
      access: 'Operatsion ishlar',
      note: 'Sayt qo‘shish, scan ishga tushirish, status yangilash va kundalik monitoring amallarini bajaradi.',
    },
    {
      name: 'USER',
      access: 'Ko‘rish',
      note: 'Natijalar, dashboard va asosiy monitoring ma’lumotlarini ko‘radi. Xavfli o‘zgartirishlar cheklangan.',
    },
  ];

  readonly commands: DocCommand[] = [
    {
      label: 'Frontend',
      command: 'cd cms-dashboard && npm start',
      hint: 'Angular dashboardni local dev serverda ishga tushiradi.',
    },
    {
      label: 'Backend',
      command: 'cd cms-detector && npm run start:dev',
      hint: 'NestJS API serverini watch mode bilan ishga tushiradi.',
    },
    {
      label: 'Database',
      command: 'cd cms-detector && npx prisma migrate deploy',
      hint: 'Prisma migratsiyalarini databasega qo‘llaydi.',
    },
    {
      label: 'Build',
      command: 'cd cms-dashboard && npm run build',
      hint: 'Frontend production build tekshiruvini bajaradi.',
    },
  ];

  getFinding(category: SalaryCategory, severity: SalarySeverity): number {
    return this.findingCounts()[category][severity];
  }

  setFinding(category: SalaryCategory, severity: SalarySeverity, value: string | number) {
    const parsed = Math.max(0, Math.floor(Number(value) || 0));
    this.findingCounts.update(current => ({
      ...current,
      [category]: {
        ...current[category],
        [severity]: parsed,
      },
    }));
  }

  resetSalaryCalculator() {
    this.findingCounts.set(this.emptyCounts());
  }

  categoryTotal(category: SalaryCategory): number {
    return this.totalFor(this.findingCounts(), category);
  }

  categoryScore(category: SalaryCategory): number {
    return this.scoreFor(this.findingCounts(), category);
  }

  formatPercent(value: number): string {
    if (!Number.isFinite(value)) return '0%';
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  }

  formatMoney(value: number): string {
    return `${Math.round(value).toLocaleString('uz-UZ')} so‘m`;
  }

  private emptyCounts(): SalaryCounts {
    return {
      tier1: { critical: 0, high: 0, medium: 0, low: 0 },
      tier2: { critical: 0, high: 0, medium: 0, low: 0 },
      tier3: { critical: 0, high: 0, medium: 0, low: 0 },
    };
  }

  private totalVulnerabilities(counts: SalaryCounts): number {
    return this.totalFor(counts, 'tier1') + this.totalFor(counts, 'tier2') + this.totalFor(counts, 'tier3');
  }

  private totalFor(counts: SalaryCounts, category: SalaryCategory): number {
    return this.severityRows.reduce((sum, row) => sum + counts[category][row.key], 0);
  }

  private scoreFor(counts: SalaryCounts, category: SalaryCategory): number {
    const coefficient = this.categoryRows.find(row => row.key === category)?.coefficient ?? 0;
    return this.severityRows.reduce((sum, row) => sum + counts[category][row.key] * row.score * coefficient, 0);
  }

  private stageOneReasons(counts: SalaryCounts): string[] {
    const reasons: string[] = [];
    const tier1Total = this.totalFor(counts, 'tier1');
    const tier2HighOrAbove = counts.tier2.critical + counts.tier2.high;
    const tier2MediumOrAbove = tier2HighOrAbove + counts.tier2.medium;
    const tier2Total = this.totalFor(counts, 'tier2');
    const tier3Total = this.totalFor(counts, 'tier3');

    if (tier1Total >= 1) reasons.push('I-toifa: istalgan darajadagi kamida 1 ta zaiflik');
    if (tier2HighOrAbove >= 3) reasons.push('II-toifa: yuqori yoki kritik darajadagi kamida 3 ta zaiflik');
    if (tier2MediumOrAbove >= 4) reasons.push('II-toifa: o‘rta yoki undan yuqori darajadagi kamida 4 ta zaiflik');
    if (tier2Total >= 5) reasons.push('II-toifa: past yoki undan yuqori darajadagi kamida 5 ta zaiflik');
    if (tier3Total >= 10) reasons.push('III-toifa: istalgan darajadagi kamida 10 ta zaiflik');

    return reasons;
  }

  private bonusFor(totalVulnerabilities: number): number {
    if (totalVulnerabilities >= 20) return 30;
    if (totalVulnerabilities >= 10) return 20;
    return 0;
  }
}
