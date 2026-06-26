import { useState, useCallback, useMemo } from 'react';
import type { DayOfWeek, Shift, StaffMember } from './types';
import { INITIAL_SHIFTS } from './data/initialShifts';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ScheduleConfig } from './components/ScheduleConfig';
import { StaffRegistration } from './components/StaffRegistration';
import { ScheduleResultView } from './components/ScheduleResult';
import { autoSchedule } from './utils/scheduler';
import type { ScheduleResult } from './utils/scheduler';
import {
  createStaffMember,
  extractNamesFromShifts,
  mergeRoster,
} from './utils/staffUtils';
import './App.css';

type Tab = 'config' | 'register' | 'result';

const DEFAULT_ROSTER = extractNamesFromShifts(INITIAL_SHIFTS);

function App() {
  const [tab, setTab] = useState<Tab>('config');
  const [shifts, setShifts] = useLocalStorage('lich-shifts', INITIAL_SHIFTS);
  const [staff, setStaff] = useLocalStorage<StaffMember[]>('lich-staff', []);
  const [roster, setRoster] = useLocalStorage('lich-ta-roster', DEFAULT_ROSTER);
  const [weekStart, setWeekStart] = useLocalStorage('lich-week', '2026-06-01');
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);

  const fullRoster = useMemo(() => mergeRoster(roster, shifts), [roster, shifts]);

  const handleUpdateStaffNeeded = useCallback((shiftId: string, count: number) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, staffNeeded: Math.max(0, count) } : s)),
    );
  }, [setShifts]);

  const handleUpdateShift = useCallback(
    (shiftId: string, updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded'>>) => {
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...updates } : s)),
      );
    },
    [setShifts],
  );

  const handleAddShift = useCallback(
    (shift: Omit<Shift, 'id'>) => {
      const newShift: Shift = {
        ...shift,
        id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      setShifts((prev) => [...prev, newShift]);
    },
    [setShifts],
  );

  const handleRemoveShift = useCallback(
    (shiftId: string) => {
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
      setScheduleResult(null);
    },
    [setShifts],
  );

  const handleAddStaff = useCallback(
    (name?: string) => {
      setStaff((prev) => [...prev, createStaffMember(name ?? '')]);
    },
    [setStaff],
  );

  const handleAddStaffBulk = useCallback(
    (names: string[]) => {
      const existing = new Set(staff.map((s) => s.name.trim().toLowerCase()));
      const newMembers = names
        .filter((n) => !existing.has(n.toLowerCase()))
        .map((n) => createStaffMember(n));
      if (newMembers.length > 0) {
        setStaff((prev) => [...prev, ...newMembers]);
      }
    },
    [setStaff, staff],
  );

  const handleFillFromRoster = useCallback(() => {
    const existing = new Set(staff.map((s) => s.name.trim().toLowerCase()));
    const newMembers = fullRoster
      .filter((n) => !existing.has(n.toLowerCase()))
      .map((n) => createStaffMember(n));
    if (newMembers.length === 0) {
      alert('Tất cả trợ giảng trong danh sách đã được thêm.');
      return;
    }
    setStaff((prev) => [...prev, ...newMembers]);
  }, [setStaff, staff, fullRoster]);

  const handleRemoveStaff = useCallback(
    (id: string) => {
      setStaff((prev) => prev.filter((s) => s.id !== id));
    },
    [setStaff],
  );

  const handleUpdateName = useCallback(
    (id: string, name: string) => {
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    },
    [setStaff],
  );

  const handleToggleAvailability = useCallback(
    (staffId: string, day: DayOfWeek, slotId: string) => {
      setStaff((prev) =>
        prev.map((s) => {
          if (s.id !== staffId) return s;
          const current = s.availability[day]?.[slotId] ?? false;
          return {
            ...s,
            availability: {
              ...s.availability,
              [day]: { ...s.availability[day], [slotId]: !current },
            },
          };
        }),
      );
    },
    [setStaff],
  );

  const handleCopyAvailability = useCallback(
    (fromId: string, toId: string) => {
      setStaff((prev) => {
        const source = prev.find((s) => s.id === fromId);
        if (!source) return prev;
        return prev.map((s) =>
          s.id === toId ? { ...s, availability: structuredClone(source.availability) } : s,
        );
      });
    },
    [setStaff],
  );

  const handleUpdateRoster = useCallback(
    (newRoster: string[]) => {
      setRoster(newRoster);
    },
    [setRoster],
  );

  const handleRunSchedule = useCallback(() => {
    const namedStaff = staff.filter((s) => s.name.trim());
    if (namedStaff.length === 0) {
      alert('Vui lòng thêm ít nhất một nhân viên có tên trước khi xếp lịch.');
      setTab('register');
      return;
    }
    const result = autoSchedule(shifts, namedStaff);
    setScheduleResult(result);
  }, [shifts, staff]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'config', label: '1. Cấu hình ca' },
    { id: 'register', label: '2. Đăng ký lịch' },
    { id: 'result', label: '3. Xếp lịch' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>ĐĂNG KÝ & XẾP LỊCH LÀM VIỆC MÔN TIẾNG ANH</h1>
        <p className="subtitle">Quản lý nhân sự cho Cơ sở 1 & Cơ sở 2</p>
      </header>

      <nav className="tab-nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'config' && (
          <ScheduleConfig
            shifts={shifts}
            weekStart={weekStart}
            onUpdateStaffNeeded={handleUpdateStaffNeeded}
            onUpdateShift={handleUpdateShift}
            onAddShift={handleAddShift}
            onRemoveShift={handleRemoveShift}
            onWeekStartChange={setWeekStart}
          />
        )}
        {tab === 'register' && (
          <StaffRegistration
            staff={staff}
            roster={fullRoster}
            weekStart={weekStart}
            onAddStaff={handleAddStaff}
            onAddStaffBulk={handleAddStaffBulk}
            onRemoveStaff={handleRemoveStaff}
            onUpdateName={handleUpdateName}
            onToggleAvailability={handleToggleAvailability}
            onCopyAvailability={handleCopyAvailability}
            onUpdateRoster={handleUpdateRoster}
            onFillFromRoster={handleFillFromRoster}
          />
        )}
        {tab === 'result' && (
          <ScheduleResultView
            shifts={shifts}
            staff={staff}
            result={scheduleResult}
            weekStart={weekStart}
            onRunSchedule={handleRunSchedule}
            onClearAssignments={() => setScheduleResult(null)}
          />
        )}
      </main>

      <footer className="app-footer">
        Dữ liệu được lưu tự động trên trình duyệt
      </footer>
    </div>
  );
}

export default App;
