import type { Assignment, Shift } from '../types';
import { useState } from 'react';
import type { TeachingAssistant } from '../data/teachingAssistants';
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
import {
  downloadFile,
  exportScheduleHtml,
  exportScheduleText,
  openPrintableHtml,
} from '../utils/exportSchedule';
import { resolveClassColor } from '../utils/classColors';
import {
  getAssignmentWarnings,
  hasBlockingWarnings,
} from '../utils/assignmentValidation';
import type { RegistrationGrid } from '../utils/registrationUtils';
import type { SlotOverrides } from '../utils/slotAccess';
import { SheetsSyncPanel } from './SheetsSyncPanel';
import { TaPicker } from './TaPicker';

interface Props {
  shifts: Shift[];
  result: ScheduleResult | null;
  weekStart: string;
  classColors: Record<string, string>;
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides: SlotOverrides | undefined;
  onRunSchedule: () => void;
  onClearAssignments: () => void;
  onUpdateAssignment: (shiftId: string, staffIds: string[]) => void;
}

function EditableAssignmentBlock({
  shift,
  assigned,
  allAssignments,
  shifts,
  classColors,
  roster,
  registrationGrid,
  slotOverrides,
  onUpdate,
}: {
  shift: Shift;
  assigned: string[];
  allAssignments: Assignment[];
  shifts: Shift[];
  classColors: Record<string, string>;
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides: SlotOverrides | undefined;
  onUpdate: (staffIds: string[]) => void;
}) {
  const filled = assigned.length;
  const missing = shift.staffNeeded - filled;
  const isPartial = missing > 0 && filled > 0;
  const isEmpty = filled === 0;
  const warnings = getAssignmentWarnings(
    shift,
    assigned,
    allAssignments,
    shifts,
    registrationGrid,
    slotOverrides,
  );
  const taOptions = roster.map((t) => t.abbreviation);

  const addName = (name: string) => {
    if (!name || assigned.includes(name)) return;
    onUpdate([...assigned, name]);
  };

  return (
    <div
      className={`result-block editable ${isEmpty ? 'unfilled' : ''} ${isPartial ? 'partial' : ''} ${hasBlockingWarnings(warnings) ? 'has-warning' : ''}`}
      style={{ backgroundColor: resolveClassColor(shift.className, classColors) }}
    >
                          <div className="class-name">
                            {shift.className}
                            {shift.teacher && <span className="teacher"> ({shift.teacher})</span>}
                            {(shift.fixedTaNames?.length ?? 0) > 0 && (
                              <span className="fixed-ta-badge-inline" title="TG cố định">
                                🔒 {shift.fixedTaNames!.join(', ')}
                              </span>
                            )}
                          </div>
      <div className="assigned-staff">
        {assigned.length > 0 ? (
          assigned.map((name) => (
            <span key={name} className="staff-tag editable">
              {name}
              <button
                type="button"
                className="staff-tag-remove"
                onClick={() => onUpdate(assigned.filter((n) => n !== name))}
                title="Bỏ TG"
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="no-staff">Chưa xếp</span>
        )}
      </div>
      <div className="assignment-edit-row">
        <TaPicker
          options={taOptions}
          exclude={assigned}
          placeholder="Thêm TG…"
          onSelect={addName}
        />
      </div>
      <div className="staff-count">
        {filled}/{shift.staffNeeded}
        {missing > 0 && <span className="missing"> (thiếu {missing})</span>}
      </div>
      {warnings.length > 0 && (
        <ul className="assignment-warnings">
          {warnings.map((w, i) => (
            <li key={i} className={`warn-${w.type}`}>
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignmentView({
  facility,
  level,
  shifts,
  assignments,
  weekDates,
  classColors,
  roster,
  registrationGrid,
  slotOverrides,
  onUpdateAssignment,
}: {
  facility: 'coso1' | 'coso2';
  level: 'cap1' | 'cap2' | 'cap3';
  shifts: Shift[];
  assignments: Assignment[];
  weekDates: string[];
  classColors: Record<string, string>;
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides: SlotOverrides | undefined;
  onUpdateAssignment: (shiftId: string, staffIds: string[]) => void;
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

                        return (
                          <EditableAssignmentBlock
                            key={shift.id}
                            shift={shift}
                            assigned={assigned}
                            allAssignments={assignments}
                            shifts={shifts}
                            classColors={classColors}
                            roster={roster}
                            registrationGrid={registrationGrid}
                            slotOverrides={slotOverrides}
                            onUpdate={(staffIds) => onUpdateAssignment(shift.id, staffIds)}
                          />
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
  result,
  weekStart,
  classColors,
  roster,
  registrationGrid,
  slotOverrides,
  onRunSchedule,
  onClearAssignments,
  onUpdateAssignment,
}: Props) {
  const weekDates = getWeekDates(weekStart);
  const [copyMsg, setCopyMsg] = useState('');

  const handleCopyText = async () => {
    if (!result) return;
    const text = exportScheduleText(shifts, result, weekStart);
    await navigator.clipboard.writeText(text);
    setCopyMsg('Đã copy!');
    setTimeout(() => setCopyMsg(''), 2000);
  };

  const handleDownloadHtml = () => {
    if (!result) return;
    const html = exportScheduleHtml(shifts, result, weekStart);
    downloadFile(html, `lich-lam-viec-${weekStart}.html`, 'text/html;charset=utf-8');
  };

  const handlePrint = () => {
    if (!result) return;
    openPrintableHtml(exportScheduleHtml(shifts, result, weekStart));
  };

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
          Nhấn &quot;Xếp lịch tự động&quot; sau khi đã cấu hình ca và điền tên TG vào lịch đăng ký.
        </div>
      )}

      {result && (
        <>
          <p className="edit-mode-hint">
            Bạn có thể sửa TG trực tiếp trên từng ca. Gõ tên để tìm — cảnh báo đỏ = trùng ca hoặc
            vượt số người.
          </p>

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

          <div className="export-bar">
            <span className="export-label">Xuất lịch dạng bảng (giống Google Sheets):</span>
            <div className="export-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={handleCopyText}>
                Copy bảng (text)
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={handleDownloadHtml}>
                Tải bảng HTML
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={handlePrint}>
                In / xem trước
              </button>
              {copyMsg && <span className="copy-feedback">{copyMsg}</span>}
            </div>
          </div>

          <SheetsSyncPanel shifts={shifts} result={result} weekStart={weekStart} />

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
                  weekDates={weekDates}
                  classColors={classColors}
                  roster={roster}
                  registrationGrid={registrationGrid}
                  slotOverrides={slotOverrides}
                  onUpdateAssignment={onUpdateAssignment}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
