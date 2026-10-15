import { Bookmark, Heart, MessageCircle, Play, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { RepliesPanel } from '../components/RepliesPanel';
import { Empty, ErrorState, Loading } from '../components/States';
import type { Page, Post } from '../types';

function ShortCard({ initial }: { initial: Post }) {
  const [post, setPost] = useState(initial);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
        video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      } else {
        video.pause();
        setPlaying(false);
      }
    }, { threshold: [0, 0.65, 1] });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().then(() => setPlaying(true)).catch(() => null);
    else { video.pause(); setPlaying(false); }
  };

  const toggle = async (kind: 'likes' | 'bookmarks', active: boolean) => {
    const previous = post;
    setPost((current) => ({
      ...current,
      [kind === 'likes' ? 'liked' : 'bookmarked']: !active,
      ...(kind === 'likes' ? { likes_count: current.likes_count + (active ? -1 : 1) } : {}),
    }));
    try { await api(`/posts/${post.id}/${kind}`, { method: active ? 'DELETE' : 'POST' }); }
    catch { setPost(previous); }
  };

  const share = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    if (navigator.share) await navigator.share({ title: `Short của @${post.author.username}`, text: post.content, url }).catch(() => null);
    else await navigator.clipboard.writeText(url);
  };

  const video = post.media[0];
  return (
    <article className="short-card">
      <div className="short-stage">
        <video ref={videoRef} src={video.url} muted={muted} loop playsInline preload="metadata" onClick={toggleVideo} aria-label={`Short của ${post.author.display_name}`} />
        {!playing && <button className="short-play" onClick={toggleVideo} aria-label="Phát video"><Play fill="currentColor" /></button>}
        <div className="short-gradient" />
        <div className="short-copy">
          <Link to={`/${post.author.username}`} className="short-author"><Avatar user={post.author} size={38} /><b>{post.author.username}</b>{post.author.is_verified && <i>✓</i>}</Link>
          {post.content && <p>{post.content}</p>}
          <Link className="short-detail-link" to={`/posts/${post.id}`}>Chi tiết và tùy chọn bài viết</Link>
        </div>
        <div className="short-actions">
          <button className={post.liked ? 'active-like' : ''} onClick={() => toggle('likes', post.liked)} aria-label="Thích"><Heart fill={post.liked ? 'currentColor' : 'none'} /><span>{post.likes_count || ''}</span></button>
          <button onClick={() => setRepliesOpen(true)} aria-label="Bình luận"><MessageCircle /><span>{post.replies_count || ''}</span></button>
          <button onClick={share} aria-label="Chia sẻ"><Send /></button>
          <button className={post.bookmarked ? 'active-bookmark' : ''} onClick={() => toggle('bookmarks', post.bookmarked)} aria-label="Lưu"><Bookmark fill={post.bookmarked ? 'currentColor' : 'none'} /></button>
          <button onClick={() => setMuted((current) => !current)} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}>{muted ? <VolumeX /> : <Volume2 />}</button>
        </div>
        {repliesOpen && <div className="short-replies">
          <header><b>Bình luận</b><button onClick={() => setRepliesOpen(false)} aria-label="Đóng bình luận"><X /></button></header>
          <RepliesPanel postId={post.id} authorUsername={post.author.username} onCountChange={(change) => setPost((current) => ({ ...current, replies_count: Math.max(0, current.replies_count + change) }))} />
        </div>}
      </div>
    </article>
  );
}

export function ShortsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api<Page<Post>>('/feed/shorts');
      setPosts(data.items);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const addShort = (event: Event) => {
      const post = (event as CustomEvent<Post>).detail;
      if (post.is_short) setPosts((current) => [post, ...current]);
    };
    window.addEventListener('kma:post-created', addShort);
    return () => window.removeEventListener('kma:post-created', addShort);
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!posts.length) return <div className="shorts-page"><div className="shorts-heading"><h1>Shorts</h1><p>Video ngắn từ cộng đồng KMAgram</p></div><Empty title="Chưa có short nào" text="Hãy tạo short video đầu tiên từ nút Tạo." /></div>;
  return <section className="shorts-page"><div className="shorts-heading"><h1>Shorts</h1><p>Video ngắn từ cộng đồng KMAgram</p></div><div className="shorts-feed">{posts.map((post) => <ShortCard key={post.id} initial={post} />)}</div></section>;
}
