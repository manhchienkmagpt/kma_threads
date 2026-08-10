import { Check, Link as LinkIcon, MoreHorizontal, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { ProfileReplyCard } from '../components/ProfileReplyCard';
import { Empty, ErrorState, Loading } from '../components/States';
import type { Page, Post, ProfileReply, User } from '../types';

type ProfileTab = 'threads' | 'replies' | 'reposts';

const emptyCopy: Record<ProfileTab, { title: string; text: string }> = {
  threads: { title: 'Chưa có bài đăng', text: 'Các bài viết mới sẽ xuất hiện tại đây.' },
  replies: { title: 'Chưa có câu trả lời', text: 'Các câu trả lời mới sẽ xuất hiện tại đây.' },
  reposts: { title: 'Chưa có bài đăng lại', text: 'Các bài được đăng lại sẽ xuất hiện tại đây.' },
};

export function ProfilePage() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [tab, setTab] = useState<ProfileTab>('threads');
  const [posts, setPosts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setTab('threads');
    setProfileLoading(true);
    setError('');
    api<User>(`/users/${username}`)
      .then((user) => active && setProfile(user))
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setProfileLoading(false));
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    let active = true;
    setContentLoading(true);
    setError('');
    const path = tab === 'threads' ? '' : `/${tab}`;
    if (tab === 'replies') {
      api<Page<ProfileReply>>(`/feed/users/${username}${path}?limit=100`)
        .then((page) => active && setReplies(page.items))
        .catch((reason) => active && setError((reason as Error).message))
        .finally(() => active && setContentLoading(false));
    } else {
      api<Page<Post>>(`/feed/users/${username}${path}?limit=100`)
        .then((page) => active && setPosts(page.items))
        .catch((reason) => active && setError((reason as Error).message))
        .finally(() => active && setContentLoading(false));
    }
    return () => { active = false; };
  }, [tab, username]);

  const toggleFollow = async () => {
    if (!profile) return;
    await api(`/users/${profile.id}/follow`, {
      method: profile.is_following ? 'DELETE' : 'POST',
    });
    setProfile({
      ...profile,
      is_following: !profile.is_following,
      followers_count: profile.followers_count + (profile.is_following ? -1 : 1),
    });
  };

  if (profileLoading) return <Loading />;
  if (!profile) return <ErrorState message={error || 'Không tìm thấy người dùng'} />;

  const hasItems = tab === 'replies' ? replies.length > 0 : posts.length > 0;

  return <>
    <section className="profile-head surface">
      <div className="profile-title">
        <div>
          <h1>{profile.display_name}</h1>
          <p>@{profile.username} {profile.is_verified && <span className="verified"><Check size={11} /></span>}</p>
        </div>
        <Avatar user={profile} size={84} />
      </div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      <div className="profile-stats">
        <span><b>{profile.followers_count}</b> người theo dõi</span><i>·</i>
        <span><b>{profile.following_count}</b> đang theo dõi</span>
        {profile.website && <><i>·</i><a href={profile.website} target="_blank" rel="noreferrer"><LinkIcon size={13} /> Website</a></>}
      </div>
      <div className="profile-buttons">
        {me?.id === profile.id
          ? <Link className="secondary-btn" to="/settings">Chỉnh sửa trang cá nhân</Link>
          : <button className={profile.is_following ? 'secondary-btn' : 'primary-btn wide'} onClick={toggleFollow}>
              {profile.is_following ? 'Đang theo dõi' : <><UserPlus size={17} /> Theo dõi</>}
            </button>}
        <button className="secondary-btn square" aria-label="Tùy chọn"><MoreHorizontal /></button>
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Nội dung trang cá nhân">
        <button className={tab === 'threads' ? 'active' : ''} onClick={() => setTab('threads')} role="tab" aria-selected={tab === 'threads'}>Threads <span>{profile.posts_count}</span></button>
        <button className={tab === 'replies' ? 'active' : ''} onClick={() => setTab('replies')} role="tab" aria-selected={tab === 'replies'}>Trả lời <span>{profile.replies_count}</span></button>
        <button className={tab === 'reposts' ? 'active' : ''} onClick={() => setTab('reposts')} role="tab" aria-selected={tab === 'reposts'}>Đăng lại <span>{profile.reposts_count}</span></button>
      </div>
    </section>
    {contentLoading ? <Loading /> : error ? <ErrorState message={error} /> : !hasItems ? (
      <Empty title={emptyCopy[tab].title} text={emptyCopy[tab].text} />
    ) : tab === 'replies' ? (
      <div className="profile-reply-list">{replies.map((reply) => <ProfileReplyCard key={reply.id} reply={reply} />)}</div>
    ) : (
      <div className="post-list">{posts.map((post) => (
        <PostCard key={`${tab}-${post.id}`} initial={post} onDelete={(id) => setPosts((current) => current.filter((item) => item.id !== id))} />
      ))}</div>
    )}
  </>;
}
