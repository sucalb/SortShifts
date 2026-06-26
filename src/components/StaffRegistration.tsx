import { useState } from 'react';
import type { DayOfWeek, StaffMember } from '../types';
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
  countRegisteredShifts,
  findStaffForTA,
  getStaffDisplayName,
  parseNamesList,
  parseRosterText,
  rosterToText,
} from '../utils/staffUtils';

interface Props {
  staff: StaffMember[];
  roster: TeachingAssistant[];
  slotOverrides: SlotOverrides | undefined;
  weekStart: string;
  onAddStaff: (ta?: TeachingAssistant) => void;
  onAddStaffBulk: (names: string[]) => void;
  onRemoveStaff: (id: string) => void;
  onUpdateName: (id: string, name: string, abbreviation?: string) => void;
  onToggleAvailability: (staffId: string, day: DayOfWeek, slotId: string) => void;
  onToggleSlotAccess: (day: DayOfWeek, slotId: string) => void;
  onCopyAvailability: (fromId: string, toId: string) => void;
  onUpdateRoster: (roster: TeachingAssistant[]) => void;
  onFillFromRoster: () => void;
}

function RegistrationGrid({
  days,
  weekDates,
  slotOverrides,
  slotEditMode,
  onToggleSlotAccess,
  member,
  onToggleAvailability,
}: {
  days: DayOfWeek[];
  weekDates: string[];
  slotOverrides: SlotOverrides | undefined;
  slotEditMode: boolean;
  onToggleSlotAccess: (day: DayOfWeek, slotId: string) => void;
  member?: StaffMember;
  onToggleAvailability?: (day: DayOfWeek, slotId: string) => void;
}) {
  return (
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
              const cellState = getSlotCellState(slotOverrides, day, slot.id);
              const registrable = isSlotRegistrable(slotOverrides, day, slot.id);
              const available = member?.availability[day]?.[slot.id] ?? false;

              if (slotEditMode || !member) {
                if (!registrable) {
                  return (
                    <td
                      key={day}
                      className={`reg-cell blocked ${cellState === 'blocked-forced' ? 'blocked-forced' : ''}`}
                      onClick={() => onToggleSlotAccess(day, slot.id)}
                      title="Click để mở đăng ký"
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
                    title="Click để khóa ô này"
                  >
                    {cellState === 'open-unlocked' ? '↺' : '🔓'}
                  </td>
                );
              }

              if (!registrable) {
                return (
                  <td key={day} className={`reg-cell blocked ${cellState === 'blocked-forced' ? 'blocked-forced' : ''}`}>
                    —
                  </td>
                );
              }

              return (
                <td
                  key={day}
                  className={`reg-cell ${available ? 'available' : ''} ${cellState === 'open-unlocked' ? 'open-unlocked' : ''}`}
                  onClick={() => onToggleAvailability?.(day, slot.id)}
                  title={available ? 'Đã đăng ký rảnh — click để bỏ' : 'Click để đăng ký rảnh'}
                >
                  {available ? '✓' : ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StaffRegistration({
  staff,
  roster,
  slotOverrides,
  weekStart,
  onAddStaff,
  onAddStaffBulk,
  onRemoveStaff,
  onUpdateName,
  onToggleAvailability,
  onToggleSlotAccess,
  onCopyAvailability,
  onUpdateRoster,
  onFillFromRoster,
}: Props) {
  const weekDates = getWeekDates(weekStart);
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
  const [pasteText, setPasteText] = useState('');
  const [rosterText, setRosterText] = useState(rosterToText(roster));
  const [showRosterEdit, setShowRosterEdit] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [slotEditMode, setSlotEditMode] = useState(false);

  const handlePasteCreate = () => {
    const names = parseNamesList(pasteText);
    if (names.length === 0) return;
    onAddStaffBulk(names);
    setPasteText('');
  };

  const handleSaveRoster = () => {
    onUpdateRoster(parseRosterText(rosterText));
    setShowRosterEdit(false);
  };

  const handleCopyNames = async () => {
    const names = staff
      .map((s) => (s.abbreviation ? `${s.name} (${s.abbreviation})` : s.name))
      .filter(Boolean)
      .join('\n');
    if (!names) return;
    await navigator.clipboard.writeText(names);
    setCopyFeedback('Đã copy danh sách tên!');
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const getShiftCount = (ta: TeachingAssistant): number => {
    const member = findStaffForTA(staff, ta);
    return member ? countRegisteredShifts(member, slotOverrides) : 0;
  };

  const isTAAdded = (ta: TeachingAssistant): boolean => !!findStaffForTA(staff, ta);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Đăng ký lịch làm việc — Trợ giảng</h2>
        <div className="btn-group">
          <button className="btn btn-secondary" onClick={() => onAddStaff()}>
            + Thêm 1 người
          </button>
          <button className="btn btn-primary" onClick={onFillFromRoster}>
            Thêm tất cả TG
          </button>
        </div>
      </div>

      <p className="hint">
        Tên kèm lớp trong tab Cấu hình ca là <strong>giáo viên cố định</strong>, không phải trợ giảng.
        Khung giờ mở đăng ký bên dưới áp dụng <strong>chung cho tất cả trợ giảng</strong>.
      </p>

      <div className="global-slots-card">
        <div className="global-slots-header">
          <h3>Ca mở đăng ký (chung)</h3>
          <button
            className={`btn btn-sm ${slotEditMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSlotEditMode(!slotEditMode)}
          >
            {slotEditMode ? '✓ Chỉnh ô' : 'Chỉnh ô'}
          </button>
        </div>
        {slotEditMode && (
          <p className="edit-mode-hint">
            Chế độ chỉnh ô: click ô để mở/khóa ca đăng ký cho toàn bộ trợ giảng
          </p>
        )}
        <div className="table-wrapper">
          <RegistrationGrid
            days={days}
            weekDates={weekDates}
            slotOverrides={slotOverrides}
            slotEditMode={slotEditMode}
            onToggleSlotAccess={onToggleSlotAccess}
          />
        </div>
      </div>

      <div className="bulk-tools">
        <div className="bulk-section">
          <label className="bulk-label">
            Dán danh sách tên trợ giảng (mỗi dòng hoặc cách nhau bằng dấu phẩy)
          </label>
          <textarea
            className="bulk-textarea"
            placeholder={'Chinh Danh\nMinh Khiêm\nHữu Thắng'}
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
            <span className="bulk-label">THỐNG KÊ CA ĐĂNG KÝ — Danh sách trợ giảng</span>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((ta) => {
                    const shiftCount = getShiftCount(ta);
                    const added = isTAAdded(ta);
                    return (
                      <tr key={`${ta.fullName}-${ta.abbreviation}`} className={added ? 'ta-added' : ''}>
                        <td>{ta.fullName}</td>
                        <td className="abbr-cell">{ta.abbreviation}</td>
                        <td className="count-cell">{shiftCount}</td>
                        <td>
                          {!added && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => onAddStaff(ta)}
                            >
                              + Thêm
                            </button>
                          )}
                          {added && <span className="added-badge">Đã thêm</span>}
                        </td>
                      </tr>
                    );
                  })}
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
                rows={12}
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
          Chưa có trợ giảng nào. Nhấn &quot;Thêm tất cả TG&quot; hoặc chọn từng người trong bảng trên.
        </div>
      )}

      <datalist id="ta-roster-list">
        {roster.map((ta) => (
          <option key={ta.fullName} value={ta.fullName} label={ta.abbreviation} />
        ))}
      </datalist>

      {staff.map((member) => (
        <div key={member.id} className="staff-card">
          <div className="staff-card-header">
            <div className="staff-name-group">
              <input
                className="staff-name-input"
                list="ta-roster-list"
                placeholder="Tên trợ giảng"
                value={member.name}
                onChange={(e) => {
                  const ta = roster.find(
                    (t) => t.fullName.toLowerCase() === e.target.value.trim().toLowerCase(),
                  );
                  onUpdateName(member.id, e.target.value, ta?.abbreviation ?? member.abbreviation);
                }}
              />
              {member.abbreviation && (
                <span className="staff-abbr-badge">{member.abbreviation}</span>
              )}
            </div>
            <div className="staff-card-actions">
              <span className="shift-count-badge">
                {countRegisteredShifts(member, slotOverrides)} ca
              </span>
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
                        {getStaffDisplayName(s)}
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
            <RegistrationGrid
              days={days}
              weekDates={weekDates}
              slotOverrides={slotOverrides}
              slotEditMode={false}
              onToggleSlotAccess={onToggleSlotAccess}
              member={member}
              onToggleAvailability={(day, slotId) =>
                onToggleAvailability(member.id, day, slotId)
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
