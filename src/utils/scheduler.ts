import type { Assignment, Shift, TeacherFixedTaMap } from '../types';
import type { RegistrationGrid } from './registrationUtils';
import { countTARegistrations, getEligibleNamesForShift } from './registrationUtils';
import { getFixedTasForShift, isTaReservedForOtherShift, shiftHasFixedTaRule } from './fixedTa';
import { isNameAssignedToConflictingShift } from './assignmentValidation';
import type { SlotOverrides } from './slotAccess';
import type { TeachingAssistant } from '../data/teachingAssistants';

export interface TaShiftSummaryRow {
  abbreviation: string;
  fullName: string;
  assigned: number;
  registered: number;
}

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

function resolveTa(roster: TeachingAssistant[], name: string): TeachingAssistant | undefined {
  const key = name.toLowerCase();
  return roster.find(
    (t) => t.abbreviation.toLowerCase() === key || t.fullName.toLowerCase() === key,
  );
}

/** Đếm số slot ca đã xếp cho từng TG (theo tên/ký hiệu trong assignments). */
export function countAssignmentsByTa(assignments: Assignment[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const asn of assignments) {
    for (const name of asn.staffIds) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** Bảng tổng hợp số ca đã xếp vs đăng ký — gộp theo ký hiệu TG. */
export function buildTaShiftSummary(
  assignments: Assignment[],
  roster: TeachingAssistant[],
  registrationGrid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
): TaShiftSummaryRow[] {
  const byAbbr = new Map<string, TaShiftSummaryRow>();

  const upsert = (name: string, assignedDelta: number) => {
    const ta = resolveTa(roster, name);
    const abbr = ta?.abbreviation ?? name;
    const fullName = ta?.fullName ?? name;
    const key = abbr.toLowerCase();
    const existing = byAbbr.get(key);
    if (existing) {
      existing.assigned += assignedDelta;
      return;
    }
    byAbbr.set(key, {
      abbreviation: abbr,
      fullName,
      assigned: assignedDelta,
      registered: 0,
    });
  };

  for (const [name, count] of countAssignmentsByTa(assignments)) {
    upsert(name, count);
  }

  for (const row of byAbbr.values()) {
    row.registered =
      countTARegistrations(registrationGrid, slotOverrides, row.abbreviation) ||
      countTARegistrations(registrationGrid, slotOverrides, row.fullName);
  }

  for (const ta of roster) {
    const key = ta.abbreviation.toLowerCase();
    if (byAbbr.has(key)) continue;
    const registered =
      countTARegistrations(registrationGrid, slotOverrides, ta.abbreviation) ||
      countTARegistrations(registrationGrid, slotOverrides, ta.fullName);
    if (registered > 0) {
      byAbbr.set(key, {
        abbreviation: ta.abbreviation,
        fullName: ta.fullName,
        assigned: 0,
        registered,
      });
    }
  }

  return [...byAbbr.values()].sort(
    (a, b) =>
      b.assigned - a.assigned ||
      b.registered - a.registered ||
      a.abbreviation.localeCompare(b.abbreviation, 'vi'),
  );
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
