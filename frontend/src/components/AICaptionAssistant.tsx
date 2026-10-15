import { Check, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { AIImageCaptionResponse, Media } from '../types';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Thân thiện và tự nhiên',
  'Hài hước, ngắn gọn',
  'Truyền cảm hứng',
];

export function AICaptionAssistant({
  media,
  onUse,
  onClose,
}: {
  media: Media;
  onUse: (caption: string) => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [imageDescription, setImageDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latestCaption = [...messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';

  const send = async (event?: FormEvent, suggestedInstruction?: string) => {
    event?.preventDefault();
    const request = (suggestedInstruction ?? instruction).trim();
    if (!request || busy) return;

    setBusy(true);
    setError('');
    setMessages((current) => [...current, { role: 'user', content: request }]);
    setInstruction('');
    try {
      const response = await api<AIImageCaptionResponse>('/ai/caption-image', {
        method: 'POST',
        body: JSON.stringify({
          media_id: media.id,
          instruction: request,
          image_description: imageDescription || null,
          previous_caption: latestCaption || null,
        }),
      });
      setImageDescription(response.image_description);
      setMessages((current) => [...current, { role: 'assistant', content: response.content }]);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ai-caption-panel" aria-label="Trò chuyện với AI để tạo caption">
      <header>
        <span><Sparkles /> AI tạo caption</span>
        <button onClick={onClose} aria-label="Đóng trợ lý caption"><X /></button>
      </header>
      {messages.length === 0 && (
        <div className="ai-caption-welcome">
          <p>Hãy mô tả caption bạn muốn. AI sẽ đọc ảnh rồi viết theo phong cách của bạn.</p>
          <div>{STARTERS.map((starter) => <button key={starter} disabled={busy} onClick={() => send(undefined, starter)}>{starter}</button>)}</div>
        </div>
      )}
      {messages.length > 0 && (
        <div className="ai-caption-chat" aria-live="polite">
          {messages.map((message, index) => (
            <p className={message.role} key={`${message.role}-${index}`}>{message.content}</p>
          ))}
          {busy && <div className="ai-caption-thinking"><LoaderCircle className="spin" /> {imageDescription ? 'Đang chỉnh caption...' : 'Đang đọc ảnh và viết caption...'}</div>}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {latestCaption && (
        <button className="ai-caption-use" onClick={() => onUse(latestCaption.slice(0, 500))}>
          <Check /> Dùng caption này
        </button>
      )}
      <form className="ai-caption-input" onSubmit={send}>
        <input
          value={instruction}
          maxLength={500}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={latestCaption ? 'Yêu cầu chỉnh sửa thêm...' : 'Ví dụ: Viết vui vẻ, trẻ trung, có emoji...'}
          aria-label="Yêu cầu về caption"
        />
        <button disabled={busy || !instruction.trim()} aria-label="Gửi yêu cầu caption">
          {busy ? <LoaderCircle className="spin" /> : <Send />}
        </button>
      </form>
    </section>
  );
}
