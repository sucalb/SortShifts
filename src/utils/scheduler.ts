import type { Assignment, Shift, TeacherFixedTaMap } from '../types';
import type { RegistrationGrid } from './registrationUtils';
import type { SlotOverrides } from './slotAccess';
import { getEligibleNamesForShift } from './registrationUtils';
import { getFixedTasForShift, isTaReservedForOtherShift, shiftHasFixedTaRule } from './fixedTa';
import { isNameAssignedToConflictingShift } from './assignmentValidation';

export interface ScheduleResult {
  assignments: Assignment[];
  unfulfilled: { shift: Shift; missing: number }[];
  stats: {
    totalShifts: number;
    totalSlotsNeeded: number;
    totalSlotsFilled: number;
  };
}

function getAssignedCount(shiftId: string, assignments: Assignment[]): number {
  return assignments.find((a) => a.shiftId === shiftId)?.staffIds.length ?? 0;
}

export function recomputeScheduleResult(
  assignments: Assignment[],
  shifts: Shift[],
): Pick<ScheduleResult, 'unfulfilled' | 'stats'> {
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
    unfulfilled,
    stats: {
      totalShifts: shifts.length,
      totalSlotsNeeded,
      totalSlotsFilled,
    },
  };
}

export function autoSchedule(
  shifts: Shift[],
  registrationGrid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
  fixedTaMap: TeacherFixedTaMap = {},
): ScheduleResult {
  const assignments: Assignment[] = [];
  const sortedShifts = [...shifts].sort((a, b) => {
    const eligibleA = getEligibleNamesForShift(a, registrationGrid, slotOverrides).length;
    const eligibleB = getEligibleNamesForShift(b, registrationGrid, slotOverrides).length;
    if (eligibleA !== eligibleB) return eligibleA - eligibleB;
    const fixedA = shiftHasFixedTaRule(a, fixedTaMap) ? 1 : 0;
    const fixedB = shiftHasFixedTaRule(b, fixedTaMap) ? 1 : 0;
    if (fixedA !== fixedB) return fixedB - fixedA;
    return b.staffNeeded - a.staffNeeded;
  });

  for (const shift of sortedShifts) {
    const needed = shift.staffNeeded;
    const assigned: string[] = [];
    const eligible = getEligibleNamesForShift(shift, registrationGrid, slotOverrides);
    const fixedOnly = shiftHasFixedTaRule(shift, fixedTaMap);

    for (const name of getFixedTasForShift(shift, fixedTaMap)) {
      if (assigned.length >= needed) break;
      if (!eligible.includes(name)) continue;
      if (assigned.includes(name)) continue;
      if (isNameAssignedToConflictingShift(name, shift, assignments, shifts)) continue;
      assigned.push(name);
    }

    if (!fixedOnly) {
      const candidates = eligible
        .filter((name) => !assigned.includes(name))
        .filter((name) => !isTaReservedForOtherShift(name, shift, shifts, fixedTaMap))
        .filter((name) => !isNameAssignedToConflictingShift(name, shift, assignments, shifts))
        .sort((a, b) => {
          const loadA = assignments.reduce(
            (sum, asn) => sum + (asn.staffIds.includes(a) ? 1 : 0),
            0,
          );
          const loadB = assignments.reduce(
            (sum, asn) => sum + (asn.staffIds.includes(b) ? 1 : 0),
            0,
          );
          return loadA - loadB;
        });

      for (const candidate of candidates) {
        if (assigned.length >= needed) break;
        if (assigned.includes(candidate)) continue;
        assigned.push(candidate);
      }
    }

    if (assigned.length > 0) {
      assignments.push({ shiftId: shift.id, staffIds: assigned });
    }
  }

  const { unfulfilled, stats } = recomputeScheduleResult(assignments, shifts);
  return { assignments, unfulfilled, stats };
}
