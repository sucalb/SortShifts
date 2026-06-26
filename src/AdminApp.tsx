import { useState, useCallback } from 'react';
import type { DayOfWeek, Shift } from './types';
import { INITIAL_SHIFTS } from './data/initialShifts';
import { DEFAULT_TEACHING_ASSISTANTS } from './data/teachingAssistants';
import type { TeachingAssistant } from './data/teachingAssistants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ScheduleConfig } from './components/ScheduleConfig';
import { RegistrationBoard } from './components/RegistrationBoard';
import { ScheduleResultView } from './components/ScheduleResult';
import { autoSchedule } from './utils/scheduler';
import type { ScheduleResult } from './utils/scheduler';
import { toggleSlotAccess, type SlotOverrides } from './utils/slotAccess';
import {
  createEmptyRegistrationGrid,
  parseRegisteredNames,
  type RegistrationGrid,
} from './utils/registrationUtils';
import './App.css';

type Tab = 'config' | 'register' | 'result';

export function AdminApp() {
  const [tab, setTab] = useState<Tab>('config');
  const [shifts, setShifts] = useLocalStorage('lich-shifts', INITIAL_SHIFTS);
  const [roster, setRoster] = useLocalStorage<TeachingAssistant[]>(
    'lich-ta-list-v2',
    DEFAULT_TEACHING_ASSISTANTS,
  );
  const [weekStart, setWeekStart] = useLocalStorage('lich-week', '2026-06-01');
  const [slotOverrides, setSlotOverrides] = useLocalStorage<SlotOverrides | undefined>(
    'lich-slot-overrides',
    undefined,
  );
  const [registrationGrid, setRegistrationGrid] = useLocalStorage<RegistrationGrid>(
    'lich-registration-grid',
    createEmptyRegistrationGrid(),
  );
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);

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

  const handleUpdateCell = useCallback(
    (day: DayOfWeek, slotId: string, text: string) => {
      setRegistrationGrid((prev) => ({
        ...prev,
        [day]: { ...prev[day], [slotId]: text },
      }));
    },
    [setRegistrationGrid],
  );

  const handleToggleSlotAccess = useCallback(
    (day: DayOfWeek, slotId: string) => {
      const { overrides, newRegistrable } = toggleSlotAccess(slotOverrides, day, slotId);
      setSlotOverrides(overrides);
      if (!newRegistrable) {
        setRegistrationGrid((prev) => ({
          ...prev,
          [day]: { ...prev[day], [slotId]: '' },
        }));
      }
    },
    [setSlotOverrides, setRegistrationGrid, slotOverrides],
  );

  const handleUpdateRoster = useCallback(
    (newRoster: TeachingAssistant[]) => {
      setRoster(newRoster);
    },
    [setRoster],
  );

  const handleImportGrid = useCallback(
    (grid: RegistrationGrid) => {
      setRegistrationGrid(grid);
    },
    [setRegistrationGrid],
  );

  const handleRunSchedule = useCallback(() => {
    const hasAnyRegistration = Object.values(registrationGrid).some((day) =>
      Object.values(day ?? {}).some((text) => parseRegisteredNames(text).length > 0),
    );
    if (!hasAnyRegistration) {
      alert('Vui lòng điền tên trợ giảng vào lịch đăng ký trước khi xếp lịch.');
      setTab('register');
      return;
    }
    const result = autoSchedule(shifts, registrationGrid, slotOverrides);
    setScheduleResult(result);
  }, [shifts, registrationGrid, slotOverrides]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'config', label: '1. Cấu hình ca' },
    { id: 'register', label: '2. Đăng ký lịch' },
    { id: 'result', label: '3. Xếp lịch' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>ĐĂNG KÝ & XẾP LỊCH LÀM VIỆC MÔN TIẾNG ANH</h1>
        <p className="subtitle">Quản lý trợ giảng cho Cơ sở 1 & Cơ sở 2</p>
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
          <RegistrationBoard
            registrationGrid={registrationGrid}
            roster={roster}
            slotOverrides={slotOverrides}
            weekStart={weekStart}
            onUpdateCell={handleUpdateCell}
            onToggleSlotAccess={handleToggleSlotAccess}
            onUpdateRoster={handleUpdateRoster}
            onWeekStartChange={setWeekStart}
            onImportGrid={handleImportGrid}
          />
        )}
        {tab === 'result' && (
          <ScheduleResultView
            shifts={shifts}
            result={scheduleResult}
            weekStart={weekStart}
            onRunSchedule={handleRunSchedule}
            onClearAssignments={() => setScheduleResult(null)}
          />
        )}
      </main>

      <footer className="app-footer">Dữ liệu được lưu tự động trên trình duyệt</footer>
    </div>
  );
}
