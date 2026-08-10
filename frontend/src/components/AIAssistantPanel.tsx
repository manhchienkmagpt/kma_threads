import { CheckCircle2, Copy, FileText, HelpCircle, LoaderCircle, MessageSquareText, SearchCheck, Send } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { AIResponse } from '../types';

type PostAIAction = 'fact-check' | 'summarize' | 'suggest-reply';

export function AIAssistantPanel({ postId }: { postId: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AIResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = async (action: PostAIAction | 'ask') => {
    if (busy || (action === 'ask' && !question.trim())) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await api<AIResponse>(`/ai/posts/${postId}/${action}`, {
        method: 'POST',
        body: action === 'ask' ? JSON.stringify({ question: question.trim() }) : undefined,
      }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ask = (event: FormEvent) => { event.preventDefault(); request('ask'); };

  return (
    <section className="ai-post-panel" aria-label="AI Assistant cho bài đăng">
      <div className="ai-post-actions">
        <button onClick={() => request('fact-check')} disabled={busy}><SearchCheck /> Fact-check</button>
        <button onClick={() => request('summarize')} disabled={busy}><FileText /> Tóm tắt thread</button>
        <button onClick={() => request('suggest-reply')} disabled={busy}><MessageSquareText /> Gợi ý phản hồi</button>
      </div>
      <form className="ai-question" onSubmit={ask}>
        <HelpCircle />
        <input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi Gemini về bài đăng này..." />
        <button disabled={busy || !question.trim()} aria-label="Gửi câu hỏi"><Send /></button>
      </form>
      {busy && <div className="ai-loading"><LoaderCircle className="spin" /> Gemini đang phân tích...</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && <div className="ai-post-result">
        <div className="ai-result-label"><CheckCircle2 /> Kết quả từ Gemini <button onClick={() => navigator.clipboard.writeText(result.content)}><Copy /> Sao chép</button></div>
        <p>{result.content}</p>
        {result.sources.length > 0 && <div className="ai-sources"><b>Nguồn tham khảo</b>{result.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
        {result.disclaimer && <small>{result.disclaimer}</small>}
      </div>}
    </section>
  );
}
