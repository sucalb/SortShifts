import type { Shift } from '../types';
import {
  DAY_LABELS,
  FACILITY_LABELS,
  LEVEL_LABELS,
  getWeekDates,
} from '../data/constants';
import type { ScheduleResult } from './scheduler';
import { formatClassLabel } from './exportSchedule';
import { getShiftTimeSlot } from './timeUtils';

export interface ManualFillRow {
  facilityLabel: string;
  levelLabel: string;
  dayLabel: string;
  dateLabel: string;
  slotLabel: string;
  className: string;
  classLabel: string;
  names: string;
}

export function buildManualFillRows(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): ManualFillRow[] {
  const weekDates = getWeekDates(weekStart);
  const rows: ManualFillRow[] = [];

  for (const shift of shifts) {
    const staff = result.assignments.find((a) => a.shiftId === shift.id)?.staffIds ?? [];
    if (staff.length === 0) continue;

    const slot = getShiftTimeSlot(shift);
    if (!slot) continue;

    rows.push({
      facilityLabel: FACILITY_LABELS[shift.facility],
      levelLabel: LEVEL_LABELS[shift.level],
      dayLabel: DAY_LABELS[shift.day],
      dateLabel: weekDates[shift.day] ?? '',
      slotLabel: slot.label,
      className: shift.className,
      classLabel: formatClassLabel(shift),
      names: staff.map((n) => n.toUpperCase()).join(', '),
    });
  }

  rows.sort((a, b) => {
    const fa = a.facilityLabel.localeCompare(b.facilityLabel, 'vi');
    if (fa !== 0) return fa;
    const la = a.levelLabel.localeCompare(b.levelLabel, 'vi');
    if (la !== 0) return la;
    const da = a.dayLabel.localeCompare(b.dayLabel, 'vi');
    if (da !== 0) return da;
    return a.slotLabel.localeCompare(b.slotLabel, 'vi');
  });

  return rows;
}

/** TSV — mở bằng Excel/Sheets hoặc copy cột Tên TG */
export function exportManualFillTsv(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): string {
  const rows = buildManualFillRows(shifts, result, weekStart);
  const header = ['Cơ sở', 'Cấp', 'Ngày', 'Ngày (số)', 'Ca', 'Lớp', 'Tên TG'].join('\t');
  const lines = rows.map((r) =>
    [r.facilityLabel, r.levelLabel, r.dayLabel, r.dateLabel, r.slotLabel, r.classLabel, r.names].join(
      '\t',
    ),
  );
  return [header, ...lines].join('\n');
}

/** Danh sách điền tay — Ctrl+F mã lớp trên Sheet rồi dán tên */
export function exportManualFillText(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): string {
  const weekDates = getWeekDates(weekStart);
  const rows = buildManualFillRows(shifts, result, weekStart);
  if (rows.length === 0) return 'Chưa có ca nào được xếp TG.';

  const lines = [
    `ĐIỀN TAY — TUẦN ${weekDates[0] ?? weekStart}`,
    'Mỗi dòng: tìm mã lớp trên Sheet → dán tên vào cột TRÁI (cột tên TG, không phải cột màu).',
    '',
  ];

  rows.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${r.facilityLabel} · ${r.levelLabel} · ${r.dayLabel} ${r.dateLabel} · ${r.slotLabel}`,
      `   Lớp: ${r.classLabel}`,
      `   TG:  ${r.names}`,
      '',
    );
  });

  return lines.join('\n');
}
