import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { TransliteratorComponent } from './transliterator.component';

describe('TransliteratorComponent structured-file whitespace', () => {
  let component: TransliteratorComponent;
  let downloaded: Blob | undefined;

  beforeEach(() => {
    component = new TransliteratorComponent();
    downloaded = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => { downloaded = blob; return 'blob:test'; }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function select(name: string, buffer: ArrayBuffer) {
    const input = { files: [{ name, type: '', arrayBuffer: async () => buffer }], value: name };
    await component.onFileSelected({ target: input } as unknown as Event);
    expect(input.value).toBe('');
    expect(component.fileError()).toBe('');
    expect(component.fileReady()).toBe(true);
  }

  async function download(): Promise<ArrayBuffer> {
    await component.downloadConvertedFile();
    expect(component.fileError()).toBe('');
    expect(component.converting()).toBe(false);
    expect(downloaded).toBeDefined();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(downloaded!);
    });
  }

  for (const bookType of ['xlsx', 'xls'] as const) {
    it(`retains empty cells, spaces and text positions across a ${bookType} round trip`, async () => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['', '  Salom  ', '   ', 'Dunyo', ''],
        [42, true],
      ]), 'First');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[' ', ' Oxir ']]), 'Second');
      await select(`example.${bookType}`, XLSX.write(workbook, { type: 'array', bookType }));

      const result = XLSX.read(await download(), { type: 'array' });
      expect(['A1', 'B1', 'C1', 'D1', 'E1'].map(address => result.Sheets['First'][address].v))
        .toEqual(['', '  Салом  ', '   ', 'Дунё', '']);
      expect(result.Sheets['First']['A2'].v).toBe(42);
      expect(result.Sheets['First']['B2'].v).toBe(true);
      expect(result.Sheets['Second']['A1'].v).toBe(' ');
      expect(result.Sheets['Second']['B1'].v).toBe(' Охир ');
      expect(component.sourceText()).toBe('\n  Salom  \n   \nDunyo\n\n \n Oxir ');
      expect(component.outputText()).toBe('\n  Салом  \n   \nДунё\n\n \n Охир ');
    });
  }

  it('retains spreadsheet positions after rebuilding the preview and editing a later line', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['', ' Салом ', ' ', 'Дунё', '']]), 'Sheet');
    await select('example.xlsx', XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
    component.setMode('cyrillic-latin');
    expect(component.outputText()).toBe('\n Salom \n \nDunyo\n');
    component.onOutputTextChange('\n Salom \n \nEdited\n');
    const result = XLSX.read(await download(), { type: 'array' });
    expect(['A1', 'B1', 'C1', 'D1', 'E1'].map(address => result.Sheets['Sheet'][address].v))
      .toEqual(['', ' Salom ', ' ', 'Edited', '']);
  });

  for (const [extension, prefix, tag, namespace] of [
    ['docx', 'word', 'w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'],
    ['pptx', 'ppt', 'a', 'http://schemas.openxmlformats.org/drawingml/2006/main'],
  ]) {
    for (const edit of [false, true]) {
      it(`preserves ${extension} whitespace-only runs and surrounding spaces${edit ? ' after mode change and editing' : ''}`, async () => {
        const zip = new JSZip();
        const path = `${prefix}/document.xml`;
        zip.file(path, `<root xmlns:${tag}="${namespace}"><${tag}:t></${tag}:t><${tag}:t xml:space="preserve"> </${tag}:t><${tag}:t xml:space="preserve"> Salom </${tag}:t><${tag}:t xml:space="preserve">  </${tag}:t><${tag}:t>Dunyo</${tag}:t><${tag}:t xml:space="preserve"> </${tag}:t></root>`);
        zip.file('unrelated.txt', 'Keep this content');
        await select(`example.${extension}`, await zip.generateAsync({ type: 'arraybuffer' }));
        expect(component.sourceText()).toBe(' \n Salom \n  \nDunyo\n ');
        expect(component.outputText()).toBe(' \n Салом \n  \nДунё\n ');
        if (edit) {
          component.setMode('cyrillic-latin');
          expect(component.outputText()).toBe(' \n Salom \n  \nDunyo\n ');
          component.onOutputTextChange(' \n Edited \n  \nLast\n ');
        }
        const result = await JSZip.loadAsync(await download());
        const xml = new DOMParser().parseFromString(await result.file(path)!.async('string'), 'application/xml');
        expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
        const runs = Array.from(xml.getElementsByTagNameNS(namespace, 't'));
        expect(runs.map(run => run.textContent)).toEqual(edit
          ? ['', ' ', ' Edited ', '  ', 'Last', ' ']
          : ['', ' ', ' Салом ', '  ', 'Дунё', ' ']);
        expect(runs[2].getAttribute('xml:space')).toBe('preserve');
        expect(await result.file('unrelated.txt')!.async('string')).toBe('Keep this content');
      });
    }
  }
});
