import { BadGatewayException } from '@nestjs/common';
import type { ChatMessage, SessionItem } from '../../../shared/api.interface';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadGatewayException('豆包接口返回格式异常');
  }
  return value as Record<string, unknown>;
}
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new BadGatewayException('豆包接口缺少列表数据');
  return value;
}
export function session(value: unknown): SessionItem {
  const row = object(value);
  if (!string(row.id)) throw new BadGatewayException('豆包接口缺少会话 ID');
  return { id: string(row.id), name: string(row.name) || '新工作任务',
    status: string(row.status), updatedAt: string(row.updated_at) };
}
export function message(value: unknown): ChatMessage {
  const row = object(value);
  if (!string(row.id)) throw new BadGatewayException('豆包接口缺少消息 ID');
  return { id: string(row.id), sessionId: string(row.session_id), replyId: string(row.reply_id),
    role: string(row.role), status: string(row.status), createdAt: string(row.created_at),
    parts: array(row.items || []).map((raw: unknown) => {
      const part = object(raw);
      const text = part.type === 'reasoning' ? array(part.summary || []).map((rawSummary: unknown) =>
        string(object(rawSummary).text)).join('\n') : string(part.text);
      return { id: string(part.id), type: string(part.type), seq: Number(part.seq) || 0, text,
        name: string(part.name || part.tool_name) || undefined, url: string(part.url) || undefined,
        summary: part.type === 'reasoning' ? array(part.summary || []).map(v => {
          const item = object(v); return { type: string(item.type), text: string(item.text) };
        }) : undefined };
    }).sort((a, b) => a.seq - b.seq) };
}
