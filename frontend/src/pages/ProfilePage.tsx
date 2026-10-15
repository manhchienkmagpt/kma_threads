import { Check, Grid3X3, Link as LinkIcon, MessageCircle, MoreHorizontal, Repeat2, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import { Avatar } from '../components/Avatar';
import { PostCard } from '../components/PostCard';
import { ProfileReplyCard } from '../components/ProfileReplyCard';
import { Empty, ErrorState, Loading } from '../components/States';
import { Dialog } from '../components/Dialog';
import { UserListDialog } from '../components/UserListDialog';
import { ReportDialog } from '../components/ReportDialog';
import { ModerationActions } from '../components/ModerationActions';
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
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [relation, setRelation] = useState<'followers' | 'following' | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [followingBusy, setFollowingBusy] = useState(false);

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
    if (!profile || followingBusy) return;
    setFollowingBusy(true); setActionError('');
    try {
      await api(`/users/${profile.id}/follow`, { method: profile.is_following ? 'DELETE' : 'POST' });
      setProfile({ ...profile, is_following: !profile.is_following, followers_count: profile.followers_count + (profile.is_following ? -1 : 1) });
    } catch (reason) { setActionError((reason as Error).message); }
    finally { setFollowingBusy(false); }
  };

  if (profileLoading) return <Loading />;
  if (!profile) return <ErrorState message={error || 'Không tìm thấy người dùng'} />;

  const hasItems = tab === 'replies' ? replies.length > 0 : posts.length > 0;

  return <>
    <section className="profile-head surface">
      <div className="profile-title">
        <Avatar user={profile} size={150} />
        <div>
          <div className="profile-identity"><h1>{profile.username}</h1>{profile.is_verified && <span className="verified"><Check size={11} /></span>}</div>
          <div className="profile-buttons">
            {me?.id === profile.id
              ? <Link className="secondary-btn" to="/settings">Chỉnh sửa trang cá nhân</Link>
              : <button className={profile.is_following ? 'secondary-btn' : 'primary-btn wide'} onClick={toggleFollow} disabled={followingBusy}>
                  {profile.is_following ? 'Đang theo dõi' : <><UserPlus size={17} /> Theo dõi</>}
                </button>}
            <div className="profile-options"><button className="secondary-btn square" aria-label="Tùy chọn trang cá nhân" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
              {menu && <div className="dropdown">
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/${profile.username}`).then(() => setMessage('Đã sao chép liên kết trang cá nhân.')).catch(() => setActionError('Không thể sao chép liên kết.')); setMenu(false); }}>Sao chép liên kết</button>
                {me?.id !== profile.id && <button onClick={() => { setReporting(true); setMenu(false); }}>Báo cáo người dùng</button>}
                {me?.role === 'admin' && me.id !== profile.id && <button onClick={() => { setModerating(true); setMenu(false); }}>Kiểm duyệt tài khoản</button>}
              </div>}
            </div>
          </div>
          <div className="profile-stats">
            <span><b>{profile.posts_count}</b> bài viết</span>
            <button onClick={() => setRelation('followers')}><b>{profile.followers_count}</b> người theo dõi</button>
            <button onClick={() => setRelation('following')}>Đang theo dõi <b>{profile.following_count}</b> người</button>
          </div>
          <div className="profile-copy"><b>{profile.display_name}</b>
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            {profile.website && <a href={profile.website} target="_blank" rel="noreferrer"><LinkIcon size={13} /> {profile.website.replace(/^https?:\/\//, '')}</a>}
          </div>
        </div>
      </div>
      {message && <p className="form-success action-feedback" role="status">{message}</p>}
      {actionError && <p className="form-error action-feedback" role="alert">{actionError}</p>}
      <div className="profile-tabs" role="tablist" aria-label="Nội dung trang cá nhân">
        <button className={tab === 'threads' ? 'active' : ''} onClick={() => setTab('threads')} role="tab" aria-selected={tab === 'threads'}><Grid3X3 /> BÀI VIẾT</button>
        <button className={tab === 'replies' ? 'active' : ''} onClick={() => setTab('replies')} role="tab" aria-selected={tab === 'replies'}><MessageCircle /> BÌNH LUẬN</button>
        <button className={tab === 'reposts' ? 'active' : ''} onClick={() => setTab('reposts')} role="tab" aria-selected={tab === 'reposts'}><Repeat2 /> ĐĂNG LẠI</button>
      </div>
    </section>
    {contentLoading ? <Loading /> : error ? <ErrorState message={error} /> : !hasItems ? (
      <Empty title={emptyCopy[tab].title} text={emptyCopy[tab].text} />
    ) : tab === 'replies' ? (
      <div className="profile-reply-list">{replies.map((reply) => <ProfileReplyCard key={reply.id} reply={reply} />)}</div>
    ) : (
      <div className="profile-grid">{posts.map((post) => (
        <button className={post.media.length ? 'profile-tile' : 'profile-tile text-tile'} key={`${tab}-${post.id}`} onClick={() => setSelectedPost(post)} aria-label={`Xem bài viết của ${post.author.username}`}>
          {post.media[0]?.mime_type.startsWith('video/') ? <video src={post.media[0].url} muted /> : post.media[0] ? <img src={post.media[0].url} alt="" loading="lazy" /> : <span>{post.content}</span>}
          <i><HeartCount count={post.likes_count} /><MessageCircle /> {post.replies_count}</i>
        </button>
      ))}</div>
    )}
    {selectedPost && <div className="post-view-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedPost(null)}>
      <div className="post-view-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết bài viết"><button className="post-view-close" onClick={() => setSelectedPost(null)} aria-label="Đóng"><X /></button><PostCard initial={selectedPost} onUpdate={(updated) => { setPosts((current) => current.map((post) => post.id === updated.id ? updated : post)); setSelectedPost(updated); }} onDelete={(id) => { setPosts((current) => current.filter((item) => item.id !== id)); setSelectedPost(null); }} /></div>
    </div>}
    {relation && <UserListDialog key={relation} title={relation === 'followers' ? 'Người theo dõi' : 'Đang theo dõi'} path={`/users/${profile.id}/${relation}`} onClose={() => setRelation(null)} />}
    {reporting && <ReportDialog target={{ user_id: profile.id }} onClose={() => setReporting(false)} onReported={() => { setReporting(false); setMessage('Đã gửi báo cáo người dùng cho quản trị viên.'); }} />}
    {moderating && <Dialog title="Kiểm duyệt tài khoản" onClose={() => setModerating(false)}><ModerationActions target={{ kind: 'users', id: profile.id }} /></Dialog>}
  </>;
}

function HeartCount({ count }: { count: number }) {
  return <><span aria-hidden="true">♥</span> {count}</>;
}
