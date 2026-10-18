import { autoSchedule } from '../src/utils/scheduler';
import { analyzeLoneShifts } from '../src/utils/loneShifts';
import { parseRegistrationImport } from '../src/utils/importRegistration';
import { taFragmentationCost } from '../src/utils/shiftContiguity';
import { findDoubleBookings } from '../src/utils/assignmentValidation';
import { isAdmin, verifyLocalCredentials } from '../src/utils/localAuth';
import { getAssignmentWarnings } from '../src/utils/assignmentValidation';
import { scanShiftsFromSheetGrid, fillFromSheetGrid } from '../src/utils/csvTemplateFill';
import { recomputeScheduleResult } from '../src/utils/scheduler';
import { buildScheduleFromSheetGrid } from '../src/utils/sheetShiftImport';
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
  check('ca cố định giữ C', r.assignments.find(a=>a.shiftId==='fixed')?.staffIds[0] === 'C'); }
{ // TG cố định KHÔNG còn bị cấm nhận ca tự do khác
  const g = emptyGrid(); g[0]!['reg-5']='C'; g[0]!['reg-6']='C';
  const ss = [shift('free',0,'cs1c3-5'), shift('fixed',0,'cs1c3-6',{teacher:'GV1'})];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  check('TG cố định vẫn nhận được ca tự do', r.stats.totalSlotsFilled === 2, String(r.stats.totalSlotsFilled)); }
{ // Ca cố định thiếu người thì người khác vẫn được điền vào
  const g = emptyGrid(); g[0]!['reg-6']='A, C';
  const ss = [shift('fixed',0,'cs1c3-6',{teacher:'GV1', staffNeeded:2})];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  const who = r.assignments[0]?.staffIds ?? [];
  check('ca cố định được điền thêm người', who.length === 2 && who.includes('C') && who.includes('A'), JSON.stringify(who)); }
{ // TG cố định không bị vòng tối ưu đẩy ra khỏi ca của mình
  const g = emptyGrid(); g[0]!['reg-5']='A, B, C'; g[0]!['reg-6']='A, B, C';
  const ss = [shift('fixed',0,'cs1c3-5',{teacher:'GV1'}), shift('free',0,'cs1c3-6')];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  check('TG cố định vẫn ở nguyên ca', r.assignments.find(a=>a.shiftId==='fixed')?.staffIds.includes('C') === true,
        JSON.stringify(r.assignments)); }

{ // 9:00-10:30 và 10:00-12:00 chồng 30 phút -> không tính trùng
  const g = emptyGrid(); g[5]!['reg-1']='A'; g[5]!['reg-2']='A';
  const ss = [shift('a',5,'cs1c3-1'), shift('b',5,'cs1c3-2')];
  const r = autoSchedule(ss, g);
  check('chồng 30 phút vẫn xếp được cả hai', r.stats.totalSlotsFilled === 2, JSON.stringify(r.assignments));
  const warns = getAssignmentWarnings(ss[1], ['A'], [{shiftId:'a',staffIds:['A']},{shiftId:'b',staffIds:['A']}], ss, g);
  check('chồng 30 phút không báo trùng', !warns.some(w => w.type === 'conflict'), JSON.stringify(warns)); }

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
  const iv = { shiftId:'s', day:0 as DayOfWeek, start:1020, end:1140,
               facility:'coso1' as const, level:'cap3' as const };
  const w = { extraBlock:12, loneBlock:8, idleHour:1.5, loadBalance:0,
              facilitySwitch:20, levelSwitch:2 };
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

