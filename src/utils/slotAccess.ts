import type { DayOfWeek } from '../types';
import { isRegistrationBlocked } from '../data/constants';

/** true = mở đăng ký, false = khóa. Không có = dùng quy tắc mặc định */
export type SlotOverrides = Partial<Record<DayOfWeek, Record<string, boolean>>>;

export function isSlotRegistrable(
  overrides: SlotOverrides | undefined,
  day: DayOfWeek,
  slotId: string,
): boolean {
  const override = overrides?.[day]?.[slotId];
  if (override !== undefined) return override;
  return !isRegistrationBlocked(day, slotId);
}

export function getSlotCellState(
  overrides: SlotOverrides | undefined,
  day: DayOfWeek,
  slotId: string,
): 'blocked-default' | 'blocked-forced' | 'open-unlocked' | 'open' {
  const registrable = isSlotRegistrable(overrides, day, slotId);
  const defaultRegistrable = !isRegistrationBlocked(day, slotId);
  const hasOverride = overrides?.[day]?.[slotId] !== undefined;

  if (!registrable) {
    return hasOverride ? 'blocked-forced' : 'blocked-default';
  }
  if (!defaultRegistrable && hasOverride) return 'open-unlocked';
  return 'open';
}

export function toggleSlotAccess(
  overrides: SlotOverrides | undefined,
  day: DayOfWeek,
  slotId: string,
): { overrides: SlotOverrides | undefined; newRegistrable: boolean } {
  const currentlyRegistrable = isSlotRegistrable(overrides, day, slotId);
  const defaultRegistrable = !isRegistrationBlocked(day, slotId);
  const newRegistrable = !currentlyRegistrable;

  const next: SlotOverrides = { ...overrides };
  const dayOverrides = { ...next[day] };

  if (newRegistrable === defaultRegistrable) {
    delete dayOverrides[slotId];
  } else {
    dayOverrides[slotId] = newRegistrable;
  }

  if (Object.keys(dayOverrides).length === 0) {
    delete next[day];
  } else {
    next[day] = dayOverrides;
  }

  return {
    overrides: Object.keys(next).length > 0 ? next : undefined,
    newRegistrable,
  };
}
