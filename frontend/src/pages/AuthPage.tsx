import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api, saveSession } from '../api';
import { useAuth } from '../App';
import type { User } from '../types';

type TokenPair = { access_token: string; refresh_token: string; user: User };

export function AuthPage() {
  const [register, setRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = register ? values : { login: values.login, password: values.password };
    try {
      const data = await api<TokenPair>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload), auth: false });
      saveSession(data); setUser(data.user);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="auth-page">
      <div className="auth-glow one" /><div className="auth-glow two" />
      <section className="auth-intro">
        <div className="auth-logo">@</div><p className="eyebrow">KMA SOCIAL</p>
        <h1>Nơi những cuộc<br />trò chuyện <em>bắt đầu.</em></h1>
        <p>Kết nối, chia sẻ góc nhìn và khám phá câu chuyện từ cộng đồng của bạn.</p>
        <div className="auth-thread-demo"><span /><div><b>kma.community</b><p>Hôm nay bạn đang nghĩ gì?</p></div></div>
      </section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div><p className="eyebrow">{register ? 'TẠO TÀI KHOẢN' : 'CHÀO MỪNG TRỞ LẠI'}</p><h2>{register ? 'Tham gia KMA Threads' : 'Đăng nhập'}</h2></div>
        <form onSubmit={submit}>
          {register && <><label>Tên hiển thị<input name="display_name" required placeholder="Nguyễn Văn An" /></label><label>Username<input name="username" required minLength={3} placeholder="an.nguyen" /></label><label>Email<input name="email" type="email" required placeholder="an@example.com" /></label></>}
          {!register && <label>Email hoặc username<input name="login" required placeholder="an.nguyen" /></label>}
          <label>Mật khẩu<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={8} placeholder="Ít nhất 8 ký tự" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          {error && <p className="form-error">{error}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <><span>{register ? 'Tạo tài khoản' : 'Tiếp tục'}</span><ArrowRight /></>}</button>
        </form>
        <p className="auth-switch">{register ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <button onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Đăng nhập' : 'Đăng ký ngay'}</button></p>
        <p className="demo-note">Demo: <b>an.nguyen</b> / <b>Password123!</b></p>
      </div></section>
    </main>
  );
}

