import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { StatisticsComponent } from '../statistics/statistics.component';

interface SheetColumn {
  id: string;
  label: string;
  width: number;
}

interface SheetRow {
  id: string;
  height: number;
  cells: Record<string, string>;
  styles?: Record<string, CellStyle>;
}

interface WorkbookSheet {
  id: string;
  name: string;
  workbookId: string;
  workbookName: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  selection?: SheetSelection;
}

interface VisibleRow {
  row: SheetRow;
  index: number;
}

interface SheetSelection {
  row: number;
  col: number;
}

interface ResizeState {
  type: 'column' | 'row';
  id: string;
  startX: number;
  startY: number;
  startSize: number;
}

type CellColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

interface CellStyle {
  color?: CellColor;
}

interface CellColorOption {
  id: CellColor;
  label: string;
  swatch: string;
}

interface WorkbookGroup {
  id: string;
  name: string;
  count: number;
}

const STORAGE_KEY = 'csec-vulnerabilities-sheet-v1';
const DEFAULT_ROW_HEIGHT = 35;
const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 180;
const CELL_LINE_HEIGHT = 20;
const CELL_VERTICAL_PADDING = 14;
const MIN_COL_WIDTH = 72;
const MAX_COL_WIDTH = 720;

const DEFAULT_COLUMNS: SheetColumn[] = [
  { id: 'source', label: 'Manba/Sayt', width: 210 },
  { id: 'title', label: 'Zaiflik nomi', width: 240 },
  { id: 'severity', label: 'Severity', width: 120 },
  { id: 'cve', label: 'CVE/CWE', width: 150 },
  { id: 'cvss', label: 'CVSS', width: 90 },
  { id: 'status', label: 'Status', width: 150 },
  { id: 'owner', label: 'Javobgar', width: 150 },
  { id: 'foundAt', label: 'Aniqlangan sana', width: 145 },
  { id: 'dueDate', label: 'Muddat', width: 130 },
  { id: 'evidence', label: 'Dalil/Link', width: 260 },
  { id: 'note', label: 'Izoh', width: 260 },
];

@Component({
  selector: 'app-vulnerabilities',
  standalone: true,
  imports: [CommonModule, FormsModule, SideNavComponent, StatisticsComponent],
  templateUrl: './vulnerabilities.component.html',
  styleUrls: ['./vulnerabilities.component.scss'],
})
export class VulnerabilitiesComponent implements OnInit {
  private host = inject(ElementRef<HTMLElement>);
  private resizeState?: ResizeState;

  sheets = signal<WorkbookSheet[]>([]);
  activeSheetId = signal('');
  activeWorkbookId = signal('');
  columns = signal<SheetColumn[]>(this.cloneColumns(DEFAULT_COLUMNS));
  rows = signal<SheetRow[]>(this.createRows(14, DEFAULT_COLUMNS));
  selected = signal({ row: 0, col: 0 });
  editing = signal<SheetSelection | null>(null);
  search = signal('');
  statusText = signal('Avtomatik saqlandi');
  fileName = signal('');

  readonly severityOptions = ['Info', 'Low', 'Medium', 'High', 'Critical'];
  readonly statusOptions = ['Open', 'In progress', 'Mitigated', 'Accepted', 'False positive'];
  readonly cellColorOptions: CellColorOption[] = [
    { id: 'none',   label: 'Rangsiz', swatch: 'transparent' },
    { id: 'red',    label: 'Qizil',   swatch: '#ef4444' },
    { id: 'orange', label: 'Orange',  swatch: '#fb923c' },
    { id: 'yellow', label: 'Sariq',   swatch: '#facc15' },
    { id: 'green',  label: 'Yashil',  swatch: '#22c55e' },
    { id: 'blue',   label: 'Ko‘k',    swatch: '#38bdf8' },
    { id: 'purple', label: 'Purple',  swatch: '#a78bfa' },
    { id: 'gray',   label: 'Kulrang', swatch: '#64748b' },
  ];

