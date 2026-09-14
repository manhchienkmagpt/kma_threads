import { ImagePlus, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import type { AIResponse, Media, Post } from '../types';
import { Avatar } from './Avatar';
import { AIWritingTools } from './AIWritingTools';

const MAX_MEDIA = 10;

export function Composer({ onCreated }: { onCreated: (post: Post) => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [captionBusy, setCaptionBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (files?: FileList | null) => {
    if (!files?.length || busy) return;
    const selected = Array.from(files);
    if (media.length + selected.length > MAX_MEDIA) {
      setError(`Mỗi thread được đăng tối đa ${MAX_MEDIA} ảnh hoặc video.`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const uploaded: Media[] = [];
    try {
      setBusy(true); setError('');
      for (const file of selected) {
        const body = new FormData();
        body.append('file', file);
        uploaded.push(await api<Media>('/media', { method: 'POST', body }));
      }
      setMedia((current) => [...current, ...uploaded]);
    } catch (reason) {
      setMedia((current) => [...current, ...uploaded]);
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeMedia = async (item: Media) => {
    setMedia((current) => current.filter(({ id }) => id !== item.id));
    try {
      await api(`/media/${item.id}`, { method: 'DELETE' });
    } catch (reason) {
      setMedia((current) => current.some(({ id }) => id === item.id) ? current : [...current, item]);
      setError((reason as Error).message);
    }
  };

  const suggestCaption = async (item: Media) => {
    if (captionBusy) return;
    try {
      setCaptionBusy(item.id); setError('');
      const response = await api<AIResponse>('/ai/caption-image', {
        method: 'POST',
        body: JSON.stringify({ media_id: item.id }),
      });
      setContent(response.content.slice(0, 500));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setCaptionBusy(null);
    }
  };

  const submit = async () => {
    if (!content.trim() && !media.length) return;
    try {
      setBusy(true); setError('');
      const post = await api<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify({ content, media_ids: media.map(({ id }) => id) }),
      });
      setContent(''); setMedia([]); onCreated(post);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <section className="composer surface">
      <Avatar user={user} />
      <div className="composer-body">
        <textarea value={content} onChange={(event) => setContent(event.target.value.slice(0, 500))} placeholder="Bắt đầu một thread..." rows={2} />
        {media.length > 0 && (
          <div className={`media-preview-grid ${media.length === 1 ? 'single' : ''}`}>
            {media.map((item) => (
              <div className="media-preview" key={item.id}>
                {item.mime_type.startsWith('video/')
                  ? <video src={item.url} controls />
                  : <img src={item.url} alt="Ảnh chuẩn bị đăng" />}
                <button className="media-remove" onClick={() => removeMedia(item)} aria-label="Xóa tệp"><X /></button>
                {user.ai_assistant_enabled && item.mime_type.startsWith('image/') && (
                  <button className="media-caption" disabled={Boolean(captionBusy)} onClick={() => suggestCaption(item)} aria-label="Gợi ý caption bằng Florence-2-large">
                    {captionBusy === item.id ? <LoaderCircle className="spin" /> : <Sparkles />}
                    <span>Gợi ý caption</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
        {aiOpen && <AIWritingTools content={content} onUse={(next) => { setContent(next); setAiOpen(false); }} onClose={() => setAiOpen(false)} />}
        <div className="composer-actions">
          <button className="icon-btn accent" disabled={busy || media.length >= MAX_MEDIA} onClick={() => fileRef.current?.click()} aria-label="Thêm ảnh hoặc video"><ImagePlus size={20} /></button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden onChange={(event) => upload(event.target.files)} />
          {user.ai_assistant_enabled && <button className={aiOpen ? 'icon-btn ai-trigger active' : 'icon-btn ai-trigger'} disabled={busy} onClick={() => setAiOpen((open) => !open)} aria-label="AI hỗ trợ viết"><Sparkles size={19} /></button>}
          <span className={content.length > 450 ? 'counter warn' : 'counter'}>{500 - content.length}</span>
          <button className="primary-btn" disabled={busy || Boolean(captionBusy) || (!content.trim() && !media.length)} onClick={submit}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} Đăng
          </button>
        </div>
      </div>
    </section>
  );
}
