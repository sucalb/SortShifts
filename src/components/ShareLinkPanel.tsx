import { useState } from 'react';
import { createShare } from '../api/shareApi';
import type { ShareCreatePayload } from '../api/shareApi';
import type { ShareInfo } from '../types';

interface Props {
  getPayload: () => ShareCreatePayload;
  shareId: string | null;
  guestUrl: string | null;
  onShareCreated: (info: ShareInfo) => void;
}

export function ShareLinkPanel({ getPayload, shareId, guestUrl, onShareCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await createShare(getPayload());
      onShareCreated(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!guestUrl) return;
    await navigator.clipboard.writeText(guestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-panel">
      <div className="share-panel-header">
        <h3>Link đăng ký cho trợ giảng</h3>
        {!shareId ? (
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={loading}>
            {loading ? 'Đang tạo...' : 'Tạo link chia sẻ'}
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
            {copied ? 'Đã copy!' : 'Copy link'}
          </button>
        )}
      </div>
      {shareId && guestUrl && (
        <div className="share-url-box">
          <code>{guestUrl}</code>
        </div>
      )}
      <p className="share-hint">
        Gửi link này cho trợ giảng. Họ chỉ được đăng ký lịch rảnh, không sửa ca làm hay xếp lịch.
        {!shareId && ' Nhấn "Tạo link" sau khi đã cấu hình ca mở đăng ký.'}
      </p>
      {error && <p className="share-error">{error}</p>}
    </div>
  );
}