{ // 3 TG cùng rảnh 2 khung liền ở 2 ngày -> phải ra 2 cặp liền, không ai lẻ
  const g = emptyGrid();
  for (const d of [0,1] as DayOfWeek[]) { g[d]!['reg-5']='QUANG, KHAI, HLONG'; g[d]!['reg-6']='QUANG, KHAI, HLONG'; }
  const mk = (id: string, day: DayOfWeek, slot: string, need: number): Shift =>
    ({ id, facility:'coso1', level:'cap2', day, timeSlotId:slot, className:id, staffNeeded:need });
  const ss = [mk('t2a',0,'cs1c2-4',1), mk('t2b',0,'cs1c2-5',1),
              mk('t3a',1,'cs1c2-4',2), mk('t3b',1,'cs1c2-5',2)];
  const r = autoSchedule(ss,g);
  const at = (id: string) => (r.assignments.find(a=>a.shiftId===id)?.staffIds ?? []).slice().sort().join(',');
  check('lấp đủ 6 slot', r.stats.totalSlotsFilled === 6, String(r.stats.totalSlotsFilled));
  check('T2 hai ca cùng người', at('t2a') === at('t2b'), `${at('t2a')} / ${at('t2b')}`);
  check('T3 hai ca cùng cặp người', at('t3a') === at('t3b'), `${at('t3a')} / ${at('t3b')}`); }

console.log('\n--- Cơ sở & cấp ---');
{ // 17-19 CS1 và 19-21 CS2 sát giờ nhưng khác cơ sở -> phải chia 2 người
  const g = emptyGrid(); g[0]!['reg-5']='A, B'; g[0]!['reg-6']='A, B';
  const ss = [
    shift('cs1',0,'cs1c3-5'),
    { ...shift('cs2',0,'cs2c3-2'), facility:'coso2' as const },
  ];
  const r = autoSchedule(ss,g);
  const w = ss.map(x => r.assignments.find(a=>a.shiftId===x.id)?.staffIds[0]);
  check('không bắt chạy giữa 2 cơ sở', w[0] !== w[1], JSON.stringify(w));
  check('vẫn lấp đủ', r.stats.totalSlotsFilled === 2); }
{ // Phạt đổi cơ sở phải nặng hơn việc tách thành 2 cụm
  const w = { extraBlock:12, loneBlock:8, idleHour:1.5, loadBalance:0, facilitySwitch:20, levelSwitch:2 };
  const cs1a = { shiftId:'a', day:0 as DayOfWeek, start:1020, end:1140, facility:'coso1' as const, level:'cap3' as const };
  const cs1b = { shiftId:'b', day:0 as DayOfWeek, start:1140, end:1260, facility:'coso1' as const, level:'cap3' as const };
  const cs2b = { shiftId:'b', day:0 as DayOfWeek, start:1140, end:1260, facility:'coso2' as const, level:'cap3' as const };
  const cungCoSo = taFragmentationCost([cs1a, cs1b], w, 30);
  const khacCoSo = taFragmentationCost([cs1a, cs2b], w, 30);
  check('cùng cơ sở nối liền = 0 phạt', cungCoSo === 0, String(cungCoSo));
  check('đổi cơ sở liền nhau chỉ bị phạt đổi cơ sở', khacCoSo === 20, String(khacCoSo)); }
{ // 17h CS1 + 19h CS2: làm liền 4 tiếng, KHÔNG phải ca lẻ
  const g = emptyGrid(); g[0]!['reg-5']='A'; g[0]!['reg-6']='A';
  const ss = [shift('cs1',0,'cs1c3-5'), { ...shift('cs2',0,'cs2c3-2'), facility:'coso2' as const }];
  const rep = analyzeLoneShifts([{shiftId:'cs1',staffIds:['A']},{shiftId:'cs2',staffIds:['A']}], ss, g);
  check('17h CS1 + 19h CS2 không bị báo ca lẻ', rep.entries.length === 0,
        JSON.stringify(rep.entries.map(e => [e.name, e.shift.id, e.reason]))); }
{ // Đổi cấp trong cùng cụm bị phạt nhẹ
  const w = { extraBlock:12, loneBlock:8, idleHour:1.5, loadBalance:0, facilitySwitch:20, levelSwitch:2 };
  const a = { shiftId:'a', day:0 as DayOfWeek, start:1020, end:1140, facility:'coso1' as const, level:'cap3' as const };
  const bSame = { shiftId:'b', day:0 as DayOfWeek, start:1140, end:1260, facility:'coso1' as const, level:'cap3' as const };
  const bDiff = { shiftId:'b', day:0 as DayOfWeek, start:1140, end:1260, facility:'coso1' as const, level:'cap2' as const };
  check('cùng cấp rẻ hơn đổi cấp',
        taFragmentationCost([a,bSame], w, 30) < taFragmentationCost([a,bDiff], w, 30)); }

