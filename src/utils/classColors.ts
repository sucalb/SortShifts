import { getClassColor as fallbackClassColor } from './exportSchedule';

function normalizeHex(color: string): string {
  const c = color.trim().toLowerCase();
  if (!c || c === '#ffffff' || c === '#fff' || c === 'white') return '';
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return c;
}

function classCore(value: string): string {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function looksLikeClass(text: string): boolean {
  const t = classCore(text);
  if (!t) return false;
  if (/\bB[123]\b/.test(t)) return true;
  if (/\d/.test(t) && /B[123]/i.test(t)) return true;
  return false;
}

/** Gộp màu nền ô mã lớp từ Sheet → map tên lớp → hex */
export function buildClassColorMap(grid: string[][], colorGrid: string[][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const val = (grid[r]?.[c] ?? '').trim();
      if (!looksLikeClass(val)) continue;
      const hex = normalizeHex(colorGrid[r]?.[c] ?? '');
      if (!hex) continue;
      map[val.toUpperCase()] = hex;
      map[classCore(val)] = hex;
    }
  }
  return map;
}

export function resolveClassColor(
  className: string,
  sheetColors: Record<string, string> | undefined,
): string {
  const trimmed = className.trim();
  if (!trimmed) return fallbackClassColor(className);
  const fromSheet =
    sheetColors?.[trimmed.toUpperCase()] ??
    sheetColors?.[classCore(trimmed)] ??
    sheetColors?.[trimmed];
  return fromSheet ?? fallbackClassColor(className);
}

export function mergeClassColorMaps(
  ...maps: (Record<string, string> | undefined)[]
): Record<string, string> {
  return Object.assign({}, ...maps.filter(Boolean));
}
