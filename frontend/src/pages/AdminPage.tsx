import { CheckCircle2, Flag, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Empty, Loading } from '../components/States';

type Report = { id: string; reporter_id: string; post_id?: string; user_id?: string; reason: string; details?: string; status: string; created_at: string };
export function AdminPage() {
  const { user } = useAuth(); const [reports, setReports] = useState<Report[]>([]); const [busy, setBusy] = useState(true);
  useEffect(() => { if (user?.role === 'admin') api<{ items: Report[] }>('/admin/reports').then((d) => setReports(d.items)).finally(() => setBusy(false)); }, [user]);
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  const resolve = async (id: string, status: 'resolved' | 'rejected') => { await api(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status, resolution_note: 'Reviewed from admin dashboard' }) }); setReports(reports.map((r) => r.id === id ? { ...r, status } : r)); };
  return <><div className="page-header"><p className="eyebrow">TRUNG TÂM AN TOÀN</p><h1>Kiểm duyệt</h1><div className="admin-summary"><span><Flag /> <b>{reports.filter((r) => r.status === 'open').length}</b> đang chờ</span><span><CheckCircle2 /> <b>{reports.filter((r) => r.status === 'resolved').length}</b> đã xử lý</span></div></div>{busy ? <Loading /> : reports.length ? <div className="report-list">{reports.map((report) => <article key={report.id} className="report-card surface"><div className="report-icon"><ShieldAlert /></div><div><p className="eyebrow">{report.post_id ? 'BÁO CÁO THREAD' : 'BÁO CÁO NGƯỜI DÙNG'}</p><h3>{report.reason}</h3><p>{report.details || 'Không có mô tả bổ sung.'}</p><small>{new Date(report.created_at).toLocaleString('vi-VN')} · {report.status}</small></div>{report.status === 'open' && <div className="report-actions"><button onClick={() => resolve(report.id, 'rejected')}>Bỏ qua</button><button className="primary-btn" onClick={() => resolve(report.id, 'resolved')}>Đã xử lý</button></div>}</article>)}</div> : <Empty title="Hàng chờ sạch" text="Không có báo cáo nào cần xem xét." />}</>;
}

