import type { Assignment, Shift, StaffMember } from '../types';
import {
  DAY_LABELS,
  FACILITY_LABELS,
  LEVEL_LABELS,
  SCHEDULE_SLOTS,
  getScheduleKey,
  getWeekDates,
} from '../data/constants';
import { getShiftTimeSlot } from '../utils/timeUtils';
import type { ScheduleResult } from '../utils/scheduler';

interface Props {
  shifts: Shift[];
  staff: StaffMember[];
  result: ScheduleResult | null;
  weekStart: string;
  onRunSchedule: () => void;
  onClearAssignments: () => void;
}

function getStaffName(staff: StaffMember[], id: string): string {
  return staff.find((s) => s.id === id)?.name || 'Chưa đặt tên';
}

function AssignmentView({
  facility,
  level,
  shifts,
  assignments,
  staff,
  weekDates,
}: {
  facility: 'coso1' | 'coso2';
  level: 'cap1' | 'cap2' | 'cap3';
  shifts: Shift[];
  assignments: Assignment[];
  staff: StaffMember[];
  weekDates: string[];
}) {
  const key = getScheduleKey(facility, level);
  const slots = SCHEDULE_SLOTS[key] ?? [];
  const days = [0, 1, 2, 3, 4, 5, 6] as const;

  const levelShifts = shifts.filter((s) => s.facility === facility && s.level === level);
  if (levelShifts.length === 0) return null;

  return (
    <div className="schedule-section">
      <h3 className="level-title">{LEVEL_LABELS[level]}</h3>
      <div className="table-wrapper">
        <table className="schedule-table result-table">
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
                  const cellShifts = levelShifts.filter(
                    (s) => s.day === day && s.timeSlotId === slot.id,
                  );
                  return (
                    <td key={day} className="schedule-cell">
                      {cellShifts.map((shift) => {
                        const asn = assignments.find((a) => a.shiftId === shift.id);
                        const assigned = asn?.staffIds ?? [];
                        const filled = assigned.length;
                        const missing = shift.staffNeeded - filled;
                        const isPartial = missing > 0 && filled > 0;
                        const isEmpty = filled === 0;

                        return (
                          <div
                            key={shift.id}
                            className={`result-block ${isEmpty ? 'unfilled' : ''} ${isPartial ? 'partial' : ''}`}
                          >
                            <div className="class-name">
                              {shift.className}
                              {shift.teacher && (
                                <span className="teacher"> ({shift.teacher})</span>
                              )}
                            </div>
                            <div className="assigned-staff">
                              {assigned.length > 0 ? (
                                assigned.map((id) => (
                                  <span key={id} className="staff-tag">
                                    {getStaffName(staff, id)}
                                  </span>
                                ))
                              ) : (
                                <span className="no-staff">Chưa xếp</span>
                              )}
                            </div>
                            <div className="staff-count">
                              {filled}/{shift.staffNeeded}
                              {missing > 0 && (
                                <span className="missing"> (thiếu {missing})</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
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

export function ScheduleResultView({
  shifts,
  staff,
  result,
  weekStart,
  onRunSchedule,
  onClearAssignments,
}: Props) {
  const weekDates = getWeekDates(weekStart);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Kết quả xếp lịch</h2>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={onRunSchedule}>
            Xếp lịch tự động
          </button>
          {result && (
            <button className="btn btn-secondary" onClick={onClearAssignments}>
              Xóa kết quả
            </button>
          )}
        </div>
      </div>

      {!result && (
        <div className="empty-state">
          Nhấn &quot;Xếp lịch tự động&quot; sau khi đã cấu hình số người và đăng ký lịch nhân viên.
        </div>
      )}

      {result && (
        <>
          <div className="stats-bar">
            <div className="stat">
              <span className="stat-value">{result.stats.totalShifts}</span>
              <span className="stat-label">Tổng ca</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.stats.totalSlotsNeeded}</span>
              <span className="stat-label">Cần người</span>
            </div>
            <div className="stat stat-success">
              <span className="stat-value">{result.stats.totalSlotsFilled}</span>
              <span className="stat-label">Đã xếp</span>
            </div>
            <div className="stat stat-warning">
              <span className="stat-value">
                {result.stats.totalSlotsNeeded - result.stats.totalSlotsFilled}
              </span>
              <span className="stat-label">Còn thiếu</span>
            </div>
          </div>

          {result.unfulfilled.length > 0 && (
            <div className="alert alert-warning">
              <strong>{result.unfulfilled.length} ca chưa đủ người:</strong>
              <ul>
                {result.unfulfilled.map(({ shift, missing }) => {
                  const slot = getShiftTimeSlot(shift);
                  return (
                    <li key={shift.id}>
                      {FACILITY_LABELS[shift.facility]} - {LEVEL_LABELS[shift.level]} -{' '}
                      {DAY_LABELS[shift.day]} {slot?.label} - {shift.className}: thiếu{' '}
                      {missing} người
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(['coso1', 'coso2'] as const).map((facility) => (
            <div key={facility} className="facility-block">
              <h2 className="facility-title">
                KẾT QUẢ {FACILITY_LABELS[facility].toUpperCase()}
              </h2>
              {(['cap3', 'cap2', 'cap1'] as const).map((level) => (
                <AssignmentView
                  key={level}
                  facility={facility}
                  level={level}
                  shifts={shifts}
                  assignments={result.assignments}
                  staff={staff}
                  weekDates={weekDates}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
