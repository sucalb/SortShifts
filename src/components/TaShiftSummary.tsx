import { useMemo } from 'react';
import type { Assignment } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { RegistrationGrid } from '../utils/registrationUtils';
import type { SlotOverrides } from '../utils/slotAccess';
import { buildTaShiftSummary } from '../utils/scheduler';

interface Props {
  assignments: Assignment[];
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides: SlotOverrides | undefined;
}

export function TaShiftSummary({
  assignments,
  roster,
  registrationGrid,
  slotOverrides,
}: Props) {
  const rows = useMemo(
    () => buildTaShiftSummary(assignments, roster, registrationGrid, slotOverrides),
    [assignments, roster, registrationGrid, slotOverrides],
  );

  const withAssignments = rows.filter((r) => r.assigned > 0);
  const totalAssigned = withAssignments.reduce((sum, r) => sum + r.assigned, 0);
  const maxAssigned = withAssignments.reduce((max, r) => Math.max(max, r.assigned), 0);

  if (rows.length === 0) return null;

  return (
    <section className="ta-shift-summary">
      <div className="ta-shift-summary-header">
        <div>
          <h3>Số ca từng trợ giảng</h3>
          <p className="ta-shift-summary-desc">
            {withAssignments.length} người được xếp · tổng {totalAssigned} slot ca
          </p>
        </div>
      </div>

      <div className="table-wrapper ta-stats-table">
        <table className="schedule-table ta-summary-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Ký hiệu</th>
              <th>Số ca đã xếp</th>
              <th>Số ca đăng ký</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.abbreviation}
                className={
                  row.assigned === 0
                    ? 'ta-summary-row--none'
                    : row.assigned === maxAssigned && maxAssigned > 0
                      ? 'ta-summary-row--max'
                      : undefined
                }
              >
                <td>{row.fullName}</td>
                <td className="abbr-cell">{row.abbreviation}</td>
                <td className="count-cell">
                  <span className="ta-summary-count">{row.assigned}</span>
                  {maxAssigned > 0 && row.assigned > 0 && (
                    <span
                      className="ta-summary-bar"
                      style={{ width: `${Math.round((row.assigned / maxAssigned) * 100)}%` }}
                      aria-hidden
                    />
                  )}
                </td>
                <td className="count-cell ta-summary-reg">{row.registered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
