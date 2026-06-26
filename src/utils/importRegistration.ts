import type { DayOfWeek } from '../types';
import { REGISTRATION_SLOTS } from '../data/constants';
import type { RegistrationGrid } from './registrationUtils';
import { createEmptyRegistrationGrid } from './registrationUtils';

function normalizeTime(s: string): string {
  return s.replace(/\s+/g, '').replace(/–/g, '-').toLowerCase();
}

function matchSlotRow(cell: string): number {
  const n = normalizeTime(cell);
  for (let i = 0; i < REGISTRATION_SLOTS.length; i++) {
    const label = normalizeTime(REGISTRATION_SLOTS[i].label);
    if (n === label || n.includes(label) || label.includes(n)) return i;
  }
  return -1;
}

function isDateHeader(cell: string): boolean {
  return /^\d{1,2}[\/\-]\d{1,2}/.test(cell.trim());
}

function looksLikeTimeRow(cell: string): boolean {
  return /\d{1,2}:\d{2}/.test(cell);
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) =>
    c.trim().replace(/^"|"$/g, ''),
  );
}

/** Parse TSV pasted from Google Sheets into registration grid */
export function parseRegistrationImport(paste: string): {
  grid: RegistrationGrid;
  filled: number;
} | { error: string } {
  const lines = paste
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { error: 'Không có dữ liệu. Hãy copy vùng bảng từ Google Sheets.' };
  }

  const grid = createEmptyRegistrationGrid();
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  let filled = 0;
  let sequentialRow = 0;

  for (const line of lines) {
    const cells = splitRow(line);
    if (cells.length < 2) continue;

    const nonEmpty = cells.filter((c) => c && c !== '—' && c !== '-');
    if (nonEmpty.length === 0) continue;

    if (nonEmpty.every(isDateHeader) || (cells[0] === 'Ca' && nonEmpty.every((c, i) => i === 0 || isDateHeader(c)))) {
      continue;
    }

    let slotIdx: number;
    let dayCells: string[];

    if (looksLikeTimeRow(cells[0])) {
      slotIdx = matchSlotRow(cells[0]);
      dayCells = cells.slice(1, 8);
    } else if (cells.length >= 7) {
      slotIdx = sequentialRow;
      dayCells = cells.slice(0, 7);
      sequentialRow++;
    } else {
      continue;
    }

    if (slotIdx < 0 || slotIdx >= REGISTRATION_SLOTS.length) continue;

    const slotId = REGISTRATION_SLOTS[slotIdx].id;

    for (let d = 0; d < Math.min(7, dayCells.length); d++) {
      const val = dayCells[d]?.replace(/^—$|^-$/g, '').trim() ?? '';
      if (val && val !== '—' && val !== '-') {
        grid[days[d]] = { ...grid[days[d]], [slotId]: val };
        filled++;
      }
    }
  }

  if (filled === 0) {
    return {
      error:
        'Không đọc được ô nào. Copy cả bảng từ Sheets (7 cột ngày × 7 dòng ca). Có thể gồm cột giờ bên trái.',
    };
  }

  return { grid, filled };
}

export function registrationGridToTsv(grid: RegistrationGrid): string {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const header = ['Ca', ...days.map((_, i) => `Ngày ${i + 1}`)].join('\t');
  const rows = REGISTRATION_SLOTS.map((slot) => {
    const cells = days.map((d) => grid[d]?.[slot.id] ?? '');
    return [slot.label, ...cells].join('\t');
  });
  return [header, ...rows].join('\n');
}
