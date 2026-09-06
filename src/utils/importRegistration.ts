import type { DayOfWeek, TimeSlot } from '../types';
import type { RegistrationGrid } from './registrationUtils';
import { createEmptyRegistrationGrid } from './registrationUtils';
import { getActiveRegistrationSlots } from './slotCatalog';

function normalizeTime(s: string): string {
  return s.replace(/\s+/g, '').replace(/–/g, '-').toLowerCase();
}

function matchSlotRow(cell: string, slots: TimeSlot[]): number {
  const n = normalizeTime(cell);
  for (let i = 0; i < slots.length; i++) {
    const label = normalizeTime(slots[i].label);
    if (n === label || n.includes(label) || label.includes(n)) return i;
  }
  return -1;
}

function isDateHeader(cell: string): boolean {
  return /^\d{1,2}[/-]\d{1,2}/.test(cell.trim());
}

/** "THỨ BẢY", "CHỦ NHẬT", "T7", "CN"… — tên ngày ở dòng tiêu đề, không phải tên TG */
function isDayNameHeader(cell: string): boolean {
  const t = cell.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!t) return false;
  return (
    /^TH[ỨU] ?(HAI|BA|T[ƯU]|N[ĂA]M|S[ÁA]U|B[ẢA]Y|[2-7])$/.test(t) ||
    /^CH[ỦU] ?NH[ẬA]T$/.test(t) ||
    /^(CN|T[2-7])$/.test(t)
  );
}

/**
 * Dòng tiêu đề của bảng, cần bỏ qua. Thiếu bước này thì dòng tên ngày bị coi
 * là dòng dữ liệu và tên ngày lọt vào lưới đăng ký như thể là tên TG.
 */
function isHeaderRow(cells: string[], nonEmpty: string[]): boolean {
  if (nonEmpty.every(isDateHeader)) return true;

  // Cần vài ô mới chắc là tiêu đề — một TG tên "CN" không được tính là header
  if (nonEmpty.filter(isDayNameHeader).length >= 3) return true;

  const first = (cells[0] ?? '').trim().toLowerCase();
  if (first === 'ca' || first === '') {
    return nonEmpty.every((c, i) => i === 0 || isDateHeader(c) || isDayNameHeader(c));
  }
  return false;
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
export function parseRegistrationImport(
  paste: string,
  registrationSlots: TimeSlot[] = getActiveRegistrationSlots(),
): {
  grid: RegistrationGrid;
  filled: number;
  /** Nhãn giờ trên bảng dán vào mà app không có khung tương ứng — dữ liệu bị bỏ */
  skippedSlots: string[];
} | { error: string } {
  const lines = paste
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { error: 'Không có dữ liệu. Hãy copy vùng bảng từ Google Sheets.' };
  }

  const slots = registrationSlots.length > 0 ? registrationSlots : getActiveRegistrationSlots();
  const grid = createEmptyRegistrationGrid(slots);
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  let filled = 0;
  let sequentialRow = 0;
  const skippedSlots: string[] = [];

  for (const line of lines) {
    const cells = splitRow(line);
    if (cells.length < 2) continue;

    const nonEmpty = cells.filter((c) => c && c !== '—' && c !== '-');
    if (nonEmpty.length === 0) continue;

    if (isHeaderRow(cells, nonEmpty)) continue;

    let slotIdx: number;
    let dayCells: string[];

    if (looksLikeTimeRow(cells[0])) {
      slotIdx = matchSlotRow(cells[0], slots);
      if (slotIdx < 0) {
        // Có dữ liệu thật ở hàng này nhưng app không có khung giờ khớp
        if (cells.slice(1, 8).some((c) => c && c !== '—' && c !== '-')) {
          skippedSlots.push(cells[0].trim());
        }
        continue;
      }
      dayCells = cells.slice(1, 8);
    } else if (cells.length >= 7) {
      slotIdx = sequentialRow;
      dayCells = cells.slice(0, 7);
      sequentialRow++;
    } else {
      continue;
    }

    if (slotIdx < 0 || slotIdx >= slots.length) continue;

    const slotId = slots[slotIdx].id;

    for (let d = 0; d < Math.min(7, dayCells.length); d++) {
      const val = dayCells[d]?.replace(/^—$|^-$/g, '').trim() ?? '';
      if (val && val !== '—' && val !== '-') {
        grid[days[d]] = { ...grid[days[d]], [slotId]: val };
        filled++;
      }
    }
  }

  if (filled === 0) {
    const hint =
      skippedSlots.length > 0
        ? ` Bảng có khung giờ ${skippedSlots.join(', ')} nhưng app không có khung nào khớp — sửa ở "Chỉnh khung giờ".`
        : '';
    return {
      error:
        `Không đọc được ô nào. Copy cả bảng từ Sheets (7 cột ngày × ${slots.length} dòng ca). ` +
        `Có thể gồm cột giờ bên trái.${hint}`,
    };
  }

  return { grid, filled, skippedSlots };
}

export function registrationGridToTsv(
  grid: RegistrationGrid,
  registrationSlots: TimeSlot[] = getActiveRegistrationSlots(),
): string {
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const header = ['Ca', ...days.map((_, i) => `Ngày ${i + 1}`)].join('\t');
  const rows = registrationSlots.map((slot) => {
    const cells = days.map((d) => grid[d]?.[slot.id] ?? '');
    return [slot.label, ...cells].join('\t');
  });
  return [header, ...rows].join('\n');
}
