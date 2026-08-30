import { useState } from 'react';
import type { DayOfWeek, Facility, Level, Shift, TimeSlot } from '../types';
import {
  DAY_LABELS,
  FACILITY_LABELS,
  LEVEL_LABELS,
  getScheduleKey,
  getWeekDates,
} from '../data/constants';
import { resolveClassColor } from '../utils/classColors';
import { syncClassColorsFromSheet, syncShiftsFromSheet } from '../utils/sheetAutoFill';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { ScheduleSlotsMap } from '../utils/slotCatalog';
import { getScheduleSlotsForKey } from '../utils/slotCatalog';
import { TaPicker } from './TaPicker';
import { TimeSlotsEditor } from './TimeSlotsEditor';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface Props {
  shifts: Shift[];
  weekStart: string;
  roster: TeachingAssistant[];
  classColors: Record<string, string>;
  scheduleSlots: ScheduleSlotsMap;
  onClassColorsChange: (colors: Record<string, string>) => void;
  onUpdateStaffNeeded: (shiftId: string, count: number) => void;
  onUpdateShift: (
    shiftId: string,
    updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded' | 'fixedTaNames'>>,
  ) => void;
  onAddShift: (shift: Omit<Shift, 'id'>) => void;
  onRemoveShift: (shiftId: string) => void;
  onWeekStartChange: (date: string) => void;
  onImportSchedule: (shifts: Shift[], scheduleSlots: ScheduleSlotsMap) => void;
  onUpdateScheduleSlots: (key: string, slots: TimeSlot[]) => void;
  onRemoveScheduleSlot: (key: string, slotId: string) => void;
}

