import { Check, Copy, LoaderCircle, WandSparkles, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import type { AIResponse } from '../types';

type WritingAction = 'rewrite' | 'spellcheck' | 'shorten' | 'tone';

export function AIWritingTools({
  content,
  onUse,
  onClose,
}: {
  content: string;
  onUse: (content: string) => void;
  onClose: () => void;
}) {
  const [tone, setTone] = useState('thân thiện');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: WritingAction) => {
    if (!content.trim() || busy) return;
    setBusy(true); setError(''); setResult('');
    try {
      const response = await api<AIResponse>('/ai/write', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), action, tone: action === 'tone' ? tone : null }),
      });
      setResult(response.content);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ai-writing-panel" aria-label="AI hỗ trợ viết bài">
      <header><span><WandSparkles /> AI hỗ trợ viết</span><button onClick={onClose} aria-label="Đóng"><X /></button></header>
      <div className="ai-writing-actions">
        <button disabled={busy || !content.trim()} onClick={() => run('rewrite')}>Viết lại</button>
        <button disabled={busy || !content.trim()} onClick={() => run('spellcheck')}>Sửa chính tả</button>
        <button disabled={busy || !content.trim()} onClick={() => run('shorten')}>Rút gọn</button>
        <div className="ai-tone-action">
          <select value={tone} onChange={(event) => setTone(event.target.value)} aria-label="Giọng văn">
            <option value="thân thiện">Thân thiện</option>
            <option value="chuyên nghiệp">Chuyên nghiệp</option>
            <option value="hài hước">Hài hước</option>
            <option value="truyền cảm hứng">Truyền cảm hứng</option>
          </select>
          <button disabled={busy || !content.trim()} onClick={() => run('tone')}>Đổi giọng</button>
        </div>
      </div>
      {busy && <div className="ai-loading"><LoaderCircle className="spin" /> Gemini đang viết...</div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && <div className="ai-writing-result">
        <p>{result}</p>
        <div>
          <button onClick={() => navigator.clipboard.writeText(result)}><Copy /> Sao chép</button>
          <button onClick={() => onUse(result.slice(0, 500))}><Check /> Dùng nội dung này</button>
        </div>
      </div>}
    </section>
  );
}
