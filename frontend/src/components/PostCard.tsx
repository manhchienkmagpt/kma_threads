import { formatDistanceToNowStrict } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import type { Post } from '../types';
import { Avatar } from './Avatar';
import { AIAssistantPanel } from './AIAssistantPanel';
import { RepliesPanel } from './RepliesPanel';

export function PostCard({ initial, onDelete }: { initial: Post; onDelete?: (id: string) => void }) {
  const [post, setPost] = useState(initial);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { user } = useAuth();

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
    if (!window.confirm('Xóa thread này?')) return;
    await api(`/posts/${post.id}`, { method: 'DELETE' });
    onDelete?.(post.id);
  };

  const ago = formatDistanceToNowStrict(new Date(post.created_at), { addSuffix: false, locale: vi });
  return (
    <article className="post surface">
      <div className="thread-rail">
        <Link to={`/${post.author.username}`}><Avatar user={post.author} /></Link><span />
      </div>
      <div className="post-body">
        <div className="post-meta">
          <Link to={`/${post.author.username}`} className="author">
            {post.author.username}{post.author.is_verified && <i>✓</i>}
          </Link>
          <span className="muted">{ago}</span>
          <div className="post-menu">
            <button className="icon-btn" onClick={() => setMenu(!menu)}><MoreHorizontal size={19} /></button>
            {menu && (
              <div className="dropdown">
                {user?.id === post.author.id ? (
                  <button className="danger" onClick={deletePost}><Trash2 size={16} />Xóa</button>
                ) : (
                  <button onClick={() => api('/reports', {
                    method: 'POST', body: JSON.stringify({ post_id: post.id, reason: 'inappropriate' }),
                  }).then(() => setMenu(false))}>Báo cáo</button>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="post-content">{post.content}</p>
        {post.media.map((media) => media.mime_type.startsWith('video/') ? (
          <video key={media.id} className="post-media" controls src={media.url} />
        ) : (
          <img key={media.id} className="post-media" src={media.url} alt="Nội dung thread" />
        ))}
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
          <button className={post.bookmarked ? 'active-bookmark' : ''} onClick={() => toggle('bookmarks', post.bookmarked)}>
            <Bookmark fill={post.bookmarked ? 'currentColor' : 'none'} />
          </button>
          {user?.ai_assistant_enabled && <button className={aiOpen ? 'ai-post-trigger active' : 'ai-post-trigger'} onClick={() => setAiOpen((open) => !open)} aria-label="Mở AI Assistant"><Sparkles /></button>}
        </div>
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
    </article>
  );
}
