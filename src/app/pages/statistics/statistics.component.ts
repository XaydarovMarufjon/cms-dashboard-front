import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { ThemeService } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';

// ─── OWASP families ─────────────────────────────────────────────
export const OWASP_FAMILIES = [
  'Broken Access Control',
  'Cryptographic Failures',
  'Injection',
  'Insecure Design',
  'Security Misconfiguration',
  'Vulnerable and Outdated Components',
  'Identification and Authentication Failures',
  'Software and Data Integrity Failures',
  'Security Logging and Monitoring Failures',
  'Server-Side Request Forgery (SSRF)',
  'Boshqa / Aniqlanmagan',
] as const;
export type OwaspFamily = typeof OWASP_FAMILIES[number];

const OWASP_RULES: { family: OwaspFamily; patterns: RegExp[] }[] = [
  // ── Most specific first to avoid Injection catching everything ──
  {
    family: 'Server-Side Request Forgery (SSRF)',
    patterns: [
      /\bssrf\b/,
      /server[\s-]*side\s*request\s*forgery/,
    ],
  },
  {
    family: 'Software and Data Integrity Failures',
    patterns: [
      /integrity\s*check/, /without\s*integrity/,
      /download\s*of\s*code/, /untrusted\s*source/,
      /insecure\s*deserial/, /deserialization/,
      /code\s*signing/,
    ],
  },
  {
    family: 'Security Logging and Monitoring Failures',
    patterns: [
      /logging\s*(and\s*monitoring\s*)?failure/,
      /monitoring\s*failure/,
      /insufficient\s*logging/, /insufficient\s*monitoring/,
      /audit\s*log/,
    ],
  },
  {
    family: 'Identification and Authentication Failures',
    patterns: [
      /default\s*credential/,
      /login[\/\s]*password\s*autofill/, /password\s*autofill/, /autofill/,
      /weak\s*password/, /zaif\s*parol/,
      /insufficient\s*mfa/, /no\s*mfa/,
      /no\s*authentic/,
      /brute\s*force/,
      /login\s*va\s*parol/, /login.*parol/, /авторизац/, /authent/,
    ],
  },
  {
    family: 'Vulnerable and Outdated Components',
    patterns: [
      /unpatched/,
      /outdated\s*(software|component|version|library)/,
      /vulnerable\s*(and\s*outdated\s*)?component/,
      /\bcve\b/,
      /eski\s*versiya/,
      /compatibility\s*iss/, /compatibility\s*issues\s*with\s*updates/,
    ],
  },
  {
    family: 'Security Misconfiguration',
    patterns: [
      /error\s*message\s*contains\s*sensitive/, /error\s*message/, /xato\s*xabar/,
      /стектрейс/, /stack\s*trace/,
      /open\/?\s*enabled\s*unnecessary/, /unnecessary\s*(port|service|page|account)/,
      /open\s*port/, /open\s*service/, /open\s*page/, /open\s*account/,
      /debug\s*mode/,
      /directory\s*listing/, /direktory\s*listing/,
      /ochiq\s*qolib\s*ketgan\s*direktor/, /ochiq\s*direktor/,
      /security\s*misconfig/,
    ],
  },
  {
    family: 'Insecure Design',
    patterns: [
      /no\s*limit\s*rate.*sms/, /sms.*no\s*limit/, /sms\s*flood/,
      /rate\s*limit/,
      /price\s*manipulat/, /discount\s*manipulat/, /logical\s*manipulat/, /logical\s*flaw/,
      /file\s*upload\s*vulnerab/, /file\s*upload/,
      /insecure\s*design/,
    ],
  },
  {
    family: 'Cryptographic Failures',
    patterns: [
      /version\s*downgrade/,
      /sensitive\s*data\s*exposure/,
      /cleartext\s*transmission/, /cleartext/, /clear\s*text/,
      /weak\s*(or\s*outdated\s*)?crypto/, /outdated\s*crypto/, /weak\s*encryption/,
      /improper\s*certificate\s*validation/, /improper\s*certificate/, /certificate\s*validation/,
      /information\s*disclosure/,
      /personal\s*ma'?lumot/, /persona[ll]\s*ma/, /maxfiy\s*ma'?lumot/,
      /\bssl\b/, /\btls\b/,
    ],
  },
  {
    family: 'Injection',
    patterns: [
      /sql\s*in[yj]ek[csz]/, /sql\s*injection/,
      /nosql\s*injection/, /no\s*sql\s*injection/, /\bnosql\b/,
      /os\s*command\s*injection/, /command\s*injection/,
      /ldap\s*injection/, /\bldap\b/,
      /\bxss\b/, /cross[\s-]*site\s*script/,
      /xxe\s*injection/, /\bxxe\b/,
      /\bssti\b/, /server[\s-]*side\s*template/,
      /html\s*in[yj]ek/, /html\s*injection/,
      /content\s*spoof/,
      /\brce\b/, /remote\s*code\s*execution/,
    ],
  },
  {
    family: 'Broken Access Control',
    patterns: [
      /\bidor\b/,
      /\bcors\b/, /cross[\s-]*origin\s*resource\s*sharing/,
      /privil[ae]ge\s*escalation/,
      /request[\/\s,]+response\s*manipulation/, /response\s*manipulation/,
      /missing\s*authoriz/,
      /path\s*traversal/, /directory\s*traversal/,
      /open\s*redirect/,
      /\.git\b/, /git\s*expos/, /\.git\s*folder/,
      /broken\s*access/,
      /ruxsatsiz\s*kirish/, /нсд/, /\bunauth\b/,
    ],
  },
];

