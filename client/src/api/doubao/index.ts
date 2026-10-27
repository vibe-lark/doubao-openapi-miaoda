import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { isAxiosError, type AxiosRequestConfig } from 'axios';
import type { AuthInfo, CompleteAuthRequest, CreateSessionRequest, InterruptRequest,
  MessageList, SendMessageRequest, SendMessageResponse, SessionItem, SessionList,
  StartAuthResponse } from '../../../../shared/api.interface';
export function errorText(error: unknown): string {
  if (isAxiosError<{ error?: { message?: string; fieldErrors?: Record<string, string[]> } }>(error)) {
    if (error.response?.status === 403) return '无操作权限，请联系应用管理员';
    return error.response?.data?.error?.message || '请求未成功，请稍后重试';
  }
  return error instanceof Error ? error.message : '请求未成功';
}
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await axiosForBackend<T>({ timeout: 25000, ...config });
    if (response.status === 403) throw new Error('无操作权限，请联系应用管理员');
    return response.data;
  } catch (error) { throw new Error(errorText(error)); }
}
const root = '/api/doubao';
const id = encodeURIComponent;
export const authInfo = () => request<AuthInfo>({ url: `${root}/auth` });
export const startAuth = () => request<StartAuthResponse>({ url: `${root}/auth/start`, method: 'POST' });
export const completeAuth = (data: CompleteAuthRequest) => request<AuthInfo>({ url: `${root}/auth/complete`, method: 'POST', data: {}, headers: { 'X-Doubao-OAuth-Code': data.code, 'X-Doubao-OAuth-State': data.state } });
export const cancelAuth = () => request<AuthInfo>({ url: `${root}/auth/cancel`, method: 'POST' });
export const logout = () => request<AuthInfo>({ url: `${root}/auth/logout`, method: 'POST' });
export const sessions = (pageToken?: string) => request<SessionList>({ url: `${root}/sessions`, params: { pageToken } });
export const createSession = (data: CreateSessionRequest) => request<SessionItem>({ url: `${root}/sessions`, method: 'POST', data });
export const detail = (sessionId: string) => request<SessionItem>({ url: `${root}/sessions/${id(sessionId)}` });
export const messages = (sessionId: string, pageToken?: string, order: 'asc' | 'desc' = 'desc') => request<MessageList>({ url: `${root}/sessions/${id(sessionId)}/messages`, params: { pageToken, order } });
export const sendMessage = (sessionId: string, data: SendMessageRequest) => request<SendMessageResponse>({ url: `${root}/sessions/${id(sessionId)}/events`, method: 'POST', data });
export const interrupt = (sessionId: string, data: InterruptRequest) => request<{ accepted: boolean }>({ url: `${root}/sessions/${id(sessionId)}/interrupt`, method: 'POST', data });
