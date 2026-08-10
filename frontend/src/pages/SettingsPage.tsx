import { Bot, Camera, ChevronRight, LoaderCircle, Moon, ShieldCheck, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { Avatar } from '../components/Avatar';
import type { User } from '../types';

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState('');
  if (!user) return null;

  const persistUser = (next: User) => {
    setUser(next);
    localStorage.setItem('user', JSON.stringify(next));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const next = await api<User>('/users/me', { method: 'PATCH', body: JSON.stringify(values) });
      persistUser(next); setNotice('Đã lưu thay đổi.');
    } catch (reason) {
      setNotice((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAi = async () => {
    setAiBusy(true); setNotice('');
    try {
      const next = await api<User>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ ai_assistant_enabled: !user.ai_assistant_enabled }),
      });
      persistUser(next);
      setNotice(next.ai_assistant_enabled ? 'Đã bật AI Assistant.' : 'Đã tắt AI Assistant.');
    } catch (reason) {
      setNotice((reason as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const deactivate = async () => {
    if (!confirm('Tạm vô hiệu hóa tài khoản? Bạn có thể kích hoạt lại bằng cách đăng nhập.')) return;
    await api('/users/me', { method: 'DELETE' }); logout();
  };

  return <>
    <div className="page-header"><p className="eyebrow">TÀI KHOẢN CỦA BẠN</p><h1>Cài đặt</h1></div>
    <section className="settings-card surface"><form onSubmit={save}>
      <div className="avatar-setting"><div><Avatar user={user} size={74} /><button type="button"><Camera /></button></div><span><b>Ảnh đại diện</b><small>URL ảnh có thể cập nhật bên dưới</small></span></div>
      <div className="form-grid">
        <label>Tên hiển thị<input name="display_name" defaultValue={user.display_name} /></label>
        <label>Username<input name="username" defaultValue={user.username} /></label>
        <label className="full">Giới thiệu<textarea name="bio" rows={4} maxLength={500} defaultValue={user.bio || ''} /></label>
        <label className="full">URL ảnh đại diện<input name="avatar_url" defaultValue={user.avatar_url || ''} placeholder="https://..." /></label>
        <label className="full">Website<input name="website" defaultValue={user.website || ''} placeholder="https://..." /></label>
      </div>
      <button className="primary-btn save-btn" disabled={busy}>{busy && <LoaderCircle className="spin" />} Lưu thay đổi</button>
    </form></section>
    <section className="ai-setting-card surface">
      <div className="ai-setting-icon"><Bot /></div>
      <div><b>Gemini AI Assistant</b><small>Fact-check, hỗ trợ viết, hỏi đáp, tóm tắt và gợi ý phản hồi.</small><em>Nội dung bạn yêu cầu phân tích sẽ được gửi tới Google Gemini.</em></div>
      <button className={user.ai_assistant_enabled ? 'toggle-switch active' : 'toggle-switch'} onClick={toggleAi} disabled={aiBusy} role="switch" aria-checked={Boolean(user.ai_assistant_enabled)} aria-label="Bật hoặc tắt AI Assistant"><span /></button>
    </section>
    {notice && <p className="settings-notice settings-page-notice">{notice}</p>}
    <section className="settings-links surface">
      <button><Moon /><span><b>Giao diện</b><small>Tối theo hệ thống</small></span><ChevronRight /></button>
      <button><ShieldCheck /><span><b>Quyền riêng tư</b><small>Quản lý hiển thị tài khoản</small></span><ChevronRight /></button>
      <button className="danger" onClick={deactivate}><Trash2 /><span><b>Vô hiệu hóa tài khoản</b><small>Ẩn hồ sơ và nội dung của bạn</small></span><ChevronRight /></button>
    </section>
  </>;
}
