import type { DayOfWeek, Facility, Level, Shift } from '../types';
import { FACILITY_LABELS, LEVEL_LABELS } from '../data/constants';
import type { ScheduleResult } from './scheduler';
import { formatClassLabel } from './exportSchedule';
import { getShiftTimeSlot } from './timeUtils';
import { parseCsv, serializeCsv } from './csvParse';

export interface CellUpdate {
  row: number;
  col: number;
  a1: string;
  value: string;
}

export interface ScannedTemplateCell {
  row: number;
  nameCol: number;
  facility: Facility;
  level: Level;
  day: DayOfWeek;
  slot: string;
  classCode: string;
}

export interface FillTemplateResult {
  grid: string[][];
  updates: CellUpdate[];
  matched: number;
  missed: number;
  missSamples: string[];
}

const LEVEL_ORDER: Level[] = ['cap3', 'cap2', 'cap1'];
const FACILITY_ANCHORS: { id: Facility; text: string; minCol: number }[] = [
  { id: 'coso1', text: 'CƠ SỞ 1', minCol: 0 },
  { id: 'coso2', text: 'CƠ SỞ 2', minCol: 15 },
];

function normalizeTime(value: string): string {
  return value.replace(/\s+/g, '').replace(/–/g, '-').toLowerCase();
}

function isTimeLabel(text: string): boolean {
  return /\d{1,2}\s*:\s*\d{2}\s*[-–—~]\s*\d{1,2}\s*:\s*\d{2}/.test(text.trim());
}

