// src/app/shared/command-palette/command-palette.component.ts
import {
  Component, HostListener, inject, signal, computed, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { WebsiteService } from '../../core/services/website.service';
import { Website } from '../../shared/models/website.model';

interface Cmd {
  kind: 'site' | 'page';
  title: string;
  sub: string;
  link: any[];
}

const PAGES: Cmd[] = [
  { kind: 'page', title: 'Bosh panel',   sub: 'Umumiy ko\'rinish', link: ['/'] },
  { kind: 'page', title: 'Saytlar',      sub: 'Skaner dashboard',  link: ['/sites'] },
  { kind: 'page', title: 'Alertlar',     sub: 'Muddat / SSL',      link: ['/alerts'] },
  { kind: 'page', title: 'Statistika',   sub: 'Hisobotlar',        link: ['/statistics'] },
  { kind: 'page', title: 'CVE Scanner',  sub: 'Nuclei zaiflik',    link: ['/nuclei'] },
  { kind: 'page', title: 'Port Scanner', sub: 'Portlar',           link: ['/ports'] },
  { kind: 'page', title: 'OSINT Dork',   sub: 'Google dorking',    link: ['/dork'] },
  { kind: 'page', title: 'URL Checker',  sub: 'Havola tekshir',    link: ['/checker'] },
  { kind: 'page', title: 'Vazifalar',    sub: 'Security tasks',    link: ['/tasks'] },
  { kind: 'page', title: 'Qo\'ng\'iroqlar', sub: 'Call jurnali',   link: ['/calls'] },
  { kind: 'page', title: 'Proxy',        sub: 'Proksi pool',       link: ['/proxies'] },
  { kind: 'page', title: 'Lotin-Kiril',  sub: 'Transliterator',    link: ['/transliterator'] },
  { kind: 'page', title: 'Foydalanuvchilar', sub: 'Admin',         link: ['/admin'] },
  { kind: 'page', title: 'Loglar',       sub: 'Audit / sessiya',   link: ['/logs'] },
];

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.scss'],
})
export class CommandPaletteComponent {
  private websiteSvc = inject(WebsiteService);
  private router = inject(Router);

  @ViewChild('input') input?: ElementRef<HTMLInputElement>;

  isOpen = signal(false);
  query  = signal('');
  active = signal(0);
  private sites = signal<Website[]>([]);
  private loaded = false;

  hits = computed<Cmd[]>(() => {
    const q = this.query().trim().toLowerCase();
    const siteHits: Cmd[] = this.sites()
      .filter(w => `${w.url} ${w.label ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map(w => ({ kind: 'site' as const, title: w.label || w.url, sub: w.url, link: ['/site', w.id] }));
    const pageHits = q
      ? PAGES.filter(p => `${p.title} ${p.sub}`.toLowerCase().includes(q))
      : PAGES;
    return q ? [...siteHits, ...pageHits].slice(0, 12) : pageHits;
  });

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') {
      e.preventDefault();
      this.isOpen() ? this.close() : this.open();
      return;
    }
    if (!this.isOpen()) return;
    if (k === 'escape') { e.preventDefault(); this.close(); }
    else if (k === 'arrowdown') { e.preventDefault(); this.move(1); }
    else if (k === 'arrowup')   { e.preventDefault(); this.move(-1); }
    else if (k === 'enter')     { e.preventDefault(); this.choose(this.hits()[this.active()]); }
  }

  async open() {
    this.isOpen.set(true);
    this.query.set('');
    this.active.set(0);
    if (!this.loaded) {
      this.loaded = true;
      try { this.sites.set(await firstValueFrom(this.websiteSvc.getAll()) ?? []); } catch { /* graceful */ }
    }
    setTimeout(() => this.input?.nativeElement.focus(), 30);
  }

  close() { this.isOpen.set(false); }

  onQuery(v: string) { this.query.set(v); this.active.set(0); }

  private move(d: number) {
    const n = this.hits().length;
    if (!n) return;
    this.active.set((this.active() + d + n) % n);
  }

  choose(c: Cmd | undefined) {
    if (!c) return;
    this.close();
    this.router.navigate(c.link);
  }
}
