import { useState, type FormEvent } from 'react';
import type { AuthMode } from '../api/userConfigApi';
import type { SyncStatus } from '../hooks/useUserConfigSync';

interface UserAuthPanelProps {
  username: string | null;
  authMode?: AuthMode | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSavedAt: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

function formatSavedAt(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function statusLabel(status: SyncStatus, mode?: AuthMode | null) {
  switch (status) {
    case 'loading':
      return 'Đang tải…';
    case 'saving':
      return 'Đang lưu…';
    case 'saved':
      return mode === 'browser' ? 'Đã lưu (trình duyệt)' : 'Đã lưu';
    case 'error':
      return 'Lỗi đồng bộ';
    default:
      return '';
  }
}

export function UserAuthPanel({
  username,
  authMode,
  syncStatus,
  syncError,
  lastSavedAt,
  onLogin,
  onLogout,
}: UserAuthPanelProps) {
  const [open, setOpen] = useState(false);
  const [formUser, setFormUser] = useState('hoangbui24');
  const [formPass, setFormPass] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await onLogin(formUser.trim(), formPass);
      setFormPass('');
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (username) {
    const savedLabel = formatSavedAt(lastSavedAt);
    const status = statusLabel(syncStatus, authMode);

    return (
      <div className="user-auth user-auth--logged-in">
        <div className="user-auth-info">
          <span className="user-auth-name">{username}</span>
          {status && (
            <span className={`user-auth-status user-auth-status--${syncStatus}`}>
              {status}
              {savedLabel && syncStatus === 'saved' ? ` · ${savedLabel}` : ''}
            </span>
          )}
          {syncError && <span className="user-auth-error">{syncError}</span>}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onLogout()}>
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="user-auth">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Đăng nhập
      </button>

      {open && (
        <form className="user-auth-form" onSubmit={(e) => void handleSubmit(e)}>
          <p className="user-auth-form-title">Tài khoản local</p>
          <p className="user-auth-form-hint">
            Đăng nhập để lưu cấu hình ca, đăng ký lịch và kết quả xếp gần nhất. Trên Vercel
            dữ liệu được lưu trong trình duyệt của bạn.
          </p>
          <label className="user-auth-field">
            <span>Tên đăng nhập</span>
            <input
              type="text"
              value={formUser}
              onChange={(e) => setFormUser(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="user-auth-field">
            <span>Mật khẩu</span>
            <input
              type="password"
              value={formPass}
              onChange={(e) => setFormPass(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {formError && <p className="user-auth-error">{formError}</p>}
          <div className="user-auth-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
