import type { Shift } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { ScheduleResult } from './scheduler';
import { recomputeScheduleResult } from './scheduler';
import {
  buildCellUpdatesPayload,
  countTemplateCells,
  fillFromSheetGrid,
  pullAssignmentsFromSheetGrid,
  scanShiftsFromSheetGrid,
  validateSheetGrid,
} from './csvTemplateFill';
import { buildScheduleFromSheetGrid, type ImportedSchedule } from './sheetShiftImport';
import type { ScheduleSlotsMap } from './slotCatalog';
import { buildClassColorMap } from './classColors';
import { fetchSheetGrid, weekTabHintFromStart } from './sheetsSync';

const gridCache = new Map<string, string[][]>();

export interface AutoFillPlan {
  weekTabHint: string;
  updates: { row: number; col: number; value: string }[];
  matched: number;
  missed: number;
  missSamples: string[];
  cs1: number;
  cs2: number;
  sheetTab?: string;
  templateCells?: number;
}

export async function buildAutoFillPlan(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
  webhookUrl: string,
): Promise<AutoFillPlan> {
  const weekTabHint = weekTabHintFromStart(weekStart);
  const cacheKey = `${webhookUrl.trim()}|${weekTabHint}`;

  let grid = gridCache.get(cacheKey);
  let sheetTab: string | undefined;
  let templateCells: number | undefined;

  if (!grid) {
    const scanned = await fetchSheetGrid(webhookUrl, weekTabHint);
    grid = scanned.grid;
    sheetTab = scanned.tab;
    templateCells = scanned.count;
    gridCache.set(cacheKey, grid);
    if (scanned.colorGrid?.length) {
      const colors = buildClassColorMap(scanned.grid, scanned.colorGrid);
      if (Object.keys(colors).length > 0) {
        localStorage.setItem('lich-class-colors', JSON.stringify(colors));
      }
    }
  } else {
    templateCells = countTemplateCells(grid);
  }

  const check = validateSheetGrid(grid);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const fill = fillFromSheetGrid(grid, shifts, result);
  const payload = buildCellUpdatesPayload(fill.updates, weekTabHint);
  const cs1 = fill.updates.filter((u) => u.col < 24).length;
  const cs2 = fill.updates.filter((u) => u.col >= 24).length;

  return {
    weekTabHint: payload.weekTabHint,
    updates: payload.updates,
    matched: fill.matched,
    missed: fill.missed,
    missSamples: fill.missSamples,
    cs1,
    cs2,
    sheetTab,
    templateCells,
  };
}

export async function syncClassColorsFromSheet(
  webhookUrl: string,
  weekStart: string,
): Promise<{ count: number; tab: string }> {
  const weekTabHint = weekTabHintFromStart(weekStart);
  const scanned = await fetchSheetGrid(webhookUrl, weekTabHint);
  gridCache.set(`${webhookUrl.trim()}|${weekTabHint}`, scanned.grid);
  const colors = scanned.colorGrid?.length
    ? buildClassColorMap(scanned.grid, scanned.colorGrid)
    : {};
  if (Object.keys(colors).length === 0) {
    throw new Error('Không đọc được màu lớp từ Sheet. Deploy script v17 trở lên.');
  }
  localStorage.setItem('lich-class-colors', JSON.stringify(colors));
  return { count: Object.keys(colors).length, tab: scanned.tab };
}

export function formatAutoFillPreview(plan: AutoFillPlan): string {
  const tab = plan.sheetTab ? ` · ${plan.sheetTab}` : '';
  const cells = plan.templateCells ? ` · ${plan.templateCells} ô lớp trên Sheet` : '';
  if (plan.missed > 0) {
    return `Khớp ${plan.matched} ca (CS1: ${plan.cs1}, CS2: ${plan.cs2})${tab}${cells}, ${plan.missed} ca không khớp. ${plan.missSamples.slice(0, 2).join('; ')}`;
  }
  return `Sẽ ghi ${plan.matched} ô (CS1: ${plan.cs1}, CS2: ${plan.cs2})${tab}${cells}`;
}

export interface SheetPullResult {
  result: ScheduleResult;
  tab: string;
  matched: number;
  empty: number;
  missSamples: string[];
  classColors: Record<string, string>;
}

export function formatSheetPullPreview(pull: SheetPullResult): string {
  const colorNote =
    Object.keys(pull.classColors).length > 0
      ? ` · ${Object.keys(pull.classColors).length} màu lớp`
      : '';
  const missNote =
    pull.missSamples.length > 0
      ? ` · ${pull.missSamples.length}+ ca không khớp trên Sheet`
      : '';
  return `Đọc ${pull.matched} ca từ tab ${pull.tab}${colorNote}${missNote}`;
}

/** Đồng bộ phân công TG từ Google Sheet về app (chiều Sheet → App). */
export async function syncScheduleFromSheet(
  webhookUrl: string,
  weekStart: string,
  shifts: Shift[],
  roster: TeachingAssistant[],
): Promise<SheetPullResult> {
  const weekTabHint = weekTabHintFromStart(weekStart);
  const cacheKey = `${webhookUrl.trim()}|${weekTabHint}`;
  gridCache.delete(cacheKey);

  const scanned = await fetchSheetGrid(webhookUrl, weekTabHint);
  gridCache.set(cacheKey, scanned.grid);

  const check = validateSheetGrid(scanned.grid);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const classColors = scanned.colorGrid?.length
    ? buildClassColorMap(scanned.grid, scanned.colorGrid)
    : {};

  const pull = pullAssignmentsFromSheetGrid(scanned.grid, shifts, roster);
  const { unfulfilled, stats } = recomputeScheduleResult(pull.assignments, shifts);

  return {
    result: { assignments: pull.assignments, unfulfilled, stats },
    tab: scanned.tab,
    matched: pull.matched,
    empty: pull.empty,
    missSamples: pull.missSamples,
    classColors,
  };
}

/** Đọc cấu trúc ca (lớp, GV, khung giờ) từ Sheet về app — chiều Sheet → Cấu hình ca. */
export async function syncShiftsFromSheet(
  webhookUrl: string,
  weekStart: string,
  existingShifts: Shift[],
  existingScheduleSlots: ScheduleSlotsMap,
): Promise<ImportedSchedule & { tab: string }> {
  const weekTabHint = weekTabHintFromStart(weekStart);
  const scanned = await fetchSheetGrid(webhookUrl, weekTabHint);
  gridCache.set(`${webhookUrl.trim()}|${weekTabHint}`, scanned.grid);

  const scan = scanShiftsFromSheetGrid(scanned.grid);
  if (scan.shifts.length === 0) {
    throw new Error(
      `Không đọc được ca nào từ tab ${scanned.tab}. Kiểm tra tab tuần có đủ vùng CƠ SỞ 1 / CƠ SỞ 2.`,
    );
  }

  const built = buildScheduleFromSheetGrid(scan, existingShifts, existingScheduleSlots);
  return { ...built, tab: scanned.tab };
}
