import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';

export function ModerationActions({ target, onRemoved }: {
  target: { kind: 'posts' | 'users'; id: string }; onRemoved?: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  if (user?.role !== 'admin') return null;
  const self = target.kind === 'users' && target.id === user.id;
  const act = async (action: 'block' | 'unblock' | 'delete' | 'ban' | 'unban') => {
    if (busy) return;
    const labels = { block: 'Ẩn bài viết', unblock: 'Bỏ ẩn bài viết', delete: 'Xóa vĩnh viễn bài viết', ban: 'Khóa tài khoản', unban: 'Mở khóa tài khoản' };
    if (['block', 'delete', 'ban'].includes(action) && !window.confirm(`${labels[action]} này?${action === 'delete' ? ' Thao tác này không thể hoàn tác.' : ''}`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/admin/${target.kind}/${target.id}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        ...(target.kind === 'users' ? { body: JSON.stringify({ reason: reason.trim() || null }) } : {}),
      });
      setMessage(`${labels[action]} thành công.`);
      if (action === 'delete' || action === 'block') onRemoved?.();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="moderation-actions">
    <b>{target.kind === 'posts' ? 'Kiểm duyệt bài viết' : 'Kiểm duyệt tài khoản'}</b>
    {target.kind === 'users' && <label>Lý do (tùy chọn)<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy || self} /></label>}
    <div>{target.kind === 'posts' ? <>
      <button className="secondary-btn" disabled={busy} onClick={() => act('block')}>Ẩn bài</button>
      <button className="secondary-btn" disabled={busy} onClick={() => act('unblock')}>Bỏ ẩn</button>
      <button className="secondary-btn danger" disabled={busy} onClick={() => act('delete')}>Xóa bài</button>
    </> : <>
      <button className="secondary-btn danger" disabled={busy || self} onClick={() => act('ban')}>Khóa tài khoản</button>
      <button className="secondary-btn" disabled={busy || self} onClick={() => act('unban')}>Mở khóa</button>
    </>}</div>
    {busy && <p role="status">Đang xử lý...</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {self && <small>Bạn không thể khóa tài khoản của mình.</small>}
  </div>;
}
