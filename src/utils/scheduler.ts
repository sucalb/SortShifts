import type { Assignment, Shift, TeacherFixedTaMap } from '../types';
import type { RegistrationGrid } from './registrationUtils';
import { countTARegistrations, getEligibleNamesForShift } from './registrationUtils';
import { getFixedTasForShift } from './fixedTa';
import type { ContiguityWeights, ShiftInterval } from './shiftContiguity';
import {
  DEFAULT_ADJACENT_GAP_MINUTES,
  DEFAULT_CONTIGUITY_WEIGHTS,
  getShiftInterval,
  intervalsConflict,
  isAdjacentRange,
  taFragmentationCost,
} from './shiftContiguity';
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

export interface AutoScheduleOptions {
  /** Ưu tiên nối ca liền nhau, hạn chế ca lẻ (mặc định bật) */
  preferContiguous?: boolean;
  /** Khoảng nghỉ tối đa (phút) vẫn coi 2 ca là liền nhau */
  adjacentGapMinutes?: number;
  /** Điều chỉnh mức phạt của mô hình chi phí */
  weights?: Partial<ContiguityWeights>;
  /** Số vòng tối ưu lại sau khi xếp lần đầu */
  maxImprovePasses?: number;
}

const EPS = 1e-9;

export function autoSchedule(
  shifts: Shift[],
  registrationGrid: RegistrationGrid | undefined,
  slotOverrides?: SlotOverrides,
  fixedTaMap: TeacherFixedTaMap = {},
  options: AutoScheduleOptions = {},
): ScheduleResult {
  const {
    preferContiguous = true,
    adjacentGapMinutes = DEFAULT_ADJACENT_GAP_MINUTES,
    maxImprovePasses = 6,
  } = options;
  const weights: ContiguityWeights = { ...DEFAULT_CONTIGUITY_WEIGHTS, ...options.weights };

  // --- Dữ liệu tra cứu ---
  const intervalByShift = new Map<string, ShiftInterval>();
  const eligibleByShift = new Map<string, string[]>();
  const eligibleSetByShift = new Map<string, Set<string>>();
  const fixedByShift = new Map<string, string[]>();

  for (const shift of shifts) {
    const interval = getShiftInterval(shift);
    if (interval) intervalByShift.set(shift.id, interval);

    const eligible = getEligibleNamesForShift(shift, registrationGrid, slotOverrides);
    eligibleByShift.set(shift.id, eligible);
    eligibleSetByShift.set(shift.id, new Set(eligible));

    const fixed = getFixedTasForShift(shift, fixedTaMap);
    fixedByShift.set(shift.id, fixed);
  }

  // --- Ca nào có ca liền kề để nối, và TG nào nối được ---
  // TG chỉ đăng ký được khung rời rạc sẽ luôn bị lẻ dù xếp kiểu gì; phạt họ vì
  // điều đó khiến họ thua mọi ca có cạnh tranh và bị xếp rất ít ca.
  const adjacentShiftIds = new Map<string, string[]>();
  for (const shift of shifts) {
    const interval = intervalByShift.get(shift.id);
    if (!interval) continue;
    const neighbours: string[] = [];
    for (const other of shifts) {
      if (other.id === shift.id) continue;
      if (other.day !== shift.day) continue;
      // Khác cơ sở thì phải di chuyển — không tính là nối ca được
      if (other.facility !== shift.facility) continue;
      const otherInterval = intervalByShift.get(other.id);
      if (!otherInterval) continue;
      if (isAdjacentRange(otherInterval, interval, adjacentGapMinutes)) neighbours.push(other.id);
    }
    adjacentShiftIds.set(shift.id, neighbours);
  }

  const chainableCache = new Map<string, boolean>();
  const canChainAt = (name: string, shiftId: string): boolean => {
    const key = name + '\u0000' + shiftId;
    const cached = chainableCache.get(key);
    if (cached !== undefined) return cached;
    const result = (adjacentShiftIds.get(shiftId) ?? []).some(
      (id) => eligibleSetByShift.get(id)?.has(name) === true,
    );
    chainableCache.set(key, result);
    return result;
  };

  // --- Trạng thái đang xếp ---
  const assignedByShift = new Map<string, string[]>(shifts.map((s) => [s.id, []]));
  const intervalsByTa = new Map<string, ShiftInterval[]>();
  /** TG cố định đã chốt — vòng tối ưu không được đổi/đẩy họ ra khỏi ca này. */
  const lockedByShift = new Map<string, Set<string>>();
  const isLocked = (shiftId: string, name: string) =>
    lockedByShift.get(shiftId)?.has(name) === true;

  const listFor = (name: string): ShiftInterval[] => intervalsByTa.get(name) ?? [];
  const cost = (name: string, intervals: ShiftInterval[]): number =>
    taFragmentationCost(intervals, weights, adjacentGapMinutes, (iv) =>
      canChainAt(name, iv.shiftId),
    );
  const costOf = (name: string): number => cost(name, listFor(name));
  const costWithout = (name: string, shiftId: string): number =>
    cost(name, listFor(name).filter((iv) => iv.shiftId !== shiftId));
  const costWith = (name: string, interval: ShiftInterval): number =>
    cost(name, [...listFor(name), interval]);
  const conflicts = (name: string, interval: ShiftInterval, excludeShiftId?: string): boolean =>
    intervalsConflict(listFor(name), interval, excludeShiftId);

  const assign = (shiftId: string, name: string) => {
    const interval = intervalByShift.get(shiftId);
    if (!interval) return;
    assignedByShift.get(shiftId)?.push(name);
    const list = intervalsByTa.get(name);
    if (list) list.push(interval);
    else intervalsByTa.set(name, [interval]);
  };

  const unassign = (shiftId: string, name: string) => {
    const assigned = assignedByShift.get(shiftId);
    if (assigned) {
      const at = assigned.indexOf(name);
      if (at >= 0) assigned.splice(at, 1);
    }
    const list = intervalsByTa.get(name);
    if (list) {
      const at = list.findIndex((iv) => iv.shiftId === shiftId);
      if (at >= 0) list.splice(at, 1);
    }
  };

  const sortedShifts = [...shifts].sort((a, b) => {
    const eligibleA = eligibleByShift.get(a.id)?.length ?? 0;
    const eligibleB = eligibleByShift.get(b.id)?.length ?? 0;
    if (eligibleA !== eligibleB) return eligibleA - eligibleB;
    if (a.staffNeeded !== b.staffNeeded) return b.staffNeeded - a.staffNeeded;
    // Cùng độ khó thì xếp theo thứ tự thời gian để dễ nối ca liền nhau.
    const ivA = intervalByShift.get(a.id);
    const ivB = intervalByShift.get(b.id);
    if (ivA && ivB) {
      if (ivA.day !== ivB.day) return ivA.day - ivB.day;
      if (ivA.start !== ivB.start) return ivA.start - ivB.start;
    }
    return a.id.localeCompare(b.id);
  });

  // --- Bước 1: chốt TG cố định trước, tránh bị ca tự do chiếm mất ---
  for (const shift of sortedShifts) {
    const interval = intervalByShift.get(shift.id);
    if (!interval) continue;
    const assigned = assignedByShift.get(shift.id) ?? [];
    for (const name of fixedByShift.get(shift.id) ?? []) {
      if (assigned.length >= shift.staffNeeded) break;
      if (assigned.includes(name)) continue;
      // TG cố định là người phụ trách lớp đó — điền tên kể cả khi họ không
      // đăng ký khung này; chỉ bỏ qua khi trùng giờ với ca khác đã chốt.
      if (conflicts(name, interval)) continue;
      assign(shift.id, name);
      const locked = lockedByShift.get(shift.id);
      if (locked) locked.add(name);
      else lockedByShift.set(shift.id, new Set([name]));
    }
  }

  // --- Bước 2: xếp các ca còn lại, ưu tiên TG có ca liền kề ---
  const fillShift = (shift: Shift) => {
    const interval = intervalByShift.get(shift.id);
    if (!interval) return;
    const assigned = assignedByShift.get(shift.id) ?? [];

    while (assigned.length < shift.staffNeeded) {
      const scored = (eligibleByShift.get(shift.id) ?? [])
        .filter(
          (name) =>
            !assigned.includes(name) && !conflicts(name, interval),
        )
        .map((name) => {
          const load = listFor(name).length;
          const delta = preferContiguous ? costWith(name, interval) - costOf(name) : load;
          return { name, delta, load };
        })
        .sort(
          (a, b) =>
            a.delta - b.delta || a.load - b.load || a.name.localeCompare(b.name, 'vi'),
        );

      if (scored.length === 0) break;
      assign(shift.id, scored[0].name);
    }
  };

  for (const shift of sortedShifts) {
    fillShift(shift);
  }

  // --- Bước 3: tối ưu lại — đổi chỗ/thay người nếu giảm được độ rời rạc ---
  const movableShifts = sortedShifts.filter((s) => intervalByShift.has(s.id));

  /** Danh sách ca của TG sau khi bỏ `removeShiftId` và thêm `add`. */
  const listAfterSwap = (name: string, removeShiftId: string, add: ShiftInterval) => [
    ...listFor(name).filter((iv) => iv.shiftId !== removeShiftId),
    add,
  ];

  const canTake = (name: string, shift: Shift, interval: ShiftInterval, fromShiftId?: string) =>
    eligibleSetByShift.get(shift.id)?.has(name) === true &&
    !assignedByShift.get(shift.id)?.includes(name) &&
    !conflicts(name, interval, fromShiftId);

  const runImprovePass = (): boolean => {
    let improved = false;

    // 3a. Hoán đổi 2 TG giữa 2 ca — tổng số ca mỗi người không đổi.
    for (let i = 0; i < movableShifts.length; i++) {
      const shiftA = movableShifts[i];
      const ivA = intervalByShift.get(shiftA.id)!;
      const listA = assignedByShift.get(shiftA.id)!;

      for (let j = i + 1; j < movableShifts.length; j++) {
        const shiftB = movableShifts[j];
        const ivB = intervalByShift.get(shiftB.id)!;
        const listB = assignedByShift.get(shiftB.id)!;

        for (const nameA of [...listA]) {
          if (!listA.includes(nameA)) continue;
          for (const nameB of [...listB]) {
            if (nameA === nameB) continue;
            if (!listA.includes(nameA) || !listB.includes(nameB)) continue;
            if (isLocked(shiftA.id, nameA) || isLocked(shiftB.id, nameB)) continue;
            if (!canTake(nameA, shiftB, ivB, shiftA.id)) continue;
            if (!canTake(nameB, shiftA, ivA, shiftB.id)) continue;

            const before = costOf(nameA) + costOf(nameB);
            const after =
              cost(nameA, listAfterSwap(nameA, shiftA.id, ivB)) +
              cost(nameB, listAfterSwap(nameB, shiftB.id, ivA));
            if (after >= before - EPS) continue;

            unassign(shiftA.id, nameA);
            unassign(shiftB.id, nameB);
            assign(shiftA.id, nameB);
            assign(shiftB.id, nameA);
            improved = true;
          }
        }
      }
    }

    // 3b. Thay một TG bằng TG khác đang rảnh nếu lịch gọn hơn.
    for (const shift of movableShifts) {
      const interval = intervalByShift.get(shift.id)!;
      const assigned = assignedByShift.get(shift.id)!;

      for (const current of [...assigned]) {
        if (!assigned.includes(current)) continue;
        if (isLocked(shift.id, current)) continue;
        for (const alt of eligibleByShift.get(shift.id) ?? []) {
          if (alt === current) continue;
          if (!canTake(alt, shift, interval)) continue;

          const before = costOf(current) + costOf(alt);
          const after = costWithout(current, shift.id) + costWith(alt, interval);
          if (after >= before - EPS) continue;

          unassign(shift.id, current);
          assign(shift.id, alt);
          improved = true;
          break;
        }
      }
    }

    return improved;
  };

  if (preferContiguous) {
    for (let pass = 0; pass < maxImprovePasses; pass++) {
      if (!runImprovePass()) break;
    }
    // Bước 3b có thể giải phóng người — thử lấp lại các ca còn thiếu.
    for (const shift of sortedShifts) {
      fillShift(shift);
    }
  }

  const assignments: Assignment[] = [];
  for (const shift of shifts) {
    const staffIds = assignedByShift.get(shift.id) ?? [];
    if (staffIds.length > 0) {
      assignments.push({ shiftId: shift.id, staffIds: [...staffIds] });
    }
  }

  const { unfulfilled, stats } = recomputeScheduleResult(assignments, shifts);
  return { assignments, unfulfilled, stats };
}
