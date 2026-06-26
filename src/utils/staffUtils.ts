import type { DayOfWeek, StaffMember } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import { REGISTRATION_SLOTS } from '../data/constants';
import { isSlotRegistrable, type SlotOverrides } from './slotAccess';

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

export function parseRosterText(text: string): TeachingAssistant[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fullName, abbreviation] = line.split('|').map((s) => s.trim());
      return { fullName, abbreviation: abbreviation || fullName };
    });
}

export function rosterToText(roster: TeachingAssistant[]): string {
  return roster.map((ta) => `${ta.fullName} | ${ta.abbreviation}`).join('\n');
}

export function createStaffMember(name: string, abbreviation?: string): StaffMember {
  return {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    abbreviation,
    availability: createEmptyAvailability(),
  };
}

export function createStaffFromTA(ta: TeachingAssistant): StaffMember {
  return createStaffMember(ta.fullName, ta.abbreviation);
}

export function getStaffDisplayName(member: StaffMember): string {
  return member.abbreviation || member.name;
}

export function countRegisteredShifts(
  member: StaffMember,
  slotOverrides?: SlotOverrides,
): number {
  let count = 0;
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  for (const day of days) {
    for (const slot of REGISTRATION_SLOTS) {
      if (!isSlotRegistrable(slotOverrides, day, slot.id)) continue;
      if (member.availability[day]?.[slot.id]) count++;
    }
  }
  return count;
}

export function findStaffForTA(staff: StaffMember[], ta: TeachingAssistant): StaffMember | undefined {
  return staff.find(
    (s) =>
      s.name.trim().toLowerCase() === ta.fullName.toLowerCase() ||
      (s.abbreviation && s.abbreviation.toLowerCase() === ta.abbreviation.toLowerCase()),
  );
}