function AddShiftForm({
  onAdd,
  onCancel,
}: {
  onAdd: (className: string, teacher: string, staffNeeded: number) => void;
  onCancel: () => void;
}) {
  const [className, setClassName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [staffNeeded, setStaffNeeded] = useState(1);

  return (
    <div className="add-shift-form">
      <input
        placeholder="Tên lớp (vd: 10 B1)"
        value={className}
        onChange={(e) => setClassName(e.target.value)}
        className="add-shift-input"
      />
      <input
        placeholder="GV cố định (tùy chọn)"
        value={teacher}
        onChange={(e) => setTeacher(e.target.value)}
        className="add-shift-input"
      />
      <div className="add-shift-row">
        <label>Người:</label>
        <input
          type="number"
          min={1}
          max={10}
          value={staffNeeded}
          onChange={(e) => setStaffNeeded(parseInt(e.target.value) || 1)}
          className="add-shift-num"
        />
      </div>
      <div className="add-shift-btns">
        <button
          className="btn btn-primary btn-sm"
          disabled={!className.trim()}
          onClick={() => onAdd(className.trim(), teacher.trim(), staffNeeded)}
        >
          Thêm
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </div>
  );
}

function ScheduleGrid({
  facility,
  level,
  shifts,
  weekDates,
  classColors,
  roster,
  slots,
  onUpdateStaffNeeded,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onUpdateSlots,
  onRemoveSlot,
}: {
  facility: Facility;
  level: Level;
  shifts: Shift[];
  weekDates: string[];
  classColors: Record<string, string>;
  roster: TeachingAssistant[];
  slots: TimeSlot[];
  onUpdateStaffNeeded: (shiftId: string, count: number) => void;
  onUpdateShift: (
    shiftId: string,
    updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded' | 'fixedTaNames'>>,
  ) => void;
  onAddShift: (shift: Omit<Shift, 'id'>) => void;
  onRemoveShift: (shiftId: string) => void;
  onUpdateSlots: (slots: TimeSlot[]) => void;
  onRemoveSlot: (slotId: string) => void;
}) {
  const key = getScheduleKey(facility, level);
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [addingCell, setAddingCell] = useState<string | null>(null);
  const taOptions = roster.map((t) => t.abbreviation);

  const cellKey = (day: DayOfWeek, slotId: string) => `${day}-${slotId}`;

  const addFixedTa = (shift: Shift, name: string) => {
    const current = shift.fixedTaNames ?? [];
    if (current.includes(name)) return;
    onUpdateShift(shift.id, { fixedTaNames: [...current, name] });
  };

  const removeFixedTa = (shift: Shift, name: string) => {
    const next = (shift.fixedTaNames ?? []).filter((n) => n !== name);
    onUpdateShift(shift.id, { fixedTaNames: next.length > 0 ? next : undefined });
  };

  return (
    <div className="schedule-section">
      <h3 className="level-title">{LEVEL_LABELS[level]}</h3>
      <TimeSlotsEditor
        title={`Khung giờ ${LEVEL_LABELS[level]}`}
        hint="Chỉnh / thêm ca để khớp Sheet hoặc mở ca đêm."
        slots={slots}
        idPrefix={key.replace('-', '')}
        onChange={onUpdateSlots}
        onRemoveSlot={(slotId) => {
          onRemoveSlot(slotId);
        }}
      />
      <div className="table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="time-col">Ca</th>
              {days.map((d) => (
                <th key={d}>
                  <div>{DAY_LABELS[d]}</div>
                  <div className="date-sub">{weekDates[d]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id}>
                <td className="time-col">{slot.label}</td>
                {days.map((day) => {
                  const cellShifts = shifts.filter(
                    (s) =>
                      s.facility === facility &&
                      s.level === level &&
                      s.day === day &&
                      s.timeSlotId === slot.id,
                  );
                  const ck = cellKey(day, slot.id);
                  const isAdding = addingCell === ck;

                  return (
                    <td key={day} className="schedule-cell">
                      {cellShifts.map((shift) => {
                        const fixedTas = shift.fixedTaNames ?? [];
                        const hasFixed = fixedTas.length > 0;
                        return (
                        <div
                          key={shift.id}
                          className={`class-block ${hasFixed ? 'class-block--fixed-ta' : ''}`}
                          style={{
                            backgroundColor: resolveClassColor(shift.className, classColors),
                          }}
                        >
                          <button
                            className="shift-remove-btn"
                            onClick={() => {
                              if (confirm(`Xóa ca ${shift.className}?`)) {
                                onRemoveShift(shift.id);
                              }
                            }}
                            title="Bỏ ca này"
                            type="button"
                          >
                            ×
                          </button>
                          <input
                            className="class-name-edit"
                            value={shift.className}
                            onChange={(e) =>
                              onUpdateShift(shift.id, { className: e.target.value })
                            }
                          />
                          <input
                            className="teacher-edit"
                            placeholder="GV cố định"
                            value={shift.teacher ?? ''}
                            onChange={(e) =>
                              onUpdateShift(shift.id, { teacher: e.target.value || undefined })
                            }
                          />
                          <div className="staff-input">
                            <label>Người:</label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={shift.staffNeeded}
                              onChange={(e) =>
                                onUpdateStaffNeeded(shift.id, parseInt(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div className="config-fixed-ta">
                            <span className="config-fixed-ta-label">TG cố định</span>
                            {fixedTas.length > 0 && (
                              <div className="config-fixed-ta-chips">
                                {fixedTas.map((name) => (
                                  <span key={name} className="config-fixed-ta-chip">
                                    {name}
                                    <button
                                      type="button"
                                      className="config-fixed-ta-chip-x"
                                      onClick={() => removeFixedTa(shift, name)}
                                      aria-label={`Bỏ ${name}`}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <TaPicker
                              options={taOptions}
                              exclude={fixedTas}
                              placeholder="+ TG cố định"
                              onSelect={(name) => addFixedTa(shift, name)}
                            />
                          </div>
                        </div>
                        );
                      })}
                      {isAdding ? (
                        <AddShiftForm
                          onAdd={(className, teacher, staffNeeded) => {
                            onAddShift({
                              facility,
                              level,
                              day,
                              timeSlotId: slot.id,
                              className,
                              teacher: teacher || undefined,
                              staffNeeded,
                            });
                            setAddingCell(null);
                          }}
                          onCancel={() => setAddingCell(null)}
                        />
                      ) : (
                        <button
                          className="add-shift-btn"
                          onClick={() => setAddingCell(ck)}
                          title="Thêm ca mới"
                        >
                          + Thêm ca
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleConfig({
  shifts,
  weekStart,
  roster,
  classColors,
  scheduleSlots,
  onClassColorsChange,
  onUpdateStaffNeeded,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onWeekStartChange,
  onImportSchedule,
  onUpdateScheduleSlots,
  onRemoveScheduleSlot,
}: Props) {
  const weekDates = getWeekDates(weekStart);
  const [webhookUrl] = useLocalStorage('lich-sheets-webhook', '');
  const [colorMsg, setColorMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [syncingColors, setSyncingColors] = useState(false);

  const facilities: { facility: Facility; levels: Level[] }[] = [
    { facility: 'coso1', levels: ['cap3', 'cap2', 'cap1'] },
    { facility: 'coso2', levels: ['cap3', 'cap2', 'cap1'] },
  ];

  const [syncingShifts, setSyncingShifts] = useState(false);

  const handleSyncShifts = async () => {
    if (!webhookUrl.trim()) {
      setColorMsg({ type: 'err', text: 'Cần cấu hình URL Apps Script (tab Xếp lịch) trước.' });
      return;
    }
    setSyncingShifts(true);
    setColorMsg(null);
    try {
      const res = await syncShiftsFromSheet(webhookUrl, weekStart, shifts, scheduleSlots);
      const { kept, added, removed, slots } = res.stats;
      const summary =
        `Đọc ${res.shifts.length} ca từ tab ${res.tab} (${slots} khung giờ).\n\n` +
        `• Giữ nguyên: ${kept} ca (số TG cần và TG cố định không đổi)\n` +
        `• Thêm mới: ${added} ca\n` +
        `• Bỏ đi: ${removed} ca không còn trên Sheet\n\n` +
        `Ghi đè cấu hình ca hiện tại?`;
      if (!window.confirm(summary)) {
        setColorMsg({ type: 'ok', text: 'Đã huỷ, cấu hình giữ nguyên.' });
        return;
      }
      onImportSchedule(res.shifts, res.scheduleSlots);
      setColorMsg({
        type: 'ok',
        text: `Đã đồng bộ ${res.shifts.length} ca từ ${res.tab} · giữ ${kept}, thêm ${added}, bỏ ${removed}.`,
      });
    } catch (err) {
      setColorMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không đồng bộ được ca từ Sheet.',
      });
    } finally {
      setSyncingShifts(false);
    }
  };

  const handleSyncColors = async () => {
    if (!webhookUrl.trim()) {
      setColorMsg({ type: 'err', text: 'Cần cấu hình URL Apps Script (tab Xếp lịch) trước.' });
      return;
    }
    setSyncingColors(true);
    setColorMsg(null);
    try {
      const res = await syncClassColorsFromSheet(webhookUrl, weekStart);
      const stored = localStorage.getItem('lich-class-colors');
      if (stored) onClassColorsChange(JSON.parse(stored) as Record<string, string>);
      setColorMsg({
        type: 'ok',
        text: `Đã đồng bộ ${res.count} màu lớp từ ${res.tab}.`,
      });
    } catch (err) {
      setColorMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không đồng bộ được màu.',
      });
    } finally {
      setSyncingColors(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Cấu hình số người cần cho mỗi ca</h2>
        <div className="week-picker">
          <label>Tuần bắt đầu:</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => onWeekStartChange(e.target.value)}
          />
        </div>
      </div>
      <p className="hint">
        Nhập số trợ giảng cần cho từng ca. Dùng <strong>Chỉnh khung giờ</strong> để thêm/sửa ca
        (kể cả ca đêm) cho khớp Sheet. <strong>TG cố định</strong> trên từng ca — xếp lịch chỉ gán
        đúng người đó. GV trong ngoặc là giáo viên dạy (không phải TG).
      </p>

      <div className="config-tools">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleSyncColors}
          disabled={syncingColors}
        >
          {syncingColors ? 'Đang đồng bộ màu…' : 'Đồng bộ màu lớp từ Sheet'}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSyncShifts}
          disabled={syncingShifts}
          title="Đọc lớp, GV và khung giờ từ tab TUẦN trên Sheet về đây"
        >
          {syncingShifts ? 'Đang đọc ca…' : 'Đồng bộ ca từ Sheet'}
        </button>
        {colorMsg && (
          <span className={colorMsg.type === 'ok' ? 'copy-feedback' : 'sheets-error'}>
            {colorMsg.text}
          </span>
        )}
      </div>

      {facilities.map(({ facility, levels }) => (
        <div key={facility} className="facility-block">
          <h2 className="facility-title">
            LỊCH LÀM VIỆC MÔN TIẾNG ANH {FACILITY_LABELS[facility].toUpperCase()}
          </h2>
          {levels.map((level) => {
            const key = getScheduleKey(facility, level);
            return (
              <ScheduleGrid
                key={level}
                facility={facility}
                level={level}
                shifts={shifts}
                weekDates={weekDates}
                classColors={classColors}
                roster={roster}
                slots={getScheduleSlotsForKey(key, scheduleSlots)}
                onUpdateStaffNeeded={onUpdateStaffNeeded}
                onUpdateShift={onUpdateShift}
                onAddShift={onAddShift}
                onRemoveShift={onRemoveShift}
                onUpdateSlots={(slots) => onUpdateScheduleSlots(key, slots)}
                onRemoveSlot={(slotId) => onRemoveScheduleSlot(key, slotId)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
