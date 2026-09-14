export type User = {
  id: string; email?: string; username: string; display_name: string; bio?: string | null;
  avatar_url?: string | null; website?: string | null; role: 'user' | 'admin'; status: string;
  is_verified: boolean; followers_count: number; following_count: number; posts_count: number;
  replies_count: number; reposts_count: number;
  is_following: boolean; created_at: string; ai_assistant_enabled?: boolean;
  has_google_api_key?: boolean;
};

export type Media = { id: string; url: string; mime_type: string; size_bytes: number; created_at: string };
export type Post = {
  id: string; content: string; author: User; media: Media[]; created_at: string; updated_at: string;
  likes_count: number; replies_count: number; reposts_count: number;
  liked: boolean; reposted: boolean; bookmarked: boolean;
};
export type Reply = {
  id: string; post_id: string; content: string; author: User;
  created_at: string; updated_at: string;
};
export type ProfileReply = Reply & { post: Post };
export type Page<T> = { items: T[]; total: number; offset: number; limit: number };
export type Notification = {
  id: string; actor: User | null; type: string; message: string; post_id?: string;
  is_read: boolean; created_at: string;
};
export type AISource = { title: string; url: string };
export type AIResponse = { content: string; sources: AISource[]; disclaimer?: string | null };