{ // Hết cách thì vẫn phải xếp — chạy giữa 2 cơ sở là bất khả kháng
  const g = emptyGrid(); g[0]!['reg-5']='A'; g[0]!['reg-6']='A';  // chỉ có A
  const ss = [
    shift('cs1',0,'cs1c3-5'),                                    // 17-19 CS1
    { ...shift('cs2',0,'cs2c3-2'), facility:'coso2' as const },  // 19-21 CS2
  ];
  const r = autoSchedule(ss,g);
  check('không còn ai khác thì vẫn lấp đủ', r.stats.totalSlotsFilled === 2,
        JSON.stringify(r.assignments)); }

console.log('\n--- TG cố định luôn được điền tên ---');
{ const g = emptyGrid(); g[0]!['reg-5']='A';   // C KHÔNG đăng ký
  const ss = [shift('f',0,'cs1c3-5',{teacher:'GV1'})];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  check('điền TG cố định dù chưa đăng ký',
        r.assignments.find(a=>a.shiftId==='f')?.staffIds[0] === 'C',
        JSON.stringify(r.assignments)); }
{ // Nhưng vẫn không được xếp trùng giờ
  const g = emptyGrid();
  const ss = [shift('f1',0,'cs1c3-5',{teacher:'GV1'}),
              { ...shift('f2',0,'cs1c3-5',{teacher:'GV1'}), id:'f2', className:'f2' }];
  const r = autoSchedule(ss, g, undefined, { GV1:['C'] });
  check('TG cố định không bị xếp trùng giờ', r.stats.totalSlotsFilled === 1,
        JSON.stringify(r.assignments)); }

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

console.log('\n--- Cùng một TG viết tên khác nhau ---');
{ // Đăng ký "T.Phú", GV cố định ghi "T.PHÚ": trước đây bị coi là 2 người -> xếp trùng giờ
  const g = emptyGrid(); g[2]!['reg-5'] = 'T.Phú';
  const ss = [shift('fixed',2,'cs1c3-5',{teacher:'GV1'}), shift('free',2,'cs1c3-5')];
  const r = autoSchedule(ss, g, undefined, { GV1:['T.PHÚ'] });
  check('không xếp trùng giờ khi khác hoa/thường', findDoubleBookings(r.assignments, ss).length === 0,
        JSON.stringify(r.assignments));
  check('ca còn lại báo thiếu', r.unfulfilled.length === 1, JSON.stringify(r.unfulfilled.map(u=>u.shift.id))); }
{ // Dấu tổ hợp (NFD) từ Mac/iPhone với dấu dựng sẵn (NFC)
  const g = emptyGrid(); g[2]!['reg-5'] = 'T.Phú, T.Phú';
  const ss = [shift('a',2,'cs1c3-5'), shift('b',2,'cs1c3-5')];
  const r = autoSchedule(ss, g);
  check('NFD/NFC là một người', r.stats.totalSlotsFilled === 1, JSON.stringify(r.assignments)); }
{ // Họ tên đầy đủ và ký hiệu trong danh sách TG
  const g = emptyGrid(); g[2]!['reg-5'] = 'Thiện Phú, T.Phú';
  const ss = [shift('a',2,'cs1c3-5'), shift('b',2,'cs1c3-5')];
  const r = autoSchedule(ss, g, undefined, {}, { roster: [{ fullName: 'Thiện Phú', abbreviation: 'T.Phú' }] });
  check('họ tên = ký hiệu', r.stats.totalSlotsFilled === 1, JSON.stringify(r.assignments));
  check('ghi theo ký hiệu', r.assignments[0]?.staffIds[0] === 'T.Phú', JSON.stringify(r.assignments)); }
{ const ss = [shift('a',0,'cs1c3-5',{staffNeeded:2})];
  const rr = recomputeScheduleResult([{ shiftId:'a', staffIds:['H.Long','H.LONG'] }], ss);
  check('một người ghi 2 lần không tính đủ 2 chỗ', rr.unfulfilled[0]?.missing === 1, JSON.stringify(rr)); }
{ const ss = [shift('a',0,'cs1c3-5',{staffNeeded:1}), shift('b',0,'cs1c3-6',{staffNeeded:1})];
  const rr = recomputeScheduleResult([{ shiftId:'a', staffIds:['A','B'] }], ss);
  check('ca dư người không bù cho ca thiếu', rr.stats.totalSlotsFilled === 1, JSON.stringify(rr.stats)); }
{ const g = emptyGrid(); g[0]!['reg-5']='H.Long'; g[0]!['reg-6']='H.Long';
  const ss = [shift('s1',0,'cs1c3-5'), shift('s2',0,'cs1c3-6')];
  const rep = analyzeLoneShifts([{ shiftId:'s1', staffIds:['H.Long'] }, { shiftId:'s2', staffIds:['H.LONG'] }], ss, g);
  check('ca lẻ: H.Long + H.LONG liền nhau không bị báo lẻ', rep.entries.length === 0, JSON.stringify(rep.entries.map(e=>e.name))); }

