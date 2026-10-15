import { Bookmark, Camera, Clapperboard, Heart, Home, LogOut, PlusSquare, Search, Settings, Shield, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import type { Post } from '../types';
import { Composer } from './Composer';

const nav = [
  ['/', Home, 'Trang chủ'], ['/shorts', Clapperboard, 'Shorts'], ['/search', Search, 'Khám phá'], ['/activity', Heart, 'Thông báo'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<'post' | 'short'>('post');
  useEffect(() => {
    if (!createOpen) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setCreateOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [createOpen]);

  const created = (post: Post) => {
    window.dispatchEvent(new CustomEvent('kma:post-created', { detail: post }));
    setCreateOpen(false);
    if (post.is_short) navigate('/shorts');
  };

  const feedRoute = ['/', '/following', '/saved', '/shorts', '/posts'].includes(location.pathname);
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="KMAgram"><span className="brand-mark"><Camera /></span></NavLink>
        <span className="mobile-title">KMAgram</span>
        <NavLink to="/activity" className="icon-btn mobile-menu" aria-label="Thông báo"><Heart size={23} /></NavLink>
        {user?.role === 'admin' && <NavLink to="/admin" className="icon-btn mobile-menu" aria-label="Quản trị"><Shield size={23} /></NavLink>}
      </header>
      <nav className="sidebar">
        <NavLink to="/" className="brand sidebar-brand"><span className="brand-mark"><Camera /></span><b>KMAgram</b></NavLink>
        <div className="nav-list">
          {nav.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'} className="nav-item"><Icon /><span>{label}</span></NavLink>)}
          <button className="nav-item" onClick={() => { setCreateKind('post'); setCreateOpen(true); }}><PlusSquare /><span>Tạo</span></button>
          <NavLink to={`/${user?.username}`} className="nav-item"><UserRound /><span>Trang cá nhân</span></NavLink>
        </div>
        <div className="nav-secondary">
          <NavLink to="/saved" className="nav-item"><Bookmark /><span>Đã lưu</span></NavLink>
          <NavLink to="/settings" className="nav-item"><Settings /><span>Cài đặt</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" className="nav-item"><Shield /><span>Quản trị</span></NavLink>}
          <button className="nav-item logout" onClick={logout}><LogOut /><span>Đăng xuất</span></button>
        </div>
      </nav>
      <main className={`main-column ${feedRoute ? 'feed-route' : ''}`} key={location.pathname}>{children}</main>
      <nav className="bottom-nav">
        <NavLink to="/" end aria-label="Trang chủ"><Home /></NavLink>
        <NavLink to="/shorts" aria-label="Shorts"><Clapperboard /></NavLink>
        <NavLink to="/search" aria-label="Khám phá"><Search /></NavLink>
        <button onClick={() => { setCreateKind('post'); setCreateOpen(true); }} aria-label="Tạo bài viết"><PlusSquare /></button>
        <NavLink to="/activity" aria-label="Thông báo"><Heart /></NavLink>
        <NavLink to={`/${user?.username}`} aria-label="Trang cá nhân"><UserRound /></NavLink>
      </nav>
      {createOpen && (
        <div className="create-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}>
          <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <header><button className="icon-btn" onClick={() => setCreateOpen(false)} aria-label="Đóng"><X /></button><h2 id="create-title">Tạo nội dung mới</h2><span /></header>
            <div className="create-kind-tabs" role="tablist" aria-label="Loại nội dung">
              <button role="tab" aria-selected={createKind === 'post'} className={createKind === 'post' ? 'active' : ''} onClick={() => setCreateKind('post')}>Bài viết</button>
              <button role="tab" aria-selected={createKind === 'short'} className={createKind === 'short' ? 'active' : ''} onClick={() => setCreateKind('short')}><Clapperboard /> Short video</button>
            </div>
            <Composer key={createKind} variant={createKind} onCreated={created} />
          </section>
        </div>
      )}
    </div>
  );
}

