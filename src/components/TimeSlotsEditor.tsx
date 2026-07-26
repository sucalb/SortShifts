import { useEffect, useState } from 'react';
import type { TimeSlot } from '../types';
import {
  formatTimeInput,
  labelFromRange,
  newSlotId,
  parseTimeInput,
  sortSlotsByStart,
} from '../utils/slotCatalog';

interface Props {
  title: string;
  hint?: string;
  slots: TimeSlot[];
  idPrefix: string;
  onChange: (slots: TimeSlot[]) => void;
  onRemoveSlot?: (slotId: string) => boolean | void;
  defaultAdd?: { start: number; end: number };
}

function SlotRow({
  slot,
  onUpdate,
  onRemove,
}: {
  slot: TimeSlot;
  onUpdate: (next: TimeSlot) => void;
  onRemove: () => void;
}) {
  const [startText, setStartText] = useState(formatTimeInput(slot.start));
  const [endText, setEndText] = useState(formatTimeInput(slot.end));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStartText(formatTimeInput(slot.start));
    setEndText(formatTimeInput(slot.end));
  }, [slot.start, slot.end]);

  const apply = (nextStart: string, nextEnd: string) => {
    const start = parseTimeInput(nextStart);
    const end = parseTimeInput(nextEnd);
    if (start === null || end === null) {
      setError('Giờ không hợp lệ (vd: 21:00)');
      return;
    }
    if (end <= start) {
      setError('Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }
    setError(null);
    onUpdate({
      ...slot,
      start,
      end,
      label: labelFromRange(start, end),
    });
  };

  return (
    <div className="slot-editor-row">
      <input
        className="slot-editor-time"
        type="text"
        inputMode="numeric"
        value={startText}
        onChange={(e) => setStartText(e.target.value)}
        onBlur={() => apply(startText, endText)}
        aria-label="Giờ bắt đầu"
      />
      <span className="slot-editor-sep">–</span>
      <input
        className="slot-editor-time"
        type="text"
        inputMode="numeric"
        value={endText}
        onChange={(e) => setEndText(e.target.value)}
        onBlur={() => apply(startText, endText)}
        aria-label="Giờ kết thúc"
      />
      <span className="slot-editor-label">{slot.label}</span>
      <button
        type="button"
        className="btn btn-secondary btn-sm slot-editor-remove"
        onClick={onRemove}
        title="Xóa khung giờ"
      >
        Xóa
      </button>
      {error && <span className="slot-editor-error">{error}</span>}
    </div>
  );
}

export function TimeSlotsEditor({
  title,
  hint,
  slots,
  idPrefix,
  onChange,
  onRemoveSlot,
  defaultAdd = { start: 21 * 60, end: 23 * 60 },
}: Props) {
  const [open, setOpen] = useState(false);

  const handleUpdate = (slotId: string, next: TimeSlot) => {
    onChange(sortSlotsByStart(slots.map((s) => (s.id === slotId ? next : s))));
  };

  const handleRemove = (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (slots.length <= 1) {
      alert('Cần giữ ít nhất một khung giờ.');
      return;
    }
    if (!confirm(`Xóa khung giờ ${slot.label}? Các ca / đăng ký gắn với khung này sẽ bị ảnh hưởng.`)) {
      return;
    }
    if (onRemoveSlot && onRemoveSlot(slotId) === false) return;
    onChange(slots.filter((s) => s.id !== slotId));
  };

  const handleAdd = () => {
    const last = slots[slots.length - 1];
    const start = last ? last.end : defaultAdd.start;
    let end = start + 120;
    if (end > 24 * 60) end = Math.min(24 * 60, start + 60);
    if (end <= start) {
      alert('Không thể thêm khung giờ — đã hết ngày.');
      return;
    }
    const next: TimeSlot = {
      id: newSlotId(idPrefix),
      start,
      end,
      label: labelFromRange(start, end),
    };
    onChange(sortSlotsByStart([...slots, next]));
  };

  return (
    <div className="slot-editor">
      <div className="slot-editor-header">
        <div>
          <strong>{title}</strong>
          {hint && <p>{hint}</p>}
        </div>
        <button
          type="button"
          className={`btn btn-sm ${open ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Đóng khung giờ' : 'Chỉnh khung giờ'}
        </button>
      </div>

      {open && (
        <div className="slot-editor-body">
          <p className="slot-editor-tip">
            Sửa giờ bắt đầu / kết thúc, hoặc thêm khung (vd. 21:00–23:00) để khớp Sheet / ca đêm.
          </p>
          <div className="slot-editor-list">
            {slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                onUpdate={(next) => handleUpdate(slot.id, next)}
                onRemove={() => handleRemove(slot.id)}
              />
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleAdd}>
            + Thêm khung giờ
          </button>
        </div>
      )}
    </div>
  );
}
