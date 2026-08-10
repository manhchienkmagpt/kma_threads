import { Bookmark, Heart, Home, LogOut, Menu, Search, Settings, Shield, UserRound } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../App';

const nav = [
  ['/', Home, 'Trang chủ'], ['/search', Search, 'Tìm kiếm'], ['/activity', Heart, 'Hoạt động'],
  ['/saved', Bookmark, 'Đã lưu'], ['/settings', Settings, 'Cài đặt'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="KMA Threads"><span className="brand-mark">@</span></NavLink>
        <span className="mobile-title">KMA Threads</span>
        <NavLink to="/settings" className="icon-btn mobile-menu"><Menu size={22} /></NavLink>
      </header>
      <nav className="sidebar">
        <NavLink to="/" className="brand sidebar-brand"><span className="brand-mark">@</span><b>KMA Threads</b></NavLink>
        <div className="nav-list">
          {nav.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'} className="nav-item"><Icon /><span>{label}</span></NavLink>)}
          <NavLink to={`/${user?.username}`} className="nav-item"><UserRound /><span>Trang cá nhân</span></NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" className="nav-item"><Shield /><span>Quản trị</span></NavLink>}
        </div>
        <button className="nav-item logout" onClick={logout}><LogOut /><span>Đăng xuất</span></button>
      </nav>
      <main className="main-column" key={location.pathname}>{children}</main>
      <nav className="bottom-nav">
        {nav.slice(0, 4).map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'} aria-label={label}><Icon /></NavLink>)}
        <NavLink to={`/${user?.username}`} aria-label="Trang cá nhân"><UserRound /></NavLink>
      </nav>
    </div>
  );
}

