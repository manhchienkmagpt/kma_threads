import { CheckCircle2, Flag, ShieldAlert } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Empty, ErrorState, Loading } from '../components/States';
import { ModerationActions } from '../components/ModerationActions';
import type { Page } from '../types';

type Report = { id: string; reporter_id: string; post_id?: string; user_id?: string; reason: string; details?: string; status: 'open' | 'reviewing' | 'resolved' | 'rejected'; resolution_note?: string; created_at: string };
type Target = { kind: 'posts' | 'users'; id: string };

function ReportCard({ report, onUpdate }: { report: Report; onUpdate: (report: Report) => void }) {
  const [note, setNote] = useState(report.resolution_note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolve = async (status: Report['status']) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next = await api<Report>(`/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, resolution_note: note.trim() || null }) });
      onUpdate(next);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const target: Target | null = report.post_id ? { kind: 'posts', id: report.post_id } : report.user_id ? { kind: 'users', id: report.user_id } : null;
  return <article className="report-card surface">
    <div className="report-icon"><ShieldAlert /></div><div className="report-content">
      <p className="eyebrow">{report.post_id ? 'BÁO CÁO BÀI VIẾT' : 'BÁO CÁO NGƯỜI DÙNG'}</p><h3>{report.reason}</h3>
      <p>{report.details || 'Không có mô tả bổ sung.'}</p><small>{new Date(report.created_at).toLocaleString('vi-VN')} · {report.status === 'open' ? 'Đang chờ' : report.status === 'reviewing' ? 'Đang xem xét' : report.status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua'}</small>
      {target && <p className="report-target">{target.kind === 'posts' ? 'Mã bài viết' : 'Mã tài khoản'}: <code>{target.id}</code></p>}
      {report.post_id && <Link className="notification-post-link" to={`/posts/${report.post_id}`}>Xem bài viết</Link>}
      {target && <ModerationActions target={target} />}
      <label className="resolution-note">Ghi chú xử lý<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2} disabled={busy} /></label>
      <div className="report-actions">
        {report.status !== 'open' && <button className="secondary-btn" disabled={busy} onClick={() => resolve('open')}>Mở lại</button>}
        {report.status !== 'reviewing' && <button className="secondary-btn" disabled={busy} onClick={() => resolve('reviewing')}>Đang xem xét</button>}
        <button className="secondary-btn" disabled={busy} onClick={() => resolve('rejected')}>Bỏ qua</button>
        <button className="primary-btn" disabled={busy} onClick={() => resolve('resolved')}>{busy ? 'Đang lưu...' : 'Đã xử lý'}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </article>;
}

export function AdminPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [targetKind, setTargetKind] = useState<Target['kind']>('posts');
  const [target, setTarget] = useState<Target | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const load = useCallback(async (offset = 0) => {
    if (user?.role !== 'admin') return;
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setBusy(true); setError('');
    try {
      const page = await api<Page<Report>>(`/admin/reports?offset=${offset}&limit=20${filter ? `&report_status=${filter}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setReports((current) => offset ? [...current, ...page.items] : page.items); setTotal(page.total);
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [user?.role, filter]);
  useEffect(() => { setReports([]); load(); return () => loadRequest.current?.abort(); }, [load]);
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  const selectTarget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setTarget({ kind: targetKind, id: String(values.get('target_id')).trim() });
  };
  const updateReport = (next: Report) => {
    setReports((current) => current.map((report) => report.id === next.id ? next : report).filter((report) => !filter || report.status === filter));
    if (filter && next.status !== filter) setTotal((value) => Math.max(0, value - 1));
  };
  return <>
    <div className="page-header"><p className="eyebrow">TRUNG TÂM AN TOÀN</p><h1>Kiểm duyệt</h1>
      <div className="admin-summary"><span><Flag /><b>{total}</b> báo cáo{filter ? ' theo bộ lọc' : ''}</span><span><CheckCircle2 />Ẩn bài và khóa tài khoản bằng các nút kiểm duyệt bên dưới.</span></div>
    </div>
    <section className="admin-target surface">
      <h2>Quản lý bài viết / tài khoản</h2><p>Dùng mã từ báo cáo để xử lý hoặc khôi phục bài viết, tài khoản.</p>
      <form className="feature-form" onSubmit={selectTarget}><label>Đối tượng<select value={targetKind} onChange={(event) => setTargetKind(event.target.value as Target['kind'])}><option value="posts">Bài viết</option><option value="users">Tài khoản</option></select></label>
        <label>Mã đối tượng<input name="target_id" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="Dán mã bài viết hoặc tài khoản" title="Mã UUID gồm 36 ký tự" /></label><button className="secondary-btn">Mở công cụ kiểm duyệt</button></form>
      {target && <ModerationActions key={`${target.kind}-${target.id}`} target={target} />}
    </section>
    <div className="admin-filter"><label>Trạng thái báo cáo<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Tất cả</option><option value="open">Đang chờ</option><option value="reviewing">Đang xem xét</option><option value="resolved">Đã xử lý</option><option value="rejected">Đã bỏ qua</option></select></label></div>
    {error && <ErrorState message={error} retry={() => load(reports.length)} />}
    <div className="report-list">{reports.map((report) => <ReportCard key={report.id} report={report} onUpdate={updateReport} />)}</div>
    {busy ? <Loading /> : !reports.length && !error ? <Empty title="Không có báo cáo" text="Không có báo cáo nào phù hợp với bộ lọc hiện tại." /> : null}
    {!busy && !error && reports.length < total && <button className="secondary-btn load-more" onClick={() => load(reports.length)}>Xem thêm</button>}
  </>;
}

