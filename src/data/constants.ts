import type { DayOfWeek, Facility, Level, TimeSlot } from '../types';

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: 'Thứ Hai',
  1: 'Thứ Ba',
  2: 'Thứ Tư',
  3: 'Thứ Năm',
  4: 'Thứ Sáu',
  5: 'Thứ Bảy',
  6: 'Chủ Nhật',
};

export const FACILITY_LABELS: Record<Facility, string> = {
  coso1: 'Cơ sở 1',
  coso2: 'Cơ sở 2',
};

export const LEVEL_LABELS: Record<Level, string> = {
  cap1: 'CẤP 1',
  cap2: 'CẤP 2',
  cap3: 'CẤP 3',
};

export const REGISTRATION_SLOTS: TimeSlot[] = [
  { id: 'reg-0', label: '6:00 - 8:00', start: 360, end: 480 },
  { id: 'reg-1', label: '8:00 - 10:00', start: 480, end: 600 },
  { id: 'reg-2', label: '10:00 - 12:00', start: 600, end: 720 },
  { id: 'reg-3', label: '13:00 - 15:00', start: 780, end: 900 },
  { id: 'reg-4', label: '15:00 - 17:00', start: 900, end: 1020 },
  { id: 'reg-5', label: '17:00 - 19:00', start: 1020, end: 1140 },
  { id: 'reg-6', label: '19:00 - 21:00', start: 1140, end: 1260 },
];

export const SCHEDULE_SLOTS: Record<string, TimeSlot[]> = {
  'coso1-cap3': [
    { id: 'cs1c3-0', label: '7:00 - 9:00', start: 420, end: 540 },
    { id: 'cs1c3-1', label: '9:00 - 10:30', start: 540, end: 630 },
    { id: 'cs1c3-2', label: '10:00 - 12:00', start: 600, end: 720 },
    { id: 'cs1c3-3', label: '13:00 - 15:00', start: 780, end: 900 },
    { id: 'cs1c3-4', label: '15:00 - 17:00', start: 900, end: 1020 },
    { id: 'cs1c3-5', label: '17:00 - 19:00', start: 1020, end: 1140 },
    { id: 'cs1c3-6', label: '19:00 - 21:00', start: 1140, end: 1260 },
  ],
  'coso1-cap2': [
    { id: 'cs1c2-0', label: '7:00 - 9:00', start: 420, end: 540 },
    { id: 'cs1c2-1', label: '9:00 - 11:00', start: 540, end: 660 },
    { id: 'cs1c2-2', label: '13:00 - 15:00', start: 780, end: 900 },
    { id: 'cs1c2-3', label: '15:00 - 17:00', start: 900, end: 1020 },
    { id: 'cs1c2-4', label: '17:00 - 19:00', start: 1020, end: 1140 },
    { id: 'cs1c2-5', label: '19:00 - 21:00', start: 1140, end: 1260 },
  ],
  'coso1-cap1': [
    { id: 'cs1c1-0', label: '9:00 - 11:00', start: 540, end: 660 },
    { id: 'cs1c1-1', label: '17:00 - 19:00', start: 1020, end: 1140 },
  ],
  'coso2-cap3': [
    { id: 'cs2c3-0', label: '15:00 - 17:00', start: 900, end: 1020 },
    { id: 'cs2c3-1', label: '17:00 - 19:00', start: 1020, end: 1140 },
    { id: 'cs2c3-2', label: '19:00 - 21:00', start: 1140, end: 1260 },
  ],
  'coso2-cap2': [
    { id: 'cs2c2-0', label: '9:00 - 11:00', start: 540, end: 660 },
    { id: 'cs2c2-1', label: '15:00 - 17:00', start: 900, end: 1020 },
    { id: 'cs2c2-2', label: '17:00 - 19:00', start: 1020, end: 1140 },
  ],
  'coso2-cap1': [
    { id: 'cs2c1-0', label: '9:00 - 11:00', start: 540, end: 660 },
  ],
};

export function getScheduleKey(facility: Facility, level: Level): string {
  return `${facility}-${level}`;
}

export function isRegistrationBlocked(day: DayOfWeek, slotId: string): boolean {
  if (day >= 5) return false;
  const blocked = ['reg-0', 'reg-1', 'reg-2', 'reg-3', 'reg-4'];
  return blocked.includes(slotId);
}

export function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toLocaleDateString('vi-VN');
  });
}
