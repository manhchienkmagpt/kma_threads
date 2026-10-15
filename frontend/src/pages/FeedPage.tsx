import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Page, Post } from '../types';
import { PostCard } from '../components/PostCard';
import { Empty, ErrorState, Loading } from '../components/States';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../App';

export function FeedPage({ mode }: { mode: 'home' | 'following' | 'saved' | 'all' }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const { user } = useAuth();
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await api<Page<Post>>(mode === 'all' ? '/posts' : mode === 'saved' ? '/bookmarks' : `/feed/${mode}`); setPosts(data.items); setTotal(data.total); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { load(); }, [load]);
  const loadMore = async () => {
    setMoreBusy(true); setError('');
    try {
      const path = mode === 'all' ? '/posts' : mode === 'saved' ? '/bookmarks' : `/feed/${mode}`;
      const data = await api<Page<Post>>(`${path}?offset=${posts.length}&limit=20`);
      setPosts((current) => [...current, ...data.items]); setTotal(data.total);
    } catch (reason) { setError((reason as Error).message); }
    finally { setMoreBusy(false); }
  };
  useEffect(() => {
    const addPost = (event: Event) => { if (mode !== 'saved') { setPosts((current) => [(event as CustomEvent<Post>).detail, ...current]); setTotal((current) => current + 1); } };
    window.addEventListener('kma:post-created', addPost);
    return () => window.removeEventListener('kma:post-created', addPost);
  }, [mode]);

  const suggested = Array.from(new Map(posts.filter((post) => post.author.id !== user?.id).map((post) => [post.author.id, post.author])).values()).slice(0, 5);
  return <div className="feed-layout">
    <section className="feed-main">
      <div className="page-header feed-header">
        <div className="feed-tabs"><Link className={mode === 'home' ? 'active' : ''} to="/">Dành cho bạn</Link><Link className={mode === 'following' ? 'active' : ''} to="/following">Đang theo dõi</Link><Link className={mode === 'all' ? 'active' : ''} to="/posts">Tất cả bài viết</Link></div>
        {mode === 'saved' && <><p className="eyebrow">THƯ VIỆN CỦA BẠN</p><h1>Đã lưu</h1></>}
      </div>
      {mode === 'home' && suggested.length > 0 && <div className="people-strip" aria-label="Khám phá tài khoản">{suggested.map((person) => <Link to={`/${person.username}`} key={person.id}><span className="story-ring"><Avatar user={person} size={62} /></span><small>{person.username}</small></Link>)}</div>}
      {loading ? <Loading /> : posts.length ? <div className="post-list">{posts.map((post) => <PostCard key={post.id} initial={post} onUpdate={(updated) => setPosts((current) => current.map((item) => item.id === updated.id ? updated : item))} onDelete={(id) => { setPosts((old) => old.filter((p) => p.id !== id)); setTotal((current) => Math.max(0, current - 1)); }} />)}</div> : !error && <Empty title={mode === 'saved' ? 'Chưa có bài viết đã lưu' : 'Bảng tin đang yên tĩnh'} text={mode === 'saved' ? 'Nhấn biểu tượng lưu trên một bài viết để xem lại tại đây.' : 'Theo dõi thêm người hoặc chia sẻ bài viết đầu tiên.'} />}
      {error && <ErrorState message={error} retry={posts.length ? loadMore : load} />}
      {!loading && posts.length < total && !error && <button className="secondary-btn load-more" disabled={moreBusy} onClick={loadMore}>{moreBusy ? 'Đang tải...' : 'Xem thêm'}</button>}
    </section>
    {mode !== 'saved' && <aside className="suggestions">
      {user && <Link className="current-account" to={`/${user.username}`}><Avatar user={user} size={44} /><span><b>{user.username}</b><small>{user.display_name}</small></span><em>Trang cá nhân</em></Link>}
      <div className="suggestions-title"><b>Gợi ý cho bạn</b><Link to="/search">Xem tất cả</Link></div>
      {suggested.map((person) => <Link className="suggestion-row" to={`/${person.username}`} key={person.id}><Avatar user={person} size={36} /><span><b>{person.username}</b><small>{person.followers_count} người theo dõi</small></span><em>Xem</em></Link>)}
      <p className="suggestions-footer">Giới thiệu · Trợ giúp · Quyền riêng tư<br />© 2026 KMAGRAM</p>
    </aside>}
  </div>;
}

