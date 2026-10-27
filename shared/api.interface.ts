export const AUTH_STATUSES = ['idle', 'pending', 'exchanging', 'success', 'failed', 'cancelled'] as const;
export type AuthStatus = (typeof AUTH_STATUSES)[number];
export const isAuthStatus = (v: string): v is AuthStatus => (AUTH_STATUSES as readonly string[]).includes(v);
export const AUTH_STATUS_LABELS: Record<AuthStatus, string> = {
  idle: '未授权', pending: '等待授权', exchanging: '正在完成授权',
  success: '已授权', failed: '授权失败', cancelled: '已取消',
};
export interface AuthInfo {
  configured: boolean; authorized: boolean; status: AuthStatus;
  userId: string; accountName?: string; avatarUrl?: string; appId: string; callbackUrl: string;
}
export interface StartAuthResponse { authorizationUrl: string; state: string }
export interface CompleteAuthRequest { code: string; state: string }
export interface SessionItem { id: string; name: string; status: string; updatedAt: string }
export interface SessionList { sessions: SessionItem[]; hasMore: boolean; pageToken?: string }
export interface MessagePart { id: string; type: string; seq: number; text: string; name?: string; url?: string; summary?: { type: string; text: string }[] }
export interface ChatMessage {
  id: string; sessionId: string; replyId: string; role: string;
  status: string; createdAt: string; parts: MessagePart[];
}
export interface MessageList { messages: ChatMessage[]; hasMore: boolean; pageToken?: string }
export interface SessionQuery { pageToken?: string }
export interface CreateSessionRequest { uuid: string; name: string }
export interface SendMessageRequest { uuid: string; text: string }
export interface InterruptRequest { uuid: string; messageId?: string }
export interface SendMessageResponse { messages: ChatMessage[]; userMessageId: string }
