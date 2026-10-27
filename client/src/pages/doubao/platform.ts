import * as api from '../../api/doubao';
import type { ChatMessage, SessionItem } from '../../../../shared/api.interface';

type Options = { body?: { uuid: string; name?: string; events?: {
  type: string; message_id?: string; contents?: { type: string; text?: string }[];
}[] }; params?: { page_token?: string; order?: 'asc' | 'desc' }; signal?: AbortSignal; sse?: boolean };
export const rawSession = (s: SessionItem) => ({ id: s.id, name: s.name, status: s.status, updated_at: s.updatedAt });
export const rawMessage = (m: ChatMessage) => ({ id: m.id, session_id: m.sessionId,
  reply_id: m.replyId, role: m.role, status: m.status, created_at: m.createdAt,
  items: m.parts.map(p => ({ id: p.id || `${m.id}:${p.type}:${p.seq}`, type: p.type, seq: p.seq,
    text: p.text, name: p.name, url: p.url, summary: p.summary })) });
const aborted = () => new DOMException('请求已停止', 'AbortError');
const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(aborted()); return; }
  const onAbort = () => { clearTimeout(timer); reject(aborted()); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal.addEventListener('abort', onAbort, { once: true });
});

export function createPlatform() {
  const lifetime = new AbortController();
  let popup: Window | null = null;
  let opening = false;
  // Miaoda cannot host SSE. Poll real message snapshots and feed the existing renderer locally.
  // This is an in-browser stream, never an HTTP event stream or fabricated model response.
  function replyStream(sid: string, replyId: string, signal?: AbortSignal): Response {
    const controller = new AbortController();
    const stop = () => controller.abort();
    lifetime.signal.addEventListener('abort', stop, { once: true });
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted || lifetime.signal.aborted) stop();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(sink) {
        let closed = false;
        const emit = (event: string, data: unknown) => {
          if (!controller.signal.aborted) sink.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          const deadline = Date.now() + 295000;
          while (!controller.signal.aborted && Date.now() < deadline) {
            let token: string | undefined;
            const visited = new Set<string>();
            let replies: ChatMessage[] = [];
            for (let page = 0; page < 50; page++) {
              const data = await api.messages(sid, token);
              if (controller.signal.aborted) break;
              replies = data.messages.filter(m => m.role === 'assistant' && m.replyId === replyId);
              if (replies.length || !data.hasMore) break;
              if (!data.pageToken || visited.has(data.pageToken)) throw new Error('消息分页游标异常');
              token = data.pageToken; visited.add(token);
            }
            if (controller.signal.aborted) break;
            for (const message of replies) {
              const raw = rawMessage(message);
              for (const item of raw.items) emit(item.type, { ...item, item_id: item.id, message_id: raw.id });
              if (['completed', 'failed', 'cancelled'].includes(message.status)) {
                emit(`message.${message.status}`, { message: raw });
                sink.close(); closed = true; return;
              }
            }
            sink.enqueue(encoder.encode(': polling\n\n'));
            await pause(1500, controller.signal);
          }
          if (!controller.signal.aborted) emit('error', { message: '接收超时，请继续接收并核对回复' });
        } catch (error) {
          if (!controller.signal.aborted) emit('error', { message: api.errorText(error) });
        } finally {
          lifetime.signal.removeEventListener('abort', stop);
          signal?.removeEventListener('abort', stop);
          if (!closed && !controller.signal.aborted) sink.close();
        }
      },
      cancel() { controller.abort(); },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  return {
    context: { environment: 'web' },
    store: {
      async get(key: string) { try { return JSON.parse(localStorage.getItem(`doubao-miaoda:${key}`) || 'null'); } catch { return null; } },
      async set(key: string, value: unknown) { localStorage.setItem(`doubao-miaoda:${key}`, JSON.stringify(value)); },
    },
    async getCurrentUserInfo() {
      const info = await api.authInfo();
      return { name: info.accountName, avatar_url: info.avatarUrl };
    },
    logout: api.logout,
    async request(method: string, path: string, options: Options = {}) {
      if (lifetime.signal.aborted || options.signal?.aborted) throw aborted();
      const { body, params } = options;
      let result: unknown;
      if (path === '/sessions' && method === 'GET') {
        const data = await api.sessions(params?.page_token);
        result = { sessions: data.sessions.map(rawSession), has_more: data.hasMore, page_token: data.pageToken };
      } else if (path === '/sessions' && method === 'POST' && body) {
        result = rawSession(await api.createSession({ uuid: body.uuid, name: body.name || '新工作任务' }));
      } else {
        const match = /^\/sessions\/([^/]+)(?:\/(messages|events)(?:\/([^/]+))?)?$/.exec(path);
        if (!match) throw new Error('不支持的豆包接口');
        const sid = decodeURIComponent(match[1]);
        if (method === 'GET' && !match[2]) result = rawSession(await api.detail(sid));
        else if (method === 'GET' && match[2] === 'messages') {
          const data = await api.messages(sid, params?.page_token, params?.order);
          result = { messages: data.messages.map(rawMessage), has_more: data.hasMore, page_token: data.pageToken };
        } else if (method === 'GET' && match[2] === 'events' && match[3] && options.sse) {
          return replyStream(sid, decodeURIComponent(match[3]), options.signal);
        } else if (method === 'POST' && match[2] === 'events' && body) {
          const event = body.events?.[0];
          if (event?.type === 'user.interrupt') result = await api.interrupt(sid, { uuid: body.uuid, messageId: event.message_id });
          else if (event?.type === 'user.message') {
            const data = await api.sendMessage(sid, { uuid: body.uuid,
              text: (event.contents || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n') });
            result = { messages: data.messages.map(rawMessage) };
          } else throw new Error('不支持的消息事件');
        } else throw new Error('不支持的豆包接口');
      }
      if (lifetime.signal.aborted || options.signal?.aborted) throw aborted();
      return result;
    },
    async openModal(_options: unknown) {
      if (opening) throw new Error('授权窗口已打开');
      opening = true;
      // Open synchronously in the click handler to retain browser user activation.
      popup = window.open('about:blank', 'doubao-miaoda-oauth', 'popup=yes,width=800,height=600');
      try {
        if (!popup) throw new Error('请允许浏览器打开授权窗口后重试');
        popup.document.title = '正在打开授权页';
        popup.document.body.style.cssText = 'margin:0;height:100vh;display:grid;place-items:center;font:14px system-ui;color:#666;background:#fafafa';
        popup.document.body.textContent = '正在打开授权页，请稍候…';
        const auth = await api.startAuth();
        if (lifetime.signal.aborted || popup.closed) { await api.cancelAuth(); return null; }
        popup.location.replace(auth.authorizationUrl);
        const deadline = Date.now() + 600000;
        while (!lifetime.signal.aborted && Date.now() < deadline) {
          await pause(800, lifetime.signal);
          const info = await api.authInfo();
          if (info.status === 'success' && info.authorized) {
            popup.close();
            return { source: 'api-invoke', data: { type: 'app-oauth-result', result: 'success' } };
          }
          if (popup.closed) {
            // The previous read may precede the callback's commit and automatic close.
            const latest = await api.authInfo();
            if (latest.status === 'success' && latest.authorized) {
              return { source: 'api-invoke', data: { type: 'app-oauth-result', result: 'success' } };
            }
            await api.cancelAuth(); return null;
          }
          if (['failed', 'cancelled'].includes(info.status)) { await api.cancelAuth(); return null; }
        }
        if (!lifetime.signal.aborted) await api.cancelAuth();
        return null;
      } catch (error) {
        if (!lifetime.signal.aborted) await api.cancelAuth().catch(() => {});
        throw error;
      } finally { popup?.close(); popup = null; opening = false; }
    },
    dispose() { lifetime.abort(); popup?.close(); },
  };
}
