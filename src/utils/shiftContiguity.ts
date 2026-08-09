import type { DayOfWeek, Shift } from '../types';
import { getShiftTimeSlot } from './timeUtils';

/** Một ca đã xếp, quy về khoảng thời gian trong ngày. */
export interface ShiftInterval {
  shiftId: string;
  day: DayOfWeek;
  start: number;
  end: number;
}

/** Khoảng nghỉ tối đa (phút) vẫn coi 2 ca là liền nhau. */
export const DEFAULT_ADJACENT_GAP_MINUTES = 30;

export interface ContiguityWeights {
  /** Phạt mỗi cụm ca rời thêm trong cùng một ngày */
  extraBlock: number;
  /** Phạt mỗi cụm chỉ có đúng 1 ca — đây là "ca lẻ" */
  loneBlock: number;
  /** Phạt mỗi giờ trống giữa hai cụm trong cùng một ngày */
  idleHour: number;
  /** Phạt lồi theo tổng số ca — giữ cân bằng tải giữa các TG */
  loadBalance: number;
}

export const DEFAULT_CONTIGUITY_WEIGHTS: ContiguityWeights = {
  extraBlock: 12,
  loneBlock: 8,
  idleHour: 1.5,
  // Đủ lớn để không dồn ca vào một nhóm nhỏ, đủ nhỏ để vẫn ưu tiên nối ca.
  loadBalance: 3,
};

export function getShiftInterval(shift: Shift): ShiftInterval | null {
  const slot = getShiftTimeSlot(shift);
  if (!slot) return null;
  return { shiftId: shift.id, day: shift.day, start: slot.start, end: slot.end };
}

/** Một chuỗi ca liền nhau của cùng một TG trong cùng một ngày. */
export interface ShiftBlock {
  day: DayOfWeek;
  start: number;
  end: number;
  intervals: ShiftInterval[];
}

/** Hai khoảng thời gian có sát nhau không (không đè nhau, cách <= gapMinutes). */
export function isAdjacentRange(
  a: { start: number; end: number },
  b: { start: number; end: number },
  gapMinutes: number,
): boolean {
  if (a.start < b.end && b.start < a.end) return false;
  const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
  return gap <= gapMinutes;
}

/** Gộp ca của một TG thành các cụm liền nhau, sắp theo ngày rồi giờ bắt đầu. */
export function groupIntoBlocks(intervals: ShiftInterval[], gapMinutes: number): ShiftBlock[] {
  const sorted = [...intervals].sort(
    (a, b) => a.day - b.day || a.start - b.start || a.end - b.end,
  );
  const blocks: ShiftBlock[] = [];
  for (const iv of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.day === iv.day && iv.start - last.end <= gapMinutes) {
      last.end = Math.max(last.end, iv.end);
      last.intervals.push(iv);
      continue;
    }
    blocks.push({ day: iv.day, start: iv.start, end: iv.end, intervals: [iv] });
  }
  return blocks;
}

/**
 * Chi phí lịch của một TG: càng nhiều cụm rời, càng nhiều ca lẻ và giờ trống
 * thì càng cao. Bộ xếp lịch tìm cách hạ tổng chi phí này xuống.
 */
export function taFragmentationCost(
  intervals: ShiftInterval[],
  weights: ContiguityWeights,
  gapMinutes: number,
): number {
  let cost = weights.loadBalance * intervals.length * intervals.length;

  const blocks = groupIntoBlocks(intervals, gapMinutes);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.intervals.length === 1) cost += weights.loneBlock;

    const prev = blocks[i - 1];
    if (prev && prev.day === block.day) {
      cost += weights.extraBlock;
      cost += (weights.idleHour * (block.start - prev.end)) / 60;
    }
  }

  return cost;
}

/** Ca `target` có đè lên ca nào đang có của TG không (bỏ qua ca `excludeShiftId`). */
export function intervalsConflict(
  intervals: ShiftInterval[],
  target: ShiftInterval,
  excludeShiftId?: string,
): boolean {
  return intervals.some(
    (iv) =>
      iv.shiftId !== excludeShiftId &&
      iv.shiftId !== target.shiftId &&
      iv.day === target.day &&
      iv.start < target.end &&
      target.start < iv.end,
  );
}
