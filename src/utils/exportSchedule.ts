import type { Assignment, DayOfWeek, Facility, Level, Shift } from '../types';
import {
  FACILITY_LABELS,
  LEVEL_LABELS,
  SCHEDULE_SLOTS,
  getScheduleKey,
  getWeekDates,
} from '../data/constants';
import type { ScheduleResult } from './scheduler';

const DAY_LABELS_UPPER: Record<DayOfWeek, string> = {
  0: 'THỨ HAI',
  1: 'THỨ BA',
  2: 'THỨ TƯ',
  3: 'THỨ NĂM',
  4: 'THỨ SÁU',
  5: 'THỨ BẢY',
  6: 'CHỦ NHẬT',
};

export const CLASS_COLORS: Record<string, string> = {
  '12 B1': '#b8d4f0',
  '11 B1': '#c8e6c9',
  '10 B1': '#fff176',
  '10 B2': '#ffcdd2',
  '12 B2': '#f48fb1',
  '11 B2': '#ce93d8',
  '12 B3': '#80cbc4',
  '6.1 B1': '#90caf9',
  '6.1 B2': '#90caf9',
  '7.2 B1': '#81d4fa',
  '7.2 B2': '#81d4fa',
  '8.1 B1': '#b39ddb',
  '8.1 B2': '#b39ddb',
  '8.2 B1': '#ffcc80',
  '8.2 B2': '#ffcc80',
  '8.3 B1': '#a5d6a7',
  '8.3 B2': '#a5d6a7',
  '9.1 B1': '#ffab91',
  '9.1 B2': '#ffab91',
  '9.2 B1': '#fff59d',
  '9.2 B2': '#fff59d',
  '9.3 B1': '#ffcc80',
  '9.3 B2': '#ffcc80',
  '9.4 B1': '#ef9a9a',
  '9.4 B2': '#ef9a9a',
  '9.5 B1': '#bcaaa4',
  '9.5 B2': '#bcaaa4',
  '7.1 B1': '#b8d4f0',
  '7.1 B2': '#b8d4f0',
  '6.2 B1': '#ef9a9a',
  '6.2 B2': '#ef9a9a',
  '5.1 B1': '#c5e1a5',
  '5.1 B2': '#c5e1a5',
  '5.2 B1': '#ffe082',
  '5.2 B2': '#ffe082',
  '11A B1': '#b8d4f0',
  '11A B2': '#b8d4f0',
  '10A B1': '#fff176',
  '10B B1': '#ffcdd2',
};

