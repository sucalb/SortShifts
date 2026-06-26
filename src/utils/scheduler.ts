import type { Assignment, Shift, StaffMember } from '../types';
import { countEligibleStaff, isStaffAvailableForShift, shiftsConflict } from './timeUtils';

export interface ScheduleResult {
  assignments: Assignment[];
  unfulfilled: { shift: Shift; missing: number }[];
  stats: {
    totalShifts: number;
    totalSlotsNeeded: number;
    totalSlotsFilled: number;
  };
}

function isStaffAssignedToConflictingShift(
  staffId: string,
  shift: Shift,
  assignments: Assignment[],
  shifts: Shift[],
): boolean {
  const assignedShiftIds = assignments
    .filter((a) => a.staffIds.includes(staffId))
    .map((a) => a.shiftId);

  return assignedShiftIds.some((assignedId) => {
    const assignedShift = shifts.find((s) => s.id === assignedId);
    return assignedShift && shiftsConflict(shift, assignedShift);
  });
}

function getAssignedCount(shiftId: string, assignments: Assignment[]): number {
  return assignments.find((a) => a.shiftId === shiftId)?.staffIds.length ?? 0;
}

export function autoSchedule(shifts: Shift[], staff: StaffMember[]): ScheduleResult {
  const assignments: Assignment[] = [];
  const sortedShifts = [...shifts].sort((a, b) => {
    const eligibleA = countEligibleStaff(staff, a);
    const eligibleB = countEligibleStaff(staff, b);
    if (eligibleA !== eligibleB) return eligibleA - eligibleB;
    return b.staffNeeded - a.staffNeeded;
  });

  for (const shift of sortedShifts) {
    const needed = shift.staffNeeded;
    const assigned: string[] = [];

    const candidates = staff
      .filter(
        (s) =>
          isStaffAvailableForShift(s, shift) &&
          !isStaffAssignedToConflictingShift(s.id, shift, assignments, shifts),
      )
      .sort((a, b) => {
        const loadA = assignments.reduce(
          (sum, asn) => sum + (asn.staffIds.includes(a.id) ? 1 : 0),
          0,
        );
        const loadB = assignments.reduce(
          (sum, asn) => sum + (asn.staffIds.includes(b.id) ? 1 : 0),
          0,
        );
        return loadA - loadB;
      });

    for (const candidate of candidates) {
      if (assigned.length >= needed) break;
      if (assigned.includes(candidate.id)) continue;
      assigned.push(candidate.id);
    }

    if (assigned.length > 0) {
      assignments.push({ shiftId: shift.id, staffIds: assigned });
    }
  }

  const unfulfilled = shifts
    .map((shift) => {
      const filled = getAssignedCount(shift.id, assignments);
      const missing = shift.staffNeeded - filled;
      return missing > 0 ? { shift, missing } : null;
    })
    .filter((x): x is { shift: Shift; missing: number } => x !== null);

  const totalSlotsNeeded = shifts.reduce((sum, s) => sum + s.staffNeeded, 0);
  const totalSlotsFilled = assignments.reduce((sum, a) => sum + a.staffIds.length, 0);

  return {
    assignments,
    unfulfilled,
    stats: {
      totalShifts: shifts.length,
      totalSlotsNeeded,
      totalSlotsFilled,
    },
  };
}
