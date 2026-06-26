import { useState } from 'react';
import type { DayOfWeek, Facility, Level, Shift } from '../types';
import {
  DAY_LABELS,
  FACILITY_LABELS,
  LEVEL_LABELS,
  SCHEDULE_SLOTS,
  getScheduleKey,
  getWeekDates,
} from '../data/constants';

interface Props {
  shifts: Shift[];
  weekStart: string;
  onUpdateStaffNeeded: (shiftId: string, count: number) => void;
  onUpdateShift: (shiftId: string, updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded'>>) => void;
  onAddShift: (shift: Omit<Shift, 'id'>) => void;
  onRemoveShift: (shiftId: string) => void;
  onWeekStartChange: (date: string) => void;
}

const CLASS_COLORS: Record<string, string> = {
  '10 B1': '#fff59d',
  '10 B2': '#f8bbd0',
  '11 B1': '#c8e6c9',
  '11 B2': '#e1bee7',
  '12 B1': '#b3e5fc',
  '12 B2': '#f8bbd0',
  '12 B3': '#80deea',
};

function getClassColor(className: string): string {
  return CLASS_COLORS[className] ?? '#ffe0b2';
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
  onUpdateStaffNeeded,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
}: {
  facility: Facility;
  level: Level;
  shifts: Shift[];
  weekDates: string[];
  onUpdateStaffNeeded: (shiftId: string, count: number) => void;
  onUpdateShift: (shiftId: string, updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded'>>) => void;
  onAddShift: (shift: Omit<Shift, 'id'>) => void;
  onRemoveShift: (shiftId: string) => void;
}) {
  const key = getScheduleKey(facility, level);
  const slots = SCHEDULE_SLOTS[key] ?? [];
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [addingCell, setAddingCell] = useState<string | null>(null);

  const cellKey = (day: DayOfWeek, slotId: string) => `${day}-${slotId}`;

  return (
    <div className="schedule-section">
      <h3 className="level-title">{LEVEL_LABELS[level]}</h3>
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
                      {cellShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="class-block"
                          style={{ backgroundColor: getClassColor(shift.className) }}
                        >
                          <button
                            className="shift-remove-btn"
                            onClick={() => {
                              if (confirm(`Xóa ca ${shift.className}?`)) {
                                onRemoveShift(shift.id);
                              }
                            }}
                            title="Bỏ ca này"
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
                        </div>
                      ))}
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
  onUpdateStaffNeeded,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onWeekStartChange,
}: Props) {
  const weekDates = getWeekDates(weekStart);

  const facilities: { facility: Facility; levels: Level[] }[] = [
    { facility: 'coso1', levels: ['cap3', 'cap2', 'cap1'] },
    { facility: 'coso2', levels: ['cap3', 'cap2', 'cap1'] },
  ];

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
        Nhập số trợ giảng cần cho từng ca. Tên trong ngoặc là giáo viên cố định (không phải TG).
        Dùng &quot;+ Thêm ca&quot; hoặc nút × để thay đổi lịch khi cần.
      </p>

      {facilities.map(({ facility, levels }) => (
        <div key={facility} className="facility-block">
          <h2 className="facility-title">
            LỊCH LÀM VIỆC MÔN TIẾNG ANH {FACILITY_LABELS[facility].toUpperCase()}
          </h2>
          {levels.map((level) => (
            <ScheduleGrid
              key={level}
              facility={facility}
              level={level}
              shifts={shifts}
              weekDates={weekDates}
              onUpdateStaffNeeded={onUpdateStaffNeeded}
              onUpdateShift={onUpdateShift}
              onAddShift={onAddShift}
              onRemoveShift={onRemoveShift}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
