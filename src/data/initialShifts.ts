import type { Shift } from '../types';

type ShiftInput = Omit<Shift, 'id' | 'staffNeeded'> & { staffNeeded?: number };

function makeShifts(items: ShiftInput[]): Shift[] {
  return items.map((item, i) => ({
    ...item,
    id: `shift-${i}`,
    staffNeeded: item.staffNeeded ?? 1,
  }));
}

export const INITIAL_SHIFTS: Shift[] = makeShifts([
  // === CƠ SỞ 1 - CẤP 3 ===
  { facility: 'coso1', level: 'cap3', day: 0, timeSlotId: 'cs1c3-5', className: '12 B1' },
  { facility: 'coso1', level: 'cap3', day: 0, timeSlotId: 'cs1c3-6', className: '11 B1' },
  { facility: 'coso1', level: 'cap3', day: 1, timeSlotId: 'cs1c3-4', className: '10 B1' },
  { facility: 'coso1', level: 'cap3', day: 1, timeSlotId: 'cs1c3-5', className: '12 B1' },
  { facility: 'coso1', level: 'cap3', day: 1, timeSlotId: 'cs1c3-6', className: '12 B1' },
  { facility: 'coso1', level: 'cap3', day: 2, timeSlotId: 'cs1c3-4', className: '10 B1' },
  { facility: 'coso1', level: 'cap3', day: 2, timeSlotId: 'cs1c3-5', className: '12 B1' },
  { facility: 'coso1', level: 'cap3', day: 2, timeSlotId: 'cs1c3-6', className: '11 B1' },
  { facility: 'coso1', level: 'cap3', day: 3, timeSlotId: 'cs1c3-4', className: '10 B2' },
  { facility: 'coso1', level: 'cap3', day: 3, timeSlotId: 'cs1c3-5', className: '12 B2' },
  { facility: 'coso1', level: 'cap3', day: 3, timeSlotId: 'cs1c3-6', className: '11 B2' },
  { facility: 'coso1', level: 'cap3', day: 4, timeSlotId: 'cs1c3-4', className: '10 B2' },
  { facility: 'coso1', level: 'cap3', day: 4, timeSlotId: 'cs1c3-5', className: '12 B2' },
  { facility: 'coso1', level: 'cap3', day: 4, timeSlotId: 'cs1c3-6', className: '11 B2' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-0', className: '10 B1' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-1', className: '10 B1' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-2', className: '12 B2' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-3', className: '11 B1' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-5', className: '12 B2' },
  { facility: 'coso1', level: 'cap3', day: 5, timeSlotId: 'cs1c3-6', className: '11 B1' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-0', className: '10 B2' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-1', className: '10 B2' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-2', className: '12 B3' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-3', className: '11 B2' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-3', className: '12 B3' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-4', className: '12 B3' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-5', className: '12 B3' },
  { facility: 'coso1', level: 'cap3', day: 6, timeSlotId: 'cs1c3-6', className: '11 B2' },

  // === CƠ SỞ 1 - CẤP 2 ===
  { facility: 'coso1', level: 'cap2', day: 0, timeSlotId: 'cs1c2-5', className: '6.1 B1', teacher: 'MAI' },
  { facility: 'coso1', level: 'cap2', day: 0, timeSlotId: 'cs1c2-5', className: '7.2 B1', teacher: 'THẮNG' },
  { facility: 'coso1', level: 'cap2', day: 1, timeSlotId: 'cs1c2-4', className: '8.1 B1', teacher: 'TÂN' },
  { facility: 'coso1', level: 'cap2', day: 1, timeSlotId: 'cs1c2-5', className: '9.1 B1', teacher: 'TÂN' },
  { facility: 'coso1', level: 'cap2', day: 2, timeSlotId: 'cs1c2-4', className: '9.5 B1', teacher: 'DANH, KHIÊM' },
  { facility: 'coso1', level: 'cap2', day: 2, timeSlotId: 'cs1c2-5', className: '6.1 B2', teacher: 'MAI' },
  { facility: 'coso1', level: 'cap2', day: 2, timeSlotId: 'cs1c2-5', className: '7.2 B2', teacher: 'THẮNG' },
  { facility: 'coso1', level: 'cap2', day: 2, timeSlotId: 'cs1c2-5', className: '8.2 B1', teacher: 'HÀ TRÂM' },
  { facility: 'coso1', level: 'cap2', day: 3, timeSlotId: 'cs1c2-4', className: '8.1 B2', teacher: 'TÂN' },
  { facility: 'coso1', level: 'cap2', day: 3, timeSlotId: 'cs1c2-5', className: '9.1 B2', teacher: 'TÂN' },
  { facility: 'coso1', level: 'cap2', day: 4, timeSlotId: 'cs1c2-5', className: '8.2 B2', teacher: 'HÀ TRÂM' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-0', className: '7.1 B1', teacher: 'HÀ TRÂM' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-1', className: '8.3 B1', teacher: 'DƯƠNG' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-2', className: '9.4 B1', teacher: 'HOÀNG' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-3', className: '9.3 B1', teacher: 'HOÀNG' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-4', className: '6.2 B1', teacher: 'LONG' },
  { facility: 'coso1', level: 'cap2', day: 5, timeSlotId: 'cs1c2-4', className: '9.2 B1', teacher: 'MAI' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-0', className: '7.1 B2', teacher: 'HÀ TRÂM' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-1', className: '8.3 B2', teacher: 'DƯƠNG' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-2', className: '9.4 B2', teacher: 'HOÀNG' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-3', className: '9.3 B2', teacher: 'HOÀNG' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-4', className: '6.2 B2', teacher: 'LONG' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-4', className: '9.2 B2', teacher: 'MAI' },
  { facility: 'coso1', level: 'cap2', day: 6, timeSlotId: 'cs1c2-4', className: '9.5 B2', teacher: 'DANH, KHIÊM' },

  // === CƠ SỞ 1 - CẤP 1 ===
  { facility: 'coso1', level: 'cap1', day: 1, timeSlotId: 'cs1c1-1', className: '5.1 B1', teacher: 'VÂN' },
  { facility: 'coso1', level: 'cap1', day: 2, timeSlotId: 'cs1c1-1', className: '5.2 B1', teacher: 'T. TRÂM' },
  { facility: 'coso1', level: 'cap1', day: 5, timeSlotId: 'cs1c1-1', className: '5.1 B2', teacher: 'VÂN' },
  { facility: 'coso1', level: 'cap1', day: 6, timeSlotId: 'cs1c1-0', className: '5.2 B1', teacher: 'T. TRÂM' },

  // === CƠ SỞ 2 - CẤP 3 ===
  { facility: 'coso2', level: 'cap3', day: 0, timeSlotId: 'cs2c3-1', className: '11A B1', teacher: 'TÂN' },
  { facility: 'coso2', level: 'cap3', day: 0, timeSlotId: 'cs2c3-2', className: '10A B1', teacher: 'TÂN' },
  { facility: 'coso2', level: 'cap3', day: 1, timeSlotId: 'cs2c3-2', className: '10B B1', teacher: 'HOÀNG' },
  { facility: 'coso2', level: 'cap3', day: 2, timeSlotId: 'cs2c3-1', className: '11A B2', teacher: 'TÂN' },
  { facility: 'coso2', level: 'cap3', day: 2, timeSlotId: 'cs2c3-1', className: '12A B1', teacher: 'CƯỜNG' },
  { facility: 'coso2', level: 'cap3', day: 2, timeSlotId: 'cs2c3-2', className: '10A B2', teacher: 'TÂN' },
  { facility: 'coso2', level: 'cap3', day: 3, timeSlotId: 'cs2c3-2', className: '10B B2', teacher: 'HOÀNG' },
  { facility: 'coso2', level: 'cap3', day: 4, timeSlotId: 'cs2c3-1', className: '11A B3', teacher: 'TÂN' },
  { facility: 'coso2', level: 'cap3', day: 5, timeSlotId: 'cs2c3-0', className: '12A B2', teacher: 'CƯỜNG' },
  { facility: 'coso2', level: 'cap3', day: 6, timeSlotId: 'cs2c3-0', className: '12A B3', teacher: 'CƯỜNG' },

  // === CƠ SỞ 2 - CẤP 2 ===
  { facility: 'coso2', level: 'cap2', day: 0, timeSlotId: 'cs2c2-2', className: '7A B1', teacher: 'THẮNG' },
  { facility: 'coso2', level: 'cap2', day: 0, timeSlotId: 'cs2c2-2', className: '9A B1', teacher: 'VÂN' },
  { facility: 'coso2', level: 'cap2', day: 2, timeSlotId: 'cs2c2-2', className: '7A B2', teacher: 'THẮNG' },
  { facility: 'coso2', level: 'cap2', day: 2, timeSlotId: 'cs2c2-2', className: '8A B1', teacher: 'DƯƠNG' },
  { facility: 'coso2', level: 'cap2', day: 4, timeSlotId: 'cs2c2-2', className: '8A B2', teacher: 'DƯƠNG' },
  { facility: 'coso2', level: 'cap2', day: 4, timeSlotId: 'cs2c2-2', className: '9A B2', teacher: 'VÂN' },
  { facility: 'coso2', level: 'cap2', day: 5, timeSlotId: 'cs2c2-0', className: '6A B1', teacher: 'THÚY VY' },
  { facility: 'coso2', level: 'cap2', day: 5, timeSlotId: 'cs2c2-2', className: '9B B1', teacher: 'HOÀNG' },
  { facility: 'coso2', level: 'cap2', day: 6, timeSlotId: 'cs2c2-0', className: '6A B2', teacher: 'THÚY VY' },
  { facility: 'coso2', level: 'cap2', day: 6, timeSlotId: 'cs2c2-2', className: '9B B2', teacher: 'HOÀNG' },

  // === CƠ SỞ 2 - CẤP 1 ===
  { facility: 'coso2', level: 'cap1', day: 5, timeSlotId: 'cs2c1-0', className: '5A B1', teacher: 'VÂN' },
  { facility: 'coso2', level: 'cap1', day: 6, timeSlotId: 'cs2c1-0', className: '5A B2', teacher: 'VÂN' },
]);
