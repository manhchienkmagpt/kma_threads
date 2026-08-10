import { LoaderCircle } from 'lucide-react';

export function Loading() { return <div className="state"><LoaderCircle className="spin" /><span>Đang tải...</span></div>; }
export function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div className="empty-symbol">@</div><h3>{title}</h3><p>{text}</p></div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="empty"><h3>Không thể tải nội dung</h3><p>{message}</p>{retry && <button className="secondary-btn" onClick={retry}>Thử lại</button>}</div>; }

