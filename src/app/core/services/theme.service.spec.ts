import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Accent, Theme, ThemeService } from './theme.service';

describe('ThemeService preferences', () => {
  const keys = ['cms-theme', 'cms-theme-mode', 'cms-accent'];
  const attributes = ['data-theme', 'data-accent'];
  let savedKeys: (string | null)[];
  let savedAttributes: (string | null)[];
  let media: EventTarget & { matches: boolean };
  let matchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    savedKeys = keys.map(key => localStorage.getItem(key));
    savedAttributes = attributes.map(name => document.documentElement.getAttribute(name));
    keys.forEach(key => localStorage.removeItem(key));
    attributes.forEach(name => document.documentElement.removeAttribute(name));
    media = Object.assign(new EventTarget(), { matches: false });
    matchMedia = vi.fn(() => media as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    keys.forEach((key, index) => {
      const value = savedKeys[index];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
    attributes.forEach((name, index) => {
      const value = savedAttributes[index];
      if (value === null) document.documentElement.removeAttribute(name);
      else document.documentElement.setAttribute(name, value);
    });
  });

  function create(platform = 'browser'): ThemeService {
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: platform }],
    });
    return TestBed.inject(ThemeService);
  }

  function changeSystemTheme(dark: boolean) {
    media.matches = dark;
    media.dispatchEvent(new Event('change'));
  }

  it('defaults to night and default accent without stored preferences', () => {
    const service = create();

    expect(service.mode()).toBe('night');
    expect(service.theme()).toBe('night');
    expect(service.accent()).toBe('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
    expect(localStorage.getItem('cms-theme-mode')).toBe('night');
    expect(localStorage.getItem('cms-theme')).toBe('night');
    expect(localStorage.getItem('cms-accent')).toBe('default');
    expect(matchMedia).toHaveBeenCalledExactlyOnceWith('(prefers-color-scheme: dark)');
  });

  it.each<Theme>(['night', 'light', 'mixed'])('restores and migrates the legacy %s preference', theme => {
    localStorage.setItem('cms-theme', theme);
    const service = create();

    expect(service.mode()).toBe(theme);
    expect(service.theme()).toBe(theme);
    expect(localStorage.getItem('cms-theme-mode')).toBe(theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
  });

  it('prefers the explicit mode over the legacy theme', () => {
    localStorage.setItem('cms-theme-mode', 'mixed');
    localStorage.setItem('cms-theme', 'light');
    const service = create();

    expect(service.mode()).toBe('mixed');
    expect(service.theme()).toBe('mixed');
    expect(localStorage.getItem('cms-theme')).toBe('mixed');
  });

  it.each([false, true])('resolves stored auto mode against the current OS (dark=%s)', dark => {
    media.matches = dark;
    localStorage.setItem('cms-theme-mode', 'auto');
    localStorage.setItem('cms-theme', dark ? 'light' : 'night');
    const expected = dark ? 'night' : 'light';
    const service = create();

    expect(service.mode()).toBe('auto');
    expect(service.theme()).toBe(expected);
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
    expect(localStorage.getItem('cms-theme-mode')).toBe('auto');
    expect(localStorage.getItem('cms-theme')).toBe(expected);
  });

  it('follows repeated OS changes while retaining auto mode', () => {
    const service = create();
    service.setMode('auto');

    for (const dark of [true, false, true]) {
      changeSystemTheme(dark);
      expect(service.theme()).toBe(dark ? 'night' : 'light');
      expect(document.documentElement.getAttribute('data-theme')).toBe(dark ? 'night' : 'light');
      expect(service.mode()).toBe('auto');
      expect(localStorage.getItem('cms-theme-mode')).toBe('auto');
    }
  });

  it.each<Theme>(['night', 'light', 'mixed'])('keeps manual %s mode through OS changes, then resumes auto', theme => {
    const service = create();
    service.setMode('auto');
    service.setMode(theme);
    changeSystemTheme(true);
    changeSystemTheme(false);

    expect(service.mode()).toBe(theme);
    expect(service.theme()).toBe(theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
    expect(localStorage.getItem('cms-theme-mode')).toBe(theme);
    expect(localStorage.getItem('cms-theme')).toBe(theme);

    service.setMode('auto');
    expect(service.theme()).toBe('light');
    changeSystemTheme(true);
    expect(service.theme()).toBe('night');
  });

  it('preserves the legacy setTheme API for callers leaving auto mode', () => {
    const service = create();
    service.setMode('auto');
    service.setTheme('mixed');
    changeSystemTheme(true);

    expect(service.mode()).toBe('mixed');
    expect(service.theme()).toBe('mixed');
    expect(localStorage.getItem('cms-theme-mode')).toBe('mixed');
    expect(localStorage.getItem('cms-theme')).toBe('mixed');
  });

  it.each<Accent>(['teal', 'blue', 'violet', 'amber'])('restores the %s accent and removes its attribute on reset', accent => {
    localStorage.setItem('cms-accent', accent);
    const service = create();
    expect(service.accent()).toBe(accent);
    expect(document.documentElement.getAttribute('data-accent')).toBe(accent);

    service.setAccent('default');
    expect(service.accent()).toBe('default');
    expect(localStorage.getItem('cms-accent')).toBe('default');
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);

    service.setAccent(accent);
    expect(service.accent()).toBe(accent);
    expect(localStorage.getItem('cms-accent')).toBe(accent);
    expect(document.documentElement.getAttribute('data-accent')).toBe(accent);
    expect(service.mode()).toBe('night');
  });

  it('keeps the selected accent across mode and OS changes', () => {
    const service = create();
    service.setAccent('teal');
    service.setMode('auto');
    changeSystemTheme(true);
    service.setTheme('mixed');

    expect(service.accent()).toBe('teal');
    expect(localStorage.getItem('cms-accent')).toBe('teal');
    expect(document.documentElement.getAttribute('data-accent')).toBe('teal');
  });

  it('constructs and updates signals on the server without browser API access', () => {
    const forbidden = () => { throw new Error('Browser API used on the server'); };
    matchMedia.mockImplementation(forbidden);
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(forbidden);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(forbidden);
    const setAttribute = vi.spyOn(document.documentElement, 'setAttribute').mockImplementation(forbidden);
    const removeAttribute = vi.spyOn(document.documentElement, 'removeAttribute').mockImplementation(forbidden);
    const service = create('server');

    expect(service.mode()).toBe('night');
    expect(service.theme()).toBe('night');
    expect(service.accent()).toBe('default');
    service.setTheme('mixed');
    expect(service.mode()).toBe('mixed');
    expect(service.theme()).toBe('mixed');
    service.setMode('auto');
    expect(service.mode()).toBe('auto');
    expect(service.theme()).toBe('light');
    service.setAccent('amber');
    expect(service.accent()).toBe('amber');
    service.setAccent('default');
    expect(service.accent()).toBe('default');
    for (const api of [matchMedia, getItem, setItem, setAttribute, removeAttribute]) {
      expect(api).not.toHaveBeenCalled();
    }
  });
});