const LEVEL_ORDER: Level[] = ['cap3', 'cap2', 'cap1'];
const FACILITY_ORDER: Facility[] = ['coso1', 'coso2'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getClassColor(className: string): string {
  if (CLASS_COLORS[className]) return CLASS_COLORS[className];
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 82%)`;
}

export function formatClassLabel(shift: Shift): string {
  const base = shift.className;
  if (shift.teacher) return `${base} (${shift.teacher})`;
  return base;
}

function getAssignedStaff(shiftId: string, assignments: Assignment[]): string[] {
  return assignments.find((a) => a.shiftId === shiftId)?.staffIds ?? [];
}

function renderShiftBlock(shift: Shift, assignments: Assignment[]): string {
  const staff = getAssignedStaff(shift.id, assignments);
  const staffText = staff.length > 0 ? staff.map((n) => n.toUpperCase()).join(', ') : '';
  const classLabel = formatClassLabel(shift);
  const color = getClassColor(shift.className);
  const missing = shift.staffNeeded - staff.length;

  return `<div class="entry">
    <span class="staff">${escapeHtml(staffText)}</span>
    <span class="class-tag" style="background:${color}">${escapeHtml(classLabel)}</span>
    ${missing > 0 ? `<span class="miss">(-${missing})</span>` : ''}
  </div>`;
}

function renderLevelTable(
  facility: Facility,
  level: Level,
  shifts: Shift[],
  assignments: Assignment[],
  weekDates: string[],
): string {
  const key = getScheduleKey(facility, level);
  const slots = SCHEDULE_SLOTS[key] ?? [];
  const levelShifts = shifts.filter((s) => s.facility === facility && s.level === level);
  if (levelShifts.length === 0) return '';

  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

  const headerCells = days
    .map(
      (d) =>
        `<th><div class="day-name">${DAY_LABELS_UPPER[d]}</div><div class="day-date">${escapeHtml(weekDates[d])}</div></th>`,
    )
    .join('');

  const bodyRows = slots
    .map((slot) => {
      const dayCells = days
        .map((day) => {
          const cellShifts = levelShifts.filter(
            (s) => s.day === day && s.timeSlotId === slot.id,
          );
          const content =
            cellShifts.length > 0
              ? cellShifts.map((s) => renderShiftBlock(s, assignments)).join('')
              : '';
          return `<td class="cell">${content}</td>`;
        })
        .join('');
      return `<tr><td class="time-col">${escapeHtml(slot.label)}</td>${dayCells}</tr>`;
    })
    .join('');

  return `
  <div class="level-block">
    <table class="grid">
      <thead>
        <tr class="level-head"><th colspan="8">${LEVEL_LABELS[level]}</th></tr>
        <tr class="col-head">
          <th class="time-col">Ca</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

function renderFacilityPage(
  facility: Facility,
  shifts: Shift[],
  assignments: Assignment[],
  weekStart: string,
  weekDates: string[],
): string {
  const facilityShifts = shifts.filter((s) => s.facility === facility);
  if (facilityShifts.length === 0) return '';

  const levels = LEVEL_ORDER.map((level) =>
    renderLevelTable(facility, level, shifts, assignments, weekDates),
  )
    .filter(Boolean)
    .join('');

  const weekLabel = weekDates[0] ?? weekStart;

  return `
  <section class="facility-page">
    <div class="banner">
      <h1>LỊCH LÀM VIỆC MÔN TIẾNG ANH ${FACILITY_LABELS[facility].toUpperCase()}</h1>
    </div>
    <div class="meta-row">
      <span class="week">TUẦN: ${escapeHtml(weekLabel)}</span>
    </div>
    ${levels}
  </section>`;
}

const EXPORT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 9px; color: #222; background: #fff; }
  .facility-page { margin-bottom: 24px; }
  .banner { background: #e65100; color: #fff; text-align: center; padding: 8px 6px; }
  .banner h1 { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
  .meta-row { display: flex; justify-content: space-between; padding: 4px 6px; font-size: 9px; font-weight: 600; }
  .level-block { margin-top: 0; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .level-head th {
    background: #e65100; color: #fff; font-size: 11px; font-weight: 700;
    padding: 4px; text-align: center; border: 1px solid #bf360c;
  }
  .col-head th {
    background: #e65100; color: #fff; font-weight: 700; font-size: 8px;
    padding: 3px 2px; border: 1px solid #bf360c; vertical-align: middle;
  }
  .day-name { font-size: 8px; line-height: 1.2; }
  .day-date { font-size: 7px; font-weight: 400; opacity: 0.95; margin-top: 1px; }
  .time-col { width: 62px; background: #fff3e0; font-weight: 600; font-size: 8px; }
  td, th { border: 1px solid #bbb; }
  td.cell { padding: 2px 3px; vertical-align: top; min-height: 22px; height: 24px; }
  td.time-col { padding: 3px 4px; text-align: center; vertical-align: middle; }
  .entry {
    display: flex; align-items: center; justify-content: space-between;
    gap: 3px; min-height: 14px; margin-bottom: 1px; line-height: 1.15;
  }
  .entry:last-child { margin-bottom: 0; }
  .staff { flex: 1; text-align: left; font-size: 7.5px; font-weight: 600; word-break: break-word; }
  .class-tag {
    flex-shrink: 0; font-size: 7.5px; font-weight: 700;
    padding: 1px 3px; border-radius: 2px; white-space: nowrap;
    border: 1px solid rgba(0,0,0,0.12);
  }
  .miss { color: #c62828; font-size: 7px; flex-shrink: 0; }
  @media print {
    body { padding: 0; }
    .facility-page { page-break-after: always; margin-bottom: 0; }
    .facility-page:last-child { page-break-after: auto; }
  }
`;

export function exportScheduleHtml(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): string {
  const weekDates = getWeekDates(weekStart);
  const pages = FACILITY_ORDER.map((f) =>
    renderFacilityPage(f, shifts, result.assignments, weekStart, weekDates),
  )
    .filter(Boolean)
    .join('');

  return `<!DOCTYPE html>
<html lang="vi"><head>
<meta charset="utf-8">
<title>Lịch làm việc ${escapeHtml(weekStart)}</title>
<style>${EXPORT_STYLES}</style>
</head><body>${pages}</body></html>`;
}

/** Plain-text fallback (compact grid summary) */
export function exportScheduleText(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): string {
  const weekDates = getWeekDates(weekStart);
  const lines: string[] = [`LỊCH LÀM VIỆC TUẦN ${weekDates[0] ?? weekStart}`, ''];

  for (const facility of FACILITY_ORDER) {
    const facilityShifts = shifts.filter((s) => s.facility === facility);
    if (facilityShifts.length === 0) continue;

    lines.push(FACILITY_LABELS[facility].toUpperCase(), '='.repeat(36));

    for (const level of LEVEL_ORDER) {
      const key = getScheduleKey(facility, level);
      const slots = SCHEDULE_SLOTS[key] ?? [];
      const levelShifts = facilityShifts.filter((s) => s.level === level);
      if (levelShifts.length === 0) continue;

      lines.push('', LEVEL_LABELS[level]);
      const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
      lines.push(
        'Ca\t' + days.map((d) => `${DAY_LABELS_UPPER[d]} ${weekDates[d]}`).join('\t'),
      );

      for (const slot of slots) {
        const row = [slot.label];
        for (const day of days) {
          const cellShifts = levelShifts.filter(
            (s) => s.day === day && s.timeSlotId === slot.id,
          );
          const parts = cellShifts.map((s) => {
            const staff = getAssignedStaff(s.id, result.assignments);
            const names = staff.map((n) => n.toUpperCase()).join(', ') || '—';
            return `${names} | ${formatClassLabel(s)}`;
          });
          row.push(parts.join(' / ') || '');
        }
        lines.push(row.join('\t'));
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintableHtml(html: string) {
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
