import { useState } from 'react';
import type { DayOfWeek, StaffMember } from '../types';
import {
  DAY_LABELS,
  REGISTRATION_SLOTS,
  getWeekDates,
  isRegistrationBlocked,
} from '../data/constants';
import { parseNamesList } from '../utils/staffUtils';

interface Props {
  staff: StaffMember[];
  roster: string[];
  weekStart: string;
  onAddStaff: (name?: string) => void;
  onAddStaffBulk: (names: string[]) => void;
  onRemoveStaff: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onToggleAvailability: (staffId: string, day: DayOfWeek, slotId: string) => void;
  onCopyAvailability: (fromId: string, toId: string) => void;
  onUpdateRoster: (roster: string[]) => void;
  onFillFromRoster: () => void;
}

export function StaffRegistration({
  staff,
  roster,
  weekStart,
  onAddStaff,
  onAddStaffBulk,
  onRemoveStaff,
  onUpdateName,
  onToggleAvailability,
  onCopyAvailability,
  onUpdateRoster,
  onFillFromRoster,
}: Props) {
  const weekDates = getWeekDates(weekStart);
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [pasteText, setPasteText] = useState('');
  const [rosterText, setRosterText] = useState(roster.join('\n'));
  const [showRosterEdit, setShowRosterEdit] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handlePasteCreate = () => {
    const names = parseNamesList(pasteText);
    if (names.length === 0) return;
    onAddStaffBulk(names);
    setPasteText('');
  };

  const handleSaveRoster = () => {
    onUpdateRoster(parseNamesList(rosterText));
    setShowRosterEdit(false);
  };

  const handleCopyNames = async () => {
    const names = staff.map((s) => s.name).filter(Boolean).join('\n');
    if (!names) return;
    await navigator.clipboard.writeText(names);
    setCopyFeedback('Đã copy danh sách tên!');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Đăng ký lịch làm việc</h2>
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => onAddStaff()}>
            + Thêm 1 người
          </button>
          <button className="btn btn-primary" onClick={onFillFromRoster}>
            Điền từ danh sách TG
          </button>
        </div>
      </div>

      <p className="hint">
        Ô màu vàng = không có ca làm (Thứ 2–6, sáng/chiều). Click ô trắng để đăng ký rảnh.
      </p>

      <div className="bulk-tools">
        <div className="bulk-section">
          <label className="bulk-label">Dán danh sách tên trợ giảng (mỗi dòng hoặc cách nhau bằng dấu phẩy)</label>
          <textarea
            className="bulk-textarea"
            placeholder={'MAI\nTHẮNG\nTÂN\nHÀ TRÂM'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={3}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handlePasteCreate}
            disabled={!pasteText.trim()}
          >
            Tạo từ danh sách
          </button>
        </div>

        <div className="bulk-section roster-section">
          <div className="roster-header">
            <span className="bulk-label">
              Danh sách trợ giảng có sẵn ({roster.length} người)
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setRosterText(roster.join('\n'));
                setShowRosterEdit(!showRosterEdit);
              }}
            >
              {showRosterEdit ? 'Đóng' : 'Sửa danh sách'}
            </button>
          </div>
          {!showRosterEdit ? (
            <div className="roster-chips">
              {roster.map((name) => (
                <button
                  key={name}
                  className="roster-chip"
                  onClick={() => onAddStaff(name)}
                  title="Click để thêm người này"
                >
                  + {name}
                </button>
              ))}
              {roster.length === 0 && (
                <span className="roster-empty">Chưa có tên. Nhấn &quot;Sửa danh sách&quot; để thêm.</span>
              )}
            </div>
          ) : (
            <div className="roster-edit">
              <textarea
                className="bulk-textarea"
                value={rosterText}
                onChange={(e) => setRosterText(e.target.value)}
                rows={5}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSaveRoster}>
                Lưu danh sách
              </button>
            </div>
          )}
        </div>

        {staff.length > 0 && (
          <div className="bulk-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleCopyNames}>
              Copy tên đã nhập
            </button>
            {copyFeedback && <span className="copy-feedback">{copyFeedback}</span>}
          </div>
        )}
      </div>

      {staff.length === 0 && (
        <div className="empty-state">
          Chưa có nhân viên. Dán danh sách tên, chọn từ danh sách TG, hoặc nhấn &quot;Thêm 1 người&quot;.
        </div>
      )}

      <datalist id="ta-roster-list">
        {roster.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {staff.map((member) => (
        <div key={member.id} className="staff-card">
          <div className="staff-card-header">
            <input
              className="staff-name-input"
              list="ta-roster-list"
              placeholder="Tên trợ giảng"
              value={member.name}
              onChange={(e) => onUpdateName(member.id, e.target.value)}
            />
            <div className="staff-card-actions">
              {staff.length > 1 && (
                <select
                  className="copy-select"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onCopyAvailability(e.target.value, member.id);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Sao chép lịch từ...</option>
                  {staff
                    .filter((s) => s.id !== member.id && s.name.trim())
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onRemoveStaff(member.id)}
              >
                Xóa
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="schedule-table registration-table">
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
                      const blocked = isRegistrationBlocked(day, slot.id);
                      const available = member.availability[day]?.[slot.id] ?? false;

                      if (blocked) {
                        return (
                          <td key={day} className="reg-cell blocked" title="Không có ca làm">
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={day}
                          className={`reg-cell ${available ? 'available' : ''}`}
                          onClick={() => onToggleAvailability(member.id, day, slot.id)}
                          title={available ? 'Đã đăng ký rảnh' : 'Click để đăng ký'}
                        >
                          {available ? '✓' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
