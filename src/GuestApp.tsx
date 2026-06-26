import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { DayOfWeek, StaffMember } from './types';
import type { TeachingAssistant } from './data/teachingAssistants';
import {
  DAY_LABELS,
  REGISTRATION_SLOTS,
  getWeekDates,
} from './data/constants';
import {
  fetchShare,
  registerGuest,
  updateGuestAvailability,
  type SharedScheduleData,
} from './api/shareApi';
import {
  getSlotCellState,
  isSlotRegistrable,
  type SlotOverrides,
} from './utils/slotAccess';
import { countRegisteredShifts } from './utils/staffUtils';

function ReadOnlySlotsGrid({
  weekDates,
  days,
  slotOverrides,
}: {
  weekDates: string[];
  days: DayOfWeek[];
  slotOverrides: SlotOverrides | undefined;
}) {
  return (
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
                const registrable = isSlotRegistrable(slotOverrides, day, slot.id);
                const cellState = getSlotCellState(slotOverrides, day, slot.id);
                if (!registrable) {
                  return (
                    <td
                      key={day}
                      className={`reg-cell blocked ${cellState === 'blocked-forced' ? 'blocked-forced' : ''}`}
                    >
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={day}
                    className={`reg-cell ${cellState === 'open-unlocked' ? 'open-unlocked' : ''}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuestApp() {
  const { shareId } = useParams<{ shareId: string }>();
  const [data, setData] = useState<SharedScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myStaff, setMyStaff] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sessionKey = `guest-staff-${shareId}`;
  const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

  const loadData = useCallback(async () => {
    if (!shareId) return;
    const remote = await fetchShare(shareId);
    setData(remote);
    const savedStaffId = sessionStorage.getItem(sessionKey);
    if (savedStaffId) {
      const found = remote.staff.find((s) => s.id === savedStaffId);
      if (found) setMyStaff(found);
    }
  }, [shareId, sessionKey]);

  useEffect(() => {
    if (!shareId) {
      setError('Link không hợp lệ');
      setLoading(false);
      return;
    }
    loadData()
      .catch((e) => setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [shareId, loadData]);

  const handleSelectTA = async (ta: TeachingAssistant) => {
    if (!shareId) return;
    setSaving(true);
    setError(null);
    try {
      const staff = await registerGuest(shareId, ta.fullName, ta.abbreviation);
      sessionStorage.setItem(sessionKey, staff.id);
      setMyStaff(staff);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi đăng ký');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (day: DayOfWeek, slotId: string) => {
    if (!shareId || !myStaff) return;
    const current = myStaff.availability[day]?.[slotId] ?? false;
    const newAvailability = {
      ...myStaff.availability,
      [day]: { ...myStaff.availability[day], [slotId]: !current },
    };
    const optimistic = { ...myStaff, availability: newAvailability };
    setMyStaff(optimistic);
    setSaving(true);
    try {
      const updated = await updateGuestAvailability(shareId, myStaff.id, newAvailability);
      setMyStaff(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setMyStaff(myStaff);
      setError(e instanceof Error ? e.message : 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app guest-app">
        <header className="app-header">
          <h1>ĐĂNG KÝ LỊCH LÀM VIỆC</h1>
        </header>
        <main className="app-main">
          <div className="empty-state">Đang tải...</div>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="app guest-app">
        <header className="app-header">
          <h1>ĐĂNG KÝ LỊCH LÀM VIỆC</h1>
        </header>
        <main className="app-main">
          <div className="empty-state error-text">{error}</div>
        </main>
      </div>
    );
  }

  if (!data) return null;

  const weekDates = getWeekDates(data.weekStart);

  return (
    <div className="app guest-app">
      <header className="app-header">
        <h1>ĐĂNG KÝ LỊCH LÀM VIỆC</h1>
        <p className="subtitle">Chọn tên và đánh dấu các ca bạn rảnh</p>
      </header>

      <main className="app-main">
        <div className="panel">
          {!myStaff ? (
            <>
              <h2>Chọn tên của bạn</h2>
              <p className="hint">Chọn đúng tên trong danh sách trợ giảng để đăng ký lịch.</p>
              <div className="guest-ta-list">
                {data.roster.map((ta) => {
                  const registered = data.staff.find(
                    (s) => s.name.toLowerCase() === ta.fullName.toLowerCase(),
                  );
                  return (
                    <button
                      key={ta.fullName}
                      className="guest-ta-btn"
                      onClick={() => handleSelectTA(ta)}
                      disabled={saving}
                    >
                      <span className="guest-ta-name">{ta.fullName}</span>
                      <span className="guest-ta-abbr">{ta.abbreviation}</span>
                      {registered && (
                        <span className="guest-ta-note">
                          ({countRegisteredShifts(registered, data.slotOverrides)} ca đã đk)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="guest-identity">
                <h2>
                  {myStaff.name}
                  {myStaff.abbreviation && (
                    <span className="staff-abbr-badge">{myStaff.abbreviation}</span>
                  )}
                </h2>
                <div className="guest-identity-actions">
                  <span className="shift-count-badge">
                    {countRegisteredShifts(myStaff, data.slotOverrides)} ca
                  </span>
                  {saving && <span className="save-status">Đang lưu...</span>}
                  {saved && <span className="save-status saved">Đã lưu ✓</span>}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      sessionStorage.removeItem(sessionKey);
                      setMyStaff(null);
                    }}
                  >
                    Đổi tên
                  </button>
                </div>
              </div>

              <p className="hint">Click ô trắng để đăng ký ca rảnh. Ô vàng = không có ca đăng ký.</p>

              <h3 className="section-subtitle">Ca mở đăng ký (chung)</h3>
              <ReadOnlySlotsGrid
                weekDates={weekDates}
                days={days}
                slotOverrides={data.slotOverrides}
              />

              <h3 className="section-subtitle">Lịch rảnh của bạn</h3>
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
                          const registrable = isSlotRegistrable(
                            data.slotOverrides,
                            day,
                            slot.id,
                          );
                          const available = myStaff.availability[day]?.[slot.id] ?? false;
                          if (!registrable) {
                            return (
                              <td key={day} className="reg-cell blocked">
                                —
                              </td>
                            );
                          }
                          return (
                            <td
                              key={day}
                              className={`reg-cell ${available ? 'available' : ''}`}
                              onClick={() => handleToggle(day, slot.id)}
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
            </>
          )}
          {error && <p className="share-error">{error}</p>}
        </div>
      </main>

      <footer className="app-footer">Đăng ký lịch — chế độ trợ giảng</footer>
    </div>
  );
}
