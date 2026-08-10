import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Page, Post } from '../types';
import { Composer } from '../components/Composer';
import { PostCard } from '../components/PostCard';
import { Empty, ErrorState, Loading } from '../components/States';
import { Link } from 'react-router-dom';

export function FeedPage({ mode }: { mode: 'home' | 'following' | 'saved' }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await api<Page<Post>>(mode === 'saved' ? '/bookmarks' : `/feed/${mode}`); setPosts(data.items); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { load(); }, [load]);
  return <>
    <div className="page-header">
      <div className="feed-tabs"><Link className={mode === 'home' ? 'active' : ''} to="/">Dành cho bạn</Link><Link className={mode === 'following' ? 'active' : ''} to="/following">Đang theo dõi</Link></div>
      {mode === 'saved' && <><p className="eyebrow">THƯ VIỆN CỦA BẠN</p><h1>Đã lưu</h1></>}
    </div>
    {mode === 'home' && <Composer onCreated={(post) => setPosts((old) => [post, ...old])} />}
    {loading ? <Loading /> : error ? <ErrorState message={error} retry={load} /> : posts.length ? <div className="post-list">{posts.map((post) => <PostCard key={post.id} initial={post} onDelete={(id) => setPosts((old) => old.filter((p) => p.id !== id))} />)}</div> : <Empty title={mode === 'saved' ? 'Chưa có thread đã lưu' : 'Feed đang yên tĩnh'} text={mode === 'saved' ? 'Nhấn biểu tượng bookmark trên một thread để xem lại tại đây.' : 'Theo dõi thêm người hoặc bắt đầu thread đầu tiên.'} />}
  </>;
}