console.log('\n--- Ghi lên Sheet ---');
{
  const W = 12;
  const g: string[][] = Array.from({ length: 8 }, () => Array(W).fill(''));
  g[0][0] = 'LỊCH LÀM VIỆC MÔN TIẾNG ANH CƠ SỞ 1';
  g[3][1] = 'CẤP 3';
  g[4][1] = '7:00 - 9:00';
  g[4][3] = 'T.PHÚ'; g[4][4] = '6.1 B2';   // tên cũ từ lần xếp trước
  g[5][3] = '';      g[5][4] = '8.2 B1';
  const ss = [shift('x',0,'cs1c3-0',{className:'6.1 B2'}), shift('y',0,'cs1c3-0',{className:'8.2 B1'})];
  const fill = fillFromSheetGrid(g, ss, { assignments: [{ shiftId:'y', staffIds:['T.Phú'] }], unfulfilled: [], stats: { totalShifts:2, totalSlotsNeeded:2, totalSlotsFilled:1 } });
  const at = (r: number) => fill.updates.find(u => u.row === r + 1 && u.col === 4)?.value;
  check('ca trống được xoá tên cũ', at(4)?.trim() === '' && at(4) !== undefined, JSON.stringify(fill.updates));
  check('ca có người được ghi tên', at(5) === 'T.PHÚ', JSON.stringify(fill.updates));
  check('ô xoá không tính là đã ghi', fill.matched === 1, String(fill.matched));
}
{ // Cùng một lớp hai buổi sát nhau: phải ghi đúng ô của khung giờ của nó
  const W = 12;
  const g: string[][] = Array.from({ length: 8 }, () => Array(W).fill(''));
  g[0][0] = 'LỊCH LÀM VIỆC MÔN TIẾNG ANH CƠ SỞ 1';
  g[3][1] = 'CẤP 3';
  g[4][1] = '9:00 - 10:30'; g[4][4] = '10 B1';
  g[5][1] = '10:00 - 12:00'; g[5][4] = '10 B1';
  const ss = [shift('late',0,'cs1c3-2',{className:'10 B1'}), shift('early',0,'cs1c3-1',{className:'10 B1'})];
  const fill = fillFromSheetGrid(g, ss, { assignments: [{ shiftId:'late', staffIds:['B'] }, { shiftId:'early', staffIds:['A'] }], unfulfilled: [], stats: { totalShifts:2, totalSlotsNeeded:2, totalSlotsFilled:2 } });
  const at = (r: number) => fill.updates.find(u => u.row === r + 1)?.value;
  check('lớp 2 buổi: ghi đúng khung giờ', at(4) === 'A' && at(5) === 'B', JSON.stringify(fill.updates));
}

