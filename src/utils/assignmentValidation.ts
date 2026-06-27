import type { Assignment, Shift } from '../types';
import { DAY_LABELS } from '../data/constants';
import { getEligibleNamesForShift, type RegistrationGrid } from './registrationUtils';
import type { SlotOverrides } from './slotAccess';
import { getShiftTimeSlot, shiftsConflict } from './timeUtils';

export interface AssignmentWarning {
  type: 'conflict' | 'not_registered' | 'over_capacity';
  message: string;
}

export function isNameAssignedToConflictingShift(
  name: string,
  shift: Shift,
  assignments: Assignment[],
  shifts: Shift[],
  excludeShiftId?: string,
): boolean {
  for (const asn of assignments) {
    if (asn.shiftId === excludeShiftId) continue;
    if (!asn.staffIds.includes(name)) continue;
    const other = shifts.find((s) => s.id === asn.shiftId);
    if (other && shiftsConflict(shift, other)) return true;
  }
  return false;
}

export function getAssignmentWarnings(
  shift: Shift,
  staffIds: string[],
  allAssignments: Assignment[],
  shifts: Shift[],
  registrationGrid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];
  const eligible = new Set(getEligibleNamesForShift(shift, registrationGrid, slotOverrides));
  const slot = getShiftTimeSlot(shift);

  if (staffIds.length > shift.staffNeeded) {
    warnings.push({
      type: 'over_capacity',
      message: `Vượt số người cần (${staffIds.length}/${shift.staffNeeded})`,
    });
  }

  for (const name of staffIds) {
    if (!eligible.has(name)) {
      warnings.push({
        type: 'not_registered',
        message: `${name}: chưa đăng ký ca ${DAY_LABELS[shift.day]} ${slot?.label ?? ''}`,
      });
    }
    if (isNameAssignedToConflictingShift(name, shift, allAssignments, shifts, shift.id)) {
      warnings.push({
        type: 'conflict',
        message: `${name}: trùng ca với lịch khác cùng khung giờ`,
      });
    }
  }

  const dupes = staffIds.filter((n, i) => staffIds.indexOf(n) !== i);
  for (const name of [...new Set(dupes)]) {
    warnings.push({ type: 'conflict', message: `${name}: bị gán trùng trong cùng ca` });
  }

  return warnings;
}

export function hasBlockingWarnings(warnings: AssignmentWarning[]): boolean {
  return warnings.some((w) => w.type === 'conflict' || w.type === 'over_capacity');
}
