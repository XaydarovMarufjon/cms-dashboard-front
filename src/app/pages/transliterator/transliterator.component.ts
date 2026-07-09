import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

type TransliterationMode = 'latin-cyrillic' | 'cyrillic-latin';
type OfficeKind = 'docx' | 'pptx';

const APOSTROPHE_RE = /['ʻʼ’‘`´]/;

interface SpreadsheetCellRef {
  sheetName: string;
  address: string;
}

interface LoadedTextFile {
  kind: 'text';
  name: string;
  extension: string;
  mimeType: string;
}

interface LoadedSpreadsheetFile {
  kind: 'spreadsheet';
  name: string;
  buffer: ArrayBuffer;
  cells: SpreadsheetCellRef[];
}

interface LoadedOfficeFile {
  kind: 'office';
  name: string;
  buffer: ArrayBuffer;
  officeKind: OfficeKind;
  mimeType: string;
  xmlFiles: string[];
}

type LoadedFile = LoadedTextFile | LoadedSpreadsheetFile | LoadedOfficeFile;

@Component({
  selector: 'app-transliterator',
  standalone: true,
  imports: [CommonModule, FormsModule, SideNavComponent],
  templateUrl: './transliterator.component.html',
  styleUrls: ['./transliterator.component.scss'],
})
export class TransliteratorComponent implements OnDestroy {
  mode = signal<TransliterationMode>('latin-cyrillic');
  sourceText = signal('');
  editedOutput = signal('');
  manualOutput = signal(false);
  copied = signal(false);

  fileName = signal('');
  fileStatus = signal('');
  fileError = signal('');
  converting = signal(false);
  downloadName = signal('');
  loadedFile = signal<LoadedFile | null>(null);

  outputText = computed(() => this.manualOutput() ? this.editedOutput() : this.convertText(this.sourceText()));
  sourceLength = computed(() => this.sourceText().length);
  outputLength = computed(() => this.outputText().length);
  fileReady = computed(() => !!this.loadedFile());

  ngOnDestroy() {
    // no persistent object URLs are kept; downloads are generated on demand
  }

  setMode(mode: TransliterationMode) {
    this.mode.set(mode);
    this.copied.set(false);
    const file = this.loadedFile();
    if (file) {
      this.rebuildFilePreview(file);
      this.fileStatus.set('Yo\'nalish o\'zgardi. Natija matnini tekshirib, yuklab oling.');
    } else {
      this.manualOutput.set(false);
    }
  }

  swapText() {
    const output = this.outputText();
    this.sourceText.set(output);
    this.mode.set(this.mode() === 'latin-cyrillic' ? 'cyrillic-latin' : 'latin-cyrillic');
    this.manualOutput.set(false);
    this.clearFileState();
  }

  clearText() {
    this.sourceText.set('');
    this.editedOutput.set('');
    this.manualOutput.set(false);
    this.copied.set(false);
    this.clearFileState();
  }

  async copyOutput() {
    const output = this.outputText();
    if (!output) return;

    await this.writeClipboard(output);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1400);
  }

  private async writeClipboard(text: string) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back for browsers that expose Clipboard API but deny the write.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  onSourceTextChange(value: string) {
    this.sourceText.set(value);
    this.manualOutput.set(false);
    this.clearFileState();
  }

  onOutputTextChange(value: string) {
    this.editedOutput.set(value);
    this.manualOutput.set(true);
    if (this.loadedFile()) {
      this.fileStatus.set('Tahrir saqlandi. Yuklab olish bosilganda faylga qo\'llanadi.');
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.fileName.set(file.name);
    this.fileError.set('');
    this.fileStatus.set('Fayl o\'qilmoqda...');
    this.converting.set(true);
    this.clearFileState(false);

    try {
      const extension = this.fileExtension(file.name);
      if (extension === 'xlsx' || extension === 'xls') {
        await this.convertSpreadsheet(file);
      } else if (extension === 'docx') {
        await this.convertOfficeZip(file, 'docx');
      } else if (extension === 'pptx') {
        await this.convertOfficeZip(file, 'pptx');
      } else if (extension === 'txt' || extension === 'csv') {
        await this.convertPlainTextFile(file, extension);
      } else {
        throw new Error('Faqat .docx, .xlsx, .xls, .pptx, .txt va .csv fayllar qo\'llab-quvvatlanadi.');
      }

      this.fileStatus.set('Tayyor. Natija tomonda tahrir qilib, keyin yuklab oling.');
    } catch (error) {
      this.fileError.set(error instanceof Error ? error.message : 'Faylni o\'girishda xato yuz berdi.');
      this.fileStatus.set('');
    } finally {
      this.converting.set(false);
    }
  }

  async downloadConvertedFile() {
    const file = this.loadedFile();
    if (!file || this.converting()) return;

    this.fileError.set('');
    this.fileStatus.set('Fayl tayyorlanmoqda...');
    this.converting.set(true);

    try {
      let blob: Blob;
      if (file.kind === 'text') {
        blob = new Blob([this.outputText()], { type: file.mimeType || 'text/plain;charset=utf-8' });
      } else if (file.kind === 'spreadsheet') {
        blob = await this.buildSpreadsheetBlob(file);
      } else {
        blob = await this.buildOfficeBlob(file);
      }

      this.downloadBlob(blob, this.downloadName());
      this.fileStatus.set('Yuklab olish boshlandi.');
    } catch (error) {
      this.fileError.set(error instanceof Error ? error.message : 'Faylni tayyorlashda xato yuz berdi.');
      this.fileStatus.set('');
    } finally {
      this.converting.set(false);
    }
  }

  private convertText(text: string): string {
    return this.mode() === 'latin-cyrillic'
      ? this.latinToCyrillic(text)
      : this.cyrillicToLatin(text);
  }

  private latinToCyrillic(input: string): string {
    let output = '';

    for (let i = 0; i < input.length;) {
      const char = input[i];
      const next = input[i + 1] ?? '';

      if (this.isLatinLetter(char) && APOSTROPHE_RE.test(next)) {
        const lower = char.toLowerCase();
        if (lower === 'o' || lower === 'g') {
          output += this.applyCase(char, lower === 'o' ? 'ў' : 'ғ');
          i += 2;
          continue;
        }
      }

      const two = input.slice(i, i + 2);
      const twoLower = two.toLowerCase();
      const digraph = this.latinDigraphToCyrillic(twoLower);
      if (digraph) {
        output += this.applyCase(two, digraph);
        i += 2;
        continue;
      }

      const lower = char.toLowerCase();
      const mapped = this.latinLetterToCyrillic(lower, i === 0 ? '' : input[i - 1]);
      output += mapped ? this.applyCase(char, mapped) : char;
      i += 1;
    }

    return output;
  }

  private cyrillicToLatin(input: string): string {
    let output = '';
    let index = 0;

    while (index < input.length) {
      const char = input[index];
      if (!this.isCyrillicLetter(char)) {
        output += char;
        index += 1;
        continue;
      }

      let end = index + 1;
      while (end < input.length && this.isCyrillicLetter(input[end])) end += 1;
      output += this.cyrillicWordToLatin(input.slice(index, end));
      index = end;
    }

    return output;
  }

  private cyrillicWordToLatin(word: string): string {
    const hasLowercase = /[а-яёғқўҳ]/.test(word);
    const allCaps = !hasLowercase && /[А-ЯЁҒҚЎҲ]/.test(word);

    return Array.from(word).map(char => {
      const lower = char.toLowerCase();
      const mapped = this.cyrillicMap[lower] ?? char;
      if (!this.isUppercaseCyrillic(char)) return mapped;
      return allCaps ? mapped.toUpperCase() : this.capitalize(mapped);
    }).join('');
  }

  private latinDigraphToCyrillic(value: string): string | null {
    const map: Record<string, string> = {
      sh: 'ш',
      ch: 'ч',
      yo: 'ё',
      yu: 'ю',
      ya: 'я',
      ye: 'е',
      ts: 'ц',
    };
    return map[value] ?? null;
  }

  private latinLetterToCyrillic(value: string, previous: string): string | null {
    if (value === 'e') {
      return !this.isLatinLetter(previous) ? 'э' : 'е';
    }

    const map: Record<string, string> = {
      a: 'а',
      b: 'б',
      d: 'д',
      f: 'ф',
      g: 'г',
      h: 'ҳ',
      i: 'и',
      j: 'ж',
      k: 'к',
      l: 'л',
      m: 'м',
      n: 'н',
      o: 'о',
      p: 'п',
      q: 'қ',
      r: 'р',
      s: 'с',
      t: 'т',
      u: 'у',
      v: 'в',
      x: 'х',
      y: 'й',
      z: 'з',
    };
    return map[value] ?? null;
  }

  private readonly cyrillicMap: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'j',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'x',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sh',
    ъ: '',
    ы: 'i',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    ў: 'o\'',
    қ: 'q',
    ғ: 'g\'',
    ҳ: 'h',
  };

  private async convertPlainTextFile(file: File, extension: string) {
    const original = await file.text();
    const converted = this.convertText(original);
    this.sourceText.set(original);
    this.editedOutput.set(converted);
    this.manualOutput.set(true);
    this.loadedFile.set({ kind: 'text', name: file.name, extension, mimeType: file.type || 'text/plain;charset=utf-8' });
    this.downloadName.set(this.outputFileName(file.name, extension));
  }

  private async convertSpreadsheet(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const originals: string[] = [];
    const converted: string[] = [];
    const cells: SpreadsheetCellRef[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      for (const address of Object.keys(sheet)) {
        if (address.startsWith('!')) continue;
        const cell = sheet[address] as XLSX.CellObject | undefined;
        if (cell && typeof cell.v === 'string') {
          originals.push(cell.v);
          converted.push(this.convertText(cell.v));
          cells.push({ sheetName, address });
        }
      }
    }

    if (!cells.length) throw new Error('Fayl ichidan matn topilmadi.');

    this.sourceText.set(this.previewText(originals));
    this.editedOutput.set(this.previewText(converted));
    this.manualOutput.set(true);
    this.loadedFile.set({ kind: 'spreadsheet', name: file.name, buffer, cells });
    this.downloadName.set(this.outputFileName(file.name, 'xlsx'));
  }

  private async convertOfficeZip(file: File, kind: OfficeKind) {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const files = zip.file(kind === 'docx' ? /^word\/.*\.xml$/ : /^ppt\/.*\.xml$/);
    const originals: string[] = [];
    const xmlFiles: string[] = [];

    await Promise.all(files.map(async item => {
      const xml = await item.async('string');
      const texts = this.extractXmlTexts(xml);
      if (texts.length) {
        xmlFiles.push(item.name);
        originals.push(...texts);
      }
    }));

    if (!originals.length) throw new Error('Fayl ichidan matn topilmadi.');

    this.sourceText.set(this.previewText(originals));
    this.editedOutput.set(this.previewText(originals.map(text => this.convertText(text))));
    this.manualOutput.set(true);
    this.loadedFile.set({
      kind: 'office',
      name: file.name,
      buffer,
      officeKind: kind,
      mimeType: file.type || this.officeMime(kind),
      xmlFiles,
    });
    this.downloadName.set(this.outputFileName(file.name, kind));
  }

  private extractXmlTexts(xml: string): string[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];

    return this.getTextElements(doc)
      .map(element => element.textContent ?? '')
      .filter(Boolean);
  }

  private replaceXmlTexts(xml: string, lines: string[], cursor: { value: number }): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;

    for (const element of this.getTextElements(doc)) {
      const text = element.textContent ?? '';
      if (!text) continue;
      element.textContent = lines[cursor.value] ?? '';
      cursor.value += 1;
    }

    return new XMLSerializer().serializeToString(doc);
  }

  private getTextElements(doc: Document): Element[] {
    return Array.from(doc.getElementsByTagName('*'))
      .filter(element => element.localName === 't' || element.localName === 'instrText');
  }

  private async buildSpreadsheetBlob(file: LoadedSpreadsheetFile): Promise<Blob> {
    const workbook = XLSX.read(file.buffer.slice(0), { type: 'array', cellDates: true });
    const lines = this.editedLines();

    file.cells.forEach((ref, index) => {
      const sheet = workbook.Sheets[ref.sheetName];
      const cell = sheet?.[ref.address] as XLSX.CellObject | undefined;
      if (!cell) return;
      const value = lines[index] ?? '';
      cell.v = value;
      cell.w = value;
      cell.t = 's';
    });

    const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private async buildOfficeBlob(file: LoadedOfficeFile): Promise<Blob> {
    const zip = await JSZip.loadAsync(file.buffer.slice(0));
    const lines = this.editedLines();
    const cursor = { value: 0 };

    await Promise.all(file.xmlFiles.map(async fileName => {
      const item = zip.file(fileName);
      if (!item) return;
      const xml = await item.async('string');
      zip.file(fileName, this.replaceXmlTexts(xml, lines, cursor));
    }));

    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      mimeType: file.mimeType || this.officeMime(file.officeKind),
    });
  }

  private editedLines(): string[] {
    return this.outputText().split(/\r?\n/);
  }

  private rebuildFilePreview(file: LoadedFile) {
    const originals = this.sourceText().split(/\r?\n/);
    if (file.kind === 'text') {
      this.editedOutput.set(this.convertText(this.sourceText()));
    } else {
      this.editedOutput.set(this.previewText(originals.map(line => this.convertText(line))));
    }
    this.manualOutput.set(true);
    this.downloadName.set(this.outputFileName(file.name, file.kind === 'office' ? file.officeKind : file.kind === 'spreadsheet' ? 'xlsx' : file.extension));
  }

  private clearFileState(clearName = true) {
    this.fileError.set('');
    this.fileStatus.set('');
    this.downloadName.set('');
    this.loadedFile.set(null);
    if (clearName) this.fileName.set('');
  }

  private previewText(lines: string[]): string {
    return lines
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  private downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private outputFileName(name: string, extension: string): string {
    const base = name.replace(/\.[^.]+$/, '');
    const suffix = this.mode() === 'latin-cyrillic' ? 'kril' : 'lotin';
    return `${base}-${suffix}.${extension}`;
  }

  private fileExtension(name: string): string {
    return name.split('.').pop()?.toLowerCase() ?? '';
  }

  private officeMime(kind: OfficeKind): string {
    return kind === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  private applyCase(source: string, replacement: string): string {
    const letters = source.replace(APOSTROPHE_RE, '');
    if (letters && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
      return replacement.toUpperCase();
    }
    if (letters && letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase()) {
      return this.capitalize(replacement);
    }
    return replacement;
  }

  private capitalize(value: string): string {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
  }

  private isLatinLetter(value: string): boolean {
    return /^[A-Za-z]$/.test(value);
  }

  private isCyrillicLetter(value: string): boolean {
    return /^[А-Яа-яЁёҒғҚқЎўҲҳ]$/.test(value);
  }

  private isUppercaseCyrillic(value: string): boolean {
    return /^[А-ЯЁҒҚЎҲ]$/.test(value);
  }
}
