import type { Assignment, DayOfWeek, Facility, Level, Shift } from '../types';
import { getWeekDates } from '../data/constants';
import type { ScheduleResult } from './scheduler';
import { formatClassLabel } from './exportSchedule';
import { getShiftTimeSlot } from './timeUtils';

export interface SheetEntry {
  facility: Facility;
  level: Level;
  day: DayOfWeek;
  slot: string;
  className: string;
  classLabel: string;
  names: string;
}

export interface SheetsSyncPayload {
  weekStart: string;
  weekLabel: string;
  weekTabHint: string;
  entries: SheetEntry[];
}

function getAssignedStaff(shiftId: string, assignments: Assignment[]): string[] {
  return assignments.find((a) => a.shiftId === shiftId)?.staffIds ?? [];
}

export function weekTabHintFromStart(weekStart: string): string {
  const m = weekStart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}`;
}

export function buildSheetsSyncPayload(
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): SheetsSyncPayload {
  const weekDates = getWeekDates(weekStart);
  const entries: SheetEntry[] = [];

  for (const shift of shifts) {
    const staff = getAssignedStaff(shift.id, result.assignments);
    if (staff.length === 0) continue;

    const slot = getShiftTimeSlot(shift);
    if (!slot) continue;

    entries.push({
      facility: shift.facility,
      level: shift.level,
      day: shift.day,
      slot: slot.label,
      className: shift.className,
      classLabel: formatClassLabel(shift),
      names: staff.map((n) => n.toUpperCase()).join(', '),
    });
  }

  return {
    weekStart,
    weekLabel: weekDates[0] ?? weekStart,
    weekTabHint: weekTabHintFromStart(weekStart),
    entries,
  };
}

function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(\?.*)?$/i.test(url.trim());
}

function friendlyScriptError(text: string, status: number): string {
  const lower = text.toLowerCase();
  if (
    lower.includes('<!doctype html') ||
    lower.includes('<html') ||
    lower.includes('không tìm thấy trang') ||
    lower.includes('page not found') ||
    lower.includes('cannot open file')
  ) {
    return (
      'URL Web App không hợp lệ hoặc đã hết hạn (Google trả về trang lỗi 404). ' +
      'Mở Apps Script → Deploy → Manage deployments → copy URL dạng .../macros/s/.../exec ' +
      '(Execute as: Me · Who has access: Anyone).'
    );
  }
  if (lower.includes('authorization') || lower.includes('sign in') || lower.includes('đăng nhập')) {
    return 'Web App chưa mở quyền truy cập. Deploy lại với Who has access: Anyone.';
  }
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length > 240) return trimmed.slice(0, 240) + '…';
  return trimmed || `HTTP ${status}`;
}

function parseScriptResponse(text: string) {
  try {
    return JSON.parse(text) as {
      ok?: boolean;
      message?: string;
      error?: string;
      version?: string;
      grid?: string[][];
      colorGrid?: string[][];
      tab?: string;
      count?: number;
    };
  } catch {
    return null;
  }
}

export async function checkScriptVersion(
  webhookUrl: string,
): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const url = webhookUrl.trim();
  if (!url) return { ok: false, error: 'Chưa có URL.' };
  if (!isValidWebhookUrl(url)) {
    return {
      ok: false,
      error:
        'URL sai định dạng. Cần dạng https://script.google.com/macros/s/.../exec (không phải link editor hay /dev).',
    };
  }

  try {
    const pingUrl = url.includes('?') ? `${url}&ping=1` : `${url}?ping=1`;
    const res = await fetch(pingUrl, { method: 'GET', redirect: 'follow' });
    const text = await res.text();
    const json = parseScriptResponse(text);
    if (!json) {
      return { ok: false, error: friendlyScriptError(text, res.status) };
    }
    const version = json.version ?? json.message ?? 'unknown';
    return { ok: true, version: String(version) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không kiểm tra được phiên bản script.',
    };
  }
}

export interface CellUpdatePayload {
  weekTabHint: string;
  updates: { row: number; col: number; value: string }[];
}

export async function fetchSheetGrid(
  webhookUrl: string,
  weekTabHint: string,
): Promise<{ grid: string[][]; colorGrid?: string[][]; tab: string; count: number }> {
  const url = webhookUrl.trim();
  if (!url) throw new Error('Chưa cấu hình URL Apps Script.');
  if (!isValidWebhookUrl(url)) {
    throw new Error('URL Web App không hợp lệ (cần .../exec).');
  }

  const scanUrl = url.includes('?')
    ? `${url}&scan=1&weekTabHint=${encodeURIComponent(weekTabHint)}`
    : `${url}?scan=1&weekTabHint=${encodeURIComponent(weekTabHint)}`;

  const parseGridResponse = (json: ReturnType<typeof parseScriptResponse>) => {
    if (json?.ok === false) throw new Error(json.error ?? 'Lỗi quét Sheet.');
    if (json?.grid?.length) {
      return {
        grid: json.grid,
        colorGrid: json.colorGrid,
        tab: json.tab ?? `TUẦN ${weekTabHint}`,
        count: json.count ?? 0,
      };
    }
    return null;
  };

  try {
    const res = await fetch(scanUrl, { method: 'GET', redirect: 'follow' });
    const text = await res.text();
    const parsed = parseGridResponse(parseScriptResponse(text));
    if (parsed) return parsed;

    const postRes = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ mode: 'scan', weekTabHint }),
    });
    const postText = await postRes.text();
    const postParsed = parseGridResponse(parseScriptResponse(postText));
    if (postParsed) return postParsed;

    throw new Error(
      friendlyScriptError(postText, postRes.status) +
        ' Cần deploy script v17 (quét tab tuần + màu lớp).',
    );
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('Không đọc được layout từ Google Sheet.');
  }
}


export async function pushCellUpdates(
  webhookUrl: string,
  payload: CellUpdatePayload,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const url = webhookUrl.trim();
  if (!url) return { ok: false, error: 'Chưa cấu hình URL Apps Script.' };
  if (!isValidWebhookUrl(url)) {
    return { ok: false, error: 'URL Web App không hợp lệ (cần .../exec).' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ mode: 'cells', ...payload }),
    });
    const text = await res.text();
    const json = parseScriptResponse(text);
    if (json) {
      if (json.ok === false) return { ok: false, error: json.error ?? 'Lỗi Apps Script.' };
      return { ok: true, message: json.message ?? 'Đã ghi Sheet.' };
    }
    return { ok: false, error: friendlyScriptError(text, res.status) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không kết nối được Apps Script.',
    };
  }
}

export async function pushToGoogleSheets(
  webhookUrl: string,
  payload: SheetsSyncPayload,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const url = webhookUrl.trim();
  if (!url) {
    return { ok: false, error: 'Chưa cấu hình URL Google Apps Script.' };
  }
  if (!isValidWebhookUrl(url)) {
    return {
      ok: false,
      error:
        'URL sai định dạng. Copy lại từ Deploy → Web app URL (kết thúc bằng /exec).',
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    const json = parseScriptResponse(text);
    if (json) {
      if (json.ok === false) {
        return { ok: false, error: json.error ?? 'Apps Script trả về lỗi.' };
      }
      return { ok: true, message: json.message ?? 'Đã cập nhật Google Sheets.' };
    }

    if (res.ok && text.includes('ok')) {
      return { ok: true, message: 'Đã gửi dữ liệu tới Google Sheets.' };
    }
    return { ok: false, error: friendlyScriptError(text, res.status) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Không kết nối được tới Google Sheets.',
    };
  }
}
