import type { Assignment, Shift } from '../types';
import { DAY_LABELS, FACILITY_LABELS } from '../data/constants';
import { getEligibleNamesForShift, type RegistrationGrid } from './registrationUtils';
import type { SlotOverrides } from './slotAccess';
import { getShiftInterval, needsTravelGap, DEFAULT_TRAVEL_MINUTES } from './shiftContiguity';
import { getShiftTimeSlot, shiftsConflict } from './timeUtils';

export interface AssignmentWarning {
  type: 'conflict' | 'not_registered' | 'over_capacity' | 'travel';
  message: string;
}

/** TG bị xếp ca ở cơ sở khác mà không đủ thời gian đi lại. */
export function getTravelClashShift(
  name: string,
  shift: Shift,
  assignments: Assignment[],
  shifts: Shift[],
  excludeShiftId?: string,
  travelMinutes: number = DEFAULT_TRAVEL_MINUTES,
): Shift | null {
  const interval = getShiftInterval(shift);
  if (!interval || travelMinutes <= 0) return null;
  for (const asn of assignments) {
    if (asn.shiftId === excludeShiftId || asn.shiftId === shift.id) continue;
    if (!asn.staffIds.includes(name)) continue;
    const other = shifts.find((s) => s.id === asn.shiftId);
    if (!other) continue;
    const otherInterval = getShiftInterval(other);
    if (otherInterval && needsTravelGap(otherInterval, interval, travelMinutes)) return other;
  }
  return null;
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
    const travelClash = getTravelClashShift(name, shift, allAssignments, shifts, shift.id);
    if (travelClash) {
      warnings.push({
        // Không chặn: có ca phải chạy giữa hai cơ sở là chuyện bất khả kháng
        // khi không còn ai khác xếp được.
        type: 'travel',
        message: `${name}: không kịp đi từ ${FACILITY_LABELS[travelClash.facility]} (${getShiftTimeSlot(travelClash)?.label ?? ''}) sang ${FACILITY_LABELS[shift.facility]}`,
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

export interface DoubleBooking {
  name: string;
  a: Shift;
  b: Shift;
}

/**
 * Mọi cặp ca một TG bị xếp trùng giờ. Lỗi này có thể lọt vào từ nhiều đường —
 * sửa tay, đọc ngược từ Sheet — nên kiểm trên kết quả cuối thay vì tin vào
 * từng bước đã chặn.
 */
export function findDoubleBookings(assignments: Assignment[], shifts: Shift[]): DoubleBooking[] {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const byName = new Map<string, Shift[]>();
  for (const asn of assignments) {
    const shift = shiftById.get(asn.shiftId);
    if (!shift) continue;
    for (const raw of asn.staffIds) {
      const key = raw.trim().toLowerCase();
      const list = byName.get(key);
      if (list) list.push(shift);
      else byName.set(key, [shift]);
    }
  }

  const display = new Map<string, string>();
  for (const asn of assignments) for (const n of asn.staffIds) display.set(n.trim().toLowerCase(), n.trim());

  const out: DoubleBooking[] = [];
  for (const [key, list] of byName) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (shiftsConflict(list[i], list[j])) {
          out.push({ name: display.get(key) ?? key, a: list[i], b: list[j] });
        }
      }
    }
  }
  return out;
}

export function describeDoubleBooking(d: DoubleBooking): string {
  const label = (s: Shift) =>
    `${FACILITY_LABELS[s.facility]} ${s.className} (${getShiftTimeSlot(s)?.label ?? ''})`;
  return `${d.name}: ${DAY_LABELS[d.a.day]} — ${label(d.a)} trùng ${label(d.b)}`;
}