function classCore(value: string): string {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function compactClass(value: string): string {
  return classCore(value).replace(/[\s.]/g, '');
}

function looksLikeClass(text: string): boolean {
  const t = classCore(text);
  if (!t) return false;
  if (/\bB[123]\b/.test(t)) return true;
  if (/\d/.test(t) && /B[123]/i.test(t)) return true;
  if (/^\d+[A-Z]?\s*B[123]/i.test(t)) return true;
  return false;
}

function classMatches(sheetText: string, className: string, classLabel: string): boolean {
  const raw = sheetText.trim();
  if (!raw) return false;
  const sheetCompact = compactClass(raw);
  const nameCompact = compactClass(className);
  const labelCompact = compactClass(classLabel);
  return (
    sheetCompact === nameCompact ||
    sheetCompact === labelCompact ||
    sheetCompact.startsWith(nameCompact) ||
    sheetCompact.startsWith(labelCompact) ||
    nameCompact.startsWith(sheetCompact)
  );
}

function colToA1(col: number): string {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function toA1(row: number, col: number): string {
  return `${colToA1(col)}${row + 1}`;
}

function parseLevel(text: string): Level | null {
  const t = text.toUpperCase();
  if (t.includes('CẤP 3') || t.includes('CAP 3')) return 'cap3';
  if (t.includes('CẤP 2') || t.includes('CAP 2')) return 'cap2';
  if (t.includes('CẤP 1') || t.includes('CAP 1')) return 'cap1';
  return null;
}

function findAnchorCol(grid: string[][], text: string, minCol: number): number {
  const needle = text.toUpperCase();
  for (let r = 0; r < Math.min(grid.length, 5); r++) {
    for (let c = minCol; c < grid[r].length; c++) {
      if (grid[r][c]?.toUpperCase().includes(needle)) return c;
    }
  }
  return -1;
}

function detectTimeCol(grid: string[][], regionStart: number, regionEnd: number, fromRow: number, toRow: number): number {
  let bestCol = regionStart;
  let bestScore = 0;
  for (let c = regionStart; c <= Math.min(regionEnd, regionStart + 3); c++) {
    let score = 0;
    for (let r = fromRow; r <= toRow; r++) {
      if (isTimeLabel(grid[r]?.[c] ?? '')) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

function rowHasScheduleContent(grid: string[][], row: number, nameColStart: number): boolean {
  for (let d = 0; d < 7; d++) {
    const nc = nameColStart + d * 2;
    const cc = nc + 1;
    if ((grid[row]?.[nc] ?? '').trim()) return true;
    if (looksLikeClass(grid[row]?.[cc] ?? '')) return true;
  }
  return false;
}

function collectTimeBlocks(
  grid: string[][],
  timeCol: number,
  fromRow: number,
  toRow: number,
  nameColStart: number,
): { slot: string; rows: number[] }[] {
  const blocks: { slot: string; rows: number[] }[] = [];
  let current: { slot: string; rows: number[] } | null = null;

  for (let r = fromRow; r <= toRow; r++) {
    const val = (grid[r]?.[timeCol] ?? '').trim();
    if (isTimeLabel(val)) {
      if (current) blocks.push(current);
      current = { slot: val, rows: [r] };
    } else if (current) {
      if (rowHasScheduleContent(grid, r, nameColStart) && current.rows.length < 10) {
        current.rows.push(r);
      } else {
        blocks.push(current);
        current = null;
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function fallbackSections(
  grid: string[][],
  timeCol: number,
  fromRow: number,
  toRow: number,
  facility: Facility,
  nameColStart: number,
): Partial<Record<Level, { timeBlocks: { slot: string; rows: number[] }[] }>> {
  const slotCounts: Record<Level, number> =
    facility === 'coso1'
      ? { cap3: 7, cap2: 6, cap1: 2 }
      : { cap3: 3, cap2: 3, cap1: 1 };
  const all = collectTimeBlocks(grid, timeCol, fromRow, toRow, nameColStart);
  const sections: Partial<Record<Level, { timeBlocks: { slot: string; rows: number[] }[] }>> = {};
  let idx = 0;
  for (const level of LEVEL_ORDER) {
    const n = slotCounts[level];
    if (idx >= all.length) break;
    sections[level] = { timeBlocks: all.slice(idx, idx + n) };
    idx += n;
  }
  return sections;
}

function findLevelSections(
  grid: string[][],
  timeCol: number,
  regionStart: number,
  fromRow: number,
  toRow: number,
  facility: Facility,
  nameColStart: number,
): Partial<Record<Level, { timeBlocks: { slot: string; rows: number[] }[] }>> {
  const markers: { level: Level; row: number }[] = [];
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = regionStart; c <= timeCol; c++) {
      const level = parseLevel(grid[r]?.[c] ?? '');
      if (level) {
        markers.push({ level, row: r });
        break;
      }
    }
  }

  if (markers.length === 0) {
    return fallbackSections(grid, timeCol, fromRow, toRow, facility, nameColStart);
  }

  markers.sort((a, b) => a.row - b.row);
  const sections: Partial<Record<Level, { timeBlocks: { slot: string; rows: number[] }[] }>> = {};
  for (let i = 0; i < markers.length; i++) {
    const end = i + 1 < markers.length ? markers[i + 1].row - 1 : toRow;
    sections[markers[i].level] = {
      timeBlocks: collectTimeBlocks(grid, timeCol, markers[i].row + 1, end, nameColStart),
    };
  }
  return sections;
}

function timeMatches(a: string, b: string): boolean {
  if (normalizeTime(a) === normalizeTime(b)) return true;
  const ma = a.match(/(\d{1,2}):(\d{2})/);
  const mb = b.match(/(\d{1,2}):(\d{2})/);
  if (!ma || !mb) return false;
  const sa = parseInt(ma[1], 10) * 60 + parseInt(ma[2], 10);
  const sb = parseInt(mb[1], 10) * 60 + parseInt(mb[2], 10);
  return Math.abs(sa - sb) <= 60;
}

function buildTemplateIndex(grid: string[][]): Map<string, { row: number; nameCol: number }[]> {
  const index = new Map<string, { row: number; nameCol: number }[]>();

  for (const fac of FACILITY_ANCHORS) {
    const anchorCol = findAnchorCol(grid, fac.text, fac.minCol);
    if (anchorCol < 0) continue;

    const regionStart = Math.max(0, anchorCol - 2);
    const regionEnd = Math.min(grid[0]?.length ?? 40, anchorCol + 16);
    const fromRow = 3;
    const toRow = Math.min(grid.length - 1, 80);

    const timeCol = detectTimeCol(grid, regionStart, regionEnd, fromRow, toRow);
    const nameColStart = timeCol + 2;
    const sections = findLevelSections(grid, timeCol, regionStart, fromRow, toRow, fac.id, nameColStart);

    for (const level of LEVEL_ORDER) {
      const section = sections[level];
      if (!section) continue;
      for (const block of section.timeBlocks) {
        for (const row of block.rows) {
          for (let day = 0; day < 7; day++) {
            const nameCol = nameColStart + day * 2;
            const classCol = nameCol + 1;
            const classVal = (grid[row]?.[classCol] ?? '').trim();
            if (!looksLikeClass(classVal)) continue;
            const key = `${fac.id}|${level}|${day}|${normalizeTime(block.slot)}|${compactClass(classVal)}`;
            const list = index.get(key) ?? [];
            list.push({ row, nameCol });
            index.set(key, list);
          }
        }
      }
    }
  }

  return index;
}

function findCell(
  grid: string[][],
  index: Map<string, { row: number; nameCol: number }[]>,
  facility: Facility,
  level: Level,
  day: DayOfWeek,
  slot: string,
  className: string,
  classLabel: string,
  used: Set<string>,
): { row: number; nameCol: number } | null {
  const nameCompact = compactClass(className);
  const labelCompact = compactClass(classLabel);

  for (const [key, list] of index) {
    const parts = key.split('|');
    if (parts.length < 5) continue;
    if (parts[0] !== facility || parts[1] !== level || parseInt(parts[2], 10) !== day) continue;
    if (!timeMatches(parts[3], slot)) continue;

    for (const hit of list) {
      const cellKey = `${hit.row}:${hit.nameCol}`;
      if (used.has(cellKey)) continue;
      const classVal = (grid[hit.row]?.[hit.nameCol + 1] ?? '').trim();
      if (classMatches(classVal, className, classLabel)) {
        used.add(cellKey);
        return hit;
      }
      const keyClass = parts[4];
      if (
        keyClass === nameCompact ||
        keyClass === labelCompact ||
        keyClass.startsWith(nameCompact) ||
        nameCompact.startsWith(keyClass)
      ) {
        used.add(cellKey);
        return hit;
      }
    }
  }
  return null;
}

function buildScannedIndex(
  cells: ScannedTemplateCell[],
): Map<string, { row: number; nameCol: number }[]> {
  const index = new Map<string, { row: number; nameCol: number }[]>();
  for (const cell of cells) {
    const key = `${cell.facility}|${cell.level}|${cell.day}|${normalizeTime(cell.slot)}|${compactClass(cell.classCode)}`;
    const list = index.get(key) ?? [];
    list.push({ row: cell.row, nameCol: cell.nameCol });
    index.set(key, list);
  }
  return index;
}

function findScannedCell(
  index: Map<string, { row: number; nameCol: number }[]>,
  facility: Facility,
  level: Level,
  day: DayOfWeek,
  slot: string,
  className: string,
  classLabel: string,
  used: Set<string>,
): { row: number; nameCol: number } | null {
  const nameCompact = compactClass(className);
  const labelCompact = compactClass(classLabel);

  for (const [key, list] of index) {
    const parts = key.split('|');
    if (parts.length < 5) continue;
    if (parts[0] !== facility || parts[1] !== level || parseInt(parts[2], 10) !== day) continue;
    if (!timeMatches(parts[3], slot)) continue;

    for (const hit of list) {
      const cellKey = `${hit.row}:${hit.nameCol}`;
      if (used.has(cellKey)) continue;
      const keyClass = parts[4];
      if (
        keyClass === nameCompact ||
        keyClass === labelCompact ||
        keyClass.startsWith(nameCompact) ||
        nameCompact.startsWith(keyClass)
      ) {
        used.add(cellKey);
        return hit;
      }
    }
  }
  return null;
}

export function fillFromScannedCells(
  cells: ScannedTemplateCell[],
  shifts: Shift[],
  result: ScheduleResult,
): Omit<FillTemplateResult, 'grid'> {
  const index = buildScannedIndex(cells);
  const updates: CellUpdate[] = [];
  const used = new Set<string>();
  const missSamples: string[] = [];
  let matched = 0;
  let missed = 0;

  for (const shift of shifts) {
    const staff = result.assignments.find((a) => a.shiftId === shift.id)?.staffIds ?? [];
    if (staff.length === 0) continue;

    const slot = getShiftTimeSlot(shift);
    if (!slot) continue;

    const classLabel = formatClassLabel(shift);
    const names = staff.map((n) => n.toUpperCase()).join(', ');
    const hit = findScannedCell(
      index,
      shift.facility,
      shift.level,
      shift.day,
      slot.label,
      shift.className,
      classLabel,
      used,
    );

    if (!hit) {
      missed++;
      if (missSamples.length < 3) {
        missSamples.push(
          `${FACILITY_LABELS[shift.facility]} ${LEVEL_LABELS[shift.level]} ${shift.day} ${slot.label} ${classLabel}`,
        );
      }
      continue;
    }

    matched++;
    updates.push({
      row: hit.row,
      col: hit.nameCol,
      a1: `${colToA1(hit.nameCol - 1)}${hit.row}`,
      value: names,
    });
  }

  return { updates, matched, missed, missSamples };
}

export function fillFromSheetGrid(
  grid: string[][],
  shifts: Shift[],
  result: ScheduleResult,
): Omit<FillTemplateResult, 'grid'> {
  return fillGridTemplate(grid, shifts, result);
}

function fillGridTemplate(
  grid: string[][],
  shifts: Shift[],
  result: ScheduleResult,
): Omit<FillTemplateResult, 'grid'> {
  const index = buildTemplateIndex(grid);
  const updates: CellUpdate[] = [];
  const used = new Set<string>();
  const missSamples: string[] = [];
  let matched = 0;
  let missed = 0;

  for (const shift of shifts) {
    const staff = result.assignments.find((a) => a.shiftId === shift.id)?.staffIds ?? [];
    if (staff.length === 0) continue;

    const slot = getShiftTimeSlot(shift);
    if (!slot) continue;

    const classLabel = formatClassLabel(shift);
    const names = staff.map((n) => n.toUpperCase()).join(', ');
    const hit = findCell(
      grid,
      index,
      shift.facility,
      shift.level,
      shift.day,
      slot.label,
      shift.className,
      classLabel,
      used,
    );

    if (!hit) {
      missed++;
      if (missSamples.length < 3) {
        missSamples.push(
          `${FACILITY_LABELS[shift.facility]} ${LEVEL_LABELS[shift.level]} ${shift.day} ${slot.label} ${classLabel}`,
        );
      }
      continue;
    }

    matched++;
    updates.push({
      row: hit.row + 1,
      col: hit.nameCol + 1,
      a1: toA1(hit.row, hit.nameCol),
      value: names,
    });
  }

  return { updates, matched, missed, missSamples };
}

export function countTemplateCells(grid: string[][]): number {
  const index = buildTemplateIndex(grid);
  return [...index.values()].reduce((n, list) => n + list.length, 0);
}

export function validateSheetGrid(grid: string[][]): { ok: boolean; indexSize: number; message: string } {
  const size = countTemplateCells(grid);
  if (size < 20) {
    return {
      ok: false,
      indexSize: size,
      message: `Sheet chỉ nhận ${size} ô mã lớp — kiểm tra tab TUẦN có đủ layout CS1 + CS2.`,
    };
  }
  return { ok: true, indexSize: size, message: `OK: ${size} ô mã lớp trên Sheet.` };
}

export function fillCsvTemplate(
  csvText: string,
  shifts: Shift[],
  result: ScheduleResult,
): FillTemplateResult {
  const grid = parseCsv(csvText);
  const filled = fillGridTemplate(grid, shifts, result);
  for (const u of filled.updates) {
    grid[u.row - 1][u.col - 1] = u.value;
  }
  return { grid, ...filled };
}

export function filledCsvToText(result: FillTemplateResult): string {
  return serializeCsv(result.grid);
}

/** Kiểm tra template CSV có đọc được layout không */
export function validateCsvTemplate(csvText: string): { ok: boolean; indexSize: number; message: string } {
  return validateSheetGrid(parseCsv(csvText));
}

export function buildCellUpdatesPayload(
  updates: CellUpdate[],
  weekTabHint: string,
): { weekTabHint: string; updates: { row: number; col: number; value: string }[] } {
  return {
    weekTabHint,
    updates: updates.map((u) => ({ row: u.row, col: u.col, value: u.value })),
  };
}
