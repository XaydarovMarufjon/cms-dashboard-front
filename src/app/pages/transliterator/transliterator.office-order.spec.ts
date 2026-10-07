import JSZip from 'jszip';
import { TransliteratorComponent } from './transliterator.component';

describe('TransliteratorComponent Office part ordering', () => {
  let component: TransliteratorComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    component = new TransliteratorComponent();
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function xml(text: string): string {
    return `<root><t>${text}</t></root>`;
  }

  function delayedPart(zip: JSZip, name: string, content: string, delay = 0) {
    zip.file(name, content);
    vi.spyOn(zip.file(name)!, 'async').mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(content), delay)) as never
    );
  }

  async function select(zip: JSZip, extension: string) {
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);
    const input = {
      files: [{
        name: `example.${extension}`,
        type: '',
        arrayBuffer: async () => new ArrayBuffer(0),
      }],
      value: 'example',
    };
    const pending = component.onFileSelected({ target: input } as unknown as Event);
    await vi.runAllTimersAsync();
    await pending;
    expect(component.fileError()).toBe('');
    expect(component.converting()).toBe(false);
    expect(input.value).toBe('');
  }

  for (const [extension, prefix] of [['docx', 'word'], ['pptx', 'ppt']]) {
    it(`keeps ${extension} preview parts in archive order despite slower earlier reads`, async () => {
      const zip = new JSZip();
      delayedPart(zip, `${prefix}/first.xml`, xml('Salom'), 30);
      delayedPart(zip, `${prefix}/second.xml`, xml('Dunyo'));

      await select(zip, extension);

      expect(component.sourceText()).toBe('Salom\nDunyo');
      expect(component.outputText()).toBe('Салом\nДунё');
      expect(component.loadedFile()).toMatchObject({
        kind: 'office',
        xmlFiles: [`${prefix}/first.xml`, `${prefix}/second.xml`],
      });
    });

    it(`writes edited ${extension} lines back to their original parts despite slower earlier reads`, async () => {
      const original = new JSZip();
      delayedPart(original, `${prefix}/first.xml`, xml('Salom'));
      delayedPart(original, `${prefix}/second.xml`, xml('Dunyo'), 30);
      await select(original, extension);
      component.onOutputTextChange('First edit\nSecond edit');

      const output = new JSZip();
      delayedPart(output, `${prefix}/first.xml`, xml('Salom'), 30);
      delayedPart(output, `${prefix}/second.xml`, xml('Dunyo'));
      vi.mocked(JSZip.loadAsync).mockResolvedValue(output);
      const write = vi.spyOn(output, 'file');
      vi.spyOn(output, 'generateAsync').mockResolvedValue(new Blob(['test archive']));
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const pending = component.downloadConvertedFile();
      await vi.runAllTimersAsync();
      await pending;

      expect(write).toHaveBeenCalledWith(`${prefix}/first.xml`, xml('First edit'));
      expect(write).toHaveBeenCalledWith(`${prefix}/second.xml`, xml('Second edit'));
      expect(component.fileError()).toBe('');
      expect(component.converting()).toBe(false);
      expect(output.generateAsync).toHaveBeenCalledOnce();
    });

    it(`skips empty ${extension} parts without consuming preview lines`, async () => {
      const zip = new JSZip();
      delayedPart(zip, `${prefix}/empty.xml`, '<root/>', 30);
      delayedPart(zip, `${prefix}/first.xml`, xml('Salom'));
      delayedPart(zip, `${prefix}/second.xml`, xml('Dunyo'));

      await select(zip, extension);

      expect(component.sourceText()).toBe('Salom\nDunyo');
      expect(component.loadedFile()).toMatchObject({
        xmlFiles: [`${prefix}/first.xml`, `${prefix}/second.xml`],
      });
    });
  }
});
