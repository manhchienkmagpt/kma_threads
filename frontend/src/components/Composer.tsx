import { ImagePlus, LoaderCircle, Send, Sparkles, Video, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import type { Media, Post } from '../types';
import { Avatar } from './Avatar';
import { AICaptionAssistant } from './AICaptionAssistant';
import { AIWritingTools } from './AIWritingTools';

const MAX_MEDIA = 10;
const MAX_SHORT_SECONDS = 60;

function getVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không thể đọc video này.'));
    };
    video.src = url;
  });
}

export function Composer({ onCreated, variant = 'post' }: { onCreated: (post: Post) => void; variant?: 'post' | 'short' }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [captionTarget, setCaptionTarget] = useState<Media | null>(null);
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isShort = variant === 'short';
  const maxMedia = isShort ? 1 : MAX_MEDIA;

  const upload = async (files?: FileList | null) => {
    if (!files?.length || busy) return;
    const selected = Array.from(files);
    if (media.length + selected.length > maxMedia) {
      setError(isShort ? 'Mỗi short chỉ gồm một video.' : `Mỗi bài viết được đăng tối đa ${MAX_MEDIA} ảnh hoặc video.`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const uploaded: Media[] = [];
    try {
      setBusy(true); setError('');
      if (isShort) {
        const file = selected[0];
        if (!['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Short chỉ hỗ trợ video MP4 hoặc WebM.');
        const duration = await getVideoDuration(file);
        if (!Number.isFinite(duration) || duration > MAX_SHORT_SECONDS) throw new Error('Short không được dài quá 60 giây.');
      }
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
    if (captionTarget?.id === item.id) setCaptionTarget(null);
    setMedia((current) => current.filter(({ id }) => id !== item.id));
    try {
      await api(`/media/${item.id}`, { method: 'DELETE' });
    } catch (reason) {
      setMedia((current) => current.some(({ id }) => id === item.id) ? current : [...current, item]);
      setError((reason as Error).message);
    }
  };

  const submit = async () => {
    if (isShort && media.length !== 1) {
      setError('Hãy chọn một video trước khi đăng short.');
      return;
    }
    if (!content.trim() && !media.length) return;
    try {
      setBusy(true); setError('');
      const post = await api<Post>('/posts', {
        method: 'POST',
        body: JSON.stringify({ content, media_ids: media.map(({ id }) => id), is_short: isShort }),
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
    <section className={`composer surface ${isShort ? 'short-composer' : ''}`}>
      <Avatar user={user} />
      <div className="composer-body">
        {isShort && <p className="short-upload-hint"><Video /> Chọn video dọc MP4/WebM, tối đa 60 giây</p>}
        <textarea autoFocus value={content} onChange={(event) => setContent(event.target.value.slice(0, 500))} placeholder={isShort ? 'Viết chú thích cho short...' : 'Viết chú thích...'} rows={3} />
        {media.length > 0 && (
          <div className={`media-preview-grid ${media.length === 1 ? 'single' : ''}`}>
            {media.map((item) => (
              <div className="media-preview" key={item.id}>
                {item.mime_type.startsWith('video/')
                  ? <video src={item.url} controls />
                  : <img src={item.url} alt="Ảnh chuẩn bị đăng" />}
                <button className="media-remove" onClick={() => removeMedia(item)} aria-label="Xóa tệp"><X /></button>
                {user.ai_assistant_enabled && item.mime_type.startsWith('image/') && (
                  <button className="media-caption" onClick={() => { setCaptionTarget(item); setAiOpen(false); }} aria-label="Trò chuyện với AI để tạo caption">
                    <Sparkles />
                    <span>AI tạo caption</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
        {captionTarget && <AICaptionAssistant
          key={captionTarget.id}
          media={captionTarget}
          onUse={(caption) => { setContent(caption); setCaptionTarget(null); }}
          onClose={() => setCaptionTarget(null)}
        />}
        {aiOpen && <AIWritingTools content={content} onUse={(next) => { setContent(next); setAiOpen(false); }} onClose={() => setAiOpen(false)} />}
        <div className="composer-actions">
          <button className="icon-btn accent" disabled={busy || media.length >= maxMedia} onClick={() => fileRef.current?.click()} aria-label={isShort ? 'Thêm short video' : 'Thêm ảnh hoặc video'}>{isShort ? <Video size={20} /> : <ImagePlus size={20} />}</button>
          <input ref={fileRef} type="file" accept={isShort ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'} multiple={!isShort} hidden onChange={(event) => upload(event.target.files)} />
          {user.ai_assistant_enabled && <button className={aiOpen ? 'icon-btn ai-trigger active' : 'icon-btn ai-trigger'} disabled={busy} onClick={() => { setAiOpen((open) => !open); setCaptionTarget(null); }} aria-label="AI hỗ trợ viết"><Sparkles size={19} /></button>}
          <span className={content.length > 450 ? 'counter warn' : 'counter'}>{500 - content.length}</span>
          <button className="primary-btn" disabled={busy || (isShort ? media.length !== 1 : (!content.trim() && !media.length))} onClick={submit}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} {isShort ? 'Đăng short' : 'Đăng'}
          </button>
        </div>
      </div>
    </section>
  );
}
