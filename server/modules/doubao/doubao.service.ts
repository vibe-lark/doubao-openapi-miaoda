import { HttpService } from '@nestjs/axios';
import { BadGatewayException, BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { CreateSessionRequest, InterruptRequest, MessageList, SendMessageRequest,
  SendMessageResponse, SessionItem, SessionList } from '../../../shared/api.interface';
import { DoubaoAuthService } from './doubao-auth.service';
import { array, message, object, session, string } from './protocol';

@Injectable()
export class DoubaoService {
  constructor(private readonly auth: DoubaoAuthService, private readonly http: HttpService) {}
  private segment(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(id)) throw new BadRequestException('会话或消息 ID 无效');
    return encodeURIComponent(id);
  }
  private uuid(value: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) {
      throw new BadRequestException('请求 UUID 无效');
    }
  }
  private page(pageToken?: string, order: 'asc' | 'desc' = 'desc') {
    if (pageToken && pageToken.length > 2048) throw new BadRequestException('分页游标过长');
    return { page_size: 50, order, ...(pageToken ? { page_token: pageToken } : {}) };
  }
  private async request(userId: string, method: 'GET' | 'POST', path: string,
    body?: unknown, params?: Record<string, string | number>) {
    const token = await this.auth.access(userId);
    try {
      const response = await this.http.axiosRef.request<unknown>({
        url: `https://open.doubao.com/open-apis/agent/v1${path}`, method,
        data: body, params, timeout: 15000, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const payload = object(response.data);
      if (payload.code !== 0) {
        throw new BadGatewayException(`豆包接口返回错误（${String(payload.code)}），请检查应用权限和用户授权`);
      }
      return object(payload.data);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isAxiosError(error) && error.response?.status === 401) {
        throw new UnauthorizedException('豆包授权已失效，请重新授权');
      }
      const status = isAxiosError(error) ? error.response?.status : undefined;
      throw new BadGatewayException(`豆包请求未成功${status ? `（HTTP ${status}）` : ''}，请检查授权或稍后重试；提交结果不明确时先刷新会话`);
    }
  }
  async sessions(userId: string, pageToken?: string): Promise<SessionList> {
    const data = await this.request(userId, 'GET', '/sessions', undefined, this.page(pageToken));
    return { sessions: array(data.sessions).map(session), hasMore: data.has_more === true,
      pageToken: string(data.page_token) || undefined };
  }
  async create(userId: string, input: CreateSessionRequest): Promise<SessionItem> {
    this.uuid(input.uuid);
    if (!input.name?.trim() || input.name.length > 256) throw new BadRequestException('会话名称须为 1 至 256 字');
    const data = await this.request(userId, 'POST', '/sessions', { uuid: input.uuid, name: input.name });
    return session(data.session || data);
  }
  async detail(userId: string, sessionId: string): Promise<SessionItem> {
    const data = await this.request(userId, 'GET', `/sessions/${this.segment(sessionId)}`);
    return session(data.session || data);
  }
  async messages(userId: string, sessionId: string, pageToken?: string, order: 'asc' | 'desc' = 'desc'): Promise<MessageList> {
    const data = await this.request(userId, 'GET', `/sessions/${this.segment(sessionId)}/messages`,
      undefined, this.page(pageToken, order));
    return { messages: array(data.messages).map(message), hasMore: data.has_more === true,
      pageToken: string(data.page_token) || undefined };
  }
  async send(userId: string, sessionId: string, input: SendMessageRequest): Promise<SendMessageResponse> {
    this.uuid(input.uuid);
    if (!input.text?.trim() || input.text.length > 32000) throw new BadRequestException('消息须为 1 至 32000 字');
    const data = await this.request(userId, 'POST', `/sessions/${this.segment(sessionId)}/events`,
      { uuid: input.uuid, events: [{ type: 'user.message', contents: [{ type: 'text', text: input.text }] }] });
    const messages = array(data.messages).map(message);
    const user = messages.find((m) => m.role === 'user');
    if (!user) throw new BadGatewayException('未收到用户消息回执，请刷新会话确认提交结果');
    return { messages, userMessageId: user.id };
  }
  async interrupt(userId: string, sessionId: string, input: InterruptRequest): Promise<{ accepted: boolean }> {
    this.uuid(input.uuid);
    if (input.messageId) this.segment(input.messageId);
    await this.request(userId, 'POST', `/sessions/${this.segment(sessionId)}/events`, {
      uuid: input.uuid, events: [{ type: 'user.interrupt', ...(input.messageId ? { message_id: input.messageId } : {}) }],
    });
    return { accepted: true };
  }
}
