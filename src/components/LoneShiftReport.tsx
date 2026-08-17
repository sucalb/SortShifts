import { useMemo } from 'react';
import type { Assignment, Shift } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import { DAY_LABELS, FACILITY_LABELS, LEVEL_LABELS } from '../data/constants';
import {
  analyzeLoneShifts,
  isForcedReason,
  LONE_SHIFT_REASON_LABELS,
} from '../utils/loneShifts';
import type { RegistrationGrid } from '../utils/registrationUtils';
import type { SlotOverrides } from '../utils/slotAccess';
import { getShiftTimeSlot } from '../utils/timeUtils';

interface Props {
  assignments: Assignment[];
  shifts: Shift[];
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides: SlotOverrides | undefined;
}

function describeShift(shift: Shift): string {
  const slot = getShiftTimeSlot(shift);
  return `${FACILITY_LABELS[shift.facility]} · ${LEVEL_LABELS[shift.level]} · ${slot?.label ?? ''} · ${shift.className}`;
}

export function LoneShiftReport({
  assignments,
  shifts,
  roster,
  registrationGrid,
  slotOverrides,
}: Props) {
  const report = useMemo(
    () => analyzeLoneShifts(assignments, shifts, registrationGrid, slotOverrides),
    [assignments, shifts, registrationGrid, slotOverrides],
  );

  const fullNameOf = useMemo(() => {
    const byAbbr = new Map(roster.map((t) => [t.abbreviation.toLowerCase(), t.fullName]));
    return (name: string) => byAbbr.get(name.toLowerCase()) ?? name;
  }, [roster]);

  if (report.entries.length === 0) return null;

  return (
    <section className="lone-shift-report">
      <div className="lone-shift-header">
        <h3>⚠️ {report.entries.length} ca bị xếp lẻ</h3>
        <p className="lone-shift-desc">
          Ca lẻ = TG chỉ có đúng ca đó trong ngày, không nối được với ca liền kề.{' '}
          <strong>{report.forcedCount} ca hết cách ghép</strong>
          {report.fixableCount > 0 && (
            <>
              {' · '}
              <strong className="lone-shift-fixable-count">
                {report.fixableCount} ca còn ghép được
              </strong>
            </>
          )}
          {' · '}
          {report.affectedTaCount} trợ giảng bị ảnh hưởng
        </p>
      </div>

      <div className="table-wrapper">
        <table className="schedule-table lone-shift-table">
          <thead>
            <tr>
              <th>Trợ giảng</th>
              <th>Ngày</th>
              <th>Ca</th>
              <th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((entry) => {
              const forced = isForcedReason(entry.reason);
              return (
                <tr
                  key={`${entry.name}-${entry.shift.id}`}
                  className={forced ? undefined : 'lone-shift-row--fixable'}
                >
                  <td>
                    <span className="abbr-cell">{entry.name}</span>
                    <span className="lone-shift-fullname">{fullNameOf(entry.name)}</span>
                  </td>
                  <td>{DAY_LABELS[entry.shift.day]}</td>
                  <td className="lone-shift-slot">{describeShift(entry.shift)}</td>
                  <td>
                    <span className={`lone-shift-reason lone-shift-reason--${entry.reason}`}>
                      {LONE_SHIFT_REASON_LABELS[entry.reason]}
                    </span>
                    {!forced && entry.adjacentShifts.length > 0 && (
                      <span className="lone-shift-hint">
                        Ghép với: {entry.adjacentShifts.map(describeShift).join(' hoặc ')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
