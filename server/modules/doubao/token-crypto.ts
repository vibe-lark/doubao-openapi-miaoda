import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export interface Credential {
  accessToken: string; refreshToken: string; expiresAt: number;
  refreshExpiresAt: number; openId: string; name: string; avatarUrl?: string;
}
export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function seal(value: Credential, key: Buffer, owner: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function unseal(value: string, key: Buffer, owner: string): Credential {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(data.subarray(12, 28));
  const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
  if (!parsed || typeof parsed !== 'object') throw Error('凭据格式无效');
  const p = parsed as Record<string, unknown>;
  if (typeof p.accessToken !== 'string' || typeof p.refreshToken !== 'string' ||
      typeof p.expiresAt !== 'number' || typeof p.refreshExpiresAt !== 'number' ||
      typeof p.openId !== 'string' || typeof p.name !== 'string') throw Error('凭据格式无效');
  return { accessToken: p.accessToken, refreshToken: p.refreshToken, expiresAt: p.expiresAt,
    refreshExpiresAt: p.refreshExpiresAt, openId: p.openId, name: p.name, ...(typeof p.avatarUrl === 'string' ? { avatarUrl: p.avatarUrl } : {}) };
}
