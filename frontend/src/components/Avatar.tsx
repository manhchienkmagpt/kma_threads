import type { User } from '../types';

export function Avatar({ user, size = 42 }: { user: Pick<User, 'avatar_url' | 'display_name'>; size?: number }) {
  const initials = user.display_name.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase();
  return user.avatar_url ? (
    <img className="avatar" src={user.avatar_url} alt={user.display_name} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: Math.max(11, size / 3) }}>{initials}</span>
  );
}

