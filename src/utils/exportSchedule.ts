import type { Shift } from '../types';
import { DAY_LABELS, FACILITY_LABELS, LEVEL_LABELS } from '../data/constants';
import { getShiftTimeSlot } from './timeUtils';
import type { ScheduleResult } from './scheduler';

interface ExportEntry {
  facility: string;
  level: string;
  day: string;
  time: string;
  className: string;
  teacher?: string;
  staff: string[];
  missing: number;
}

function buildEntries(shifts: Shift[], result: ScheduleResult): ExportEntry[] {
  const entries: ExportEntry[] = [];

  for (const shift of shifts) {
    const asn = result.assignments.find((a) => a.shiftId === shift.id);
    const assigned = asn?.staffIds ?? [];
    const missing = shift.staffNeeded - assigned.length;
    if (assigned.length === 0 && missing <= 0) continue;

    const slot = getShiftTimeSlot(shift);
    entries.push({
      facility: FACILITY_LABELS[shift.facility],
      level: LEVEL_LABELS[shift.level],
      day: DAY_LABELS[shift.day],
      time: slot?.label ?? '',
      className: shift.className,
      teacher: shift.teacher,
      staff: assigned,
      missing: Math.max(0, missing),
    });
  }

  return entries.sort((a, b) => {
    const dayOrder = Object.values(DAY_LABELS).indexOf(a.day) - Object.values(DAY_LABELS).indexOf(b.day);
    if (dayOrder !== 0) return dayOrder;
    return a.time.localeCompare(b.time);
  });
}

function shortDay(day: string): string {
  const map: Record<string, string> = {
    'Thứ Hai': 'T2',
    'Thứ Ba': 'T3',
    'Thứ Tư': 'T4',
    'Thứ Năm': 'T5',
    'Thứ Sáu': 'T6',
    'Thứ Bảy': 'T7',
    'Chủ Nhật': 'CN',
  };
  return map[day] ?? day;
}

function shortTime(time: string): string {
  return time.replace(/:00/g, '').replace(' - ', '-');
}

export function exportScheduleText(shifts: Shift[], result: ScheduleResult, weekStart: string): string {
  const entries = buildEntries(shifts, result);
  const byPerson = new Map<string, string[]>();

  for (const e of entries) {
    for (const name of e.staff) {
      const line = `${shortDay(e.day)} ${shortTime(e.time)} | ${e.facility} ${e.className}${e.teacher ? ` (${e.teacher})` : ''}`;
      if (!byPerson.has(name)) byPerson.set(name, []);
      byPerson.get(name)!.push(line);
    }
  }

  const lines: string[] = [
    `LỊCH LÀM VIỆC TUẦN ${weekStart}`,
    '='.repeat(40),
    '',
    '--- THEO TRỢ GIẢNG ---',
  ];

  for (const [name, shifts_] of [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'))) {
    lines.push(`\n${name}:`);
    for (const s of shifts_) lines.push(`  • ${s}`);
  }

  lines.push('', '--- THEO CA ---');
  for (const e of entries) {
    const staff = e.staff.join(', ') || '(thiếu)';
    const miss = e.missing > 0 ? ` [thiếu ${e.missing}]` : '';
    lines.push(
      `${shortDay(e.day)} ${shortTime(e.time)} | ${e.facility} ${e.level} ${e.className} → ${staff}${miss}`,
    );
  }

  return lines.join('\n');
}

export function exportScheduleHtml(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): string {
  const entries = buildEntries(shifts, result);
  const byPerson = new Map<string, { line: string; facility: string }[]>();

  for (const e of entries) {
    for (const name of e.staff) {
      const line = `${shortDay(e.day)} ${shortTime(e.time)} · ${e.className}`;
      if (!byPerson.has(name)) byPerson.set(name, []);
      byPerson.get(name)!.push({ line, facility: e.facility });
    }
  }

  const personCards = [...byPerson.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
    .map(
      ([name, items]) => `
    <div class="card">
      <div class="name">${escapeHtml(name)}</div>
      <ul>${items.map((i) => `<li><span class="fac">${escapeHtml(i.facility)}</span> ${escapeHtml(i.line)}</li>`).join('')}</ul>
    </div>`,
    )
    .join('');

  const shiftRows = entries
    .map((e) => {
      const staff = e.staff.join(', ') || '<span class="miss">Chưa xếp</span>';
      const miss = e.missing > 0 ? ` <span class="miss">(thiếu ${e.missing})</span>` : '';
      return `<tr>
        <td>${shortDay(e.day)}</td>
        <td>${shortTime(e.time)}</td>
        <td>${e.facility}</td>
        <td>${e.className}</td>
        <td>${staff}${miss}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Lịch làm việc ${weekStart}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; padding: 12px; color: #222; }
  h1 { font-size: 14px; text-align: center; color: #e65100; margin-bottom: 4px; }
  .sub { text-align: center; font-size: 10px; color: #666; margin-bottom: 12px; }
  h2 { font-size: 11px; color: #e65100; margin: 10px 0 6px; border-bottom: 1px solid #ffcc80; padding-bottom: 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
  .card { border: 1px solid #ddd; border-radius: 4px; padding: 6px; background: #fafafa; }
  .card .name { font-weight: 700; color: #1565c0; margin-bottom: 4px; font-size: 11px; }
  .card ul { list-style: none; }
  .card li { font-size: 10px; padding: 1px 0; }
  .fac { color: #e65100; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
  th, td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; }
  th { background: #fff3e0; font-size: 10px; }
  .miss { color: #c62828; }
  @media print { body { padding: 8px; } .grid { grid-template-columns: repeat(4, 1fr); } }
</style></head><body>
<h1>LỊCH LÀM VIỆC MÔN TIẾNG ANH</h1>
<p class="sub">Tuần bắt đầu ${escapeHtml(weekStart)}</p>
<h2>Theo trợ giảng</h2>
<div class="grid">${personCards}</div>
<h2>Theo ca</h2>
<table>
  <thead><tr><th>Ngày</th><th>Ca</th><th>Cơ sở</th><th>Lớp</th><th>TG</th></tr></thead>
  <tbody>${shiftRows}</tbody>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
