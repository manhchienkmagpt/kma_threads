import { Bell, CheckCheck, Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Empty, Loading } from '../components/States';
import type { Notification } from '../types';

const icons = { like: Heart, reply: MessageCircle, follow: UserPlus, repost: Repeat2, moderation: Bell };

export function ActivityPage() {
  const [items, setItems] = useState<Notification[]>([]); const [busy, setBusy] = useState(true); const [unread, setUnread] = useState(0);
  useEffect(() => { api<{ items: Notification[]; unread_count: number }>('/notifications').then((data) => { setItems(data.items); setUnread(data.unread_count); }).finally(() => setBusy(false)); }, []);
  const readAll = async () => { await api('/notifications/read-all', { method: 'PATCH' }); setItems(items.map((i) => ({ ...i, is_read: true }))); setUnread(0); };
  return <><div className="page-header row"><div><p className="eyebrow">CẬP NHẬT MỚI NHẤT</p><h1>Hoạt động {unread > 0 && <sup>{unread}</sup>}</h1></div>{unread > 0 && <button className="text-btn" onClick={readAll}><CheckCheck /> Đánh dấu đã đọc</button>}</div>
    {busy ? <Loading /> : items.length ? <div className="activity-list">{items.map((item) => { const Icon = icons[item.type as keyof typeof icons] || Bell; return <div key={item.id} className={`activity-row surface ${item.is_read ? '' : 'unread'}`}><div className="activity-avatar">{item.actor ? <Avatar user={item.actor} /> : <span className="system-avatar">@</span>}<i><Icon /></i></div><div><p>{item.message}</p><span>{new Date(item.created_at).toLocaleString('vi-VN')}</span></div>{!item.is_read && <b className="unread-dot" />}</div>; })}</div> : <Empty title="Chưa có hoạt động" text="Lượt thích, trả lời và người theo dõi mới sẽ xuất hiện tại đây." />}</>;
}

