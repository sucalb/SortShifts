import type { TeachingAssistant } from '../data/teachingAssistants';

/**
 * Khoá so sánh tên TG. Cùng một người có thể được gõ "T.Phú", "T.PHÚ", "t.phú "
 * hay dấu tiếng Việt dạng tổ hợp (NFD, hay gặp khi gõ trên Mac/iPhone) — so
 * nguyên chuỗi thì thành hai người khác nhau và bị xếp trùng giờ.
 */
export function taNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Quy mọi cách viết tên về một tên hiển thị duy nhất: ký hiệu trong danh sách TG
 * nếu khớp ký hiệu hoặc họ tên, không thì lấy cách viết gặp đầu tiên.
 */
export function createTaCanonicalizer(roster: TeachingAssistant[] = []) {
  const byKey = new Map<string, string>();
  for (const ta of roster) {
    const display = ta.abbreviation.normalize('NFC').trim();
    if (!display) continue;
    for (const variant of [ta.abbreviation, ta.fullName]) {
      const key = taNameKey(variant ?? '');
      if (key && !byKey.has(key)) byKey.set(key, display);
    }
  }
  return (raw: string): string => {
    const key = taNameKey(raw);
    if (!key) return '';
    const known = byKey.get(key);
    if (known) return known;
    const display = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
    byKey.set(key, display);
    return display;
  };
}

/** Bỏ tên trùng (theo khoá), giữ thứ tự gặp đầu tiên. */
export function uniqueTaNames(names: string[], canonical: (raw: string) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = canonical(raw);
    if (!name) continue;
    const key = taNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
