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
            type="button"
            className={`btn btn-import-sheets ${showImport ? 'active' : ''}`}
            onClick={() => {
              setShowImport(!showImport);
              if (showImport) setImportMsg(null);
            }}
          >
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h5v2H8v-2z"
              />
            </svg>
            Import Sheets
          </button>
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

      <div className="reg-quick-tips">
        <span className="reg-tip">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Điền tên TG, cách nhau bằng dấu phẩy
        </span>
        <span className="reg-tip reg-tip-muted">
          <span className="tip-swatch blocked" />
          Ô vàng = không có ca
        </span>
      </div>

      {showImport && (
        <div className="import-card">
          <div className="import-card-top">
            <div className="import-card-brand">
              <div className="import-card-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48">
                  <rect x="8" y="6" width="22" height="30" rx="2" fill="#34a853" />
                  <rect x="14" y="4" width="22" height="30" rx="2" fill="#fff" stroke="#dadce0" />
                  <rect x="18" y="12" width="14" height="2" fill="#34a853" opacity="0.5" />
                  <rect x="18" y="17" width="10" height="2" fill="#34a853" opacity="0.35" />
                  <rect x="18" y="22" width="12" height="2" fill="#34a853" opacity="0.35" />
                </svg>
              </div>
              <div>
                <h3>Import từ Google Sheets</h3>
                <p>Copy bảng đăng ký tuần và dán vào khung bên dưới</p>
              </div>
            </div>
            <button
              type="button"
              className="import-card-close"
              aria-label="Đóng"
              onClick={() => {
                setShowImport(false);
                setImportMsg(null);
              }}
            >
              ×
            </button>
          </div>

          <ol className="import-steps">
            <li>Mở sheet đăng ký, chọn vùng <strong>7 cột ngày × 7 dòng ca</strong></li>
            <li>Nhấn <kbd>Ctrl</kbd>+<kbd>C</kbd> để copy</li>
            <li>Dán vào khung dưới rồi bấm Import</li>
          </ol>

          <div className={`import-dropzone ${importText.trim() ? 'has-content' : ''}`}>
            <textarea
              className="import-dropzone-input"
              placeholder="Dán dữ liệu từ Sheets vào đây…"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                if (importMsg) setImportMsg(null);
              }}
              rows={7}
            />
            {!importText.trim() && (
              <div className="import-dropzone-hint">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                <span>Ctrl + V để dán</span>
              </div>
            )}
          </div>

          <div className="import-card-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!importText.trim()}
            >
              Import vào lịch
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setImportText('');
                setImportMsg(null);
              }}
              disabled={!importText.trim()}
            >
              Xóa nội dung
            </button>
            {importMsg && (
              <div className={`import-toast ${importMsg.type}`} role="status">
                {importMsg.type === 'ok' ? '✓' : '!'} {importMsg.text}
              </div>
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
