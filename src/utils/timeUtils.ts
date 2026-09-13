import type { Shift, StaffMember, TimeSlot } from '../types';
import { isSlotRegistrable, type SlotOverrides } from './slotAccess';
import {
  findTimeSlotById,
  getActiveRegistrationSlots,
} from './slotCatalog';

export function timeOverlaps(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

export function getTimeSlotById(slotId: string): TimeSlot | undefined {
  return findTimeSlotById(slotId);
}

export function getShiftTimeSlot(shift: Shift): TimeSlot | undefined {
  return getTimeSlotById(shift.timeSlotId);
}

/**
 * Hai ca chồng nhau không quá chừng này (phút) vẫn không tính là trùng giờ.
 * Khung trên Sheet hay ghi lệch, vd. 9:00-10:30 và 10:00-12:00 — trên thực tế
 * vẫn làm nối được, báo trùng ở đây chỉ gây nhiễu.
 */
export const SHIFT_OVERLAP_TOLERANCE_MINUTES = 30;

/** Số phút hai khoảng thời gian đè lên nhau (<= 0 là không đè). */
export function overlapMinutes(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start);
}

export function shiftsConflict(a: Shift, b: Shift): boolean {
  if (a.day !== b.day) return false;
  const slotA = getShiftTimeSlot(a);
  const slotB = getShiftTimeSlot(b);
  if (!slotA || !slotB) return false;
  return overlapMinutes(slotA, slotB) > SHIFT_OVERLAP_TOLERANCE_MINUTES;
}

export function isStaffAvailableForShift(
  staff: StaffMember,
  shift: Shift,
  slotOverrides?: SlotOverrides,
): boolean {
  const shiftSlot = getShiftTimeSlot(shift);
  if (!shiftSlot) return false;

  const dayAvail = staff.availability[shift.day];
  if (!dayAvail) return false;

  return getActiveRegistrationSlots().some(
    (regSlot) =>
      isSlotRegistrable(slotOverrides, shift.day, regSlot.id) &&
      dayAvail[regSlot.id] &&
      timeOverlaps(shiftSlot, regSlot),
  );
}

export function countEligibleStaff(
  staff: StaffMember[],
  shift: Shift,
  slotOverrides?: SlotOverrides,
): number {
  return staff.filter((s) => isStaffAvailableForShift(s, shift, slotOverrides)).length;
}
