import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBootstrap,
  fetchRegisterGrid,
  pickDefaultWeek,
  syncRegistration,
  type RegisterEmployee,
  type RegisterGrid,
  type RegisterWeek,
} from '../api/registerApi';

const EMPLOYEE_KEY = 'dk-employee';
const DRAFT_PREFIX = 'dk-draft.';

type Status = { type: 'ok' | 'err' | 'loading'; text: string } | null;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Trang đăng ký lịch cho trợ giảng — không cần đăng nhập. Ghi thẳng vào Sheet
 * đăng ký qua cùng Apps Script với trang ShiftRegister cũ.
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
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>({ type: 'loading', text: 'Đang tải danh sách…' });

  useEffect(() => {
    fetchBootstrap()
      .then((data) => {
        setEmployees(data.employees);
        setWeeks(data.weeks);
        if (data.weeks.length > 0) setWeek(pickDefaultWeek(data.weeks));
        setStatus(null);
      })
      .catch((err: Error) =>
        setStatus({ type: 'err', text: `Không tải được dữ liệu từ Sheet: ${err.message}` }),
      );
  }, []);

  const draftKey = employee && week ? `${DRAFT_PREFIX}${employee.code}.${week}` : '';

  const loadGrid = useCallback(async () => {
    if (!employee || !week) return;
    setStatus({ type: 'loading', text: 'Đang tải lịch tuần…' });
    setGrid(null);
    try {
      const g = await fetchRegisterGrid(week, employee.code);
      const fromSheet: Record<string, boolean> = {};
      for (const [key, cell] of Object.entries(g.cells)) if (cell.on) fromSheet[key] = true;
      const draft = readJson<Record<string, boolean>>(`${DRAFT_PREFIX}${employee.code}.${week}`);
      setGrid(g);
      setSelected(draft ?? fromSheet);
      setDirty(!!draft);
      setStatus(draft ? { type: 'ok', text: 'Đang hiện bản nháp chưa đồng bộ.' } : null);
    } catch (err) {
      setStatus({ type: 'err', text: `Không tải được lịch: ${(err as Error).message}` });
    }
  }, [employee, week]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (draftKey) {
        try {
          localStorage.setItem(draftKey, JSON.stringify(next));
        } catch {
          /* bỏ qua */
        }
      }
      return next;
    });
    setDirty(true);
  };

  const handleSync = async () => {
    if (!employee || !grid) return;
    const cells: { row: number; col: number; checked: boolean }[] = [];
    const g: RegisterGrid = grid;
    for (const shift of g.shifts) {
      for (const d of g.days) {
        const key = `${shift.row}_${d.col}`;
        if (g.cells[key]?.closed) continue;
        cells.push({ row: shift.row, col: d.col, checked: !!selected[key] });
      }
    }
    setStatus({ type: 'loading', text: 'Đang đồng bộ lên Sheet…' });
    try {
      await syncRegistration(g.week, employee.code, cells);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* bỏ qua */
      }
      setDirty(false);
      setStatus({
        type: 'ok',
        text: `Đã đồng bộ lên Sheet lúc ${new Date().toLocaleTimeString('vi-VN')}.`,
      });
    } catch (err) {
      setStatus({ type: 'err', text: `Đồng bộ thất bại: ${(err as Error).message}` });
    }
  };

  const chosenCount = useMemo(
    () => Object.entries(selected).filter(([k, v]) => v && !grid?.cells[k]?.closed).length,
    [selected, grid],
  );

  if (!employee) {
    return (
      <div className="panel ta-register">
        <h2>Bạn là ai?</h2>
        <p className="ta-register-hint">Chọn tên của bạn — lần sau app sẽ tự nhớ.</p>
        <div className="ta-register-row">
          <select
            className="ta-register-select"
            value={pickedCode}
            onChange={(e) => setPickedCode(e.target.value)}
            disabled={employees.length === 0}
          >
            <option value="">{employees.length ? '— Chọn tên —' : 'Đang tải…'}</option>
            {employees.map((emp) => (
              <option key={emp.code} value={emp.code}>
                {emp.name} ({emp.code})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pickedCode}
            onClick={() => {
              const emp = employees.find((x) => x.code === pickedCode);
              if (!emp) return;
              localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(emp));
              setEmployee(emp);
            }}
          >
            Tiếp tục
          </button>
        </div>
        {status && <p className={`ta-register-status ${status.type}`}>{status.text}</p>}
      </div>
    );
  }

  return (
    <div className="panel ta-register">
      <div className="panel-header">
        <h2>
          {employee.name} <span className="ta-register-code">({employee.code})</span>
        </h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            localStorage.removeItem(EMPLOYEE_KEY);
            setEmployee(null);
            setGrid(null);
          }}
        >
          Đổi tên
        </button>
      </div>

      <div className="ta-register-row">
        <label>
          Tuần:{' '}
          <select
            className="ta-register-select"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w.name} value={w.name}>
                {w.name} ({w.startDate})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="ta-register-hint">
        Bấm vào ô để chọn ca bạn làm được. Ô xám là giờ không có ca. Chọn xong bấm{' '}
        <strong>Đồng bộ lên Sheet</strong>.
      </p>

      {grid && (
        <div className="table-wrapper">
          <table className="schedule-table ta-register-table">
            <thead>
              <tr>
                <th>Ca</th>
                {grid.days.map((d) => (
                  <th key={d.col}>
                    <div>{d.weekday}</div>
                    <div className="date-sub">{d.date}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.shifts.map((shift) => (
                <tr key={shift.row}>
                  <td className="time-col">{shift.label}</td>
                  {grid.days.map((day) => {
                    const key = `${shift.row}_${day.col}`;
                    const closed = !!grid.cells[key]?.closed;
                    const on = !!selected[key];
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          className={`ta-cell ${on ? 'on' : ''} ${closed ? 'closed' : ''}`}
                          disabled={closed}
                          onClick={() => toggle(key)}
                          aria-pressed={on}
                        >
                          {closed ? '—' : on ? '✓' : ''}
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

      <div className="ta-register-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!grid || status?.type === 'loading'}
          onClick={handleSync}
        >
          Đồng bộ lên Sheet
        </button>
        <span className="ta-register-count">
          {chosenCount} ca đã chọn{dirty ? ' · chưa đồng bộ' : ''}
        </span>
      </div>
      {status && <p className={`ta-register-status ${status.type}`}>{status.text}</p>}
    </div>
  );
}
