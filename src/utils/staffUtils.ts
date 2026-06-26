import type { DayOfWeek, Shift, StaffMember } from '../types';

export function createEmptyAvailability(): Record<DayOfWeek, Record<string, boolean>> {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const slots = ['reg-0', 'reg-1', 'reg-2', 'reg-3', 'reg-4', 'reg-5', 'reg-6'];
  return Object.fromEntries(
    days.map((d) => [d, Object.fromEntries(slots.map((s) => [s, false]))]),
  ) as Record<DayOfWeek, Record<string, boolean>>;
}

export function parseNamesList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

export function extractNamesFromShifts(shifts: Shift[]): string[] {
  const names = new Set<string>();
  for (const shift of shifts) {
    if (!shift.teacher) continue;
    for (const part of shift.teacher.split(/[,/&]+/)) {
      const name = part.trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function mergeRoster(roster: string[], shifts: Shift[]): string[] {
  const merged = new Set([...roster, ...extractNamesFromShifts(shifts)]);
  return [...merged].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function createStaffMember(name: string): StaffMember {
  return {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    availability: createEmptyAvailability(),
  };
}
