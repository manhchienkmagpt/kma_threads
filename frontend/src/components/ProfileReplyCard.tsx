import { formatDistanceToNowStrict } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CornerDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ProfileReply } from '../types';
import { Avatar } from './Avatar';

export function ProfileReplyCard({ reply }: { reply: ProfileReply }) {
  const postAge = formatDistanceToNowStrict(new Date(reply.post.created_at), {
    addSuffix: true,
    locale: vi,
  });
  const replyAge = formatDistanceToNowStrict(new Date(reply.created_at), {
    addSuffix: true,
    locale: vi,
  });

  return (
    <article className="profile-reply surface">
      <div className="profile-reply-parent">
        <Link to={`/${reply.post.author.username}`}>
          <Avatar user={reply.post.author} size={34} />
        </Link>
        <div>
          <div className="profile-reply-meta">
            <Link to={`/${reply.post.author.username}`}>@{reply.post.author.username}</Link>
            <span>{postAge}</span>
          </div>
          <p>{reply.post.content}</p>
        </div>
      </div>
      <div className="profile-reply-answer">
        <div className="profile-reply-connector"><CornerDownRight /></div>
        <Link to={`/${reply.author.username}`}>
          <Avatar user={reply.author} size={38} />
        </Link>
        <div>
          <div className="profile-reply-meta">
            <Link to={`/${reply.author.username}`}>@{reply.author.username}</Link>
            <span>đã trả lời {replyAge}</span>
          </div>
          <p>{reply.content}</p>
        </div>
      </div>
    </article>
  );
}
