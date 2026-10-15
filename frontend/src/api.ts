const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

type Options = RequestInit & { auth?: boolean };
let refreshInFlight: Promise<boolean> | null = null;

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  return request<T>(path, options, true);
}

async function request<T>(path: string, options: Options, canRefresh: boolean): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.auth !== false) {
    const token = localStorage.getItem('access_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && options.auth !== false && !path.includes('/auth/refresh')) {
    if (canRefresh && localStorage.getItem('refresh_token')) {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          const refreshed = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') }),
          });
          if (!refreshed.ok) return false;
          saveSession(await refreshed.json());
          return true;
        })().finally(() => { refreshInFlight = null; });
      }
      if (await refreshInFlight) return request<T>(path, options, false);
    }
    clearSession();
    window.location.href = '/auth';
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((item: { msg?: string }) => item.msg || '').filter(Boolean).join('; ')
      : typeof body.detail === 'string' ? body.detail : '';
    throw new Error(detail || 'Có lỗi xảy ra. Vui lòng thử lại.');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function saveSession(data: { access_token: string; refresh_token: string; user: unknown }) {
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