export function mapToOwasp(rawType: string): OwaspFamily {
  const t = (rawType || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return 'Boshqa / Aniqlanmagan';
  // Split by comma — if any token matches, take the first matching family
  const tokens = t.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  for (const tok of tokens.length ? tokens : [t]) {
    for (const r of OWASP_RULES) {
      if (r.patterns.some(p => p.test(tok))) return r.family;
    }
  }
  return 'Boshqa / Aniqlanmagan';
}

// ─── Helpers ───
function cleanCell(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const dd = String(v.getDate()).padStart(2, '0');
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${v.getFullYear()}`;
  }
  return String(v).replace(/_x000D_|_x000A_/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 1000 && v < 100000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO format
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = +iso[1], mo = +iso[2], dd = +iso[3];
    if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(y, mo - 1, dd);
      if (!isNaN(d.getTime()) && d.getMonth() === mo - 1) return d;
    }
  }
  // Find ALL dd[./-]mm[./-]yy(yy) candidates, pick latest valid one
  // (letter refs like "12-15-23/12" have mm=15 → invalid; real date "15.06.2024" wins)
  const re = /(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/g;
  let m: RegExpExecArray | null;
  let best: Date | null = null;
  while ((m = re.exec(s)) !== null) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += 2000;
    if (dd < 1 || dd > 31) continue;
    if (mm < 1 || mm > 12) continue;
    if (yy < 1990 || yy > 2100) continue;
    const d = new Date(yy, mm - 1, dd);
    if (isNaN(d.getTime())) continue;
    if (d.getMonth() !== mm - 1 || d.getDate() !== dd) continue;
    if (!best || d > best) best = d;
  }
  if (best) return best;
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function quarterOf(d: Date): 1 | 2 | 3 | 4 { return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4; }
function halfOf(d: Date): 1 | 2 { return d.getMonth() < 6 ? 1 : 2; }

export interface Insight {
  level: 'info' | 'warn' | 'alert';
  label: string;
  value: string;
  hint?: string;
}
function formatDate(d: Date | null): string {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function findHeaderRow(rows: any[][], required: string[]): number {
  const want = required.map(s => s.toLowerCase());
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = (rows[i] || []).map(c => cleanCell(c).toLowerCase());
    const matched = want.filter(w => row.some(c => c.includes(w))).length;
    if (matched >= Math.max(2, Math.floor(want.length / 2))) return i;
  }
  return 0;
}

function findCol(headers: string[], ...needles: string[]): number {
  const hs = headers.map(h => h.toLowerCase());
  for (const n of needles) {
    const ln = n.toLowerCase();
    const i = hs.findIndex(h => h.includes(ln));
    if (i >= 0) return i;
  }
  return -1;
}

export interface CountEntry { key: string; count: number; }

function splitSites(s: string): string[] {
  if (!s) return [];
  return s.split(/[,;\n]+/)
    .map(t => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''))
    .filter(Boolean);
}

function splitTypes(s: string): string[] {
  if (!s) return [];
  return s.split(/\s+va\s+|\s+и\s+|\s+and\s+|[,;\n]+/i)
    .map(t => t.trim())
    .filter(Boolean);
}

function isYes(v: string): boolean {
  const x = v.toLowerCase().trim();
  return x === 'да' || x === 'ha' || x === 'yes' || x === 'true';
}
function isNo(v: string): boolean {
  const x = v.toLowerCase().trim();
  return x === 'нет' || x === 'yo\'q' || x === 'yoq' || x === 'yoʻq' || x === 'no' || x === 'false';
}

// ─── Section row types ───
export interface VulnRow {
  num: string; gov: string; organization: string; website: string;
  rawType: string; owasp: OwaspFamily; outLetter: string; inLetter: string;
  date: Date | null; sheetYear: string;
  rawRow: any[];
}
export interface CyberRow {
  num: string; gov: string; organization: string; website: string;
  source: string; detectedDate: Date | null; outLetter: string; inLetter: string;
  hoster: string; cms: string; incidentType: string; status: string;
  rawRow: any[];
}
export interface TechRow {
  num: string; organization: string; website: string; hosting: string;
  start: Date | null; finish: Date | null; duration: string; note: string;
  rawRow: any[];
}

type Period = 'all' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2';

// Each section keeps its own raw rows (for the deep column analyzer)
interface SectionData<T> {
  fileName: string;
  rows: T[];
  headers: string[];
  rawRows: any[][];   // dataRows (excluding header)
}

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss'],
})
export class StatisticsComponent {
  themeService = inject(ThemeService);
  auth = inject(AuthService);

  readonly OWASP_FAMILIES = OWASP_FAMILIES;
  activeSection = signal<'vuln' | 'cyber' | 'tech'>('vuln');

  // ── Upload state ──
  uniDrag = signal(false);
  uniLoading = signal(false);
  uniError = signal('');
  uniFiles = signal<{ name: string; sections: string[] }[]>([]);

  // ── Section data ──
  vuln = signal<SectionData<VulnRow> | null>(null);
  cyber = signal<SectionData<CyberRow> | null>(null);
  tech = signal<SectionData<TechRow> | null>(null);

  // ── Vuln filters ──
  vulnPeriod = signal<Period>('all');
  vulnYear = signal<string>('all');
  vulnFamily = signal<OwaspFamily | 'all'>('all');
  vulnSearch = signal('');

  // ── Cyber filters ──
  cyberPeriod = signal<Period>('all');
  cyberFilters = signal<Record<string, string>>({
    website: 'all', source: 'all', hoster: 'all', cms: 'all',
    incidentType: 'all', gov: 'all', organization: 'all', inLetter: 'all',
  });
  cyberSearch = signal('');

  // ── Tech filters ──
  techPeriod = signal<Period>('all');
  techFilters = signal<Record<string, string>>({
    website: 'all', organization: 'all', hosting: 'all', note: 'all',
  });
  techSearch = signal('');

  hasAnyData = computed(() => !!(this.vuln() || this.cyber() || this.tech()));

  // ═══════════ FILE HANDLING ═══════════
  async onFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    for (const f of files) await this.parseFile(f);
    input.value = '';
  }
  onDragOver(e: DragEvent) { e.preventDefault(); this.uniDrag.set(true); }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.uniDrag.set(false); }
  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.uniDrag.set(false);
    const files = Array.from(e.dataTransfer?.files || []);
    for (const f of files) await this.parseFile(f);
  }

  async parseFile(file: File) {
    this.uniError.set('');
    this.uniLoading.set(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sections: string[] = [];

      // Try Cyber
      const cyberData = this.extractCyber(wb, file.name);
      if (cyberData) { this.cyber.set(cyberData); this.resetCyberFilters(); sections.push('Kiberxavfsizlik'); }

      // Try Tech
      const techData = this.extractTech(wb, file.name);
      if (techData) { this.tech.set(techData); this.resetTechFilters(); sections.push('Texnik'); }

      // Try Vuln (yearly sheets)
      const vulnData = this.extractVuln(wb, file.name);
      if (vulnData) { this.vuln.set(vulnData); this.resetVulnFilters(); sections.push('Zaifliklar'); }

      if (!sections.length) {
        this.uniError.set(`"${file.name}" da tanish ma'lumot topilmadi`);
        return;
      }
      this.uniFiles.update(list => [...list, { name: file.name, sections }]);
      // Auto-switch tab to first newly-loaded section if current is empty
      if (sections.includes('Zaifliklar') && !this.cyber() && !this.tech()) this.activeSection.set('vuln');
      else if (sections.includes('Kiberxavfsizlik')) this.activeSection.set('cyber');
      else if (sections.includes('Zaifliklar')) this.activeSection.set('vuln');
      else if (sections.includes('Texnik')) this.activeSection.set('tech');
    } catch (e: any) {
      this.uniError.set('Faylni o\'qib bo\'lmadi: ' + (e?.message || 'xato'));
    } finally {
      this.uniLoading.set(false);
    }
  }

  // ═══════════ EXTRACTORS ═══════════
  private extractVuln(wb: XLSX.WorkBook, fileName: string): SectionData<VulnRow> | null {
    const rows: VulnRow[] = [];
    const rawRows: any[][] = [];
    let headers: string[] = [];
    for (const sn of wb.SheetNames) {
      const ym = sn.match(/(20\d{2})/);
      if (!ym) continue;
      const year = ym[1];
      const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
      if (!raw.length) continue;
      // Skip Cyber/Tech sheets
      const firstRows = raw.slice(0, 5).flat().map(c => cleanCell(c).toLowerCase()).join(' ');
      if (firstRows.includes('тип инцидент')) continue;
      if (firstRows.includes('хостинг') && firstRows.includes('завершен')) continue;

      const hRow = findHeaderRow(raw, ['veb-sayt', 'zaiflik turi', 'tashkilot']);
      const sheetHeaders = raw[hRow].map(h => cleanCell(h));
      const iNum = findCol(sheetHeaders, '№', 'п/п', 'zaiflik');
      const iGov = findCol(sheetHeaders, 'гос', 'gov');
      const iOrg = findCol(sheetHeaders, 'tashkilot', 'organizatsi');
      const iWeb = findCol(sheetHeaders, 'veb-sayt', 'веб-сайт', 'website', 'sayt');
      const iType = findCol(sheetHeaders, 'zaiflik turi', 'тип', 'vulnerab');
      const iOut = findCol(sheetHeaders, 'chiquvchi', 'исх');
      const iIn = findCol(sheetHeaders, 'kiruvchi', 'вх');
      const iDate = findCol(sheetHeaders, 'sana', 'дата', 'date');
      if (iType < 0 || iWeb < 0) continue;
      if (!headers.length) headers = sheetHeaders;

      for (let i = hRow + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r || !r.some((c: any) => cleanCell(c))) continue;
        const rawType = cleanCell(r[iType]);
        if (!rawType) continue;
        const outLetter = iOut >= 0 ? cleanCell(r[iOut]) : '';
        const inLetter = iIn >= 0 ? cleanCell(r[iIn]) : '';
        // Date priority: dedicated date col → kiruvchi xat → chiquvchi xat
        let date: Date | null = null;
        if (iDate >= 0) date = parseDate(r[iDate]);
        if (!date && inLetter) date = parseDate(inLetter);
        if (!date && outLetter) date = parseDate(outLetter);
        rows.push({
          num: iNum >= 0 ? cleanCell(r[iNum]) : '',
          gov: iGov >= 0 ? cleanCell(r[iGov]) : '',
          organization: iOrg >= 0 ? cleanCell(r[iOrg]) : '',
          website: cleanCell(r[iWeb]),
          rawType,
          owasp: mapToOwasp(rawType),
          outLetter,
          inLetter,
          date,
          sheetYear: year,
          rawRow: r,
        });
        rawRows.push(r);
      }
    }
    if (!rows.length) return null;
    return { fileName, rows, headers, rawRows };
  }

  private extractCyber(wb: XLSX.WorkBook, fileName: string): SectionData<CyberRow> | null {
    const sn = wb.SheetNames.find(n => /uz\s*домен|uz\s*dom|кибер|cyber/i.test(n));
    if (!sn) return null;
    const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
    if (!raw.length) return null;
    const hRow = findHeaderRow(raw, ['наименование', 'веб-сайт', 'источник', 'хостер', 'cms']);
    const headers = raw[hRow].map(h => cleanCell(h));
    const idx = {
      num: findCol(headers, 'п/п', '№'),
      gov: findCol(headers, 'gov/не', 'gov'),
      org: findCol(headers, 'название организ'),
      web: findCol(headers, 'наименование веб', 'веб-сайт'),
      src: findCol(headers, 'источник'),
      date: findCol(headers, 'дата выявления'),
      outL: findCol(headers, 'исх'),
      inL: findCol(headers, 'вх'),
      host: findCol(headers, 'хостер'),
      cms: findCol(headers, 'cms'),
      type: findCol(headers, 'тип инцидент'),
      status: findCol(headers, 'состояние'),
    };
    const rows: CyberRow[] = [];
    const rawRows: any[][] = [];
    for (let i = hRow + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r || !r.some((c: any) => cleanCell(c))) continue;
      const web = idx.web >= 0 ? cleanCell(r[idx.web]) : '';
      if (!web) continue;
      rows.push({
        num: idx.num >= 0 ? cleanCell(r[idx.num]) : '',
        gov: idx.gov >= 0 ? cleanCell(r[idx.gov]) : '',
        organization: idx.org >= 0 ? cleanCell(r[idx.org]) : '',
        website: web,
        source: idx.src >= 0 ? cleanCell(r[idx.src]) : '',
        detectedDate: idx.date >= 0 ? parseDate(r[idx.date]) : null,
        outLetter: idx.outL >= 0 ? cleanCell(r[idx.outL]) : '',
        inLetter: idx.inL >= 0 ? cleanCell(r[idx.inL]) : '',
        hoster: idx.host >= 0 ? cleanCell(r[idx.host]) : '',
        cms: idx.cms >= 0 ? cleanCell(r[idx.cms]) : '',
        incidentType: idx.type >= 0 ? cleanCell(r[idx.type]) : '',
        status: idx.status >= 0 ? cleanCell(r[idx.status]) : '',
        rawRow: r,
      });
      rawRows.push(r);
    }
    if (!rows.length) return null;
    return { fileName, rows, headers, rawRows };
  }

  private extractTech(wb: XLSX.WorkBook, fileName: string): SectionData<TechRow> | null {
    const sn = wb.SheetNames.find(n => /гос|gos|техник|tech/i.test(n));
    if (!sn) return null;
    // Skip if also matches cyber
    if (/uz\s*домен/i.test(sn)) return null;
    const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: false });
    if (!raw.length) return null;
    const hRow = findHeaderRow(raw, ['наименование', 'веб-сайт', 'хостинг', 'начало']);
    const headers = raw[hRow].map(h => cleanCell(h));
    const idx = {
      num: findCol(headers, 'п/п', '№'),
      org: findCol(headers, 'наименование'),
      web: findCol(headers, 'веб-сайт', 'веб сайт'),
      host: findCol(headers, 'хостинг'),
      start: findCol(headers, 'начало'),
      finish: findCol(headers, 'завершен'),
      dur: findCol(headers, 'час:мин', 'час'),
      note: findCol(headers, 'примечан'),
    };
    if (idx.web < 0 || idx.start < 0) return null;
    const rows: TechRow[] = [];
    const rawRows: any[][] = [];
    for (let i = hRow + 1; i < raw.length; i++) {
      const r = raw[i];
      if (!r || !r.some((c: any) => cleanCell(c))) continue;
      const web = cleanCell(r[idx.web]);
      if (!web) continue;
      const start = parseDate(r[idx.start]);
      const finish = idx.finish >= 0 ? parseDate(r[idx.finish]) : null;
      let duration = idx.dur >= 0 ? cleanCell(r[idx.dur]) : '';
      if (!duration && start && finish) {
        const min = Math.max(0, Math.round((finish.getTime() - start.getTime()) / 60000));
        const h = Math.floor(min / 60);
        const mm = String(min % 60).padStart(2, '0');
        duration = `${String(h).padStart(2, '0')}:${mm}`;
      }
      rows.push({
        num: idx.num >= 0 ? cleanCell(r[idx.num]) : '',
        organization: idx.org >= 0 ? cleanCell(r[idx.org]) : '',
        website: web,
        hosting: idx.host >= 0 ? cleanCell(r[idx.host]) : '',
        start, finish, duration,
        note: idx.note >= 0 ? cleanCell(r[idx.note]) : '',
        rawRow: r,
      });
      rawRows.push(r);
    }
    if (!rows.length) return null;
    return { fileName, rows, headers, rawRows };
  }

  // ═══════════ VULN COMPUTED ═══════════
  vulnYears = computed(() => {
    const v = this.vuln(); if (!v) return [];
    const set = new Set<string>();
    for (const r of v.rows) if (r.sheetYear) set.add(r.sheetYear);
    return Array.from(set).sort().reverse();
  });

  vulnFiltered = computed<VulnRow[]>(() => {
    const v = this.vuln(); if (!v) return [];
    const period = this.vulnPeriod();
    const year = this.vulnYear();
    const fam = this.vulnFamily();
    const q = this.vulnSearch().toLowerCase().trim();
    return v.rows.filter(r => {
      if (year !== 'all' && r.sheetYear !== year) return false;
      if (fam !== 'all' && r.owasp !== fam) return false;
      if (period !== 'all') {
        if (!r.date) return false;
        if (period.startsWith('q') && quarterOf(r.date) !== parseInt(period[1], 10)) return false;
        if (period.startsWith('h') && halfOf(r.date) !== parseInt(period[1], 10)) return false;
      }
      if (q) {
        const hay = `${r.organization} ${r.website} ${r.rawType} ${r.outLetter}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  vulnFamilyCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) m.set(r.owasp, (m.get(r.owasp) || 0) + 1);
    return OWASP_FAMILIES.map(f => ({ key: f, count: m.get(f) || 0 }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  vulnQuarterCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) {
      if (!r.date) continue;
      const k = `Q${quarterOf(r.date)}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return ['Q1', 'Q2', 'Q3', 'Q4'].map(k => ({ key: k, count: m.get(k) || 0 }));
  });

  vulnGovCounts = computed<CountEntry[]>(() => {
    let gov = 0, nongov = 0;
    for (const r of this.vulnFiltered()) {
      if (isYes(r.gov)) gov++;
      else if (isNo(r.gov)) nongov++;
    }
    return [
      { key: 'Davlat (Да)', count: gov },
      { key: 'Hususiy (Нет)', count: nongov },
    ];
  });

  vulnUniqueWebsites = computed(() => {
    const s = new Set<string>();
    for (const r of this.vulnFiltered()) for (const w of splitSites(r.website)) s.add(w);
    return s.size;
  });
  vulnUniqueOrgs = computed(() => new Set(this.vulnFiltered().map(r => r.organization.trim()).filter(Boolean)).size);
  vulnGovPercent = computed(() => {
    const [g, n] = this.vulnGovCounts();
    const t = g.count + n.count;
    return t ? Math.round((g.count / t) * 1000) / 10 : 0;
  });

  vulnYearCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) {
      const k = r.sheetYear || '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key));
  });

  vulnTopTypes = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) {
      for (const t of splitTypes(r.rawType)) {
        const k = t.toLowerCase();
        m.set(k, (m.get(k) || 0) + 1);
      }
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  vulnTopOrgs = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) {
      const k = r.organization.trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  vulnTopSites = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.vulnFiltered()) {
      for (const k of splitSites(r.website)) m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  vulnSectorStats = computed<{
    gov: { count: number; sites: number; orgs: number; topFamily: OwaspFamily | null; topFamilyCount: number; families: CountEntry[] };
    priv: { count: number; sites: number; orgs: number; topFamily: OwaspFamily | null; topFamilyCount: number; families: CountEntry[] };
    unknown: number;
  }>(() => {
    const rows = this.vulnFiltered();
    const gov: VulnRow[] = [];
    const priv: VulnRow[] = [];
    let unknown = 0;
    for (const r of rows) {
      if (isYes(r.gov)) gov.push(r);
      else if (isNo(r.gov)) priv.push(r);
      else unknown++;
    }
    const build = (list: VulnRow[]) => {
      const sites = new Set<string>();
      const orgs = new Set<string>();
      const famMap = new Map<OwaspFamily, number>();
      for (const r of list) {
        for (const s of splitSites(r.website)) sites.add(s);
        const o = r.organization.trim(); if (o) orgs.add(o);
        famMap.set(r.owasp, (famMap.get(r.owasp) || 0) + 1);
      }
      const families = Array.from(famMap.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
      const top = families[0];
      return {
        count: list.length,
        sites: sites.size,
        orgs: orgs.size,
        topFamily: top ? (top.key as OwaspFamily) : null,
        topFamilyCount: top ? top.count : 0,
        families: families.slice(0, 5),
      };
    };
    return { gov: build(gov), priv: build(priv), unknown };
  });

  vulnInsights = computed<Insight[]>(() => {
    const rows = this.vulnFiltered();
    const out: Insight[] = [];
    if (!rows.length) return out;
    const fam = this.vulnFamilyCounts()[0];
    if (fam) {
      const pct = Math.round((fam.count / rows.length) * 100);
      out.push({ level: 'alert', label: 'Eng faol OWASP oilasi', value: fam.key, hint: `${fam.count} ta · ${pct}%` });
    }
    const org = this.vulnTopOrgs()[0];
    if (org) out.push({ level: 'warn', label: 'Eng ko\'p zaiflik topilgan tashkilot', value: org.key, hint: `${org.count} ta zaiflik` });
    const site = this.vulnTopSites()[0];
    if (site) out.push({ level: 'warn', label: 'Eng zaif veb-sayt', value: site.key, hint: `${site.count} ta zaiflik` });
    const ttype = this.vulnTopTypes()[0];
    if (ttype) out.push({ level: 'info', label: 'Eng ko\'p uchragan zaiflik turi', value: ttype.key, hint: `${ttype.count} marta` });
    const years = this.vulnYearCounts();
    if (years.length >= 2) {
      const cur = years[years.length - 1];
      const prev = years[years.length - 2];
      const diff = cur.count - prev.count;
      const pct = prev.count > 0 ? Math.round((diff / prev.count) * 100) : 0;
      out.push({
        level: diff > 0 ? 'alert' : 'info',
        label: `${cur.key} y. ${prev.key} y. ga nisbatan`,
        value: `${diff > 0 ? '+' : ''}${pct}%`,
        hint: `${prev.count} → ${cur.count}`,
      });
    }
    const gov = this.vulnGovPercent();
    out.push({ level: 'info', label: 'Davlat zaifliklari ulushi', value: `${gov}%`, hint: `${this.vulnGovCounts()[0].count} davlat / ${this.vulnGovCounts()[1].count} hususiy` });
    return out;
  });

  vulnSiteBreakdown = computed<{
    site: string;
    count: number;
    topFamily: OwaspFamily | null;
    familyCount: number;
    families: { family: OwaspFamily; count: number }[];
    uniqueTypes: number;
    duplicates: number;
    sector: 'gov' | 'priv' | 'mixed' | 'unknown';
    govCount: number;
    privCount: number;
  }[]>(() => {
    const m = new Map<string, {
      count: number;
      families: Map<OwaspFamily, number>;
      typeCounts: Map<string, number>;
      govCount: number;
      privCount: number;
    }>();
    for (const r of this.vulnFiltered()) {
      const isGov = isYes(r.gov);
      const isPriv = isNo(r.gov);
      const types = splitTypes(r.rawType);
      for (const site of splitSites(r.website)) {
        if (!m.has(site)) m.set(site, { count: 0, families: new Map(), typeCounts: new Map(), govCount: 0, privCount: 0 });
        const data = m.get(site)!;
        data.count++;
        data.families.set(r.owasp, (data.families.get(r.owasp) || 0) + 1);
        for (const t of types) {
          const k = t.toLowerCase();
          data.typeCounts.set(k, (data.typeCounts.get(k) || 0) + 1);
        }
        if (isGov) data.govCount++;
        else if (isPriv) data.privCount++;
      }
    }
    return Array.from(m.entries()).map(([site, data]) => {
      const families = Array.from(data.families.entries())
        .map(([family, count]) => ({ family, count }))
        .sort((a, b) => b.count - a.count);
      const totalTokens = Array.from(data.typeCounts.values()).reduce((a, b) => a + b, 0);
      const uniqueTypes = data.typeCounts.size;
      let sector: 'gov' | 'priv' | 'mixed' | 'unknown' = 'unknown';
      if (data.govCount > 0 && data.privCount === 0) sector = 'gov';
      else if (data.privCount > 0 && data.govCount === 0) sector = 'priv';
      else if (data.govCount > 0 && data.privCount > 0) sector = 'mixed';
      return {
        site,
        count: data.count,
        topFamily: families[0]?.family || null,
        familyCount: families.length,
        families,
        uniqueTypes,
        duplicates: Math.max(0, totalTokens - uniqueTypes),
        sector,
        govCount: data.govCount,
        privCount: data.privCount,
      };
    }).sort((a, b) => b.count - a.count);
  });

  vulnDuplicateSites = computed(() => this.vulnSiteBreakdown().filter(s => s.count > 1).length);

  vulnTypeBreakdown = computed<{
    type: string;
    count: number;
    sites: number;
    duplicates: number;
    topFamily: OwaspFamily | null;
    families: OwaspFamily[];
  }[]>(() => {
    const m = new Map<string, { count: number; sites: Map<string, number>; families: Map<OwaspFamily, number> }>();
    for (const r of this.vulnFiltered()) {
      const types = splitTypes(r.rawType);
      const sites = splitSites(r.website);
      for (const t of types) {
        const key = t.toLowerCase();
        if (!m.has(key)) m.set(key, { count: 0, sites: new Map(), families: new Map() });
        const data = m.get(key)!;
        // count once per (row × type), regardless of how many sites
        data.count++;
        for (const s of sites) data.sites.set(s, (data.sites.get(s) || 0) + 1);
        data.families.set(r.owasp, (data.families.get(r.owasp) || 0) + 1);
      }
    }
    return Array.from(m.entries()).map(([type, data]) => {
      const fams = Array.from(data.families.entries()).sort((a, b) => b[1] - a[1]);
      return {
        type,
        count: data.count,
        sites: data.sites.size,
        duplicates: Math.max(0, data.count - data.sites.size),
        topFamily: fams[0]?.[0] || null,
        families: fams.map(f => f[0]),
      };
    }).sort((a, b) => b.count - a.count);
  });

  vulnFamilyBreakdown = computed<{ family: OwaspFamily; count: number; subtypes: CountEntry[] }[]>(() => {
    const counts = new Map<OwaspFamily, number>();
    const subs = new Map<OwaspFamily, Map<string, number>>();
    for (const r of this.vulnFiltered()) {
      counts.set(r.owasp, (counts.get(r.owasp) || 0) + 1);
      if (!subs.has(r.owasp)) subs.set(r.owasp, new Map());
      const sub = subs.get(r.owasp)!;
      const tokens = r.rawType.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      for (const t of tokens) {
        const key = t.toLowerCase();
        sub.set(key, (sub.get(key) || 0) + 1);
      }
    }
    return Array.from(counts.keys())
      .map(family => {
        const subtypes = Array.from(subs.get(family)!.entries())
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count);
        return { family, count: counts.get(family)!, subtypes };
      })
      .sort((a, b) => b.count - a.count);
  });

  // ═══════════ CYBER COMPUTED ═══════════
  cyberOptions = computed(() => {
    const c = this.cyber(); if (!c) return null;
    const uniq = (fn: (r: CyberRow) => string) => {
      const s = new Set<string>();
      for (const r of c.rows) { const v = fn(r).trim(); if (v) s.add(v); }
      return Array.from(s).sort();
    };
    return {
      website: uniq(r => r.website),
      source: uniq(r => r.source),
      hoster: uniq(r => r.hoster),
      cms: uniq(r => r.cms),
      incidentType: uniq(r => r.incidentType),
      gov: uniq(r => r.gov),
      organization: uniq(r => r.organization),
      inLetter: uniq(r => r.inLetter),
    };
  });

  cyberFiltered = computed<CyberRow[]>(() => {
    const c = this.cyber(); if (!c) return [];
    const f = this.cyberFilters();
    const period = this.cyberPeriod();
    const q = this.cyberSearch().toLowerCase().trim();
    return c.rows.filter(r => {
      if (f['website'] !== 'all' && r.website !== f['website']) return false;
      if (f['source'] !== 'all' && r.source !== f['source']) return false;
      if (f['hoster'] !== 'all' && r.hoster !== f['hoster']) return false;
      if (f['cms'] !== 'all' && r.cms !== f['cms']) return false;
      if (f['incidentType'] !== 'all' && r.incidentType !== f['incidentType']) return false;
      if (f['gov'] !== 'all' && r.gov !== f['gov']) return false;
      if (f['organization'] !== 'all' && r.organization !== f['organization']) return false;
      if (f['inLetter'] !== 'all' && r.inLetter !== f['inLetter']) return false;
      if (period !== 'all') {
        if (!r.detectedDate) return false;
        if (period.startsWith('q') && quarterOf(r.detectedDate) !== parseInt(period[1], 10)) return false;
        if (period.startsWith('h') && halfOf(r.detectedDate) !== parseInt(period[1], 10)) return false;
      }
      if (q) {
        const hay = `${r.organization} ${r.website} ${r.incidentType} ${r.source}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  cyberCounts = (field: keyof CyberRow, top = 20) => computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.cyberFiltered()) {
      const k = (r[field] as string) || '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count).slice(0, top);
  });

  cyberIncidentCounts = this.cyberCounts('incidentType', 50);
  cyberHosterCounts = this.cyberCounts('hoster', 20);
  cyberCmsCounts = this.cyberCounts('cms', 50);
  cyberSourceCounts = this.cyberCounts('source', 20);
  cyberStatusCounts = this.cyberCounts('status', 10);
  cyberOrgCounts = this.cyberCounts('organization', 15);
  cyberSiteCounts = this.cyberCounts('website', 15);

  cyberUniqueWebsites = computed(() => new Set(this.cyberFiltered().map(r => r.website.trim().toLowerCase()).filter(Boolean)).size);
  cyberUniqueOrgs = computed(() => new Set(this.cyberFiltered().map(r => r.organization.trim()).filter(Boolean)).size);
  cyberUniqueHosters = computed(() => new Set(this.cyberFiltered().map(r => r.hoster.trim()).filter(Boolean)).size);

  cyberGovPercent = computed(() => {
    let gov = 0, total = 0;
    for (const r of this.cyberFiltered()) {
      if (isYes(r.gov)) { gov++; total++; }
      else if (isNo(r.gov)) total++;
    }
    return total ? Math.round((gov / total) * 1000) / 10 : 0;
  });

  cyberQuarterCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.cyberFiltered()) {
      if (!r.detectedDate) continue;
      const k = `Q${quarterOf(r.detectedDate)}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return ['Q1', 'Q2', 'Q3', 'Q4'].map(k => ({ key: k, count: m.get(k) || 0 }));
  });

  cyberMonthCounts = computed<CountEntry[]>(() => {
    const m = new Map<number, number>();
    for (const r of this.cyberFiltered()) {
      if (!r.detectedDate) continue;
      const mo = r.detectedDate.getMonth();
      m.set(mo, (m.get(mo) || 0) + 1);
    }
    const names = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];
    return names.map((nm, i) => ({ key: nm, count: m.get(i) || 0 }));
  });

  cyberInsights = computed<Insight[]>(() => {
    const rows = this.cyberFiltered();
    const out: Insight[] = [];
    if (!rows.length) return out;
    const inc = this.cyberIncidentCounts()[0];
    if (inc) {
      const pct = Math.round((inc.count / rows.length) * 100);
      out.push({ level: 'alert', label: 'Eng ko\'p uchragan hodisa turi', value: inc.key, hint: `${inc.count} ta · ${pct}%` });
    }
    const host = this.cyberHosterCounts()[0];
    if (host && host.key !== '—') out.push({ level: 'warn', label: 'Top xoster', value: host.key, hint: `${host.count} hodisa` });
    const org = this.cyberOrgCounts()[0];
    if (org && org.key !== '—') out.push({ level: 'warn', label: 'Eng ko\'p ta\'sirlangan tashkilot', value: org.key, hint: `${org.count} hodisa` });
    const cms = this.cyberCmsCounts()[0];
    if (cms && cms.key !== '—') out.push({ level: 'info', label: 'Eng ko\'p uchragan CMS', value: cms.key, hint: `${cms.count} hodisa` });
    const months = this.cyberMonthCounts();
    const peak = [...months].sort((a, b) => b.count - a.count)[0];
    if (peak && peak.count > 0) out.push({ level: 'info', label: 'Eng band oy', value: peak.key, hint: `${peak.count} hodisa` });
    out.push({ level: 'info', label: 'Davlat hodisalari ulushi', value: `${this.cyberGovPercent()}%` });
    return out;
  });

  // ═══════════ TECH COMPUTED ═══════════
  techOptions = computed(() => {
    const t = this.tech(); if (!t) return null;
    const uniq = (fn: (r: TechRow) => string) => {
      const s = new Set<string>();
      for (const r of t.rows) { const v = fn(r).trim(); if (v) s.add(v); }
      return Array.from(s).sort();
    };
    return {
      website: uniq(r => r.website),
      organization: uniq(r => r.organization),
      hosting: uniq(r => r.hosting),
      note: uniq(r => r.note),
    };
  });

  techFiltered = computed<TechRow[]>(() => {
    const t = this.tech(); if (!t) return [];
    const f = this.techFilters();
    const period = this.techPeriod();
    const q = this.techSearch().toLowerCase().trim();
    return t.rows.filter(r => {
      if (f['website'] !== 'all' && r.website !== f['website']) return false;
      if (f['organization'] !== 'all' && r.organization !== f['organization']) return false;
      if (f['hosting'] !== 'all' && r.hosting !== f['hosting']) return false;
      if (f['note'] !== 'all' && r.note !== f['note']) return false;
      if (period !== 'all') {
        if (!r.start) return false;
        if (period.startsWith('q') && quarterOf(r.start) !== parseInt(period[1], 10)) return false;
        if (period.startsWith('h') && halfOf(r.start) !== parseInt(period[1], 10)) return false;
      }
      if (q) {
        const hay = `${r.organization} ${r.website} ${r.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  techNoteCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.techFiltered()) {
      const k = r.note || '—';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  });

  techTotalHours = computed<number>(() => {
    let totalMin = 0;
    for (const r of this.techFiltered()) {
      if (!r.start || !r.finish) continue;
      const diff = (r.finish.getTime() - r.start.getTime()) / 60000;
      if (diff > 0) totalMin += diff;
    }
    return Math.round(totalMin / 60 * 10) / 10;
  });

  techDurations = computed<{ avgHours: number; maxHours: number; maxRow: TechRow | null; withDuration: number }>(() => {
    let total = 0, count = 0, max = 0;
    let maxRow: TechRow | null = null;
    for (const r of this.techFiltered()) {
      if (!r.start || !r.finish) continue;
      const diff = (r.finish.getTime() - r.start.getTime()) / 60000;
      if (diff <= 0) continue;
      total += diff; count++;
      if (diff > max) { max = diff; maxRow = r; }
    }
    return {
      avgHours: count > 0 ? Math.round((total / count) / 6) / 10 : 0,
      maxHours: Math.round(max / 6) / 10,
      maxRow,
      withDuration: count,
    };
  });

  techUniqueWebsites = computed(() => new Set(this.techFiltered().map(r => r.website.trim().toLowerCase()).filter(Boolean)).size);
  techUniqueOrgs = computed(() => new Set(this.techFiltered().map(r => r.organization.trim()).filter(Boolean)).size);

  techTopHosting = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.techFiltered()) {
      const k = r.hosting.trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  techTopOrgs = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.techFiltered()) {
      const k = r.organization.trim();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  techTopSites = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.techFiltered()) {
      const k = r.website.trim().toLowerCase();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  });

  techQuarterCounts = computed<CountEntry[]>(() => {
    const m = new Map<string, number>();
    for (const r of this.techFiltered()) {
      if (!r.start) continue;
      const k = `Q${quarterOf(r.start)}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return ['Q1', 'Q2', 'Q3', 'Q4'].map(k => ({ key: k, count: m.get(k) || 0 }));
  });

  techInsights = computed<Insight[]>(() => {
    const rows = this.techFiltered();
    const out: Insight[] = [];
    if (!rows.length) return out;
    const note = this.techNoteCounts()[0];
    if (note && note.key !== '—') {
      const pct = Math.round((note.count / rows.length) * 100);
      out.push({ level: 'alert', label: 'Eng ko\'p uchragan sabab', value: note.key, hint: `${note.count} ta · ${pct}%` });
    }
    const d = this.techDurations();
    if (d.maxRow && d.maxHours > 0) out.push({ level: 'warn', label: 'Eng uzun hodisa', value: d.maxRow.website, hint: `${d.maxHours} soat` });
    const host = this.techTopHosting()[0];
    if (host) out.push({ level: 'warn', label: 'Top xosting', value: host.key, hint: `${host.count} hodisa` });
    const org = this.techTopOrgs()[0];
    if (org) out.push({ level: 'info', label: 'Eng ko\'p hodisaga uchragan tashkilot', value: org.key, hint: `${org.count} hodisa` });
    const q = [...this.techQuarterCounts()].sort((a, b) => b.count - a.count)[0];
    if (q && q.count > 0) out.push({ level: 'info', label: 'Eng band chorak', value: q.key, hint: `${q.count} hodisa` });
    if (d.avgHours > 0) out.push({ level: 'info', label: 'O\'rtacha davomiylik', value: `${d.avgHours} soat`, hint: `${d.withDuration} ta hisoblangan` });
    return out;
  });

  // ═══════════ Section / filters ═══════════
  setSection(s: 'vuln' | 'cyber' | 'tech') {
    this.activeSection.set(s);
  }

  setVulnPeriod(p: Period) { this.vulnPeriod.set(p); }
  setCyberPeriod(p: Period) { this.cyberPeriod.set(p); }
  setTechPeriod(p: Period) { this.techPeriod.set(p); }

  setCyberFilter(key: string, value: string) {
    this.cyberFilters.set({ ...this.cyberFilters(), [key]: value });
  }
  setTechFilter(key: string, value: string) {
    this.techFilters.set({ ...this.techFilters(), [key]: value });
  }

  private resetVulnFilters() {
    this.vulnPeriod.set('all'); this.vulnYear.set('all');
    this.vulnFamily.set('all'); this.vulnSearch.set('');
  }
  private resetCyberFilters() {
    this.cyberPeriod.set('all');
    this.cyberFilters.set({
      website: 'all', source: 'all', hoster: 'all', cms: 'all',
      incidentType: 'all', gov: 'all', organization: 'all', inLetter: 'all',
    });
    this.cyberSearch.set('');
  }
  private resetTechFilters() {
    this.techPeriod.set('all');
    this.techFilters.set({ website: 'all', organization: 'all', hosting: 'all', note: 'all' });
    this.techSearch.set('');
  }

  resetAll() {
    this.vuln.set(null); this.cyber.set(null); this.tech.set(null);
    this.uniFiles.set([]); this.uniError.set('');
    this.resetVulnFilters(); this.resetCyberFilters(); this.resetTechFilters();
  }

  fmtNum(n: number | null): string {
    if (n === null || n === undefined) return '—';
    if (Number.isInteger(n) && Math.abs(n) < 1e9) return n.toLocaleString('ru-RU');
    return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }

  // ═══════════ Template helpers / export ═══════════
  fmtDate(d: Date | null): string { return formatDate(d); }
  percent(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  exportCsv(headers: string[], rows: string[][], filename: string) {
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(',')];
    for (const r of rows) lines.push(r.map(esc).join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  exportVuln() {
    this.exportCsv(
      ['№', 'Gov', 'Tashkilot', 'Veb-sayt', 'Zaiflik turi', 'OWASP', 'Chiquvchi xat', 'Kiruvchi xat', 'Yil'],
      this.vulnFiltered().map(r => [r.num, r.gov, r.organization, r.website, r.rawType, r.owasp, r.outLetter, r.inLetter, r.sheetYear]),
      'zaifliklar.csv',
    );
  }
  exportCyber() {
    this.exportCsv(
      ['№', 'Gov', 'Tashkilot', 'Veb-sayt', 'Manba', 'Sana', 'Hoster', 'CMS', 'Hodisa turi', 'Vx.xat'],
      this.cyberFiltered().map(r => [r.num, r.gov, r.organization, r.website, r.source, formatDate(r.detectedDate), r.hoster, r.cms, r.incidentType, r.inLetter]),
      'kiberxavfsizlik.csv',
    );
  }
  exportTech() {
    this.exportCsv(
      ['№', 'Tashkilot', 'Veb-sayt', 'Xosting', 'Boshlanish', 'Tugash', 'Davomiyligi', 'Izoh'],
      this.techFiltered().map(r => [r.num, r.organization, r.website, r.hosting, formatDate(r.start), formatDate(r.finish), r.duration, r.note]),
      'texnik_hodisa.csv',
    );
  }

  logout() { this.auth.logout(); }
}
