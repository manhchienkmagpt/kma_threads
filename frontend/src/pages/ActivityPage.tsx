import { Bell, CheckCheck, Heart, MessageCircle, Repeat2, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Empty, ErrorState, Loading } from '../components/States';
import type { Notification } from '../types';

const icons = { like: Heart, reply: MessageCircle, follow: UserPlus, repost: Repeat2, moderation: Bell };

export function ActivityPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (offset = 0) => {
    setLoading(true); setError('');
    try {
      const data = await api<{ items: Notification[]; unread_count: number; offset: number; limit: number }>(`/notifications?offset=${offset}&limit=20`);
      setItems((current) => offset ? [...current, ...data.items] : data.items);
      setUnread(data.unread_count); setNextOffset(data.offset + data.items.length); setHasMore(data.items.length === data.limit);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (action: 'all' | 'read' | 'delete', item?: Notification) => {
    if (busy || loading) return;
    if (action === 'delete' && !window.confirm('Xóa thông báo này?')) return;
    setBusy(true); setError('');
    try {
      if (action === 'all') {
        await api('/notifications/read-all', { method: 'PATCH' });
        setItems((current) => current.map((entry) => ({ ...entry, is_read: true }))); setUnread(0);
      } else if (item) {
        if (action === 'read') {
          const updated = await api<Notification>(`/notifications/${item.id}/read`, { method: 'PATCH' });
          setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
        } else {
          await api(`/notifications/${item.id}`, { method: 'DELETE' });
          setItems((current) => current.filter((entry) => entry.id !== item.id));
          setNextOffset((value) => Math.max(0, value - 1));
        }
        if (!item.is_read) setUnread((count) => Math.max(0, count - 1));
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <>
    <div className="page-header row"><div><p className="eyebrow">CẬP NHẬT MỚI NHẤT</p><h1>Hoạt động {unread > 0 && <sup>{unread}</sup>}</h1></div>
      {unread > 0 && <button className="text-btn" disabled={busy || loading} onClick={() => act('all')}><CheckCheck /> Đọc tất cả</button>}
    </div>
    {error && <ErrorState message={error} retry={() => load()} />}
    <div className="activity-list">{items.map((item) => {
      const Icon = icons[item.type as keyof typeof icons] || Bell;
      return <article key={item.id} className={`activity-row surface ${item.is_read ? '' : 'unread'}`}>
        <div className="activity-avatar">{item.actor ? <Link to={`/${item.actor.username}`} aria-label={`Trang cá nhân ${item.actor.username}`}><Avatar user={item.actor} /></Link> : <span className="system-avatar">@</span>}<i><Icon /></i></div>
        <div><p>{item.message}</p><span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>{item.post_id && <Link className="notification-post-link" to={`/posts/${item.post_id}`}>Xem bài viết</Link>}</div>
        <div className="notification-actions">
          {!item.is_read && <button className="icon-btn" disabled={busy || loading} onClick={() => act('read', item)} aria-label="Đánh dấu thông báo đã đọc" title="Đánh dấu đã đọc"><CheckCheck /></button>}
          <button className="icon-btn danger" disabled={busy || loading} onClick={() => act('delete', item)} aria-label="Xóa thông báo" title="Xóa thông báo"><Trash2 /></button>
        </div>
        {!item.is_read && <b className="unread-dot" />}
      </article>;
    })}</div>
    {loading ? <Loading /> : !error && !items.length ? <Empty title="Chưa có hoạt động" text="Lượt thích, trả lời và người theo dõi mới sẽ xuất hiện tại đây." /> : null}
    {!loading && hasMore && !error && <button className="secondary-btn load-more" disabled={busy} onClick={() => load(nextOffset)}>Xem thêm</button>}
  </>;
}

