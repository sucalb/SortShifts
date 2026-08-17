import { autoSchedule } from '../src/utils/scheduler';
import { analyzeLoneShifts } from '../src/utils/loneShifts';
import { taFragmentationCost } from '../src/utils/shiftContiguity';
import { SCHEDULE_SLOTS, REGISTRATION_SLOTS } from '../src/data/constants';
import type { DayOfWeek, Shift } from '../src/types';
import type { RegistrationGrid } from '../src/utils/registrationUtils';

const days: DayOfWeek[] = [0,1,2,3,4,5,6];
const emptyGrid = (): RegistrationGrid => Object.fromEntries(
  days.map(d => [d, Object.fromEntries(REGISTRATION_SLOTS.map(s => [s.id, '']))])) as RegistrationGrid;
const shift = (id: string, day: DayOfWeek, timeSlotId: string, extra: Partial<Shift> = {}): Shift =>
  ({ id, facility: 'coso1', level: 'cap3', day, timeSlotId, className: id, staffNeeded: 1, ...extra });

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { if (ok) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };

console.log('--- Ràng buộc cứng ---');
check('không có ca', autoSchedule([], emptyGrid()).assignments.length === 0);
check('không đăng ký', autoSchedule([shift('a',0,'cs1c3-5')], emptyGrid()).assignments.length === 0);
check('grid undefined', autoSchedule([shift('a',0,'cs1c3-5')], undefined).assignments.length === 0);
check('slot lạ', autoSchedule([shift('a',0,'xx')], emptyGrid()).assignments.length === 0);
{ const g = emptyGrid(); g[5]!['reg-1'] = 'A';
  const ss = [shift('x',5,'cs1c3-1'), { ...shift('y',5,'cs1c2-1'), level:'cap2' as const }];
  check('không trùng giờ', autoSchedule(ss,g).stats.totalSlotsFilled === 1); }
{ const g = emptyGrid(); g[0]!['reg-5'] = 'A, B, C, D, E';
  const r = autoSchedule([shift('c',0,'cs1c3-5',{staffNeeded:2})], g);
  check('tôn trọng staffNeeded', r.assignments[0]?.staffIds.length === 2);
  check('không lặp tên', new Set(r.assignments[0]!.staffIds).size === 2); }
{ const g = emptyGrid(); g[0]!['reg-5'] = 'A';
  const r = autoSchedule([shift('s',0,'cs1c3-5',{staffNeeded:3})], g);
  check('không bịa người', r.assignments[0]?.staffIds.join() === 'A');
  check('báo thiếu', r.unfulfilled[0]?.missing === 2); }
{ const g = emptyGrid(); g[0]!['reg-5'] = 'A, B, C';
  const r = autoSchedule([shift('f',0,'cs1c3-5',{teacher:'GV1'})], g, undefined, { GV1:['C'] });
  check('TG cố định được giữ', r.assignments[0]?.staffIds[0] === 'C'); }
{ const g = emptyGrid(); g[0]!['reg-5']='A, C'; g[0]!['reg-6']='A, C';
  const ss = [shift('free',0,'cs1c3-5'), shift('fixed',0,'cs1c3-6',{teacher:'GV1'})];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  check('ca cố định giữ C', r.assignments.find(a=>a.shiftId==='fixed')?.staffIds[0] === 'C');
  check('ca tự do lấy A', r.assignments.find(a=>a.shiftId==='free')?.staffIds[0] === 'A'); }

console.log('\n--- Nối ca liền nhau ---');
{ const g = emptyGrid(); g[0]!['reg-5']='A, B'; g[0]!['reg-6']='A, B';
  const ss = [shift('s1',0,'cs1c3-5'), shift('s2',0,'cs1c3-6')];
  const r = autoSchedule(ss,g);
  const w = ss.map(s => r.assignments.find(a=>a.shiftId===s.id)?.staffIds[0]);
  check('2 ca liền nhau về 1 người', w[0] === w[1], JSON.stringify(w));
  check('lấp đủ', r.stats.totalSlotsFilled === 2); }
{ const g = emptyGrid(); g[5]!['reg-0']='A, B'; g[5]!['reg-5']='A, B';
  const ss = [shift('sang',5,'cs1c3-0'), shift('toi',5,'cs1c3-5')];
  const r = autoSchedule(ss,g);
  const w = ss.map(s => r.assignments.find(a=>a.shiftId===s.id)?.staffIds[0]);
  check('ca cách xa chia 2 người', w[0] !== w[1], JSON.stringify(w)); }

