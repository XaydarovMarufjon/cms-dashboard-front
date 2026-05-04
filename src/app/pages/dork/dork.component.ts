import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface UzDomain {
  value: string;
  label: string;
  desc: string;
}

interface DorkPreset {
  id: string;
  label: string;
  desc: string;
  icon: string;
  build: (site: string, keywords: string, extra: string) => string;
}

interface DorkHistoryEntry {
  id: string;
  query: string;
  preset: string;
  domains: string[];
  timestamp: Date;
}

const UZ_DOMAINS: UzDomain[] = [
  { value: '.uz',      label: '.uz',      desc: 'barcha .uz' },
  { value: 'gov.uz',   label: 'gov.uz',   desc: 'davlat' },
  { value: 'edu.uz',   label: 'edu.uz',   desc: "ta'lim" },
];

const DORK_PRESETS: DorkPreset[] = [
  {
    id: 'files',
    label: 'Fayllar',
    desc: 'PDF, Excel, SQL, ENV, log, bak fayllari',
    icon: 'file',
    build: (site, kw) =>
      `${site} (filetype:pdf OR filetype:xls OR filetype:xlsx OR filetype:doc OR filetype:docx OR filetype:sql OR filetype:env OR filetype:log OR filetype:bak OR filetype:backup)${kw ? ' ' + kw : ''}`,
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    desc: 'Login, admin, dashboard, panel sahifalar',
    icon: 'key',
    build: (site, kw) =>
      `${site} (inurl:admin OR inurl:login OR inurl:dashboard OR inurl:panel OR inurl:wp-admin OR inurl:administrator OR inurl:backend OR inurl:cpanel)${kw ? ' ' + kw : ''}`,
  },
  {
    id: 'exposed',
    label: "Ochiq Ma'lumotlar",
    desc: 'Directory listing, parollar, config, DB',
    icon: 'warning',
    build: (site, kw) =>
      `${site} (intitle:"index of" OR intext:"sql dump" OR intext:"password" OR intext:"passwd" OR inurl:config OR inurl:backup OR inurl:db OR inurl:.env OR intext:"DB_PASSWORD")${kw ? ' ' + kw : ''}`,
  },
  {
    id: 'custom',
    label: 'Custom',
    desc: "O'z dork operatorlaringizni yozing",
    icon: 'edit',
    build: (site, _kw, extra) => `${site}${extra ? ' ' + extra : ''}`,
  },
];

@Component({
  selector: 'app-dork',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dork.component.html',
  styleUrls: ['./dork.component.scss'],
})
export class DorkComponent {
  readonly UZ_DOMAINS = UZ_DOMAINS;
  readonly DORK_PRESETS = DORK_PRESETS;

  keywords = signal('');
  selectedDomains = signal<string[]>(['gov.uz']);
  activePresetId = signal('files');
  customOperators = signal('');
  copiedId = signal<string | null>(null);
  history = signal<DorkHistoryEntry[]>([]);

  activePreset = computed(() =>
    DORK_PRESETS.find(p => p.id === this.activePresetId()) ?? DORK_PRESETS[0]
  );

  siteClause = computed(() => {
    const doms = this.selectedDomains();
    if (!doms.length) return '';
    if (doms.length === 1) return `site:${doms[0]}`;
    return `(${doms.map(d => `site:${d}`).join(' OR ')})`;
  });

  generatedQuery = computed(() => {
    const site = this.siteClause();
    if (!site) return '';
    const preset = this.activePreset();
    return preset.build(site, this.keywords().trim(), this.customOperators().trim());
  });

  googleUrl = computed(() => {
    const q = this.generatedQuery();
    if (!q) return '';
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  });

  toggleDomain(value: string) {
    this.selectedDomains.update(list => {
      if (list.includes(value)) {
        return list.filter(d => d !== value);
      }
      return [...list, value];
    });
  }

  isDomainSelected(value: string): boolean {
    return this.selectedDomains().includes(value);
  }

  openGoogle() {
    const url = this.googleUrl();
    if (!url) return;
    this.addToHistory();
    window.open(url, 'dork-results', 'width=1280,height=860,noopener');
  }

  async copyQuery(query: string, id: string) {
    try {
      await navigator.clipboard.writeText(query);
      this.copiedId.set(id);
      setTimeout(() => this.copiedId.set(null), 1800);
    } catch {
      // fallback: select text manually
    }
  }

  private addToHistory() {
    const entry: DorkHistoryEntry = {
      id: Date.now().toString(),
      query: this.generatedQuery(),
      preset: this.activePreset().label,
      domains: [...this.selectedDomains()],
      timestamp: new Date(),
    };
    this.history.update(h => [entry, ...h].slice(0, 20));
  }

  rerunHistory(entry: DorkHistoryEntry) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(entry.query)}`;
    window.open(url, 'dork-results', 'width=1280,height=860,noopener');
  }

  clearHistory() {
    this.history.set([]);
  }

  allPresetQueries = computed(() => {
    const site = this.siteClause();
    const kw = this.keywords().trim();
    if (!site) return [];
    return DORK_PRESETS.filter(p => p.id !== 'custom').map(p => ({
      preset: p,
      query: p.build(site, kw, ''),
      googleUrl: `https://www.google.com/search?q=${encodeURIComponent(p.build(site, kw, ''))}`,
    }));
  });
}
