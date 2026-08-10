import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, clearSession } from './api';
import type { User } from './types';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { FeedPage } from './pages/FeedPage';
import { ProfilePage } from './pages/ProfilePage';
import { SearchPage } from './pages/SearchPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';

type AuthValue = { user: User | null; setUser: (user: User | null) => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
export const useAuth = () => useContext(AuthContext)!;

function Protected() {
  const { user } = useAuth();
  return user ? <AppShell><Outlet /></AppShell> : <Navigate to="/auth" replace />;
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const logout = async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token }) }).catch(() => null);
    clearSession(); setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route element={<Protected />}>
          <Route path="/" element={<FeedPage mode="home" />} />
          <Route path="/following" element={<FeedPage mode="following" />} />
          <Route path="/saved" element={<FeedPage mode="saved" />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/:username" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

