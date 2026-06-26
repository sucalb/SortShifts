import { useState } from 'react';
import type { DayOfWeek } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import {
  DAY_LABELS,
  REGISTRATION_SLOTS,
  getWeekDates,
} from '../data/constants';
import {
  getSlotCellState,
  isSlotRegistrable,
  type SlotOverrides,
} from '../utils/slotAccess';
import {
  countTARegistrations,
  getCellText,
  type RegistrationGrid,
} from '../utils/registrationUtils';
import { parseRosterText, rosterToText } from '../utils/staffUtils';
import { parseRegistrationImport } from '../utils/importRegistration';

interface Props {
  registrationGrid: RegistrationGrid;
  roster: TeachingAssistant[];
  slotOverrides: SlotOverrides | undefined;
  weekStart: string;
  onUpdateCell: (day: DayOfWeek, slotId: string, text: string) => void;
  onToggleSlotAccess: (day: DayOfWeek, slotId: string) => void;
  onUpdateRoster: (roster: TeachingAssistant[]) => void;
  onWeekStartChange: (date: string) => void;
  onImportGrid: (grid: RegistrationGrid) => void;
}

export function RegistrationBoard({
  registrationGrid,
  roster,
  slotOverrides,
  weekStart,
  onUpdateCell,
  onToggleSlotAccess,
  onUpdateRoster,
  onWeekStartChange,
  onImportGrid,
}: Props) {
  const weekDates = getWeekDates(weekStart);
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [slotEditMode, setSlotEditMode] = useState(false);
  const [showRosterEdit, setShowRosterEdit] = useState(false);
  const [rosterText, setRosterText] = useState(rosterToText(roster));
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const handleSaveRoster = () => {
    onUpdateRoster(parseRosterText(rosterText));
    setShowRosterEdit(false);
  };

  const handleImport = () => {
    const result = parseRegistrationImport(importText);
    if ('error' in result) {
      setImportMsg({ type: 'err', text: result.error });
      return;
    }
    onImportGrid(result.grid);
    setImportMsg({ type: 'ok', text: `Đã import ${result.filled} ô có dữ liệu.` });
    setImportText('');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Đăng ký lịch làm việc</h2>
        <div className="btn-group">
          <button
            className={`btn btn-sm ${slotEditMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSlotEditMode(!slotEditMode)}
          >
            {slotEditMode ? '✓ Chỉnh ô' : 'Chỉnh ô'}
          </button>
          <div className="week-picker">
            <label>Tuần:</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => onWeekStartChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <p className="hint">
        Điền tên trợ giảng vào từng ô (cách nhau bằng dấu phẩy) hoặc{' '}
        <button className="link-btn" type="button" onClick={() => setShowImport(!showImport)}>
          import từ Google Sheets
        </button>
        . Ô vàng = không có ca.
      </p>

      {showImport && (
        <div className="import-panel">
          <label className="bulk-label">
            Dán bảng từ Google Sheets (copy cả vùng 7×7, có thể kèm cột giờ và hàng ngày)
          </label>
          <textarea
            className="bulk-textarea import-textarea"
            placeholder={'Ca\t22/06\t23/06\t...\n6:00 - 8:00\t\t...\n...\n19:00 - 21:00\tKhang, Ý\t...'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
          />
          <div className="import-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleImport}
              disabled={!importText.trim()}
            >
              Import vào lịch
            </button>
            {importMsg && (
              <span className={importMsg.type === 'ok' ? 'copy-feedback' : 'share-error'}>
                {importMsg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {slotEditMode && (
        <p className="edit-mode-hint">Chế độ chỉnh ô: click ô để mở/khóa ca đăng ký</p>
      )}

      <div className="table-wrapper registration-board">
        <table className="schedule-table registration-table reg-names-table">
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
            {REGISTRATION_SLOTS.map((slot) => (
              <tr key={slot.id}>
                <td className="time-col">{slot.label}</td>
                {days.map((day) => {
                  const registrable = isSlotRegistrable(slotOverrides, day, slot.id);
                  const cellState = getSlotCellState(slotOverrides, day, slot.id);
                  const text = getCellText(registrationGrid, day, slot.id);

                  if (slotEditMode) {
                    if (!registrable) {
                      return (
                        <td
                          key={day}
                          className={`reg-cell blocked ${cellState === 'blocked-forced' ? 'blocked-forced' : ''}`}
                          onClick={() => onToggleSlotAccess(day, slot.id)}
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={day}
                        className={`reg-cell open-edit ${cellState === 'open-unlocked' ? 'open-unlocked' : ''}`}
                        onClick={() => onToggleSlotAccess(day, slot.id)}
                      >
                        {cellState === 'open-unlocked' ? '↺' : '🔓'}
                      </td>
                    );
                  }

                  if (!registrable) {
                    return (
                      <td key={day} className="reg-cell blocked">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={day} className="reg-cell reg-name-cell">
                      <textarea
                        className="reg-name-input"
                        value={text}
                        onChange={(e) => onUpdateCell(day, slot.id, e.target.value)}
                        placeholder="Khang, Ý, H.Long..."
                        rows={2}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="roster-reference">
        <div className="roster-header">
          <span className="bulk-label">Danh sách ký hiệu trợ giảng</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setRosterText(rosterToText(roster));
              setShowRosterEdit(!showRosterEdit);
            }}
          >
            {showRosterEdit ? 'Đóng' : 'Sửa danh sách'}
          </button>
        </div>

        {!showRosterEdit ? (
          <div className="table-wrapper ta-stats-table">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Ký hiệu</th>
                  <th>Số ca đăng ký</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((ta) => (
                  <tr key={ta.fullName}>
                    <td>{ta.fullName}</td>
                    <td className="abbr-cell">{ta.abbreviation}</td>
                    <td className="count-cell">
                      {countTARegistrations(registrationGrid, slotOverrides, ta.abbreviation) ||
                        countTARegistrations(registrationGrid, slotOverrides, ta.fullName)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="roster-edit">
            <p className="edit-hint">Mỗi dòng: Tên đầy đủ | Ký hiệu</p>
            <textarea
              className="bulk-textarea"
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              rows={10}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSaveRoster}>
              Lưu danh sách
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
