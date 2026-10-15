import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Page, User } from '../types';
import { Avatar } from './Avatar';
import { Dialog } from './Dialog';
import { Empty, Loading } from './States';

export function UserListDialog({ title, path, onClose }: { title: string; path: string; onClose: () => void }) {
  const [page, setPage] = useState<Page<User>>({ items: [], total: 0, offset: 0, limit: 20 });
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    api<Page<User>>(`${path}?offset=${offset}&limit=20`)
      .then((next) => active && setPage((current) => ({ ...next, items: offset ? [...current.items, ...next.items] : next.items })))
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [path, offset, retry]);

  return <Dialog title={title} onClose={onClose}>
    <div className="relation-list">{page.items.map((person) => <Link className="relation-row" key={person.id} to={`/${person.username}`} onClick={onClose}>
      <Avatar user={person} size={42} /><span><b>{person.username}{person.is_verified && ' ✓'}</b><small>{person.display_name}</small></span>
    </Link>)}</div>
    {busy && <Loading />}
    {error && <div className="action-feedback"><p className="form-error" role="alert">{error}</p><button className="secondary-btn" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div>}
    {!busy && !error && !page.items.length && <Empty title="Chưa có người dùng" text="Danh sách sẽ xuất hiện ở đây khi có tương tác." />}
    {!busy && !error && page.items.length < page.total && <button className="secondary-btn load-more" onClick={() => setOffset(page.offset + page.limit)}>Xem thêm</button>}
  </Dialog>;
}
