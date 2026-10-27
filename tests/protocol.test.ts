import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { seal, unseal, type Credential } from '../server/modules/doubao/token-crypto';
import { message, session } from '../server/modules/doubao/protocol';
describe('credential security', () => {
  const token: Credential = { accessToken: 'test-access', refreshToken: 'test-refresh',
    expiresAt: 100, refreshExpiresAt: 200, openId: 'test-user', name: '测试账号' };
  const key = randomBytes(32);
  test('encrypts and binds to app and current user', () => {
    const encrypted = seal(token, key, 'app:owner');
    expect(encrypted).not.toContain('test-access');
    expect(unseal(encrypted, key, 'app:owner')).toEqual(token);
    expect(() => unseal(encrypted, key, 'app:other-user')).toThrow();
    expect(() => unseal(encrypted, randomBytes(32), 'app:owner')).toThrow();
  });
});
describe('Doubao response contract', () => {
  test('retains assistant reply relation and sorts content parts', () => {
    const result = message({ id: 'assistant', session_id: 'session', reply_id: 'user-message',
      role: 'assistant', status: 'completed', items: [{ id: 'p2', type: 'text', seq: 2, text: '二' },
        { id: 'p1', type: 'text', seq: 1, text: '一' }] });
    expect(result.replyId).toBe('user-message');
    expect(result.parts.map(p => p.text)).toEqual(['一', '二']);
  });
  test('keeps empty terminal snapshot and rejects missing identity', () => {
    expect(message({ id: 'reply', status: 'completed', items: [] }).parts).toEqual([]);
    expect(() => session({ name: 'missing id' })).toThrow();
  });
});

describe('original UI content contract', () => {
  test('preserves reasoning summaries, tool names and linked content', () => {
    const result = message({ id: 'a1', items: [
      { id: 'r', type: 'reasoning', seq: 1, summary: [{ type: 'summary_text', text: '摘要' }] },
      { id: 't', type: 'tool_call', seq: 2, tool_name: '文档检索' },
      { id: 'f', type: 'file', seq: 3, url: 'https://example.com/file' },
    ] });
    expect(result.parts[0].summary).toEqual([{ type: 'summary_text', text: '摘要' }]);
    expect(result.parts[1].name).toBe('文档检索');
    expect(result.parts[2].url).toBe('https://example.com/file');
  });
  test('retains the OAuth account avatar in encrypted credentials', () => {
    const key = randomBytes(32);
    const value: Credential = { accessToken: 'test', refreshToken: 'test', expiresAt: 100,
      refreshExpiresAt: 200, openId: 'user', name: '测试用户', avatarUrl: 'https://example.com/avatar' };
    expect(unseal(seal(value, key, 'owner'), key, 'owner')).toEqual(value);
  });
});
