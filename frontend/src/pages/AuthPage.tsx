import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useAuth } from '../App';
import type { User } from '../types';

type TokenPair = { access_token: string; refresh_token: string; user: User };

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthPage({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(params.has('token') ? 'reset' : initialMode);
  const [resetToken, setResetToken] = useState(params.get('token') || '');
  const [message, setMessage] = useState('');
  const register = mode === 'register';
  const recovering = mode === 'forgot' || mode === 'reset';
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const changeMode = (next: AuthMode) => { setMode(next); setError(''); setMessage(''); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = register ? values : { login: values.login, password: values.password };
    try {
      if (mode === 'forgot') {
        const data = await api<{ message: string; reset_token?: string }>('/auth/forgot-password', {
          method: 'POST', body: JSON.stringify({ email: values.email }), auth: false,
        });
        setMessage('Yêu cầu đã được tiếp nhận. Nếu email tồn tại, hệ thống sẽ tạo mã đặt lại mật khẩu.');
        if (data.reset_token) { setResetToken(data.reset_token); setMode('reset'); }
        return;
      }
      if (mode === 'reset') {
        if (values.password !== values.confirm_password) throw new Error('Mật khẩu xác nhận chưa khớp.');
        await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken.trim(), new_password: values.password }), auth: false });
        setResetToken(''); setMode('login'); setMessage('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');
        return;
      }
      const data = await api<TokenPair>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload), auth: false });
      saveSession(data); setUser(data.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="auth-page">
      <div className="auth-glow one" /><div className="auth-glow two" />
      <section className="auth-intro">
        <div className="auth-logo">K</div><p className="eyebrow">KMAGRAM</p>
        <h1>Chia sẻ những<br />khoảnh khắc <em>đáng nhớ.</em></h1>
        <p>Kết nối bạn bè, đăng ảnh và khám phá cảm hứng từ cộng đồng KMA.</p>
        <div className="auth-thread-demo"><span /><div><b>kma.community</b><p>Hôm nay bạn đang nghĩ gì?</p></div></div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div><p className="eyebrow">{recovering ? 'KHÔI PHỤC TÀI KHOẢN' : register ? 'TẠO TÀI KHOẢN' : 'CHÀO MỪNG TRỞ LẠI'}</p><h2>{mode === 'forgot' ? 'Quên mật khẩu' : mode === 'reset' ? 'Đặt lại mật khẩu' : register ? 'Tham gia KMAgram' : 'Đăng nhập'}</h2></div>
        <form onSubmit={submit} key={mode}>
          <fieldset className="feature-fieldset" disabled={busy}>
          {register && <><label>Tên hiển thị<input name="display_name" required placeholder="Nguyễn Văn An" /></label><label>Username<input name="username" required minLength={3} placeholder="an.nguyen" /></label><label>Email<input name="email" type="email" required placeholder="an@example.com" /></label></>}
          {mode === 'login' && <label>Email hoặc username<input name="login" required autoComplete="username" placeholder="an.nguyen" /></label>}
          {mode === 'forgot' && <label>Email đăng ký<input name="email" type="email" required autoComplete="email" placeholder="an@example.com" /></label>}
          {mode === 'reset' && <label>Mã đặt lại mật khẩu<input value={resetToken} onChange={(event) => setResetToken(event.target.value)} required autoComplete="off" /></label>}
          {mode !== 'forgot' && <label>{mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'login' ? undefined : 8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mật khẩu" /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>}
          {mode === 'reset' && <label>Xác nhận mật khẩu mới<input name="confirm_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>}
          </fieldset>
          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <><span>{mode === 'forgot' ? 'Gửi yêu cầu' : mode === 'reset' ? 'Đặt lại mật khẩu' : register ? 'Tạo tài khoản' : 'Tiếp tục'}</span><ArrowRight /></>}</button>
        </form>
        {mode === 'login' && <p className="auth-switch"><button disabled={busy} onClick={() => changeMode('forgot')}>Quên mật khẩu?</button></p>}
        {recovering ? <>
          <p className="auth-switch"><button disabled={busy} onClick={() => changeMode(mode === 'forgot' ? 'reset' : 'forgot')}>{mode === 'forgot' ? 'Tôi đã có mã đặt lại' : 'Yêu cầu mã mới'}</button></p>
          <p className="auth-switch"><button disabled={busy} onClick={() => changeMode('login')}>Quay lại đăng nhập</button></p>
        </> : <>
          <p className="auth-switch">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <button disabled={busy} onClick={() => changeMode(register ? 'login' : 'register')}>{register ? 'Đăng nhập' : 'Đăng ký ngay'}</button></p>
          <p className="demo-note">Demo: <b>an.nguyen</b> / <b>Password123!</b></p>
        </>}
      </div></section>
    </main>
  );
}