{ // Layout thật: tiêu đề "CẤP 3" nằm ở dòng 3 (index 2), ngay trên dòng ngày
  const W = 12;
  const g: string[][] = Array.from({ length: 10 }, () => Array(W).fill(''));
  g[0][0] = 'LỊCH LÀM VIỆC MÔN TIẾNG ANH CƠ SỞ 1';
  g[1][1] = 'TUẦN:';
  g[2][1] = 'CẤP 3'; g[2][3] = 'THỨ HAI';
  g[3][3] = '1/6/2026';
  g[4][1] = '17:00 - 19:00'; g[4][4] = '12 B2';
  g[5][1] = 'CẤP 2'; g[5][3] = 'THỨ HAI';
  g[6][3] = '1/6/2026';
  g[7][1] = '17:00 - 19:00'; g[7][4] = '8.1 B2\n(TÂN)';
  const scan = scanShiftsFromSheetGrid(g);
  check('đọc được khối CẤP 3 ở dòng 3', scan.shifts.some(x => x.level === 'cap3' && x.className === '12 B2'),
        JSON.stringify(scan.shifts));
  check('vẫn đọc được CẤP 2', scan.shifts.some(x => x.level === 'cap2' && x.className === '8.1 B2'));
}

console.log('\n--- Đồng bộ ca từ Sheet ---');
{
  const W = 12;
  const row = (): string[] => Array(W).fill('');
  const g: string[][] = Array.from({ length: 8 }, row);
  g[0][0] = 'LỊCH LÀM VIỆC MÔN TIẾNG ANH CƠ SỞ 1';
  g[3][1] = 'CẤP 3';
  g[4][1] = '7:00 - 9:00';
  g[4][4] = '10 B1';              // T2, cột lớp = 3 + 0*2 + 1
  g[4][6] = '10 B2\n(TÂN)';       // T3
  g[5][1] = '9:00 - 11:00';
  g[5][4] = '11 B1';              // T2

  const scan = scanShiftsFromSheetGrid(g);
  check('đọc được 3 ca', scan.shifts.length === 3, JSON.stringify(scan.shifts));
  const c1 = scan.shifts.find(x => x.className === '10 B1');
  check('đúng ngày/khung giờ', c1?.day === 0 && c1?.slotLabel === '7:00 - 9:00', JSON.stringify(c1));
  check('tách được tên GV', scan.shifts.find(x => x.className === '10 B2')?.teacher === 'TÂN',
        JSON.stringify(scan.shifts.find(x => x.className === '10 B2')));
  check('gom khung giờ theo khối', scan.slotLabelsByKey['coso1-cap3']?.length === 2,
        JSON.stringify(scan.slotLabelsByKey));

  // Ca đã có phải giữ nguyên staffNeeded + TG cố định
  const existingSlots = { 'coso1-cap3': [{ id: 'old-slot', label: '7:00 - 9:00', start: 420, end: 540 }] };
  const existing: Shift[] = [{
    id: 'giu-nguyen', facility: 'coso1', level: 'cap3', day: 0,
    timeSlotId: 'old-slot', className: '10 B1', staffNeeded: 3, fixedTaNames: ['Khang'],
  }];
  const built = buildScheduleFromSheetGrid(scan, existing, existingSlots);
  const kept = built.shifts.find(x => x.className === '10 B1');
  check('giữ nguyên số TG cần', kept?.staffNeeded === 3, String(kept?.staffNeeded));
  check('giữ nguyên TG cố định', kept?.fixedTaNames?.[0] === 'Khang', JSON.stringify(kept?.fixedTaNames));
  check('giữ nguyên id ca cũ', kept?.id === 'giu-nguyen', kept?.id);
  check('tái dùng khung giờ cũ', kept?.timeSlotId === 'old-slot', kept?.timeSlotId);
  check('ca mới mặc định cần 1 TG',
        built.shifts.find(x => x.className === '11 B1')?.staffNeeded === 1);
  check('thống kê đúng', built.stats.kept === 1 && built.stats.added === 2 && built.stats.removed === 0,
        JSON.stringify(built.stats));
}

