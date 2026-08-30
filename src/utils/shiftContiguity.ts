import type { DayOfWeek, Facility, Level, Shift } from '../types';
import { getShiftTimeSlot } from './timeUtils';

/** Một ca đã xếp, quy về khoảng thời gian trong ngày. */
export interface ShiftInterval {
  shiftId: string;
  day: DayOfWeek;
  start: number;
  end: number;
  facility: Facility;
  level: Level;
}

/** Khoảng nghỉ tối đa (phút) vẫn coi 2 ca là liền nhau. */
export const DEFAULT_ADJACENT_GAP_MINUTES = 30;

/** Thời gian tối thiểu (phút) để đi từ cơ sở này sang cơ sở kia. */
export const DEFAULT_TRAVEL_MINUTES = 30;

export interface ContiguityWeights {
  /** Phạt mỗi cụm ca rời thêm trong cùng một ngày */
  extraBlock: number;
  /** Phạt mỗi cụm chỉ có đúng 1 ca — đây là "ca lẻ" */
  loneBlock: number;
  /** Phạt mỗi giờ trống giữa hai cụm trong cùng một ngày */
  idleHour: number;
  /** Phạt lồi theo tổng số ca — giữ cân bằng tải giữa các TG */
  loadBalance: number;
  /** Phạt mỗi lần phải đổi cơ sở trong cùng một ngày — có di chuyển thật */
  facilitySwitch: number;
  /** Phạt mỗi lần đổi cấp giữa hai ca liền nhau — nhẹ, chỉ để chọn khi ngang điểm */
  levelSwitch: number;
}

export const DEFAULT_CONTIGUITY_WEIGHTS: ContiguityWeights = {
  extraBlock: 12,
  loneBlock: 8,
  idleHour: 1.5,
  // Đủ lớn để không dồn ca vào một nhóm nhỏ, đủ nhỏ để vẫn ưu tiên nối ca.
  loadBalance: 3,
  // Nặng hơn cả một cụm rời: thà tách ca còn hơn bắt chạy giữa hai cơ sở.
  facilitySwitch: 20,
  levelSwitch: 2,
};

export function getShiftInterval(shift: Shift): ShiftInterval | null {
  const slot = getShiftTimeSlot(shift);
  if (!slot) return null;
  return {
    shiftId: shift.id,
    day: shift.day,
    start: slot.start,
    end: slot.end,
    facility: shift.facility,
    level: shift.level,
  };
}

/** Một chuỗi ca liền nhau của cùng một TG trong cùng một ngày. */
export interface ShiftBlock {
  day: DayOfWeek;
  start: number;
  end: number;
  /** Cụm chỉ gồm ca cùng một cơ sở — đổi cơ sở là cắt cụm */
  facility: Facility;
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
    if (
      last &&
      last.day === iv.day &&
      last.facility === iv.facility &&
      iv.start - last.end <= gapMinutes
    ) {
      last.end = Math.max(last.end, iv.end);
      last.intervals.push(iv);
      continue;
    }
    blocks.push({
      day: iv.day,
      start: iv.start,
      end: iv.end,
      facility: iv.facility,
      intervals: [iv],
    });
  }
  return blocks;
}

/**
 * Chi phí lịch của một TG: càng nhiều cụm rời, càng nhiều ca lẻ và giờ trống
 * thì càng cao. Bộ xếp lịch tìm cách hạ tổng chi phí này xuống.
 *
 * `canChain` cho biết ca đó có ca liền kề nào mà TG này đủ điều kiện làm không.
 * Ca không thể nối thì bị lẻ là chuyện bắt buộc, không phải lỗi của cách xếp —
 * tính phạt vào đó sẽ khiến TG chỉ đăng ký được khung rời rạc thua mọi ca có
 * cạnh tranh, nên những ca như vậy được miễn phạt.
 */
export function taFragmentationCost(
  intervals: ShiftInterval[],
  weights: ContiguityWeights,
  gapMinutes: number,
  canChain?: (interval: ShiftInterval) => boolean,
): number {
  let cost = weights.loadBalance * intervals.length * intervals.length;

  const blocks = groupIntoBlocks(intervals, gapMinutes);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.intervals.length === 1 && (!canChain || canChain(block.intervals[0]))) {
      cost += weights.loneBlock;
    }

    // Đổi cấp giữa hai ca liền nhau trong cùng cụm
    for (let j = 1; j < block.intervals.length; j++) {
      if (block.intervals[j].level !== block.intervals[j - 1].level) {
        cost += weights.levelSwitch;
      }
    }

    const prev = blocks[i - 1];
    if (prev && prev.day === block.day) {
      cost += weights.extraBlock;
      cost += (weights.idleHour * (block.start - prev.end)) / 60;
      if (prev.facility !== block.facility) cost += weights.facilitySwitch;
    }
  }

  return cost;
}

/**
 * Hai ca ở hai cơ sở khác nhau, cùng ngày, mà không đủ thời gian đi lại.
 * Đây là ràng buộc cứng chứ không phải điểm trừ: không ai kết thúc 19:00 ở
 * cơ sở này rồi có mặt lúc 19:00 ở cơ sở kia.
 */
export function needsTravelGap(
  a: ShiftInterval,
  b: ShiftInterval,
  travelMinutes: number,
): boolean {
  if (a.day !== b.day) return false;
  if (a.facility === b.facility) return false;
  const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
  return gap < travelMinutes;
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
