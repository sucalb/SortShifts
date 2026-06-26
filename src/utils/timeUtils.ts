import { REGISTRATION_SLOTS, SCHEDULE_SLOTS } from '../data/constants';
import type { Shift, StaffMember, TimeSlot } from '../types';
import { isSlotRegistrable, type SlotOverrides } from './slotAccess';

export function timeOverlaps(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

export function getTimeSlotById(slotId: string): TimeSlot | undefined {
  for (const slots of Object.values(SCHEDULE_SLOTS)) {
    const found = slots.find((s) => s.id === slotId);
    if (found) return found;
  }
  return REGISTRATION_SLOTS.find((s) => s.id === slotId);
}

export function getShiftTimeSlot(shift: Shift): TimeSlot | undefined {
  return getTimeSlotById(shift.timeSlotId);
}

export function shiftsConflict(a: Shift, b: Shift): boolean {
  if (a.day !== b.day) return false;
  const slotA = getShiftTimeSlot(a);
  const slotB = getShiftTimeSlot(b);
  if (!slotA || !slotB) return false;
  return timeOverlaps(slotA, slotB);
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

  return REGISTRATION_SLOTS.some(
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
