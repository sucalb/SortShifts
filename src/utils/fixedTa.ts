import type { Shift, TeacherFixedTaMap } from '../types';

export function normalizeTeacherKey(teacher: string): string {
  return teacher.trim().toUpperCase();
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** TG cố định trên ca (ưu tiên) hoặc theo quy tắc GV */
export function getFixedTasForShift(shift: Shift, map: TeacherFixedTaMap = {}): string[] {
  if (shift.fixedTaNames?.length) {
    return uniqueNames(shift.fixedTaNames);
  }
  if (!shift.teacher?.trim()) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of shift.teacher.split(/[,;]+/)) {
    const key = normalizeTeacherKey(part);
    if (!key) continue;
    for (const ta of map[key] ?? []) {
      const name = ta.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
  }
  return result;
}

export function shiftHasFixedTaRule(shift: Shift, map: TeacherFixedTaMap = {}): boolean {
  return getFixedTasForShift(shift, map).length > 0;
}

export function isTaReservedForOtherShift(
  name: string,
  shift: Shift,
  shifts: Shift[],
  map: TeacherFixedTaMap = {},
): boolean {
  for (const other of shifts) {
    if (other.id === shift.id) continue;
    if (!shiftHasFixedTaRule(other, map)) continue;
    if (getFixedTasForShift(other, map).includes(name)) return true;
  }
  return false;
}
