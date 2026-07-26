import { useState } from 'react';
import type { Shift } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { ScheduleResult } from '../utils/scheduler';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  buildAutoFillPlan,
  formatAutoFillPreview,
  formatSheetPullPreview,
  syncScheduleFromSheet,
} from '../utils/sheetAutoFill';
import { checkScriptVersion, pushCellUpdates, weekTabHintFromStart } from '../utils/sheetsSync';

interface Props {
  shifts: Shift[];
  result: ScheduleResult | null;
  weekStart: string;
  roster: TeachingAssistant[];
  onSyncFromSheet: (result: ScheduleResult, classColors?: Record<string, string>) => void;
}

export function SheetsSyncPanel({ shifts, result, weekStart, roster, onSyncFromSheet }: Props) {
  const [webhookUrl, setWebhookUrl] = useLocalStorage('lich-sheets-webhook', '');
  const [autoPush, setAutoPush] = useLocalStorage('lich-sheets-auto-push', false);
  const [showSetup, setShowSetup] = useState(!webhookUrl);
  const [status, setStatus] = useState<{ type: 'ok' | 'err' | 'loading'; text: string } | null>(
    null,
  );

  const weekTabHint = weekTabHintFromStart(weekStart);

  const handleCheckVersion = async () => {
    setStatus({ type: 'loading', text: 'Đang kiểm tra script…' });
    const res = await checkScriptVersion(webhookUrl);
    setStatus({
      type: res.ok ? 'ok' : 'err',
      text: res.ok
        ? `Script đang chạy: ${res.version} (cần v17 trở lên)`
        : res.error,
    });
  };

  const handlePush = async () => {
    if (!result) {
      setStatus({ type: 'err', text: 'Chưa có kết quả xếp lịch — xếp lịch trước khi điền Sheet.' });
      return;
    }
    setStatus({ type: 'loading', text: 'Đang đọc Sheet và khớp ca…' });
    try {
      const plan = await buildAutoFillPlan(shifts, result, weekStart, webhookUrl);
      if (plan.updates.length === 0) {
        setStatus({
          type: 'err',
          text:
            plan.missed > 0
              ? formatAutoFillPreview(plan)
              : 'Không có ca nào được gán TG — xếp lịch trước khi điền Sheet.',
        });
        return;
      }
      const res = await pushCellUpdates(webhookUrl, {
        weekTabHint: plan.weekTabHint,
        updates: plan.updates,
      });
      setStatus({
        type: res.ok ? 'ok' : 'err',
        text: res.ok
          ? `${res.message} · ${formatAutoFillPreview(plan)}`
          : res.error,
      });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không tạo được kế hoạch điền Sheet.',
      });
    }
  };

  const handlePullFromSheet = async () => {
    setStatus({ type: 'loading', text: 'Đang đọc phân công từ Sheet…' });
    try {
      const pull = await syncScheduleFromSheet(webhookUrl, weekStart, shifts, roster);
      if (pull.matched === 0) {
        setStatus({
          type: 'err',
          text:
            pull.missSamples.length > 0
              ? `Không đọc được ca nào từ Sheet. Ví dụ không khớp: ${pull.missSamples.slice(0, 2).join('; ')}`
              : 'Sheet chưa có tên TG — điền tên vào cột trái mỗi ca trước khi đồng bộ.',
        });
        return;
      }
      onSyncFromSheet(pull.result, pull.classColors);
      setStatus({
        type: 'ok',
        text: `${formatSheetPullPreview(pull)} · ${pull.result.stats.totalSlotsFilled}/${pull.result.stats.totalSlotsNeeded} slot đã xếp`,
      });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không đồng bộ được từ Sheet.',
      });
    }
  };

  return (
    <div className="sheets-sync-panel">
      <div className="sheets-sync-header">
        <div className="sheets-sync-title">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="sheets-icon">
            <path
              fill="currentColor"
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h5v2H8v-2z"
            />
          </svg>
          <div>
            <strong>Google Sheets</strong>
            <p>Đẩy lịch xếp lên Sheet hoặc đồng bộ ngược sau khi chỉnh sửa trên Sheet</p>
            <p className="sheets-week-hint">
              Tab đích: <strong>TUẦN {weekTabHint}</strong> (tuần bắt đầu {weekStart})
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowSetup(!showSetup)}
        >
          {showSetup ? 'Thu gọn' : 'Cấu hình'}
        </button>
      </div>

      {showSetup && (
        <div className="sheets-setup">
          <label className="bulk-label" htmlFor="sheets-webhook">
            URL Web App (Google Apps Script)
          </label>
          <input
            id="sheets-webhook"
            className="sheets-url-input"
            type="url"
            placeholder="https://script.google.com/macros/s/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <details className="sheets-setup-guide">
            <summary>Hướng dẫn cài lần đầu (1 lần)</summary>
            <ol>
              <li>
                Mở file Google Sheet lịch làm việc (vd.{' '}
                <a
                  href="https://docs.google.com/spreadsheets/d/1c1kyKobm4KzK1tr6NU9mukONNEiOIJ-ugTLchoPfcms/edit"
                  target="_blank"
                  rel="noreferrer"
                >
                  sheet Cơ sở 1
                </a>
                )
              </li>
              <li>
                <strong>Extensions → Apps Script</strong> → dán code từ{' '}
                <code>scripts/google-apps-script/fillSchedule.gs</code>
              </li>
              <li>
                Chạy thử <code>testMapping</code> trong Apps Script (Run) để xem script có
                nhận đúng vùng CẤP 3 / CẤP 2 không
              </li>
              <li>
                Lần đầu: <strong>Deploy → New deployment → Web app</strong> (Execute as: Me ·
                Anyone) → copy URL vào ô trên
              </li>
              <li>
                Mỗi lần sửa code: <strong>Save</strong> →{' '}
                <strong>Deploy → Manage deployments</strong> → biểu tượng bút →{' '}
                <strong>New version</strong> → Deploy
              </li>
              <li>
                Bấm <strong>Kiểm tra script</strong> — phải thấy <code>v17</code>
              </li>
              <li>
                File có nhiều tab — script tự chọn tab <strong>TUẦN dd/m</strong> (vd. TUẦN
                29/6). Không ghi vào tab <strong>BẢN GỐC</strong> (chỉ xem)
              </li>
              <li>
                Script tự nhận layout 1 hoặc 2 cột/ngày; khớp ca linh hoạt (7:00 ↔ 7:30)
              </li>
              <li>
                Nếu báo lỗi <strong>ô bảo vệ</strong>:
                <ul>
                  <li>Mở tab <strong>TUẦN xx/x</strong> (không phải BẢN GỐC)</li>
                  <li>
                    Data → Protect sheets and ranges → thêm email Google của bạn vào vùng
                    được sửa
                  </li>
                  <li>
                    Hoặc trong Apps Script chạy <code>removeWriteProtections()</code> (chủ
                    file) trên tab tuần đó
                  </li>
                  <li>Deploy Web app bằng tài khoản <strong>chủ file</strong> sheet</li>
                </ul>
              </li>
            </ol>
          </details>
          <label className="sheets-auto-label">
            <input
              type="checkbox"
              checked={autoPush}
              onChange={(e) => setAutoPush(e.target.checked)}
            />
            Tự đẩy lên Sheets sau mỗi lần xếp lịch
          </label>
        </div>
      )}

      <div className="sheets-sync-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleCheckVersion}
          disabled={!webhookUrl.trim() || status?.type === 'loading'}
        >
          Kiểm tra script
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm sheets-pull-btn"
          onClick={handlePullFromSheet}
          disabled={!webhookUrl.trim() || status?.type === 'loading'}
          title="Đọc tên TG từ Sheet về app sau khi bạn chỉnh sửa trên Sheet"
        >
          {status?.type === 'loading' ? 'Đang đồng bộ…' : 'Đồng bộ từ Sheet'}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm sheets-push-btn"
          onClick={handlePush}
          disabled={!webhookUrl.trim() || !result || status?.type === 'loading'}
          title="Ghi phân công TG từ app lên Sheet"
        >
          {status?.type === 'loading' ? 'Đang gửi…' : 'Điền lên Sheet'}
        </button>
        {!webhookUrl.trim() && (
          <span className="sheets-hint">Cần cấu hình URL Apps Script trước</span>
        )}
        {status && status.type !== 'loading' && (
          <div className={status.type === 'ok' ? 'copy-feedback' : 'sheets-error'}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  );
}

export async function autoPushIfEnabled(
  webhookUrl: string,
  autoPush: boolean,
  shifts: Shift[],
  result: ScheduleResult,
  weekStart: string,
): Promise<string | null> {
  if (!autoPush || !webhookUrl.trim()) return null;
  try {
    const plan = await buildAutoFillPlan(shifts, result, weekStart, webhookUrl);
    if (plan.updates.length === 0) return formatAutoFillPreview(plan);
    const res = await pushCellUpdates(webhookUrl, {
      weekTabHint: plan.weekTabHint,
      updates: plan.updates,
    });
    return res.ok ? `${res.message} · ${formatAutoFillPreview(plan)}` : res.error;
  } catch (err) {
    return err instanceof Error ? err.message : 'Lỗi tự đẩy Sheets.';
  }
}
