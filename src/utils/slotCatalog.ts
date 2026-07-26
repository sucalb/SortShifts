import {
  REGISTRATION_SLOTS as DEFAULT_REGISTRATION_SLOTS,
  SCHEDULE_SLOTS as DEFAULT_SCHEDULE_SLOTS,
} from '../data/constants';
import type { TimeSlot } from '../types';

export type ScheduleSlotsMap = Record<string, TimeSlot[]>;

let activeRegistrationSlots: TimeSlot[] = DEFAULT_REGISTRATION_SLOTS;
let activeScheduleSlots: ScheduleSlotsMap = DEFAULT_SCHEDULE_SLOTS;

export function getDefaultRegistrationSlots(): TimeSlot[] {
  return DEFAULT_REGISTRATION_SLOTS.map((s) => ({ ...s }));
}

export function getDefaultScheduleSlots(): ScheduleSlotsMap {
  return Object.fromEntries(
    Object.entries(DEFAULT_SCHEDULE_SLOTS).map(([key, slots]) => [
      key,
      slots.map((s) => ({ ...s })),
    ]),
  );
}

export function setActiveSlotCatalogs(
  registrationSlots: TimeSlot[],
  scheduleSlots: ScheduleSlotsMap,
) {
  activeRegistrationSlots = registrationSlots;
  activeScheduleSlots = scheduleSlots;
}

export function getActiveRegistrationSlots(): TimeSlot[] {
  return activeRegistrationSlots;
}

export function getActiveScheduleSlots(): ScheduleSlotsMap {
  return activeScheduleSlots;
}

export function getScheduleSlotsForKey(
  key: string,
  scheduleSlots: ScheduleSlotsMap = activeScheduleSlots,
): TimeSlot[] {
  return scheduleSlots[key] ?? DEFAULT_SCHEDULE_SLOTS[key] ?? [];
}

export function findTimeSlotById(
  slotId: string,
  registrationSlots: TimeSlot[] = activeRegistrationSlots,
  scheduleSlots: ScheduleSlotsMap = activeScheduleSlots,
): TimeSlot | undefined {
  for (const slots of Object.values(scheduleSlots)) {
    const found = slots.find((s) => s.id === slotId);
    if (found) return found;
  }
  for (const slots of Object.values(DEFAULT_SCHEDULE_SLOTS)) {
    const found = slots.find((s) => s.id === slotId);
    if (found) return found;
  }
  return (
    registrationSlots.find((s) => s.id === slotId) ??
    DEFAULT_REGISTRATION_SLOTS.find((s) => s.id === slotId)
  );
}

export function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function labelFromRange(start: number, end: number): string {
  return `${formatMinutesAsTime(start)} - ${formatMinutesAsTime(end)}`;
}

export function newSlotId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sortSlotsByStart(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function normalizeSlotCatalog(
  registrationSlots?: TimeSlot[] | null,
  scheduleSlots?: ScheduleSlotsMap | null,
): { registrationSlots: TimeSlot[]; scheduleSlots: ScheduleSlotsMap } {
  const reg =
    registrationSlots && registrationSlots.length > 0
      ? sortSlotsByStart(registrationSlots.map((s) => ({ ...s })))
      : getDefaultRegistrationSlots();

  const defaults = getDefaultScheduleSlots();
  const next: ScheduleSlotsMap = { ...defaults };
  if (scheduleSlots) {
    for (const [key, slots] of Object.entries(scheduleSlots)) {
      if (Array.isArray(slots) && slots.length > 0) {
        next[key] = sortSlotsByStart(slots.map((s) => ({ ...s })));
      }
    }
  }

  return { registrationSlots: reg, scheduleSlots: next };
}
