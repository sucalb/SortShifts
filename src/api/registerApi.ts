import type { DayOfWeek } from '../types';

/**
 * Apps Script của Sheet đăng ký lịch — cùng backend với trang ShiftRegister cũ,
 * nên đăng ký ở đây hay ở trang cũ đều ghi vào một chỗ.
 */
export const REGISTER_API_URL =
  'https://script.google.com/macros/s/AKfycbyO3AH-bPufSZN6ARhCTW6wuI31B6z7H-7Tu2zR9Qg-PcI2uKsYPoxsckS6xo2H0XV7/exec';

export interface RegisterEmployee {
  name: string;
  code: string;
}

export interface RegisterWeek {
  name: string;
  /** dd/mm/yyyy — Thứ Hai đầu tuần */
  startDate: string;
}

export interface RegisterDay {
  col: number;
  date: string;
  weekday: string;
}

export interface RegisterShiftRow {
  row: number;
  label: string;
}

export interface RegisterGrid {
  week: string;
  days: RegisterDay[];
  shifts: RegisterShiftRow[];
  /** "row_col" -> on: TG này đã đăng ký, closed: ô không có ca (tô màu trên Sheet) */
  cells: Record<string, { on: boolean; closed: boolean }>;
}

async function apiGet<T>(params: Record<string, string>): Promise<T> {
  const url = `${REGISTER_API_URL}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { redirect: 'follow' });
  const data = (await res.json()) as T & { error?: string };
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error);
  }
  return data;
}

export function fetchBootstrap(): Promise<{ weeks: RegisterWeek[]; employees: RegisterEmployee[] }> {
  return apiGet({ action: 'bootstrap' });
}

export function fetchRegisterGrid(week: string, code = ''): Promise<RegisterGrid> {
  return apiGet({ action: 'grid', week, code });
}

export async function syncRegistration(
  week: string,
  code: string,
  cells: { row: number; col: number; checked: boolean }[],
): Promise<void> {
  const res = await fetch(REGISTER_API_URL, {
    method: 'POST',
    redirect: 'follow',
    // text/plain để trình duyệt không gửi preflight — Apps Script không trả lời OPTIONS
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ week, code, cells }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || 'Không ghi được lên Sheet.');
}

/** Tạo tab tuần mới trên Sheet đăng ký, nhân bản từ tuần gần nhất. `date` là yyyy-mm-dd. */
export async function createRegisterWeek(isoDate: string): Promise<RegisterWeek> {
  const [y, m, d] = isoDate.split('-');
  const res = await fetch(REGISTER_API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'createWeek', mondayDate: `${d}/${m}/${y}` }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; week?: RegisterWeek };
  if (!data.ok || !data.week) throw new Error(data.error || 'Không tạo được tuần mới.');
  return data.week;
}

/** Thứ Hai của tuần sau, dạng yyyy-mm-dd — tuần TG cần đăng ký. */
export function nextMondayIso(today = new Date()): string {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDdMmYyyy(s: string): Date {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

/** Lịch luôn được đăng ký trước một tuần, nên mặc định chọn tuần SAU. */
export function pickDefaultWeek(weeks: RegisterWeek[], today = new Date()): string {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  const dow = base.getDay();
  base.setDate(base.getDate() + (dow === 0 ? -6 : 1 - dow) + 7);
  let best = weeks[0]?.name ?? '';
  let bestDiff = Infinity;
  for (const w of weeks) {
    const diff = Math.abs(parseDdMmYyyy(w.startDate).getTime() - base.getTime());
    if (diff <= bestDiff) {
      bestDiff = diff;
      best = w.name;
    }
  }
  return best;
}

/** "2026-10-19" -> tuần đăng ký có startDate "19/10/2026", nếu có. */
export function findWeekByIsoStart(weeks: RegisterWeek[], isoDate: string): RegisterWeek | null {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = `${m[3]}/${m[2]}/${m[1]}`;
  return weeks.find((w) => w.startDate === target) ?? null;
}

const WEEKDAY_TO_DAY: Record<string, DayOfWeek> = {
  'Thứ Hai': 0,
  'Thứ Ba': 1,
  'Thứ Tư': 2,
  'Thứ Năm': 3,
  'Thứ Sáu': 4,
  'Thứ Bảy': 5,
  'Chủ Nhật': 6,
};

export function weekdayToDay(weekday: string): DayOfWeek | null {
  return WEEKDAY_TO_DAY[weekday] ?? null;
}

/**
 * Lấy toàn bộ lịch đăng ký của một tuần. API chỉ trả "người này có đăng ký ô này
 * không", nên hỏi lần lượt từng TG rồi ghép lại — tránh phải sửa và deploy lại
 * Apps Script của Sheet đăng ký.
 */
export async function fetchAllRegistrations(
  week: string,
  employees: RegisterEmployee[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ grid: RegisterGrid; namesByCell: Record<string, string[]> }> {
  const namesByCell: Record<string, string[]> = {};
  let layout: RegisterGrid | null = null;
  let done = 0;
  const queue = [...employees];
  const CONCURRENCY = 8;

  const worker = async () => {
    while (queue.length > 0) {
      const emp = queue.shift()!;
      const g = await fetchRegisterGrid(week, emp.code);
      if (!layout) layout = g;
      for (const [key, cell] of Object.entries(g.cells)) {
        if (!cell.on) continue;
        (namesByCell[key] ??= []).push(emp.code);
      }
      onProgress?.(++done, employees.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, employees.length) }, worker));
  if (!layout) layout = await fetchRegisterGrid(week);
  return { grid: layout, namesByCell };
}

/**
 * Chuyển lịch đăng ký lấy từ Sheet thành bảng TSV giống lúc copy tay từ Sheet,
 * để đi qua đúng bộ import đã có (khớp khung giờ, báo khung bị bỏ qua).
 */
export function registrationsToTsv(grid: RegisterGrid, namesByCell: Record<string, string[]>): string {
  const ordered = [...grid.days].sort(
    (a, b) => (weekdayToDay(a.weekday) ?? 9) - (weekdayToDay(b.weekday) ?? 9),
  );
  const lines = grid.shifts.map((shift) => {
    const cells = ordered.map((day) => (namesByCell[`${shift.row}_${day.col}`] ?? []).join(', '));
    return [shift.label, ...cells].join('\t');
  });
  return lines.join('\n');
}
