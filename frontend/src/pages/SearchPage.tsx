import { Search, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { Empty, Loading } from '../components/States';
import type { Page, Post, User } from '../types';

export function SearchPage() {
  const [q, setQ] = useState(''); const [tab, setTab] = useState<'users' | 'posts'>('users');
  const [users, setUsers] = useState<User[]>([]); const [posts, setPosts] = useState<Post[]>([]); const [busy, setBusy] = useState(false);
  const search = async (e?: FormEvent) => { e?.preventDefault(); if (!q.trim()) return; setBusy(true); try { if (tab === 'users') setUsers((await api<Page<User>>(`/search/users?q=${encodeURIComponent(q)}`)).items); else setPosts((await api<Page<Post>>(`/search/posts?q=${encodeURIComponent(q)}`)).items); } finally { setBusy(false); } };
  return <><div className="page-header"><p className="eyebrow">KHÁM PHÁ CỘNG ĐỒNG</p><h1>Tìm kiếm</h1><form className="search-box" onSubmit={search}><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người hoặc nội dung..." /><kbd>↵</kbd></form><div className="profile-tabs"><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Mọi người</button><button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>Threads</button></div></div>
    {busy ? <Loading /> : tab === 'users' ? users.length ? <div className="user-results">{users.map((user) => <div className="user-row surface" key={user.id}><Link to={`/${user.username}`}><Avatar user={user} /><div><b>{user.display_name}</b><span>@{user.username}</span><small>{user.followers_count} người theo dõi</small></div></Link><button className="secondary-btn"><UserPlus size={16} /> Theo dõi</button></div>)}</div> : <Empty title="Tìm người bạn quan tâm" text="Tìm kiếm theo tên hiển thị hoặc username." /> : posts.length ? <div className="post-list">{posts.map((post) => <PostCard key={post.id} initial={post} />)}</div> : <Empty title="Tìm một cuộc trò chuyện" text="Nhập từ khóa để khám phá các thread liên quan." />}</>;
}

