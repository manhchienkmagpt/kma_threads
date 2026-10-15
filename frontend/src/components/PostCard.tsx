import { formatDistanceToNowStrict } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Pencil, Repeat2, Send, Shield, Sparkles, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import type { Post } from '../types';
import { Avatar } from './Avatar';
import { AIAssistantPanel } from './AIAssistantPanel';
import { RepliesPanel } from './RepliesPanel';
import { Dialog } from './Dialog';
import { UserListDialog } from './UserListDialog';
import { ReportDialog } from './ReportDialog';
import { ModerationActions } from './ModerationActions';
import { MediaDetailsDialog } from './MediaDetailsDialog';

export function PostCard({ initial, onDelete, onUpdate }: { initial: Post; onDelete?: (id: string) => void; onUpdate?: (post: Post) => void }) {
  const [post, setPost] = useState(initial);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [people, setPeople] = useState<'likes' | 'reposts' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [mediaDetails, setMediaDetails] = useState(false);
  useEffect(() => { setPost(initial); }, [initial]);

  const removeFromView = () => { setRemoved(true); onDelete?.(post.id); };
  const savePost = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Post>(`/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ content: draft.trim() }) });
      setPost(updated); onUpdate?.(updated); setEditing(false); setMessage('Đã lưu bài viết.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const toggle = async (kind: 'likes' | 'reposts' | 'bookmarks', active: boolean) => {
    setPost((current) => ({
      ...current,
      [kind === 'likes' ? 'liked' : kind === 'reposts' ? 'reposted' : 'bookmarked']: !active,
      ...(kind === 'likes' ? { likes_count: current.likes_count + (active ? -1 : 1) } : {}),
      ...(kind === 'reposts' ? { reposts_count: current.reposts_count + (active ? -1 : 1) } : {}),
    }));
    try { await api(`/posts/${post.id}/${kind}`, { method: active ? 'DELETE' : 'POST' }); }
    catch { setPost(post); }
  };

  const deletePost = async () => {
    if (busy) return;
    if (!window.confirm('Xóa bài viết này?')) return;
    setBusy(true); setError('');
    try { await api(`/posts/${post.id}`, { method: 'DELETE' }); removeFromView(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const ago = formatDistanceToNowStrict(new Date(post.created_at), { addSuffix: false, locale: vi });
  const sharePost = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    if (navigator.share) await navigator.share({ title: `Bài viết của @${post.author.username}`, text: post.content, url }).catch(() => null);
    else await navigator.clipboard.writeText(url);
  };
  if (removed) return <p className="action-feedback" role="status">Bài viết đã được gỡ khỏi giao diện.</p>;
  return (
    <article className="post surface">
      <div className="post-body">
        <header className="post-meta">
          <Link to={`/${post.author.username}`} className="post-avatar"><Avatar user={post.author} size={34} /></Link>
          <Link to={`/${post.author.username}`} className="author">
            {post.author.username}{post.author.is_verified && <i>✓</i>}
          </Link>
          <span className="post-dot">·</span><Link className="muted post-permalink" to={`/posts/${post.id}`}><time dateTime={post.created_at}>{ago}</time></Link>
          {post.updated_at !== post.created_at && <small className="muted">đã sửa</small>}
          <div className="post-menu">
            <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Tùy chọn bài viết" aria-expanded={menu}><MoreHorizontal size={19} /></button>
            {menu && (
              <div className="dropdown">
                {user?.id === post.author.id ? (
                  <><button onClick={() => { setDraft(post.content); setEditing(true); setMenu(false); setError(''); }}><Pencil size={16} />Chỉnh sửa</button><button className="danger" disabled={busy} onClick={deletePost}><Trash2 size={16} />Xóa</button></>
                ) : (
                  <button onClick={() => { setReporting(true); setMenu(false); }}>Báo cáo</button>
                )}
                {user?.role === 'admin' && <button onClick={() => { setModerating(true); setMenu(false); }}><Shield size={16} />Kiểm duyệt</button>}
                {post.media.length > 0 && <button onClick={() => { setMediaDetails(true); setMenu(false); }}>Thông tin tệp đính kèm</button>}
              </div>
            )}
          </div>
        </header>
        {post.media.length > 0 && <div className={`post-media-grid ${post.media.length === 1 ? 'single' : ''}`}>
        {post.media.map((media) => media.mime_type.startsWith('video/') ? (
          <video key={media.id} className="post-media" controls src={media.url} />
        ) : (
          <img key={media.id} className="post-media" src={media.url} alt={`Bài viết của ${post.author.display_name}`} loading="lazy" />
        ))}
        </div>}
        <div className="post-actions">
          <button className={post.liked ? 'active-like' : ''} onClick={() => toggle('likes', post.liked)}>
            <Heart fill={post.liked ? 'currentColor' : 'none'} /><span>{post.likes_count || ''}</span>
          </button>
          <button
            className={repliesOpen ? 'comments-open' : ''}
            onClick={() => setRepliesOpen((open) => !open)}
            aria-expanded={repliesOpen}
            aria-label={repliesOpen ? 'Đóng bình luận' : 'Xem bình luận'}
          >
            <MessageCircle /><span>{post.replies_count || ''}</span>
          </button>
          <button className={post.reposted ? 'active-repost' : ''} onClick={() => toggle('reposts', post.reposted)}>
            <Repeat2 /><span>{post.reposts_count || ''}</span>
          </button>
          <button onClick={sharePost} aria-label="Chia sẻ bài viết"><Send /></button>
          <button className={`bookmark-action ${post.bookmarked ? 'active-bookmark' : ''}`} onClick={() => toggle('bookmarks', post.bookmarked)}>
            <Bookmark fill={post.bookmarked ? 'currentColor' : 'none'} />
          </button>
          {user?.ai_assistant_enabled && <button className={aiOpen ? 'ai-post-trigger active' : 'ai-post-trigger'} onClick={() => setAiOpen((open) => !open)} aria-label="Mở AI Assistant"><Sparkles /></button>}
        </div>
        <div className="post-interaction-counts">
          <button className="post-likes text-btn" onClick={() => setPeople('likes')}>{post.likes_count.toLocaleString('vi-VN')} lượt thích</button>
          <button className="text-btn" onClick={() => setPeople('reposts')}>{post.reposts_count.toLocaleString('vi-VN')} lượt đăng lại</button>
        </div>
        {error && !editing && <p className="form-error action-feedback" role="alert">{error}</p>}
        {message && <p className="form-success action-feedback" role="status">{message}</p>}
        {post.content && <p className="post-content"><Link to={`/${post.author.username}`}>{post.author.username}</Link> {post.content}</p>}
        {aiOpen && <AIAssistantPanel postId={post.id} />}
        {post.replies_count > 0 && !repliesOpen && (
          <button className="conversation-trigger" onClick={() => setRepliesOpen(true)}>
            Xem {post.replies_count} bình luận
          </button>
        )}
        {repliesOpen && (
          <RepliesPanel
            postId={post.id}
            authorUsername={post.author.username}
            onCountChange={(change) => setPost((current) => ({
              ...current,
              replies_count: Math.max(0, current.replies_count + change),
            }))}
          />
        )}
      </div>
      {people && <UserListDialog key={people} title={people === 'likes' ? 'Người thích bài viết' : 'Người đăng lại bài viết'} path={`/posts/${post.id}/${people}`} onClose={() => setPeople(null)} />}
      {mediaDetails && <MediaDetailsDialog media={post.media} onClose={() => setMediaDetails(false)} />}
      {reporting && <ReportDialog target={{ post_id: post.id }} onClose={() => setReporting(false)} onReported={() => { setReporting(false); setMessage('Đã gửi báo cáo cho quản trị viên.'); }} />}
      {moderating && <Dialog title="Kiểm duyệt bài viết" onClose={() => setModerating(false)}><ModerationActions target={{ kind: 'posts', id: post.id }} onRemoved={removeFromView} /></Dialog>}
      {editing && <Dialog title="Chỉnh sửa bài viết" onClose={() => setEditing(false)} busy={busy}><form className="feature-form" onSubmit={savePost}>
        <label>Nội dung<textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} rows={5} required disabled={busy} /></label>
        <small>{draft.length}/500 ký tự · Chỉnh sửa nội dung văn bản</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button type="button" className="secondary-btn" disabled={busy} onClick={() => setEditing(false)}>Hủy</button><button className="primary-btn" disabled={busy || !draft.trim()}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></footer>
      </form></Dialog>}
    </article>
  );
}
