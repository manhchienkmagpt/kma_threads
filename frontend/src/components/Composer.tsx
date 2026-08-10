import { ImagePlus, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import type { Media, Post } from '../types';
import { Avatar } from './Avatar';
import { AIWritingTools } from './AIWritingTools';

export function Composer({ onCreated }: { onCreated: (post: Post) => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file?: File) => {
    if (!file || busy) return;
    const body = new FormData(); body.append('file', file);
    try {
      setBusy(true); setError('');
      setMedia(await api('/media', { method: 'POST', body }));
    } catch (e) {
      setMedia(null); setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const submit = async () => {
    if (!content.trim() && !media) return;
    try {
      setBusy(true); setError('');
      const post = await api<Post>('/posts', { method: 'POST', body: JSON.stringify({ content, media_ids: media ? [media.id] : [] }) });
      setContent(''); setMedia(null); onCreated(post);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (!user) return null;
  return (
    <section className="composer surface">
      <Avatar user={user} />
      <div className="composer-body">
        <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 500))} placeholder="Bắt đầu một thread..." rows={2} />
        {media && <div className="media-preview"><img src={media.url} /><button onClick={() => setMedia(null)}><X /></button></div>}
        {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
        {aiOpen && <AIWritingTools content={content} onUse={(next) => { setContent(next); setAiOpen(false); }} onClose={() => setAiOpen(false)} />}
        <div className="composer-actions">
          <button className="icon-btn accent" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Thêm ảnh"><ImagePlus size={20} /></button>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" hidden onChange={(e) => upload(e.target.files?.[0])} />
          {user.ai_assistant_enabled && <button className={aiOpen ? 'icon-btn ai-trigger active' : 'icon-btn ai-trigger'} disabled={busy} onClick={() => setAiOpen((open) => !open)} aria-label="AI hỗ trợ viết"><Sparkles size={19} /></button>}
          <span className={content.length > 450 ? 'counter warn' : 'counter'}>{500 - content.length}</span>
          <button className="primary-btn" disabled={busy || (!content.trim() && !media)} onClick={submit}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} Đăng
          </button>
        </div>
      </div>
    </section>
  );
}
