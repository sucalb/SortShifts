export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Facility = 'coso1' | 'coso2';

export type Level = 'cap1' | 'cap2' | 'cap3';

export interface TimeSlot {
  id: string;
  label: string;
  start: number;
  end: number;
}

export interface Shift {
  id: string;
  facility: Facility;
  level: Level;
  day: DayOfWeek;
  timeSlotId: string;
  className: string;
  teacher?: string;
  staffNeeded: number;
}

export interface StaffMember {
  id: string;
  name: string;
  availability: Record<DayOfWeek, Record<string, boolean>>;
}

export interface Assignment {
  shiftId: string;
  staffIds: string[];
}

export interface AppState {
  shifts: Shift[];
  staff: StaffMember[];
  assignments: Assignment[];
  weekStart: string;
}
