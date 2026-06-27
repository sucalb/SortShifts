import { useState, useCallback, type ReactNode } from 'react';
import type { DayOfWeek, Shift, TeacherFixedTaMap } from './types';
import { INITIAL_SHIFTS } from './data/initialShifts';
import { DEFAULT_TEACHING_ASSISTANTS } from './data/teachingAssistants';
import type { TeachingAssistant } from './data/teachingAssistants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ScheduleConfig } from './components/ScheduleConfig';
import { RegistrationBoard } from './components/RegistrationBoard';
import { ScheduleResultView } from './components/ScheduleResult';
import { autoPushIfEnabled } from './components/SheetsSyncPanel';
import { autoSchedule, recomputeScheduleResult } from './utils/scheduler';
import type { ScheduleResult } from './utils/scheduler';
import { toggleSlotAccess, type SlotOverrides } from './utils/slotAccess';
import {
  createEmptyRegistrationGrid,
  parseRegisteredNames,
  type RegistrationGrid,
} from './utils/registrationUtils';
import './App.css';

type Tab = 'config' | 'register' | 'result';

const NAV: { id: Tab; label: string; desc: string; icon: ReactNode }[] = [
  {
    id: 'config',
    label: 'Cấu hình ca',
    desc: 'Lớp, GV, TG cố định',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="1" />
        <path d="M3 10h18M8 4v18" />
      </svg>
    ),
  },
  {
    id: 'register',
    label: 'Đăng ký lịch',
    desc: 'TG đánh dấu ca rảnh',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="1" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'result',
    label: 'Xếp lịch',
    desc: 'Chạy & đồng bộ Sheet',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

const PAGE_META: Record<Tab, { title: string; subtitle: string }> = {
  config: {
    title: 'Cấu hình ca học',
    subtitle: 'Thiết lập lớp, giáo viên và số trợ giảng cho từng ca trong tuần.',
  },
  register: {
    title: 'Đăng ký lịch rảnh',
    subtitle: 'Trợ giảng đánh dấu các ca có thể làm việc trước khi xếp lịch.',
  },
  result: {
    title: 'Kết quả xếp lịch',
    subtitle: 'Xem phân công, chỉnh sửa thủ công và đẩy lên Google Sheets.',
  },
};

export function AdminApp() {
  const [tab, setTab] = useState<Tab>('config');
  const [shifts, setShifts] = useLocalStorage('lich-shifts', INITIAL_SHIFTS);
  const [roster, setRoster] = useLocalStorage<TeachingAssistant[]>(
    'lich-ta-list-v2',
    DEFAULT_TEACHING_ASSISTANTS,
  );
  const [weekStart, setWeekStart] = useLocalStorage('lich-week', '2026-06-29');
  const [slotOverrides, setSlotOverrides] = useLocalStorage<SlotOverrides | undefined>(
    'lich-slot-overrides',
    undefined,
  );
  const [registrationGrid, setRegistrationGrid] = useLocalStorage<RegistrationGrid>(
    'lich-registration-grid',
    createEmptyRegistrationGrid(),
  );
  const [classColors, setClassColors] = useLocalStorage<Record<string, string>>(
    'lich-class-colors',
    {},
  );
  const [fixedTaMap] = useLocalStorage<TeacherFixedTaMap>(
    'lich-teacher-fixed-ta',
    {},
  );
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);

  const handleUpdateStaffNeeded = useCallback((shiftId: string, count: number) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, staffNeeded: Math.max(0, count) } : s)),
    );
  }, [setShifts]);

  const handleUpdateShift = useCallback(
    (
      shiftId: string,
      updates: Partial<Pick<Shift, 'className' | 'teacher' | 'staffNeeded' | 'fixedTaNames'>>,
    ) => {
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

  const handleRunSchedule = useCallback(async () => {
    const hasAnyRegistration = Object.values(registrationGrid).some((day) =>
      Object.values(day ?? {}).some((text) => parseRegisteredNames(text).length > 0),
    );
    if (!hasAnyRegistration) {
      alert('Vui lòng điền tên trợ giảng vào lịch đăng ký trước khi xếp lịch.');
      setTab('register');
      return;
    }
    const result = autoSchedule(shifts, registrationGrid, slotOverrides, fixedTaMap);
    setScheduleResult(result);

    try {
      const webhookUrl = localStorage.getItem('lich-sheets-webhook');
      const autoPush = localStorage.getItem('lich-sheets-auto-push');
      const url = webhookUrl ? (JSON.parse(webhookUrl) as string) : '';
      const enabled = autoPush ? (JSON.parse(autoPush) as boolean) : false;
      if (enabled && url.trim()) {
        const msg = await autoPushIfEnabled(url, true, shifts, result, weekStart);
        if (msg) {
          alert(`Xếp lịch xong.\n\nGoogle Sheets: ${msg}`);
        }
      }
    } catch {
      /* ignore auto-push errors */
    }
  }, [shifts, registrationGrid, slotOverrides, fixedTaMap, weekStart]);

  const handleUpdateAssignment = useCallback(
    (shiftId: string, staffIds: string[]) => {
      setScheduleResult((prev) => {
        if (!prev) return prev;
        const assignments = prev.assignments.filter((a) => a.shiftId !== shiftId);
        if (staffIds.length > 0) {
          assignments.push({ shiftId, staffIds });
        }
        const { unfulfilled, stats } = recomputeScheduleResult(assignments, shifts);
        return { assignments, unfulfilled, stats };
      });
    },
    [shifts],
  );

  const page = PAGE_META[tab];

  return (
    <div className="app app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img className="brand-mark" src="/favicon.svg" alt="" width={36} height={36} />
          <div className="topbar-brand-text">
            <strong>URANUS</strong>
            <span>Tiếng Anh · CS1 & CS2</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="topbar-week">
            Tuần <strong>{weekStart}</strong>
          </span>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar" aria-label="Điều hướng">
          <p className="sidebar-label">Menu</p>
          <nav className="sidebar-nav">
            {NAV.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-text">
                  <span className="sidebar-link-step">{i + 1}</span>
                  {item.label}
                  <small>{item.desc}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="sidebar-promo">
            <span className="sidebar-promo-tag">Lưu tự động</span>
            <p>Dữ liệu được giữ trên trình duyệt — không cần đăng nhập.</p>
          </div>
        </aside>

        <div className="content-wrap">
          <main className="app-main">
            <header className="page-header">
              <h1>{page.title}</h1>
              <p>{page.subtitle}</p>
            </header>

            {tab === 'config' && (
              <ScheduleConfig
                shifts={shifts}
                weekStart={weekStart}
                roster={roster}
                classColors={classColors}
                onClassColorsChange={setClassColors}
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
                classColors={classColors}
                roster={roster}
                registrationGrid={registrationGrid}
                slotOverrides={slotOverrides}
                onRunSchedule={handleRunSchedule}
                onClearAssignments={() => setScheduleResult(null)}
                onUpdateAssignment={handleUpdateAssignment}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
