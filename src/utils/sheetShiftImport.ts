import type { Shift, TimeSlot } from '../types';
import type { ScannedShift, SheetShiftScan } from './csvTemplateFill';
import { getScheduleKey } from '../data/constants';
import {
  labelFromRange,
  newSlotId,
  parseTimeInput,
  sortSlotsByStart,
  type ScheduleSlotsMap,
} from './slotCatalog';

export interface ImportedSchedule {
  shifts: Shift[];
  scheduleSlots: ScheduleSlotsMap;
  stats: {
    /** Ca đã có, cùng ngày giờ — giữ nguyên số TG cần và TG cố định */
    kept: number;
    /** Lớp đã có nhưng đổi ngày/giờ trên Sheet — cấu hình đi theo lớp */
    moved: number;
    /** Ca mới xuất hiện trên Sheet */
    added: number;
    /** Ca trong app không còn trên Sheet — sẽ bị bỏ */
    removed: number;
    /** Khung giờ đọc được từ Sheet */
    slots: number;
  };
}

/** "7:00 - 9:00" -> { start: 420, end: 540 } */
function parseSlotLabel(label: string): { start: number; end: number } | null {
  const parts = label.split(/[-–—]/);
  if (parts.length < 2) return null;
  const start = parseTimeInput(parts[0]);
  const end = parseTimeInput(parts[1]);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** Khoá nhận dạng một ca, không phụ thuộc id — để ghép ca cũ với ca đọc về. */
function shiftIdentity(
  facility: string,
  level: string,
  day: number,
  start: number,
  className: string,
): string {
  return [facility, level, day, start, className.toUpperCase().replace(/[\s.]/g, '')].join('|');
}

/**
 * Dựng lại cấu hình ca từ lưới Sheet.
 *
 * Số TG cần và TG cố định là thứ chỉ có trong app, Sheet không biết — nên ca
 * nào đã có thì giữ nguyên hai giá trị đó cùng với id, chỉ ca mới mới nhận
 * mặc định. Nhờ vậy đồng bộ lại không xoá mất công cấu hình.
 */
export function buildScheduleFromSheetGrid(
  scan: SheetShiftScan,
  existingShifts: Shift[],
  existingScheduleSlots: ScheduleSlotsMap,
): ImportedSchedule {
  // 1. Khung giờ cho từng khối, tái dùng id cũ nếu trùng giờ
  const scheduleSlots: ScheduleSlotsMap = { ...existingScheduleSlots };
  const slotByKeyLabel = new Map<string, TimeSlot>();
  let slotCount = 0;

  for (const [key, labels] of Object.entries(scan.slotLabelsByKey)) {
    const previous = existingScheduleSlots[key] ?? [];
    const slots: TimeSlot[] = [];

    for (const label of labels) {
      const range = parseSlotLabel(label);
      if (!range) continue;
      const reused = previous.find((s) => s.start === range.start && s.end === range.end);
      const slot: TimeSlot = reused
        ? { ...reused }
        : {
            id: newSlotId(key),
            label: labelFromRange(range.start, range.end),
            start: range.start,
            end: range.end,
          };
      slots.push(slot);
      slotByKeyLabel.set(`${key}|${label}`, slot);
      slotCount++;
    }

    if (slots.length > 0) scheduleSlots[key] = sortSlotsByStart(slots);
  }

  // 2. Ca cũ: tra theo đúng ngày giờ, và theo lớp để bắt lớp dời lịch
  const slotStartOf = (shift: Shift): number | null => {
    const key = getScheduleKey(shift.facility, shift.level);
    const slot = (existingScheduleSlots[key] ?? []).find((s) => s.id === shift.timeSlotId);
    return slot ? slot.start : null;
  };
  const existingByIdentity = new Map<string, Shift>();
  for (const shift of existingShifts) {
    const start = slotStartOf(shift);
    if (start === null) continue;
    existingByIdentity.set(
      shiftIdentity(shift.facility, shift.level, shift.day, start, shift.className),
      shift,
    );
  }

  // 3. Chuẩn hoá danh sách ca đọc được (bỏ trùng)
  const candidates: { scanned: ScannedShift; slot: TimeSlot; identity: string }[] = [];
  const seen = new Set<string>();
  for (const scanned of scan.shifts) {
    const key = getScheduleKey(scanned.facility, scanned.level);
    const slot = slotByKeyLabel.get(`${key}|${scanned.slotLabel}`);
    if (!slot) continue;
    const identity = shiftIdentity(
      scanned.facility,
      scanned.level,
      scanned.day,
      slot.start,
      scanned.className,
    );
    // Sheet có thể lặp cùng một lớp ở hai hàng của cùng khung giờ
    if (seen.has(identity)) continue;
    seen.add(identity);
    candidates.push({ scanned, slot, identity });
  }

  // 4. Ghép: khớp đúng ngày giờ trước, sau đó ghép theo lớp cho lớp dời lịch.
  // Số TG cần và TG cố định thuộc về lớp chứ không thuộc khung giờ — lớp đổi
  // ngày thì cấu hình phải đi theo, không thì đồng bộ lại là mất công khai báo.
  const previousFor = new Map<string, Shift>();
  const usedExisting = new Set<string>();
  let kept = 0;
  let moved = 0;
  let added = 0;

  for (const c of candidates) {
    const previous = existingByIdentity.get(c.identity);
    if (previous && !usedExisting.has(previous.id)) {
      previousFor.set(c.identity, previous);
      usedExisting.add(previous.id);
      kept++;
    }
  }

  const classKey = (facility: string, level: string, className: string) =>
    [facility, level, className.toUpperCase().replace(/[\s.]/g, '')].join('|');
  const unmatchedByClass = new Map<string, Shift[]>();
  for (const shift of existingShifts) {
    if (usedExisting.has(shift.id)) continue;
    const k = classKey(shift.facility, shift.level, shift.className);
    const list = unmatchedByClass.get(k);
    if (list) list.push(shift);
    else unmatchedByClass.set(k, [shift]);
  }

  for (const c of candidates) {
    if (previousFor.has(c.identity)) continue;
    const list = unmatchedByClass.get(
      classKey(c.scanned.facility, c.scanned.level, c.scanned.className),
    );
    const previous = list?.shift();
    if (previous) {
      previousFor.set(c.identity, previous);
      usedExisting.add(previous.id);
      moved++;
    }
  }

  const shifts: Shift[] = candidates.map(({ scanned, slot, identity }) => {
    const previous = previousFor.get(identity);
    const base = {
      facility: scanned.facility,
      level: scanned.level,
      day: scanned.day,
      timeSlotId: slot.id,
      className: scanned.className,
      ...(scanned.teacher ? { teacher: scanned.teacher } : {}),
    };
    if (previous) return { ...previous, ...base };
    added++;
    return {
      id: `sheet-${identity.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
      ...base,
      staffNeeded: 1,
    };
  });

  return {
    shifts,
    scheduleSlots,
    stats: {
      kept,
      moved,
      added,
      removed: existingShifts.filter((x) => !usedExisting.has(x.id)).length,
      slots: slotCount,
    },
  };
}
