import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { PostCard } from '../components/PostCard';
import { Empty, ErrorState, Loading } from '../components/States';
import type { Post } from '../types';

export function PostPage() {
  const { postId } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPost(await api<Post>(`/posts/${postId}`)); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [postId]);
  useEffect(() => { load(); }, [load]);
  return <>
    <div className="page-header"><Link className="text-btn" to="/">← Về bảng tin</Link><h1>Bài viết</h1></div>
    {loading ? <Loading /> : error ? <ErrorState message={error} retry={load} /> : post ? <PostCard initial={post} onUpdate={setPost} onDelete={() => setPost(null)} /> : <Empty title="Bài viết đã được gỡ" text="Bài viết này không còn hiển thị." />}
  </>;
}
