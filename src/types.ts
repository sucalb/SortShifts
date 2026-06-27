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
  /** TG chỉ xếp cho ca này — không tự gán thêm người khác */
  fixedTaNames?: string[];
  staffNeeded: number;
}

export interface StaffMember {
  id: string;
  name: string;
  abbreviation?: string;
  availability: Record<DayOfWeek, Record<string, boolean>>;
}

export interface Assignment {
  shiftId: string;
  staffIds: string[];
}

/** GV (uppercase key) → danh sách TG cố định (viết tắt) */
export type TeacherFixedTaMap = Record<string, string[]>;

export interface AppState {
  shifts: Shift[];
  staff: StaffMember[];
  assignments: Assignment[];
  weekStart: string;
}

export interface ShareInfo {
  shareId: string;
  adminToken: string;
  guestUrl: string;
}
