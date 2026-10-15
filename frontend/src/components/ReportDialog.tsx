import { FormEvent, useState } from 'react';
import { api } from '../api';
import { Dialog } from './Dialog';

export function ReportDialog({ target, onClose, onReported }: {
  target: { post_id: string } | { user_id: string }; onClose: () => void; onReported: () => void;
}) {
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api('/reports', { method: 'POST', body: JSON.stringify({ ...target, reason, details: details.trim() || null }) });
      onReported();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <Dialog title={'post_id' in target ? 'Báo cáo bài viết' : 'Báo cáo người dùng'} onClose={onClose} busy={busy}>
    <form className="feature-form" onSubmit={submit}>
      <label>Lý do<select value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}>
        <option value="inappropriate">Nội dung không phù hợp</option><option value="spam">Spam</option><option value="harassment">Quấy rối</option><option value="impersonation">Giả mạo</option><option value="misinformation">Thông tin sai lệch</option><option value="other">Khác</option>
      </select></label>
      <label>Mô tả thêm<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={2000} rows={4} disabled={busy} placeholder="Thông tin giúp quản trị viên xem xét báo cáo..." /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary-btn" onClick={onClose} disabled={busy}>Hủy</button><button className="primary-btn" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi báo cáo'}</button></footer>
    </form>
  </Dialog>;
}
