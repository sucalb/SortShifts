import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRegisterWeek,
  fetchBootstrap,
  fetchRegisterGrid,
  findWeekByIsoStart,
  nextMondayIso,
  pickDefaultWeek,
  syncRegistration,
  type RegisterEmployee,
  type RegisterGrid,
  type RegisterWeek,
} from '../api/registerApi';

const EMPLOYEE_KEY = 'dk-employee';
const DRAFT_PREFIX = 'dk-draft.';

type Toast = { kind: 'ok' | 'error'; text: string } | null;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* trình duyệt chặn lưu trữ — vẫn dùng được, chỉ không nhớ */
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* bỏ qua */
  }
}

/** Dropdown tự dựng — <select> của trình duyệt không chỉnh được giao diện danh sách thả xuống. */
function Dropdown<T extends string>({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: T | '';
  options: { value: T; label: string }[];
  placeholder: string;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div className="dk-dropdown" ref={rootRef}>
      <button
        type="button"
        className="dk-dropdown-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current?.label ?? placeholder}
      </button>
      {open && (
        <div className="dk-dropdown-menu" role="listbox">
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`dk-dropdown-item ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Trang đăng ký lịch cho trợ giảng — không cần đăng nhập. Ghi thẳng vào Sheet
 * đăng ký qua cùng Apps Script với trang ShiftRegister cũ, giữ nguyên giao diện cũ.
 */
export function TaRegistrationView() {
  const [employees, setEmployees] = useState<RegisterEmployee[]>([]);
  const [weeks, setWeeks] = useState<RegisterWeek[]>([]);
  const [employee, setEmployee] = useState<RegisterEmployee | null>(() =>
    readJson<RegisterEmployee>(EMPLOYEE_KEY),
  );
  const [pickedCode, setPickedCode] = useState('');
  const [week, setWeek] = useState('');
  const [grid, setGrid] = useState<RegisterGrid | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [statusText, setStatusText] = useState('Đang tải...');
  const [statusOk, setStatusOk] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNewWeek, setShowNewWeek] = useState(false);
  const [newWeekDate, setNewWeekDate] = useState('');
  const [newWeekError, setNewWeekError] = useState('');
  const [toast, setToast] = useState<Toast>(null);

  const flash = (kind: 'ok' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3000);
  };

  const loadBootstrap = useCallback(async (selectWeek?: string) => {
    try {
      const data = await fetchBootstrap();
      setEmployees(data.employees);
      setWeeks(data.weeks);
      if (data.weeks.length === 0) {
        setError('Chưa có tuần nào trong Sheet.');
        return;
      }
      const target =
        selectWeek && data.weeks.some((w) => w.name === selectWeek)
          ? selectWeek
          : pickDefaultWeek(data.weeks);
      setWeek(target);
    } catch (err) {
      setError(`Không tải được dữ liệu từ Sheet: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  // Tuần TG cần đăng ký là tuần sau; Sheet chưa có thì gợi ý tạo luôn.
  const nextMonday = nextMondayIso();
  const nextWeekMissing = weeks.length > 0 && !findWeekByIsoStart(weeks, nextMonday);

  const draftKey = employee && week ? `${DRAFT_PREFIX}${employee.code}.${week}` : '';

  useEffect(() => {
    if (!employee || !week) return;
    let cancelled = false;
    setGrid(null);
    setError('');
    setStatusOk(false);
    setStatusText('Đang tải...');
    fetchRegisterGrid(week, employee.code)
      .then((g) => {
        if (cancelled) return;
        const fromSheet: Record<string, boolean> = {};
        for (const [key, cell] of Object.entries(g.cells)) if (cell.on) fromSheet[key] = true;
        const draft = readJson<Record<string, boolean>>(`${DRAFT_PREFIX}${employee.code}.${week}`);
        setGrid(g);
        setSelected(draft ?? fromSheet);
        setStatusText(draft ? 'Đang hiện bản nháp chưa đồng bộ.' : 'Đã tải lịch từ Sheet.');
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatusText('');
          setError(`Không tải được lịch: ${err.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [employee, week]);

  const toggle = (key: string) => setSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSaveDraft = () => {
    if (!draftKey) return;
    writeJson(draftKey, selected);
    flash('ok', 'Đã lưu nháp trên trình duyệt.');
  };

  const handleSync = async () => {
    if (!employee || !grid) return;
    const g: RegisterGrid = grid;
    const cells: { row: number; col: number; checked: boolean }[] = [];
    for (const shift of g.shifts) {
      for (const d of g.days) {
        const key = `${shift.row}_${d.col}`;
        if (g.cells[key]?.closed) continue; // ô không có ca, không gửi lên
        cells.push({ row: shift.row, col: d.col, checked: !!selected[key] });
      }
    }
    setBusy(true);
    setStatusOk(false);
    setStatusText('Đang đồng bộ...');
    try {
      await syncRegistration(g.week, employee.code, cells);
      removeKey(draftKey);
      setStatusOk(true);
      setStatusText(`Đã đồng bộ lên Sheet lúc ${new Date().toLocaleTimeString('vi-VN')}`);
      flash('ok', 'Đồng bộ thành công!');
    } catch (err) {
      setStatusText('Đồng bộ thất bại');
      flash('error', `Đồng bộ thất bại: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWeek = async (isoDate: string) => {
    if (!isoDate) {
      setNewWeekError('Chọn 1 ngày trước đã.');
      return;
    }
    setBusy(true);
    setNewWeekError('');
    try {
      const created = await createRegisterWeek(isoDate);
      setShowNewWeek(false);
      setNewWeekDate('');
      flash('ok', `Đã tạo tuần ${created.name}!`);
      await loadBootstrap(created.name);
    } catch (err) {
      setNewWeekError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const weekOptions = useMemo(
    () => [...weeks].reverse().map((w) => ({ value: w.name, label: `${w.name} · ${w.startDate}` })),
    [weeks],
  );

  if (!employee) {
    return (
      <div className="dk">
        <section className="dk-card dk-center-card">
          <h1>Chào bạn 👋</h1>
          <p className="dk-muted">Vui lòng chọn tên của bạn để bắt đầu đăng ký ca làm việc.</p>
          <div className="dk-field">
            <label>Tên của bạn</label>
            <Dropdown
              value={pickedCode}
              placeholder={employees.length ? 'Chọn tên' : 'Đang tải danh sách...'}
              disabled={employees.length === 0}
              options={employees.map((e) => ({ value: e.code, label: e.name }))}
              onChange={setPickedCode}
            />
          </div>
          <button
            type="button"
            className="dk-btn dk-btn-primary"
            disabled={!pickedCode}
            onClick={() => {
              const emp = employees.find((x) => x.code === pickedCode);
              if (!emp) return;
              writeJson(EMPLOYEE_KEY, emp);
              setEmployee(emp);
            }}
          >
            Tiếp tục
          </button>
          {error && <p className="dk-error">{error}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="dk">
      <div className="dk-whoami">
        <div>
          <div className="dk-whoami-name">{employee.name}</div>
          <div className="dk-whoami-status">Đã lưu trên trình duyệt này</div>
        </div>
        <button
          type="button"
          className="dk-btn dk-btn-outline"
          onClick={() => {
            removeKey(EMPLOYEE_KEY);
            setEmployee(null);
            setGrid(null);
          }}
        >
          Đổi tên
        </button>
      </div>

      {nextWeekMissing && (
        <div className="dk-note dk-note-action">
          <span>
            Tuần sau (<strong>{nextMonday.split('-').reverse().join('/')}</strong>) chưa có trên
            Sheet.
          </span>
          <button
            type="button"
            className="dk-btn dk-btn-primary dk-btn-sm"
            disabled={busy}
            onClick={() => handleCreateWeek(nextMonday)}
          >
            Tạo tuần này
          </button>
        </div>
      )}

      <div className="dk-card dk-table-card">
        <div className="dk-card-title-row">
          <div className="dk-card-title">Đăng ký lịch làm việc</div>
          <div className="dk-week-inline">
            <span className="dk-week-label">Tuần:</span>
            <Dropdown
              value={week}
              placeholder="—"
              options={weekOptions}
              onChange={setWeek}
            />
            <button
              type="button"
              className="dk-btn dk-btn-outline dk-btn-sm"
              onClick={() => {
                setShowNewWeek((v) => !v);
                setNewWeekError('');
              }}
            >
              + Tuần mới
            </button>
          </div>
        </div>

        {showNewWeek && (
          <div className="dk-new-week">
            <label htmlFor="dkNewWeekDate">
              Chọn 1 ngày bất kỳ trong tuần muốn tạo (tự quy về Thứ Hai):
            </label>
            <div className="dk-new-week-row">
              <input
                id="dkNewWeekDate"
                type="date"
                value={newWeekDate}
                onChange={(e) => setNewWeekDate(e.target.value)}
              />
              <button
                type="button"
                className="dk-btn dk-btn-primary dk-btn-sm"
                disabled={busy}
                onClick={() => handleCreateWeek(newWeekDate)}
              >
                Tạo tuần
              </button>
              <button
                type="button"
                className="dk-btn dk-btn-outline dk-btn-sm"
                onClick={() => setShowNewWeek(false)}
              >
                Huỷ
              </button>
            </div>
            {newWeekError && <p className="dk-error">{newWeekError}</p>}
          </div>
        )}

        <div className="dk-legend">
          <span>✓ Ô xanh = ca bạn đã chọn</span>
          <span>
            <span className="dk-swatch" /> Ô vàng = không có ca
          </span>
        </div>

        <div className="dk-note">
          Bấm vào ô để đánh dấu ca bạn <strong>có thể làm</strong>, bấm lại để bỏ chọn. Nhớ bấm{' '}
          <strong>Đồng bộ lên Sheet</strong> sau khi chọn xong để nhà trường thấy được lịch của bạn.
        </div>

        <div className="dk-status">
          <span className={statusOk ? 'ok' : 'dk-muted'}>{statusText}</span>
        </div>

        {grid && (
          <div className="dk-table-wrap">
            <table className="dk-shift-table">
              <thead>
                <tr>
                  <th className="corner">Ca</th>
                  {grid.days.map((d) => (
                    <th key={d.col}>
                      <span className="weekday">{d.weekday}</span>
                      <span className="date">{d.date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.shifts.map((shift) => (
                  <tr key={shift.row}>
                    <th>{shift.label}</th>
                    {grid.days.map((day) => {
                      const key = `${shift.row}_${day.col}`;
                      const closed = !!grid.cells[key]?.closed;
                      const on = !closed && !!selected[key];
                      return (
                        <td key={key}>
                          <button
                            type="button"
                            className={`dk-cell ${on ? 'selected' : ''} ${closed ? 'closed' : ''}`}
                            disabled={closed}
                            aria-pressed={on}
                            aria-label={`${day.weekday} ${shift.label}`}
                            onClick={() => toggle(key)}
                          >
                            {on ? '✓' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="dk-actions">
          <button type="button" className="dk-btn dk-btn-outline" onClick={handleSaveDraft}>
            Lưu nháp
          </button>
          <button
            type="button"
            className="dk-btn dk-btn-primary"
            disabled={!grid || busy}
            onClick={handleSync}
          >
            Đồng bộ lên Sheet
          </button>
        </div>
        {error && <p className="dk-error">{error}</p>}
      </div>

      {toast && <div className={`dk-toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