console.log('\n--- Import lịch đăng ký ---');
{
  const slots = [
    { id:'r0', label:'7:00 - 9:00',   start:420,  end:540  },
    { id:'r1', label:'9:00 - 10:30',  start:540,  end:630  },
    { id:'r2', label:'10:30 - 12:00', start:630,  end:720  },
    { id:'r3', label:'17:00 - 19:00', start:1020, end:1140 },
  ];
  const paste = [
    'CA\tTHỨ HAI\tTHỨ BA\tTHỨ TƯ\tTHỨ NĂM\tTHỨ SÁU\tTHỨ BẢY\tCHỦ NHẬT',
    '\t7/9/2026\t8/9/2026\t9/9/2026\t10/9/2026\t11/9/2026\t12/9/2026\t13/9/2026',
    '7:00 - 9:00\t—\t—\t—\t—\t—\tKhang\tÝ',
    '9:00 - 10:30\t—\t—\t—\t—\t—\tKhang, Ý\tH.Long',
    '17:00 - 19:00\tKhang, Khải\t—\t—\t—\t—\t—\t—',
  ].join('\n');

  const res = parseRegistrationImport(paste, slots);
  if ('error' in res) { check('import không lỗi', false, res.error); }
  else {
    const cell = (d: DayOfWeek, id: string) => res.grid[d]?.[id] ?? '';
    check('không lọt tên ngày vào lưới',
          !JSON.stringify(res.grid).includes('THỨ') && !JSON.stringify(res.grid).includes('CHỦ NHẬT'),
          JSON.stringify(res.grid));
    check('T7 khung đầu đúng', cell(5,'r0') === 'Khang', cell(5,'r0'));
    check('CN khung đầu đúng', cell(6,'r0') === 'Ý', cell(6,'r0'));
    check('khung thứ 2 không bị đẩy lệch', cell(5,'r1') === 'Khang, Ý', cell(5,'r1'));
    check('khung 17-19 đúng ngày', cell(0,'r3') === 'Khang, Khải', cell(0,'r3'));
  }
}
{ // Header chỉ có tên ngày, không có cột "CA"
  const slots = [{ id:'r0', label:'7:00 - 9:00', start:420, end:540 }];
  const paste = [
    'THỨ HAI\tTHỨ BA\tTHỨ TƯ\tTHỨ NĂM\tTHỨ SÁU\tTHỨ BẢY\tCHỦ NHẬT',
    '7:00 - 9:00\tA\t—\t—\t—\t—\t—\t—',
  ].join('\n');
  const res = parseRegistrationImport(paste, slots);
  check('bỏ header dù không có cột CA',
        !('error' in res) && res.grid[0]?.['r0'] === 'A',
        JSON.stringify(res));
}
{ // Khung giờ trên bảng dán mà app không có -> phải báo, không được im lặng bỏ
  const slots = [{ id:'r0', label:'7:00 - 9:00', start:420, end:540 }];
  const paste = [
    'CA\tTHỨ HAI\tTHỨ BA\tTHỨ TƯ\tTHỨ NĂM\tTHỨ SÁU\tTHỨ BẢY\tCHỦ NHẬT',
    '7:00 - 9:00\tA\t—\t—\t—\t—\t—\t—',
    '6:00 - 8:00\t—\t—\t—\t—\t—\tB\tC',
  ].join('\n');
  const res = parseRegistrationImport(paste, slots);
  check('vẫn nhận khung khớp', !('error' in res) && res.grid[0]?.['r0'] === 'A', JSON.stringify(res));
  check('báo khung bị bỏ', !('error' in res) && res.skippedSlots.includes('6:00 - 8:00'),
        'error' in res ? res.error : JSON.stringify(res.skippedSlots)); }
{ // Hàng không khớp nhưng rỗng thì không cần báo
  const slots = [{ id:'r0', label:'7:00 - 9:00', start:420, end:540 }];
  const paste = '7:00 - 9:00\tA\t—\t—\t—\t—\t—\t—\n6:00 - 8:00\t—\t—\t—\t—\t—\t—\t—';
  const res = parseRegistrationImport(paste, slots);
  check('hàng rỗng không báo thừa', !('error' in res) && res.skippedSlots.length === 0,
        'error' in res ? res.error : JSON.stringify(res.skippedSlots)); }
{ // TG viết tắt trùng tên ngày không được coi là header
  const slots = [{ id:'r0', label:'7:00 - 9:00', start:420, end:540 }];
  const paste = '7:00 - 9:00\tCN\t—\t—\t—\t—\t—\t—';
  const res = parseRegistrationImport(paste, slots);
  check('không nhầm TG tên "CN" là header',
        !('error' in res) && res.grid[0]?.['r0'] === 'CN',
        JSON.stringify(res));
}

