import type { Assignment, Shift, TeacherFixedTaMap } from '../types';
import { getFixedTasForShift } from './fixedTa';
import {
  getEligibleNamesForShift,
  getRegisteredNamesForSlot,
  type RegistrationGrid,
} from './registrationUtils';
import {
  DEFAULT_ADJACENT_GAP_MINUTES,
  getShiftInterval,
  groupIntoBlocks,
  isAdjacentRange,
  type ShiftInterval,
} from './shiftContiguity';
import { isSlotRegistrable, type SlotOverrides } from './slotAccess';
import { getActiveRegistrationSlots } from './slotCatalog';

/** Vì sao ca này bị xếp lẻ, không ghép được với ca nào liền kề. */
export type LoneShiftReason =
  | 'no-registration'
  | 'no-adjacent-shift'
  | 'adjacent-reserved'
  | 'adjacent-full'
  | 'adjacent-open';

export const LONE_SHIFT_REASON_LABELS: Record<LoneShiftReason, string> = {
  'no-registration': 'TG không đăng ký khung liền kề',
  'no-adjacent-shift': 'Khung liền kề không có lớp nào',
  'adjacent-reserved': 'Ca liền kề dành cho TG cố định',
  'adjacent-full': 'Ca liền kề đã đủ người',
  'adjacent-open': 'Ca liền kề còn trống — có thể ghép thêm',
};

/** Chỉ 'adjacent-open' là còn sửa được; các lý do khác là hết cách. */
export function isForcedReason(reason: LoneShiftReason): boolean {
  return reason !== 'adjacent-open';
}

export interface LoneShiftEntry {
  name: string;
  shift: Shift;
  reason: LoneShiftReason;
  /** Các ca sát giờ mà TG này có đăng ký — dùng để giải thích thêm */
  adjacentShifts: Shift[];
}

export interface LoneShiftReport {
  entries: LoneShiftEntry[];
  /** Số ca lẻ không còn cách nào ghép */
  forcedCount: number;
  /** Số ca lẻ vẫn còn chỗ ghép thủ công */
  fixableCount: number;
  /** Số TG bị dính ca lẻ */
  affectedTaCount: number;
}

/**
 * Tìm những ca mà TG bị xếp đứng một mình trong ngày (không nối với ca nào
 * liền kề), kèm lý do — để biết ca nào thật sự hết lựa chọn và ca nào còn
 * ghép lại được bằng tay.
 */
export function analyzeLoneShifts(
  assignments: Assignment[],
  shifts: Shift[],
  registrationGrid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
  fixedTaMap: TeacherFixedTaMap = {},
  gapMinutes: number = DEFAULT_ADJACENT_GAP_MINUTES,
): LoneShiftReport {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const intervalByShift = new Map<string, ShiftInterval>();
  const shiftsByDay = new Map<number, Shift[]>();

  for (const shift of shifts) {
    const interval = getShiftInterval(shift);
    if (!interval) continue;
    intervalByShift.set(shift.id, interval);
    const list = shiftsByDay.get(shift.day);
    if (list) list.push(shift);
    else shiftsByDay.set(shift.day, [shift]);
  }

  const eligibleByShift = new Map<string, Set<string>>();
  const fixedShiftsByName = new Map<string, Set<string>>();
  const filledByShift = new Map<string, number>();

  for (const shift of shifts) {
    eligibleByShift.set(
      shift.id,
      new Set(getEligibleNamesForShift(shift, registrationGrid, slotOverrides)),
    );
    for (const name of getFixedTasForShift(shift, fixedTaMap)) {
      const set = fixedShiftsByName.get(name);
      if (set) set.add(shift.id);
      else fixedShiftsByName.set(name, new Set([shift.id]));
    }
  }

  const intervalsByTa = new Map<string, ShiftInterval[]>();
  for (const asn of assignments) {
    filledByShift.set(asn.shiftId, asn.staffIds.length);
    const interval = intervalByShift.get(asn.shiftId);
    if (!interval) continue;
    for (const name of asn.staffIds) {
      const list = intervalsByTa.get(name);
      if (list) list.push(interval);
      else intervalsByTa.set(name, [interval]);
    }
  }

  /** TG bị giữ chỗ cho một ca cố định khác thì không thể ghép vào ca này. */
  const isReservedForOther = (name: string, shiftId: string): boolean => {
    const set = fixedShiftsByName.get(name);
    if (!set) return false;
    for (const id of set) {
      if (id !== shiftId) return true;
    }
    return false;
  };

  const registrationSlots = getActiveRegistrationSlots();

  /** TG có đăng ký khung giờ nào sát với ca này trong ngày không. */
  const hasAdjacentRegistration = (name: string, interval: ShiftInterval): boolean => {
    const key = name.toLowerCase();
    return registrationSlots.some(
      (slot) =>
        isSlotRegistrable(slotOverrides, interval.day, slot.id) &&
        isAdjacentRange(slot, interval, gapMinutes) &&
        getRegisteredNamesForSlot(registrationGrid, interval.day, slot.id).some(
          (n) => n.toLowerCase() === key,
        ),
    );
  };

  const entries: LoneShiftEntry[] = [];

  for (const [name, intervals] of intervalsByTa) {
    for (const block of groupIntoBlocks(intervals, gapMinutes)) {
      if (block.intervals.length !== 1) continue;

      const interval = block.intervals[0];
      const shift = shiftById.get(interval.shiftId);
      if (!shift) continue;

      // Các ca sát giờ mà TG này đủ điều kiện làm.
      const adjacentShifts = (shiftsByDay.get(shift.day) ?? []).filter((other) => {
        if (other.id === shift.id) return false;
        const otherInterval = intervalByShift.get(other.id);
        if (!otherInterval) return false;
        if (!isAdjacentRange(otherInterval, interval, gapMinutes)) return false;
        return eligibleByShift.get(other.id)?.has(name) === true;
      });

      let reason: LoneShiftReason;
      if (adjacentShifts.length === 0) {
        reason = hasAdjacentRegistration(name, interval)
          ? 'no-adjacent-shift'
          : 'no-registration';
      } else {
        const openShifts = adjacentShifts.filter(
          (other) =>
            (filledByShift.get(other.id) ?? 0) < other.staffNeeded &&
            !isReservedForOther(name, other.id) &&
            getFixedTasForShift(other, fixedTaMap).length === 0,
        );
        const allowedShifts = adjacentShifts.filter(
          (other) =>
            !isReservedForOther(name, other.id) &&
            getFixedTasForShift(other, fixedTaMap).length === 0,
        );

        if (openShifts.length > 0) reason = 'adjacent-open';
        else if (allowedShifts.length > 0) reason = 'adjacent-full';
        else reason = 'adjacent-reserved';
      }

      entries.push({ name, shift, reason, adjacentShifts });
    }
  }

  entries.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'vi') ||
      a.shift.day - b.shift.day ||
      (intervalByShift.get(a.shift.id)?.start ?? 0) -
        (intervalByShift.get(b.shift.id)?.start ?? 0),
  );

  const fixableCount = entries.filter((e) => !isForcedReason(e.reason)).length;

  return {
    entries,
    forcedCount: entries.length - fixableCount,
    fixableCount,
    affectedTaCount: new Set(entries.map((e) => e.name)).size,
  };
}