  activeSheetName = computed(() => this.sheets().find(sheet => sheet.id === this.activeSheetId())?.name || 'Sheet 1');
  workbooks = computed<WorkbookGroup[]>(() => {
    const groups = new Map<string, WorkbookGroup>();
    this.sheets().forEach(sheet => {
      const id = sheet.workbookId;
      const existing = groups.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(id, { id, name: sheet.workbookName || 'Excel fayl', count: 1 });
      }
    });
    return Array.from(groups.values());
  });
  activeWorkbookName = computed(() => (
    this.workbooks().find(workbook => workbook.id === this.activeWorkbookId())?.name || 'Asosiy jadval'
  ));
  visibleSheets = computed(() => {
    const workbookId = this.activeWorkbookId();
    const sheets = this.sheets();
    return workbookId ? sheets.filter(sheet => sheet.workbookId === workbookId) : sheets;
  });
  selectedColumnWidth = computed(() => this.columns()[this.selected().col]?.width ?? 160);
  selectedRowHeight = computed(() => this.rows()[this.selected().row]?.height ?? DEFAULT_ROW_HEIGHT);
  selectedCellAddress = computed(() => this.cellAddress(this.selected().row, this.selected().col));
  selectedCellColor = computed(() => {
    const selected = this.selected();
    const row = this.rows()[selected.row];
    const column = this.columns()[selected.col];
    return row && column ? this.cellColor(row, column) : 'none';
  });

  visibleRows = computed<VisibleRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    const entries = this.rows().map((row, index) => ({ row, index }));
    if (!q) return entries;
    return entries.filter(entry => {
      const rowText = this.columns()
        .map(col => entry.row.cells[col.id] || '')
        .join(' ')
        .toLowerCase();
      return rowText.includes(q) || String(entry.index + 1).includes(q);
    });
  });

  stats = computed(() => {
    const rows = this.rows();
    const dataRows = rows.filter(row => this.rowHasData(row));
    return {
      total: dataRows.length,
      critical: dataRows.filter(row => this.cellById(row, 'severity').toLowerCase() === 'critical').length,
      high: dataRows.filter(row => this.cellById(row, 'severity').toLowerCase() === 'high').length,
      open: dataRows.filter(row => ['open', 'in progress'].includes(this.cellById(row, 'status').toLowerCase())).length,
    };
  });

  ngOnInit() {
    this.loadSavedSheet();
    this.ensureWorkbookInitialized();
  }

  cellValue(row: SheetRow, column: SheetColumn): string {
    return row.cells[column.id] ?? '';
  }

  cellAddress(row: number, col: number): string {
    return `${this.columnLabel(col)}${row + 1}`;
  }

  isEditing(row: number, col: number): boolean {
    const editing = this.editing();
    return editing?.row === row && editing?.col === col;
  }

  setCell(rowId: string, columnId: string, value: string) {
    const minHeight = this.heightForValue(value);
    this.rows.update(rows => rows.map(row => (
      row.id === rowId
        ? { ...row, height: Math.max(row.height, minHeight), cells: { ...row.cells, [columnId]: value } }
        : row
    )));
    this.persist('Saqlanmoqda...');
  }

  setSelectedCellColor(color: CellColor) {
    const selected = this.selected();
    const targetRow = this.rows()[selected.row];
    const targetColumn = this.columns()[selected.col];
    if (!targetRow || !targetColumn) return;

    this.rows.update(rows => rows.map(row => {
      if (row.id !== targetRow.id) return row;

      const styles = { ...(row.styles ?? {}) };
      if (color === 'none') {
        delete styles[targetColumn.id];
      } else {
        styles[targetColumn.id] = { ...(styles[targetColumn.id] ?? {}), color };
      }

      return {
        ...row,
        styles: Object.keys(styles).length ? styles : undefined,
      };
    }));
    this.persist(color === 'none' ? 'Katak rangi tozalandi' : 'Katak rangi saqlandi');
  }

  renameColumn(columnId: string, label: string) {
    this.columns.update(cols => cols.map(col => col.id === columnId ? { ...col, label } : col));
    this.persist('Ustun yangilandi');
  }

  selectCell(row: number, col: number, keepEditing = false) {
    this.selected.set({ row, col });
    if (!keepEditing) this.editing.set(null);
    this.storeWorkbook();
  }

  selectHeader(col: number) {
    this.selected.update(current => ({ row: current.row, col }));
  }

  addRow(afterIndex = this.selected().row) {
    const insertAt = this.insertRowAfter(afterIndex);
    this.focusCell(insertAt, this.selected().col);
  }

  deleteSelectedRow() {
    if (!this.confirmAction('Tanlangan qator o‘chirilsinmi?')) return;

    const target = this.selected().row;
    if (this.rows().length <= 1) {
      this.rows.set([this.createRow(this.columns())]);
      this.persist('Qator tozalandi');
      this.focusCell(0, 0);
      return;
    }

    this.rows.update(rows => rows.filter((_, index) => index !== target));
    const row = Math.min(target, this.rows().length - 1);
    this.persist('Qator o‘chirildi');
    this.focusCell(row, this.selected().col);
  }

  addColumn() {
    const label = `Ustun ${this.columns().length + 1}`;
    const used = new Set(this.columns().map(col => col.id));
    const column = this.createColumn(label, this.columns().length, used);
    this.columns.update(cols => [...cols, column]);
    this.rows.update(rows => rows.map(row => ({ ...row, cells: { ...row.cells, [column.id]: '' } })));
    this.persist('Ustun qo‘shildi');
    this.focusCell(this.selected().row, this.columns().length - 1);
  }

  deleteSelectedColumn() {
    const index = this.selected().col;
    const column = this.columns()[index];
    if (!column) return;
    if (this.columns().length <= 1) return;
    if (!this.confirmAction('Tanlangan ustun o‘chirilsinmi?')) return;

    this.columns.update(cols => cols.filter((_, colIndex) => colIndex !== index));
    this.rows.update(rows => rows.map(row => {
      const cells = { ...row.cells };
      const styles = { ...(row.styles ?? {}) };
      delete cells[column.id];
      delete styles[column.id];
      return {
        ...row,
        cells,
        styles: Object.keys(styles).length ? styles : undefined,
      };
    }));

    const col = Math.min(index, this.columns().length - 1);
    this.persist('Ustun o‘chirildi');
    this.focusCell(this.selected().row, col);
  }

  setSelectedColumnWidth(value: number | string) {
    const width = this.parseDimension(value, MIN_COL_WIDTH, MAX_COL_WIDTH, this.selectedColumnWidth());
    const column = this.columns()[this.selected().col];
    if (!column) return;
    this.columns.update(cols => cols.map(col => col.id === column.id ? { ...col, width } : col));
    this.persist('Ustun kengligi saqlandi');
  }

  setSelectedRowHeight(value: number | string) {
    const height = this.parseDimension(value, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT, this.selectedRowHeight());
    const row = this.rows()[this.selected().row];
    if (!row) return;
    this.rows.update(rows => rows.map(item => item.id === row.id ? { ...item, height } : item));
    this.persist('Qator balandligi saqlandi');
  }

  startColumnResize(event: MouseEvent, column: SheetColumn) {
    event.preventDefault();
    event.stopPropagation();
    this.beginResize({
      type: 'column',
      id: column.id,
      startX: event.clientX,
      startY: event.clientY,
      startSize: column.width,
    });
  }

  startRowResize(event: MouseEvent, row: SheetRow) {
    event.preventDefault();
    event.stopPropagation();
    this.beginResize({
      type: 'row',
      id: row.id,
      startX: event.clientX,
      startY: event.clientY,
      startSize: row.height,
    });
  }

  addSheet() {
    this.saveActiveSheetToWorkbook();
    const sheet = this.createSheet(
      `Sheet ${this.visibleSheets().length + 1}`,
      undefined,
      undefined,
      this.activeWorkbookId() || undefined,
      this.activeWorkbookName(),
    );
    this.sheets.update(sheets => [...sheets, sheet]);
    this.activateSheet(sheet.id);
  }

  activateWorkbook(workbookId: string) {
    if (workbookId === this.activeWorkbookId()) return;
    this.saveActiveSheetToWorkbook();
    const sheet = this.sheets().find(item => item.workbookId === workbookId);
    if (!sheet) return;
    this.activateSheet(sheet.id);
  }

  activateSheet(sheetId: string) {
    if (sheetId === this.activeSheetId()) return;
    this.saveActiveSheetToWorkbook();
    const sheet = this.sheets().find(item => item.id === sheetId);
    if (!sheet) return;

    const columns = this.normalizeColumns(sheet.columns);
    const rows = this.normalizeRows(sheet.rows, columns);
    const nextRows = rows.length ? rows : this.createRows(14, columns);
    const selection = this.normalizeSelection(sheet.selection, nextRows, columns);
    this.activeSheetId.set(sheet.id);
    this.activeWorkbookId.set(sheet.workbookId);
    this.columns.set(columns);
    this.rows.set(nextRows);
    this.selected.set(selection);
    this.editing.set(null);
    this.search.set('');
    this.persist(`${sheet.name || 'Sheet'} ochildi`);
    this.focusCell(selection.row, selection.col);
  }

  renameSheet(sheetId: string, name: string) {
    const nextName = name.slice(0, 31);
    this.sheets.update(sheets => sheets.map(sheet => sheet.id === sheetId ? { ...sheet, name: nextName } : sheet));
    this.persist('Sheet nomi saqlandi');
  }

  deleteActiveSheet() {
    const sheets = this.sheets();
    if (!this.confirmAction(`"${this.activeSheetName()}" sheeti o‘chirilsinmi?`)) return;

    if (sheets.length <= 1) {
      const sheet = this.createSheet('Sheet 1');
      this.sheets.set([sheet]);
      this.activeSheetId.set(sheet.id);
      this.activeWorkbookId.set(sheet.workbookId);
      this.columns.set(this.cloneColumns(sheet.columns));
      this.rows.set(this.cloneRows(sheet.rows, sheet.columns));
      this.selected.set({ row: 0, col: 0 });
      this.editing.set(null);
      this.search.set('');
      this.fileName.set('');
      this.persist('Sheet o‘chirildi');
      this.focusCell(0, 0);
      return;
    }

    const activeId = this.activeSheetId();
    const activeIndex = Math.max(0, sheets.findIndex(sheet => sheet.id === activeId));
    const nextSheets = sheets.filter(sheet => sheet.id !== activeId);
    const nextSheet = nextSheets[Math.max(0, activeIndex - 1)] ?? nextSheets[0];

    this.sheets.set(nextSheets);
    this.activeSheetId.set(nextSheet.id);
    this.activeWorkbookId.set(nextSheet.workbookId);
    const columns = this.normalizeColumns(nextSheet.columns);
    const rows = this.normalizeRows(nextSheet.rows, columns);
    const nextRows = rows.length ? rows : this.createRows(14, columns);
    const selection = this.normalizeSelection(nextSheet.selection, nextRows, columns);
    this.columns.set(columns);
    this.rows.set(nextRows);
    this.selected.set(selection);
    this.editing.set(null);
    this.search.set('');
    this.persist('Sheet o‘chirildi');
    this.focusCell(selection.row, selection.col);
  }

  clearData() {
    if (!this.confirmAction('Jadvaldagi barcha kataklar tozalansinmi?')) return;

    const columns = this.columns();
    this.rows.update(rows => rows.map(row => {
      const cells: Record<string, string> = {};
      columns.forEach(col => cells[col.id] = '');
      return { ...row, cells, styles: undefined };
    }));
    this.persist('Jadval tozalandi');
    this.focusCell(0, 0);
  }

  onCellKeydown(event: KeyboardEvent, rowIndex: number, colIndex: number) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      this.insertLineBreak(event, rowIndex, colIndex);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 1, 0);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.moveTab(rowIndex, colIndex, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, -1, 0);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 1, 0);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const input = event.target as HTMLInputElement | HTMLTextAreaElement;
      const valueLength = input.value.length;
      const atStart = (input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0;
      const atEnd = (input.selectionStart ?? valueLength) === valueLength && (input.selectionEnd ?? valueLength) === valueLength;
      if (event.key === 'ArrowLeft' && !atStart) return;
      if (event.key === 'ArrowRight' && !atEnd) return;

      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 0, event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  onCellViewKeydown(event: KeyboardEvent, rowIndex: number, colIndex: number) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      const row = this.rows()[rowIndex];
      const column = this.columns()[colIndex];
      if (!row || !column) return;
      const value = `${row.cells[column.id] || ''}\n`;
      this.setCell(row.id, column.id, value);
      this.editCell(rowIndex, colIndex, value.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 1, 0);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.moveTab(rowIndex, colIndex, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, -1, 0);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 1, 0);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.moveFrom(rowIndex, colIndex, 0, event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      const row = this.rows()[rowIndex];
      const column = this.columns()[colIndex];
      if (!row || !column) return;
      this.setCell(row.id, column.id, '');
      this.editCell(rowIndex, colIndex, 0);
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const row = this.rows()[rowIndex];
      const column = this.columns()[colIndex];
      if (!row || !column) return;
      this.setCell(row.id, column.id, event.key);
      this.editCell(rowIndex, colIndex, 1);
    }
  }

  onPaste(event: ClipboardEvent, rowIndex: number, colIndex: number) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\t') && !text.includes('\n')) return;

    event.preventDefault();
    const matrix = this.parseClipboard(text);
    if (!matrix.length) return;

    this.writeMatrix(matrix, rowIndex, colIndex);
    this.persist(`${matrix.length} qator joylandi`);
    this.focusCell(rowIndex, colIndex);
  }

  async importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const workbookId = this.uid('workbook');
      const workbookName = this.uniqueWorkbookName(file.name, new Set(this.workbooks().map(item => item.name)));
      const usedSheetNames = new Set<string>();
      const importedSheets = workbook.SheetNames.map((sheetName, index) => {
        const matrix: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        });
        const nextSheetName = this.uniqueSheetName(sheetName || `Sheet ${index + 1}`, usedSheetNames);
        return this.sheetFromMatrix(matrix, nextSheetName, workbookId, workbookName);
      });

      if (!importedSheets.length) throw new Error('Sheet topilmadi');
      this.saveActiveSheetToWorkbook();
      const currentSheets = this.sheets();
      const shouldReplaceBlank = currentSheets.length === 1 && this.isBlankSheet(currentSheets[0]);
      const nextSheets = shouldReplaceBlank ? importedSheets : [...currentSheets, ...importedSheets];
      const first = importedSheets[0];

      this.sheets.set(nextSheets);
      this.activeSheetId.set(first.id);
      this.activeWorkbookId.set(first.workbookId);
      this.columns.set(this.cloneColumns(first.columns));
      this.rows.set(this.cloneRows(first.rows, first.columns));
      this.search.set('');
      this.selected.set({ row: 0, col: 0 });
      this.fileName.set(file.name);
      this.persist(`${workbookName} alohida import qilindi`);
      this.focusCell(0, 0);
    } catch {
      this.statusText.set('Faylni o‘qib bo‘lmadi');
    } finally {
      input.value = '';
    }
  }

  exportXlsx() {
    this.saveActiveSheetToWorkbook();
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    const sheets = this.sheetsForWorkbook(this.activeWorkbookId());
    sheets.forEach((sheet, index) => {
      const worksheet = XLSX.utils.aoa_to_sheet(this.exportMatrixFor(sheet.columns, sheet.rows));
      XLSX.utils.book_append_sheet(workbook, worksheet, this.safeSheetName(sheet.name, index, usedNames));
    });
    XLSX.writeFile(workbook, `${this.exportBaseName(this.activeWorkbookName())}-${this.filenameDate()}.xlsx`);
    this.statusText.set('XLSX yuklandi');
  }

  exportCsv() {
    const sheet = XLSX.utils.aoa_to_sheet(this.exportMatrixFor(this.columns(), this.rows()));
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.activeSheetName() || 'zaifliklar'}-${this.filenameDate()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.statusText.set('CSV yuklandi');
  }

  dataListFor(columnId: string): string | null {
    if (columnId === 'severity') return 'severity-options';
    if (columnId === 'status') return 'status-options';
    return null;
  }

  cellTone(columnId: string, value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
    if (columnId === 'severity' && normalized) return `tone-severity tone-${normalized}`;
    if (columnId === 'status' && normalized) return `tone-status tone-${normalized}`;
    return '';
  }

  cellClasses(row: SheetRow, column: SheetColumn): string[] {
    const tone = this.cellTone(column.id, this.cellValue(row, column));
    const color = this.cellColor(row, column);
    return [
      tone,
      color === 'none' ? '' : `cell-color cell-color-${color}`,
    ].filter(Boolean);
  }

  cellColor(row: SheetRow, column: SheetColumn): CellColor {
    return this.normalizeCellColor(row.styles?.[column.id]?.color);
  }

  private beginResize(state: ResizeState) {
    this.resizeState = state;
    document.body.style.cursor = state.type === 'column' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', this.onResizeMove);
    window.addEventListener('mouseup', this.onResizeEnd);
  }

  private onResizeMove = (event: MouseEvent) => {
    if (!this.resizeState) return;

    if (this.resizeState.type === 'column') {
      const width = this.clamp(this.resizeState.startSize + event.clientX - this.resizeState.startX, MIN_COL_WIDTH, MAX_COL_WIDTH);
      this.columns.update(cols => cols.map(col => col.id === this.resizeState?.id ? { ...col, width } : col));
      return;
    }

    const height = this.clamp(this.resizeState.startSize + event.clientY - this.resizeState.startY, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    this.rows.update(rows => rows.map(row => row.id === this.resizeState?.id ? { ...row, height } : row));
  };

  private onResizeEnd = () => {
    window.removeEventListener('mousemove', this.onResizeMove);
    window.removeEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (this.resizeState) {
      this.resizeState = undefined;
      this.persist('O‘lcham saqlandi');
    }
  };

  private loadSavedSheet() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as {
        sheets?: WorkbookSheet[];
        activeSheetId?: string;
        activeWorkbookId?: string;
        columns?: SheetColumn[];
        rows?: SheetRow[];
        selected?: SheetSelection;
        fileName?: string;
      };

      const legacyWorkbookId = saved.activeWorkbookId || this.uid('workbook');
      const legacyWorkbookName = saved.fileName || 'Asosiy jadval';

      if (Array.isArray(saved.sheets) && saved.sheets.length) {
        const sheets = saved.sheets.map((sheet, index) => {
          const columns = this.normalizeColumns(sheet.columns);
          const rows = this.normalizeRows(sheet.rows, columns);
          const nextRows = rows.length ? rows : this.createRows(14, columns);
          const selection = sheet.selection
            ? this.normalizeSelection(sheet.selection, nextRows, columns)
            : undefined;
          return {
            id: sheet.id || this.uid('sheet'),
            name: sheet.name || `Sheet ${index + 1}`,
            workbookId: sheet.workbookId || legacyWorkbookId,
            workbookName: sheet.workbookName || legacyWorkbookName,
            columns,
            rows: nextRows,
            selection,
          };
        });
        const active = sheets.find(sheet => sheet.id === saved.activeSheetId) ?? sheets[0];
        this.sheets.set(sheets);
        this.activeSheetId.set(active.id);
        this.activeWorkbookId.set(active.workbookId);
        this.columns.set(this.cloneColumns(active.columns));
        this.rows.set(this.cloneRows(active.rows, active.columns));
      } else {
        const columns = this.normalizeColumns(saved.columns);
        const rows = this.normalizeRows(saved.rows, columns);
        const sheet = this.createSheet('Sheet 1', columns, rows.length ? rows : this.createRows(14, columns), legacyWorkbookId, legacyWorkbookName);
        this.sheets.set([sheet]);
        this.activeSheetId.set(sheet.id);
        this.activeWorkbookId.set(sheet.workbookId);
        this.columns.set(this.cloneColumns(sheet.columns));
        this.rows.set(this.cloneRows(sheet.rows, sheet.columns));
      }

      this.fileName.set(saved.fileName || '');
      const activeSheet = this.sheets().find(sheet => sheet.id === this.activeSheetId());
      this.selected.set(this.normalizeSelection(activeSheet?.selection ?? saved.selected));
      this.editing.set(null);
      this.statusText.set('Avtomatik saqlandi');
    } catch {
      this.statusText.set('Saqlangan jadval o‘qilmadi');
    }
  }

  private ensureWorkbookInitialized() {
    if (this.sheets().length && this.activeSheetId()) {
      const active = this.sheets().find(sheet => sheet.id === this.activeSheetId()) ?? this.sheets()[0];
      if (active && !this.activeWorkbookId()) this.activeWorkbookId.set(active.workbookId);
      return;
    }
    const sheet = this.createSheet('Sheet 1', this.columns(), this.rows(), this.uid('workbook'), 'Asosiy jadval');
    this.sheets.set([sheet]);
    this.activeSheetId.set(sheet.id);
    this.activeWorkbookId.set(sheet.workbookId);
  }

  private persist(message: string) {
    this.statusText.set(message);
    this.storeWorkbook();
    window.setTimeout(() => {
      if (this.statusText() === message) this.statusText.set('Avtomatik saqlandi');
    }, 900);
  }

  private storeWorkbook() {
    this.saveActiveSheetToWorkbook();
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sheets: this.sheets(),
      activeSheetId: this.activeSheetId(),
      activeWorkbookId: this.activeWorkbookId(),
      selected: this.normalizeSelection(this.selected()),
      fileName: this.activeWorkbookName(),
    }));
  }

  private saveActiveSheetToWorkbook() {
    const activeId = this.activeSheetId();
    if (!activeId) return;
    const columns = this.cloneColumns(this.columns());
    const rows = this.cloneRows(this.rows(), columns);
    const selection = this.normalizeSelection(this.selected(), rows, columns);

    this.sheets.update(sheets => {
      const hasActive = sheets.some(sheet => sheet.id === activeId);
      if (!hasActive) {
        const workbookId = this.activeWorkbookId() || this.uid('workbook');
        return [...sheets, { id: activeId, name: 'Sheet 1', workbookId, workbookName: this.activeWorkbookName(), columns, rows, selection }];
      }
      return sheets.map(sheet => sheet.id === activeId ? { ...sheet, columns, rows, selection } : sheet);
    });
  }

  private moveFrom(rowIndex: number, colIndex: number, rowDelta: number, colDelta: number) {
    const visible = this.visibleRows();
    const visiblePos = visible.findIndex(entry => entry.index === rowIndex);
    const maxCol = this.columns().length - 1;
    const nextCol = this.clamp(colIndex + colDelta, 0, maxCol);
    let nextRow = rowIndex;

    if (rowDelta !== 0) {
      if (visiblePos >= 0) {
        const nextVisible = visible[this.clamp(visiblePos + rowDelta, 0, visible.length - 1)];
        nextRow = nextVisible?.index ?? rowIndex;
      } else {
        nextRow = this.clamp(rowIndex + rowDelta, 0, this.rows().length - 1);
      }
    }

    this.focusCell(nextRow, nextCol);
  }

  private moveTab(rowIndex: number, colIndex: number, step: 1 | -1) {
    let nextCol = colIndex + step;
    let nextRow = rowIndex;
    const maxCol = this.columns().length - 1;

    if (nextCol > maxCol) {
      nextCol = 0;
      nextRow = this.search() ? rowIndex + 1 : this.insertRowAfter(rowIndex);
    } else if (nextCol < 0) {
      nextCol = maxCol;
      nextRow = rowIndex - 1;
    }

    if (nextRow >= this.rows().length && !this.search()) {
      this.addRow(this.rows().length - 1);
      nextRow = this.rows().length - 1;
    }

    nextRow = this.clamp(nextRow, 0, this.rows().length - 1);
    this.focusCell(nextRow, nextCol);
  }

  private insertRowAfter(afterIndex: number): number {
    const columns = this.columns();
    const newRow = this.createRow(columns);
    const insertAt = Math.min(Math.max(afterIndex + 1, 0), this.rows().length);
    this.rows.update(rows => {
      const next = [...rows];
      next.splice(insertAt, 0, newRow);
      return next;
    });
    this.persist('Qator qo‘shildi');
    return insertAt;
  }

  focusCell(row: number, col: number) {
    const maxRow = Math.max(0, this.rows().length - 1);
    const maxCol = Math.max(0, this.columns().length - 1);
    const next = { row: this.clamp(row, 0, maxRow), col: this.clamp(col, 0, maxCol) };
    this.selected.set(next);
    this.editing.set(null);
    this.storeWorkbook();
    window.setTimeout(() => {
      const cell = this.host.nativeElement.querySelector(`[data-cell="${next.row}-${next.col}"]`) as HTMLElement | null;
      cell?.focus();
    });
  }

  editCell(row: number, col: number, cursor?: number) {
    const maxRow = Math.max(0, this.rows().length - 1);
    const maxCol = Math.max(0, this.columns().length - 1);
    const next = { row: this.clamp(row, 0, maxRow), col: this.clamp(col, 0, maxCol) };
    this.selected.set(next);
    this.editing.set(next);
    this.storeWorkbook();
    window.setTimeout(() => {
      const input = this.host.nativeElement.querySelector(`[data-cell="${next.row}-${next.col}"]`) as HTMLTextAreaElement | null;
      if (!input) return;
      input.focus();
      if (cursor === undefined) {
        input.select();
      } else {
        input.selectionStart = cursor;
        input.selectionEnd = cursor;
      }
    });
  }

  private insertLineBreak(event: KeyboardEvent, rowIndex: number, colIndex: number) {
    const textarea = event.target as HTMLTextAreaElement;
    const row = this.rows()[rowIndex];
    const column = this.columns()[colIndex];
    if (!row || !column) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const value = `${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`;
    this.setCell(row.id, column.id, value);
    this.focusCellAt(rowIndex, colIndex, start + 1);
  }

  private focusCellAt(row: number, col: number, cursor: number) {
    this.editing.set({ row, col });
    window.setTimeout(() => {
      const input = this.host.nativeElement.querySelector(`[data-cell="${row}-${col}"]`) as HTMLTextAreaElement | null;
      if (!input) return;
      input.focus();
      input.selectionStart = cursor;
      input.selectionEnd = cursor;
    });
  }

  private writeMatrix(matrix: string[][], startRow: number, startCol: number) {
    const minRows = startRow + matrix.length;
    const minCols = startCol + Math.max(...matrix.map(row => row.length));
    const columns = this.ensureColumnCount(this.columns(), minCols);
    const rows = this.ensureRowCount(this.rows(), columns, minRows);

    matrix.forEach((line, lineIndex) => {
      line.forEach((value, valueIndex) => {
        const row = rows[startRow + lineIndex];
        const col = columns[startCol + valueIndex];
        row.cells[col.id] = value;
        row.height = Math.max(row.height, this.heightForValue(value));
      });
    });

    this.columns.set(columns);
    this.rows.set(rows);
  }

  private sheetFromMatrix(matrix: unknown[][], name: string, workbookId: string, workbookName: string): WorkbookSheet {
    const nonEmpty = matrix.filter(row => row.some(cell => this.stringify(cell).trim()));
    if (!nonEmpty.length) return this.createSheet(name, undefined, undefined, workbookId, workbookName);

    const header = nonEmpty[0].map(cell => this.stringify(cell).trim());
    const columns = this.columnsFromHeader(header);
    const dataRows = nonEmpty.slice(1);
    const rows = dataRows.map(row => {
      const cells: Record<string, string> = {};
      columns.forEach((col, index) => cells[col.id] = this.stringify(row[index]));
      return { id: this.uid('row'), height: DEFAULT_ROW_HEIGHT, cells };
    });

    return {
      id: this.uid('sheet'),
      name: name.slice(0, 31) || 'Sheet',
      workbookId,
      workbookName,
      columns,
      rows: rows.length ? rows : this.createRows(14, columns),
      selection: { row: 0, col: 0 },
    };
  }

  private exportMatrixFor(columns: SheetColumn[], rows: SheetRow[]): string[][] {
    const dataRows = rows.filter(row => this.rowHasDataFor(row, columns));
    return [
      columns.map(col => col.label || col.id),
      ...(dataRows.length ? dataRows : rows).map(row => columns.map(col => row.cells[col.id] || '')),
    ];
  }

  private parseClipboard(text: string): string[][] {
    return text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
      .map(line => line.split('\t'));
  }

  private normalizeColumns(columns: SheetColumn[] | undefined): SheetColumn[] {
    if (!Array.isArray(columns) || !columns.length) return this.cloneColumns(DEFAULT_COLUMNS);
    return columns.map((col, index) => ({
      id: col.id || `col_${index + 1}`,
      label: col.label || `Ustun ${index + 1}`,
      width: this.clamp(Number(col.width) || 160, MIN_COL_WIDTH, MAX_COL_WIDTH),
    }));
  }

  private normalizeRows(rows: SheetRow[] | undefined, columns: SheetColumn[]): SheetRow[] {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const cells: Record<string, string> = {};
      columns.forEach(col => cells[col.id] = this.stringify(row.cells?.[col.id] ?? ''));
      const styles = this.normalizeCellStyles(row.styles, columns);
      return {
        id: row.id || this.uid('row'),
        height: this.clamp(Number(row.height) || DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
        cells,
        styles: Object.keys(styles).length ? styles : undefined,
      };
    });
  }

  private createSheet(
    name: string,
    columns = this.cloneColumns(DEFAULT_COLUMNS),
    rows = this.createRows(14, columns),
    workbookId = this.activeWorkbookId() || this.uid('workbook'),
    workbookName = this.activeWorkbookName(),
  ): WorkbookSheet {
    const normalizedColumns = this.normalizeColumns(columns);
    const normalizedRows = this.normalizeRows(rows, normalizedColumns);
    return {
      id: this.uid('sheet'),
      name: name.slice(0, 31) || 'Sheet',
      workbookId,
      workbookName: workbookName || 'Asosiy jadval',
      columns: normalizedColumns,
      rows: normalizedRows.length ? normalizedRows : this.createRows(14, normalizedColumns),
      selection: { row: 0, col: 0 },
    };
  }

  private createRows(count: number, columns: SheetColumn[]): SheetRow[] {
    return Array.from({ length: count }, () => this.createRow(columns));
  }

  private createRow(columns: SheetColumn[]): SheetRow {
    const cells: Record<string, string> = {};
    columns.forEach(col => cells[col.id] = '');
    return { id: this.uid('row'), height: DEFAULT_ROW_HEIGHT, cells };
  }

  private createColumn(label: string, index: number, usedIds = new Set(this.columns().map(col => col.id))): SheetColumn {
    const base = label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `col_${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}_${suffix++}`;
    return { id, label, width: 160 };
  }

  private columnsFromHeader(header: string[]): SheetColumn[] {
    const labels = header.length ? header : DEFAULT_COLUMNS.map(col => col.label);
    const used = new Set<string>();
    return labels.map((label, index) => {
      const clean = label || `Ustun ${index + 1}`;
      let id = clean
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `col_${index + 1}`;
      const base = id;
      let suffix = 2;
      while (used.has(id)) id = `${base}_${suffix++}`;
      used.add(id);
      return { id, label: clean, width: this.suggestWidth(clean) };
    });
  }

  private ensureColumnCount(columns: SheetColumn[], count: number): SheetColumn[] {
    const next = columns.map(col => ({ ...col }));
    const used = new Set(next.map(col => col.id));
    while (next.length < count) {
      const column = this.createColumn(`Ustun ${next.length + 1}`, next.length, used);
      used.add(column.id);
      next.push(column);
    }
    return next;
  }

  private ensureRowCount(rows: SheetRow[], columns: SheetColumn[], count: number): SheetRow[] {
    const next = this.cloneRows(rows, columns);
    while (next.length < count) next.push(this.createRow(columns));
    next.forEach(row => columns.forEach(col => row.cells[col.id] ??= ''));
    return next;
  }

  private cloneColumns(columns: SheetColumn[]): SheetColumn[] {
    return columns.map(col => ({ ...col }));
  }

  private cloneRows(rows: SheetRow[], columns: SheetColumn[]): SheetRow[] {
    return rows.map(row => {
      const cells: Record<string, string> = {};
      columns.forEach(col => cells[col.id] = this.stringify(row.cells?.[col.id] ?? ''));
      const styles = this.normalizeCellStyles(row.styles, columns);
      return {
        id: row.id || this.uid('row'),
        height: this.clamp(Number(row.height) || DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
        cells,
        styles: Object.keys(styles).length ? styles : undefined,
      };
    });
  }

  private normalizeCellStyles(styles: Record<string, CellStyle> | undefined, columns: SheetColumn[]): Record<string, CellStyle> {
    if (!styles || typeof styles !== 'object') return {};

    const columnIds = new Set(columns.map(col => col.id));
    const next: Record<string, CellStyle> = {};
    Object.entries(styles).forEach(([columnId, style]) => {
      if (!columnIds.has(columnId)) return;
      const color = this.normalizeCellColor(style?.color);
      if (color !== 'none') next[columnId] = { color };
    });
    return next;
  }

  private normalizeCellColor(color: unknown): CellColor {
    return this.cellColorOptions.some(option => option.id === color) ? color as CellColor : 'none';
  }

  private isBlankSheet(sheet: WorkbookSheet | undefined): boolean {
    if (!sheet) return true;
    const columns = this.normalizeColumns(sheet.columns);
    const rows = this.normalizeRows(sheet.rows, columns);
    return rows.every(row => !this.rowHasDataFor(row, columns) && !Object.keys(row.styles ?? {}).length);
  }

  private rowHasData(row: SheetRow): boolean {
    return this.rowHasDataFor(row, this.columns());
  }

  private rowHasDataFor(row: SheetRow, columns: SheetColumn[]): boolean {
    return columns.some(col => (row.cells[col.id] || '').trim());
  }

  private cellById(row: SheetRow, columnId: string): string {
    return row.cells[columnId] || '';
  }

  private stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  }

  private suggestWidth(label: string): number {
    if (/izoh|dalil|link|nomi/i.test(label)) return 260;
    if (/sana|muddat|status|severity/i.test(label)) return 140;
    return 170;
  }

  private parseDimension(value: number | string, min: number, max: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? this.clamp(Math.round(numeric), min, max) : fallback;
  }

  private confirmAction(message: string): boolean {
    return window.confirm(message);
  }

  private heightForValue(value: string): number {
    const lines = Math.max(1, value.split(/\r?\n/).length);
    return this.clamp(lines * CELL_LINE_HEIGHT + CELL_VERTICAL_PADDING, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
  }

  private normalizeSelection(
    selection: SheetSelection | undefined,
    rows = this.rows(),
    columns = this.columns(),
  ): SheetSelection {
    const maxRow = Math.max(0, rows.length - 1);
    const maxCol = Math.max(0, columns.length - 1);
    return {
      row: this.clamp(Number(selection?.row) || 0, 0, maxRow),
      col: this.clamp(Number(selection?.col) || 0, 0, maxCol),
    };
  }

  private columnLabel(index: number): string {
    let n = index + 1;
    let label = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label || 'A';
  }

  private safeSheetName(name: string, index: number, used: Set<string>): string {
    const fallback = `Sheet ${index + 1}`;
    const base = (name || fallback).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || fallback;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      const label = ` ${suffix++}`;
      candidate = `${base.slice(0, 31 - label.length)}${label}`;
    }
    used.add(candidate);
    return candidate;
  }

  private uniqueSheetName(name: string, used: Set<string>): string {
    const base = (name || 'Sheet').slice(0, 31) || 'Sheet';
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      const label = ` ${suffix++}`;
      candidate = `${base.slice(0, 31 - label.length)}${label}`;
    }
    used.add(candidate);
    return candidate;
  }

  private uniqueWorkbookName(name: string, used: Set<string>): string {
    const base = (name || 'Excel fayl').trim() || 'Excel fayl';
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base} (${suffix++})`;
    used.add(candidate);
    return candidate;
  }

  private sheetsForWorkbook(workbookId: string): WorkbookSheet[] {
    const sheets = this.sheets();
    if (!workbookId) return sheets;
    return sheets.filter(sheet => sheet.workbookId === workbookId);
  }

  private exportBaseName(name: string): string {
    return (name || 'zaifliklar')
      .replace(/\.(xlsx|xls|csv)$/i, '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim() || 'zaifliklar';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private uid(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private filenameDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