console.log('\n--- Không bao giờ xếp trùng giờ ---');
{ // Phát hiện: Ý ở 12 B1 (CẤP 3) và 3.1 (CẤP 1) cùng T4 17-19
  const ss = [shift('12b1',2,'cs1c3-5'), { ...shift('31',2,'cs1c1-1'), level:'cap1' as const }];
  const d = findDoubleBookings([{shiftId:'12b1',staffIds:['Ý']},{shiftId:'31',staffIds:['Ý']}], ss);
  check('phát hiện trùng giờ khác cấp', d.length === 1 && d[0].name === 'Ý', JSON.stringify(d.map(x=>x.name)));
  const ok = findDoubleBookings([{shiftId:'12b1',staffIds:['Ý']},{shiftId:'31',staffIds:['Bảo']}], ss);
  check('không báo nhầm khi khác người', ok.length === 0); }
{ // Bất biến: bộ xếp lịch không bao giờ tự tạo ca trùng, kể cả có TG cố định
  let seed = 12345;
  const rnd = () => { seed = (seed*1103515245+12345)%2147483648; return seed/2147483648; };
  const NAMES = ['Ý','Bảo','Quang','Huy','Khải','Thịnh','An','T.Phú','Quân','H.Long'];
  let bad = 0, runs = 0;
  for (let k = 0; k < 200; k++) {
    const g = emptyGrid();
    for (const d of days) for (const sl of REGISTRATION_SLOTS)
      g[d]![sl.id] = NAMES.filter(() => rnd() < 0.35).join(', ');
    const ss: Shift[] = [];
    for (const [key, slots] of Object.entries(SCHEDULE_SLOTS)) {
      const [facility, level] = key.split('-') as ['coso1'|'coso2','cap1'|'cap2'|'cap3'];
      for (const day of days) for (const sl of slots) {
        if (rnd() < 0.5) continue;
        ss.push({ id:`${key}-${day}-${sl.id}`, facility, level, day, timeSlotId:sl.id, className:'c',
          staffNeeded: 1 + Math.floor(rnd()*2),
          ...(rnd() < 0.2 ? { fixedTaNames: [NAMES[Math.floor(rnd()*NAMES.length)]] } : {}) });
      }
    }
    const r = autoSchedule(ss, g);
    runs++;
    if (findDoubleBookings(r.assignments, ss).length > 0) bad++;
  }
  check(`200 kịch bản ngẫu nhiên: 0 lần xếp trùng giờ`, bad === 0, `${bad}/${runs} lần trùng`); }

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
      if (l.some(x => x.day===sh.day && Math.min(x.end,sl.end)-Math.max(x.start,sl.start) > 30)) clash++;
      l.push({day:sh.day,start:sl.start,end:sl.end}); byName.set(n,l); } }
  check('0 xung đột giờ', clash === 0, clash + ' xung đột'); }

console.log('\n--- Tài khoản ---');
check('chỉ admin là admin', isAdmin('admin') && !isAdmin('hoangbui24') && !isAdmin(null));
check('tài khoản cũ hoangbui24 không còn đăng nhập được', !(await verifyLocalCredentials('hoangbui24', '241202')));
check('admin sai mật khẩu bị từ chối', !(await verifyLocalCredentials('admin', 'admin')));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
