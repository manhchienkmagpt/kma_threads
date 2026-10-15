import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Media } from '../types';
import { Dialog } from './Dialog';
import { ErrorState, Loading } from './States';

export function MediaDetailsDialog({ media, onClose }: { media: Media[]; onClose: () => void }) {
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all(media.map((item) => api<Media>(`/media/${item.id}`)))
      .then((next) => active && setItems(next))
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [media, retry]);
  return <Dialog title="Thông tin tệp đính kèm" onClose={onClose}>
    {loading ? <Loading /> : error ? <ErrorState message={error} retry={() => setRetry((value) => value + 1)} /> : <div className="media-details">{items.map((item, index) => <section key={item.id}>
      <h3>Tệp {index + 1}</h3><dl><dt>Loại tệp</dt><dd>{item.mime_type}</dd><dt>Dung lượng</dt><dd>{(item.size_bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} MB</dd><dt>Ngày tải lên</dt><dd>{new Date(item.created_at).toLocaleString('vi-VN')}</dd></dl>
      <a className="secondary-btn" href={item.url} target="_blank" rel="noreferrer">Mở tệp gốc</a>
    </section>)}</div>}
  </Dialog>;
}