console.log('\n--- Miễn phạt khi không thể nối (T.Phú/Quân) ---');
{ // Phạt "ca lẻ" phải được miễn khi TG không có ca nào để nối
  const iv = { shiftId:'s', day:0 as DayOfWeek, start:1020, end:1140 };
  const w = { extraBlock:12, loneBlock:8, idleHour:1.5, loadBalance:0 };
  const coPhat = taFragmentationCost([iv], w, 30, () => true);
  const mienPhat = taFragmentationCost([iv], w, 30, () => false);
  check('nối được -> chịu phạt ca lẻ', coPhat === 8, String(coPhat));
  check('không nối được -> miễn phạt', mienPhat === 0, String(mienPhat));
  check('mặc định vẫn phạt', taFragmentationCost([iv], w, 30) === 8); }
{ // A chỉ đăng ký khung lẻ 17-19; B đăng ký cả 17-19 lẫn 19-21.
  // B ôm được 1 cặp liền nhau, nhưng A vẫn phải có ca chứ không bị bỏ trắng.
  const g = emptyGrid();
  g[0]!['reg-5'] = 'A, B';
  g[0]!['reg-6'] = 'B';
  const ss = [shift('som1',0,'cs1c3-5'), shift('som2',0,'cs1c3-5',{className:'som2'}), shift('muon',0,'cs1c3-6')];
  const r = autoSchedule(ss,g);
  const who = (id: string) => r.assignments.find(a=>a.shiftId===id)?.staffIds[0];
  const all = ss.map(x => who(x.id));
  check('A không bị bỏ trắng', all.includes('A'), JSON.stringify(all));
  check('B nối được cặp liền nhau', who('muon') === 'B' && (who('som1') === 'B' || who('som2') === 'B'), JSON.stringify(all));
  check('lấp đủ cả 3', r.stats.totalSlotsFilled === 3, String(r.stats.totalSlotsFilled)); }

console.log('\n--- Báo cáo ca lẻ ---');
{ const g = emptyGrid(); g[0]!['reg-5']='A'; g[0]!['reg-6']='A';
  const ss = [shift('s1',0,'cs1c3-5'), shift('s2',0,'cs1c3-6')];
  check('chuỗi liền -> 0 ca lẻ', analyzeLoneShifts(autoSchedule(ss,g).assignments, ss, g).entries.length === 0); }
{ const g = emptyGrid(); g[0]!['reg-5']='A';
  const ss = [shift('s1',0,'cs1c3-5')];
  const rep = analyzeLoneShifts(autoSchedule(ss,g).assignments, ss, g);
  check("lý do no-registration", rep.entries[0]?.reason === 'no-registration', rep.entries[0]?.reason);
  check('tính là hết cách', rep.forcedCount === 1 && rep.fixableCount === 0); }
{ const g = emptyGrid(); g[0]!['reg-5']='A'; g[0]!['reg-6']='A';
  const ss = [shift('s1',0,'cs1c3-5')];
  check("lý do no-adjacent-shift", analyzeLoneShifts(autoSchedule(ss,g).assignments, ss, g).entries[0]?.reason === 'no-adjacent-shift'); }
{ const g = emptyGrid(); g[0]!['reg-5']='A, B'; g[0]!['reg-6']='A, B';
  const ss = [shift('s1',0,'cs1c3-5'), shift('s2',0,'cs1c3-6')];
  const rep = analyzeLoneShifts([{ shiftId:'s1', staffIds:['A'] }], ss, g);
  check("sửa tay -> adjacent-open", rep.entries[0]?.reason === 'adjacent-open', rep.entries[0]?.reason);
  check('đếm là sửa được', rep.fixableCount === 1); }
{ const g = emptyGrid(); g[5]!['reg-2']='A'; g[5]!['reg-3']='A';
  const ss = [shift('am',5,'cs1c3-2'), shift('pm',5,'cs1c3-3')];
  check('nghỉ trưa -> 2 cụm rời', analyzeLoneShifts(autoSchedule(ss,g).assignments, ss, g).entries.length === 2); }

console.log('\n--- Ổn định & hiệu năng ---');
{ const g = emptyGrid();
  for (const d of days) for (const s of REGISTRATION_SLOTS) g[d]![s.id] = 'A, B, C, D, E, F, G, H';
  const ss: Shift[] = [];
  for (const [key, slots] of Object.entries(SCHEDULE_SLOTS)) {
    const [facility, level] = key.split('-') as ['coso1'|'coso2','cap1'|'cap2'|'cap3'];
    for (const day of days) for (const slot of slots)
      ss.push({ id:`${key}-${day}-${slot.id}`, facility, level, day, timeSlotId:slot.id, className:'c', staffNeeded:2 });
  }
  const t0 = Date.now(); const r1 = autoSchedule(ss,g); const ms = Date.now()-t0;
  check('tất định', JSON.stringify(r1.assignments) === JSON.stringify(autoSchedule(ss,g).assignments));
  check(`${ss.length} ca < 3s (${ms}ms)`, ms < 3000);
  const slotById = new Map(Object.values(SCHEDULE_SLOTS).flat().map(s=>[s.id,s]));
  const shiftById = new Map(ss.map(s=>[s.id,s]));
  const byName = new Map<string,{day:number;start:number;end:number}[]>();
  let clash = 0;
  for (const a of r1.assignments) { const sh = shiftById.get(a.shiftId)!; const sl = slotById.get(sh.timeSlotId)!;
    for (const n of a.staffIds) { const l = byName.get(n) ?? [];
      if (l.some(x => x.day===sh.day && x.start<sl.end && sl.start<x.end)) clash++;
      l.push({day:sh.day,start:sl.start,end:sl.end}); byName.set(n,l); } }
  check('0 xung đột giờ', clash === 0, clash + ' xung đột'); }

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
