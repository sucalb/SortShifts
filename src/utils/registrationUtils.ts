import type { DayOfWeek, Shift, TimeSlot } from '../types';
import { isSlotRegistrable, type SlotOverrides } from './slotAccess';
import { getShiftTimeSlot, timeOverlaps } from './timeUtils';
import { getActiveRegistrationSlots } from './slotCatalog';
import type { TeachingAssistant } from '../data/teachingAssistants';

export type RegistrationGrid = Partial<Record<DayOfWeek, Record<string, string>>>;

export function createEmptyRegistrationGrid(
  slots: TimeSlot[] = getActiveRegistrationSlots(),
): RegistrationGrid {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  return Object.fromEntries(
    days.map((d) => [d, Object.fromEntries(slots.map((s) => [s.id, '']))]),
  ) as RegistrationGrid;
}

/** Thêm key cho slot mới, giữ dữ liệu cũ. */
export function ensureRegistrationGridSlots(
  grid: RegistrationGrid,
  slots: TimeSlot[],
): RegistrationGrid {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const next: RegistrationGrid = {};
  for (const day of days) {
    const dayGrid: Record<string, string> = { ...(grid[day] ?? {}) };
    for (const slot of slots) {
      if (dayGrid[slot.id] === undefined) dayGrid[slot.id] = '';
    }
    next[day] = dayGrid;
  }
  return next;
}

export function removeRegistrationSlotFromGrid(
  grid: RegistrationGrid,
  slotId: string,
): RegistrationGrid {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const next: RegistrationGrid = {};
  for (const day of days) {
    const dayGrid = { ...(grid[day] ?? {}) };
    delete dayGrid[slotId];
    next[day] = dayGrid;
  }
  return next;
}

export function parseRegisteredNames(text: string): string[] {
  return text
    .split(/[,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/** Chuẩn hóa tên TG đọc từ Sheet về ký hiệu trong roster. */
export function normalizeStaffNames(names: string[], roster: TeachingAssistant[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of names) {
    const key = raw.trim();
    if (!key) continue;
    const upper = key.toUpperCase();
    const ta = roster.find(
      (t) => t.abbreviation.toUpperCase() === upper || t.fullName.toUpperCase() === upper,
    );
    const normalized = ta?.abbreviation ?? key;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(normalized);
  }

  return result;
}

export function getCellText(
  grid: RegistrationGrid | undefined,
  day: DayOfWeek,
  slotId: string,
): string {
  return grid?.[day]?.[slotId] ?? '';
}

export function getRegisteredNamesForSlot(
  grid: RegistrationGrid | undefined,
  day: DayOfWeek,
  slotId: string,
): string[] {
  return parseRegisteredNames(getCellText(grid, day, slotId));
}

export function getEligibleNamesForShift(
  shift: Shift,
  grid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
  registrationSlots: TimeSlot[] = getActiveRegistrationSlots(),
): string[] {
  const shiftSlot = getShiftTimeSlot(shift);
  if (!shiftSlot) return [];

  const names = new Set<string>();
  for (const regSlot of registrationSlots) {
    if (!isSlotRegistrable(slotOverrides, shift.day, regSlot.id)) continue;
    if (!timeOverlaps(shiftSlot, regSlot)) continue;
    for (const name of getRegisteredNamesForSlot(grid, shift.day, regSlot.id)) {
      names.add(name);
    }
  }
  return [...names];
}

export function countTARegistrations(
  grid: RegistrationGrid | undefined,
  slotOverrides: SlotOverrides | undefined,
  taName: string,
  registrationSlots: TimeSlot[] = getActiveRegistrationSlots(),
): number {
  let count = 0;
  const key = taName.toLowerCase();
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  for (const day of days) {
    for (const slot of registrationSlots) {
      if (!isSlotRegistrable(slotOverrides, day, slot.id)) continue;
      const names = getRegisteredNamesForSlot(grid, day, slot.id);
      if (names.some((n) => n.toLowerCase() === key)) count++;
    }
  }
  return count;
}
