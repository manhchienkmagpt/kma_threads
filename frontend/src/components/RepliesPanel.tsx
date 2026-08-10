import { formatDistanceToNowStrict } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Check, LoaderCircle, Pencil, Send, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import type { Page, Reply } from '../types';
import { Avatar } from './Avatar';

type Props = {
  postId: string;
  authorUsername: string;
  onCountChange: (change: number) => void;
};

export function RepliesPanel({ postId, authorUsername, onCountChange }: Props) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<Page<Reply>>(`/posts/${postId}/replies?limit=100`)
      .then((data) => active && setReplies(data.items))
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [postId]);

  const createReply = async () => {
    if (!content.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const created = await api<Reply>(`/posts/${postId}/replies`, {
        method: 'POST', body: JSON.stringify({ content: content.trim() }),
      });
      setReplies((current) => [...current, created]);
      setContent(''); onCountChange(1);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const saveReply = async (replyId: string) => {
    if (!editingContent.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Reply>(`/posts/${postId}/replies/${replyId}`, {
        method: 'PATCH', body: JSON.stringify({ content: editingContent.trim() }),
      });
      setReplies((current) => current.map((reply) => reply.id === replyId ? updated : reply));
      setEditingId(null); setEditingContent('');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const deleteReply = async (replyId: string) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    setBusy(true); setError('');
    try {
      await api(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' });
      setReplies((current) => current.filter((reply) => reply.id !== replyId));
      onCountChange(-1);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="replies-panel" aria-label="Bình luận">
      <div className="reply-composer">
        {user && <Avatar user={user} size={32} />}
        <div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value.slice(0, 500))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); createReply();
              }
            }}
            placeholder={`Trả lời @${authorUsername}...`}
            rows={1}
          />
          <span>{content.length}/500</span>
        </div>
        <button className="reply-send" disabled={!content.trim() || busy} onClick={createReply} aria-label="Gửi bình luận">
          {busy ? <LoaderCircle className="spin" /> : <Send />}
        </button>
      </div>

      {error && <p className="reply-error">{error}</p>}
      {loading ? (
        <div className="replies-loading"><LoaderCircle className="spin" /> Đang tải bình luận...</div>
      ) : replies.length === 0 ? (
        <div className="replies-empty"><b>Chưa có bình luận</b><span>Hãy bắt đầu cuộc trò chuyện.</span></div>
      ) : (
        <div className="reply-list">
          {replies.map((reply) => {
            const editing = editingId === reply.id;
            const edited = reply.updated_at !== reply.created_at;
            return (
              <article className="reply-item" key={reply.id}>
                <Link to={`/${reply.author.username}`}><Avatar user={reply.author} size={32} /></Link>
                <div className="reply-body">
                  <div className="reply-meta">
                    <Link to={`/${reply.author.username}`}>{reply.author.username}</Link>
                    <span>{formatDistanceToNowStrict(new Date(reply.created_at), { addSuffix: true, locale: vi })}</span>
                    {edited && <span>· đã sửa</span>}
                    {user?.id === reply.author.id && !editing && (
                      <div className="reply-tools">
                        <button onClick={() => { setEditingId(reply.id); setEditingContent(reply.content); }} aria-label="Sửa bình luận"><Pencil /></button>
                        <button onClick={() => deleteReply(reply.id)} aria-label="Xóa bình luận"><Trash2 /></button>
                      </div>
                    )}
                  </div>
                  {editing ? (
                    <div className="reply-editor">
                      <textarea autoFocus value={editingContent} maxLength={500} onChange={(event) => setEditingContent(event.target.value)} />
                      <button onClick={() => saveReply(reply.id)} disabled={busy || !editingContent.trim()} aria-label="Lưu"><Check /></button>
                      <button onClick={() => setEditingId(null)} aria-label="Hủy"><X /></button>
                    </div>
                  ) : <p>{reply.content}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
