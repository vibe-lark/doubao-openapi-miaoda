import { randomBytes } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable,
  Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { doubaoAccount } from '../../database/schema';
import type { AuthInfo, StartAuthResponse, CompleteAuthRequest } from '../../../shared/api.interface';
import { isAuthStatus } from '../../../shared/api.interface';
import { hash, seal, unseal, type Credential } from './token-crypto';
import { object, string } from './protocol';

@Injectable()
export class DoubaoAuthService {
  private readonly logger = new Logger(DoubaoAuthService.name);
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly http: HttpService) {}
  private config() {
    const appId = process.env.DOUBAO_APP_ID || '';
    const appSecret = process.env.DOUBAO_APP_SECRET || '';
    const callbackUrl = process.env.DOUBAO_REDIRECT_URI || '';
    const key = Buffer.from(process.env.DOUBAO_TOKEN_KEY || '', 'base64');
    const scopes = process.env.DOUBAO_SCOPES || '';
    const configured = /^cli_[\w-]+$/.test(appId) && !!appSecret && key.length === 32 &&
      /^https:\/\//.test(callbackUrl) && !!scopes.trim();
    return { appId, appSecret, callbackUrl, key, scopes, configured };
  }
  private requiredConfig() {
    const config = this.config();
    if (!config.configured) throw new ServiceUnavailableException('尚未配置豆包应用授权，请联系应用开发者');
    return config;
  }
  private owner(userId: string) { return eq(doubaoAccount.owner, userId); }
  private async account(userId: string) {
    return (await this.db.select().from(doubaoAccount).where(this.owner(userId)).limit(1))[0];
  }
  private decode(encrypted: string, userId: string) {
    const c = this.requiredConfig();
    try { return unseal(encrypted, c.key, `${c.appId}:${userId}`); }
    catch { throw new UnauthorizedException('授权已失效，请重新授权'); }
  }
  async info(userId: string): Promise<AuthInfo> {
    const config = this.config();
    const row = await this.account(userId);
    const token = row?.encryptedToken && config.configured ? this.decode(row.encryptedToken, userId) : null;
    return { configured: config.configured, authorized: !!token &&
      (token.expiresAt > Date.now() || token.refreshExpiresAt > Date.now()),
      status: row && isAuthStatus(row.authStatus) ? row.authStatus : 'idle',
      userId, accountName: token?.name, avatarUrl: token?.avatarUrl, appId: config.appId, callbackUrl: config.callbackUrl };
  }
  async start(userId: string): Promise<StartAuthResponse> {
    const config = this.requiredConfig();
    const state = randomBytes(32).toString('hex');
    await this.db.insert(doubaoAccount).values({ owner: userId }).onConflictDoNothing();
    await this.db.update(doubaoAccount).set({ authStateHash: hash(state), authStatus: 'pending',
      authExpiresAt: Date.now() + 600000, version: sql`${doubaoAccount.version} + 1` })
      .where(this.owner(userId));
    const url = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
    url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.callbackUrl,
      response_type: 'code', scope: config.scopes, state, prompt: 'consent' }).toString();
    return { authorizationUrl: url.href, state };
  }
  private async exchange(body: Record<string, string>): Promise<Record<string, unknown>> {
    const config = this.requiredConfig();
    try {
      const response = await this.http.axiosRef.post<unknown>('https://accounts.feishu.cn/oauth/v3/token',
        { client_id: config.appId, client_secret: config.appSecret, ...body },
        { timeout: 12000, maxRedirects: 0 });
      const payload = object(response.data);
      if (payload.error || payload.code) throw new Error('oauth_error');
      return object(payload.data || payload);
    } catch { throw new UnauthorizedException('授权未完成或已过期，请重新授权'); }
  }
  private credential(raw: Record<string, unknown>, profile: { openId: string; name: string; avatarUrl?: string }, old?: Credential): Credential {
    const accessToken = string(raw.access_token);
    const refreshToken = string(raw.refresh_token) || old?.refreshToken || '';
    const refreshSeconds = Number(raw.refresh_token_expires_in ?? raw.refresh_expires_in);
    if (!accessToken || !refreshToken || !(Number(raw.expires_in) > 0) ||
      (!old && !(refreshSeconds > 0)) || (raw.open_id && raw.open_id !== profile.openId)) {
      throw new BadGatewayException('授权凭据不完整，请检查应用权限与 offline_access 授权');
    }
    return { accessToken, refreshToken, expiresAt: Date.now() + Number(raw.expires_in) * 1000,
      refreshExpiresAt: refreshSeconds > 0 ? Date.now() + refreshSeconds * 1000 : old!.refreshExpiresAt,
      openId: profile.openId, name: profile.name, avatarUrl: profile.avatarUrl };
  }
  async complete(userId: string, input: CompleteAuthRequest): Promise<AuthInfo> {
    if (!/^[a-f0-9]{64}$/.test(input.state || '') || !input.code || input.code.length > 4096) {
      throw new BadRequestException('授权回调参数无效');
    }
    const stateHash = hash(input.state);
    const [row] = await this.db.update(doubaoAccount).set({ authStatus: 'exchanging' })
      .where(and(this.owner(userId), eq(doubaoAccount.authStateHash, stateHash),
        eq(doubaoAccount.authStatus, 'pending'), gt(doubaoAccount.authExpiresAt, Date.now())))
      .returning();
    if (!row) throw new BadRequestException('授权会话已取消、过期或已经使用，请回原页面重试');
    const fence = and(this.owner(userId), eq(doubaoAccount.version, row.version),
      eq(doubaoAccount.authStateHash, stateHash), eq(doubaoAccount.authStatus, 'exchanging'));
    try {
      const config = this.requiredConfig();
      const raw = await this.exchange({ grant_type: 'authorization_code', code: input.code,
        redirect_uri: config.callbackUrl });
      const result = await this.http.axiosRef.get<unknown>('https://open.larkoffice.com/open-apis/authen/v1/user_info',
        { headers: { Authorization: `Bearer ${string(raw.access_token)}` }, timeout: 10000, maxRedirects: 0 });
      const payload = object(result.data);
      const profile = object(payload.data);
      if (payload.code !== 0 || !string(profile.open_id)) throw new UnauthorizedException('无法确认授权账号');
      const credential = this.credential(raw, { openId: string(profile.open_id), name: string(profile.name), avatarUrl: string(profile.avatar_url) });
      const saved = await this.db.update(doubaoAccount).set({
        encryptedToken: seal(credential, config.key, `${config.appId}:${userId}`),
        authStatus: 'success', authStateHash: null, refreshLockUntil: 0,
        version: sql`${doubaoAccount.version} + 1`,
      }).where(fence).returning({ id: doubaoAccount.id });
      if (!saved.length) throw new ConflictException('授权过程中账号状态已改变，请重新授权');
      return this.info(userId);
    } catch (error) {
      await this.db.update(doubaoAccount).set({ authStatus: 'failed', authStateHash: null }).where(fence);
      // Do not log Axios errors: they contain OAuth codes, secrets and tokens.
      this.logger.warn('OAuth completion failed; credential details omitted');
      if (error instanceof BadRequestException || error instanceof UnauthorizedException ||
        error instanceof ConflictException || error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('保存授权失败，请重新授权');
    }
  }
  async cancel(userId: string) {
    await this.db.update(doubaoAccount).set({ authStatus: 'cancelled', authStateHash: null,
      version: sql`${doubaoAccount.version} + 1` }).where(and(this.owner(userId),
      sql`${doubaoAccount.authStatus} IN ('pending','exchanging')`));
    return this.info(userId);
  }
  async logout(userId: string) {
    await this.db.update(doubaoAccount).set({ encryptedToken: null, authStateHash: null,
      authStatus: 'idle', refreshLockUntil: 0, version: sql`${doubaoAccount.version} + 1` })
      .where(this.owner(userId));
    return this.info(userId);
  }
  async access(userId: string): Promise<string> {
    const row = await this.account(userId);
    if (!row?.encryptedToken) throw new UnauthorizedException('请先授权登录豆包');
    const token = this.decode(row.encryptedToken, userId);
    if (token.expiresAt > Date.now() + 60000) return token.accessToken;
    if (token.refreshExpiresAt <= Date.now()) throw new UnauthorizedException('授权已过期，请重新授权');
    const lockUntil = Date.now() + 30000;
    const [locked] = await this.db.update(doubaoAccount).set({ refreshLockUntil: lockUntil })
      .where(and(this.owner(userId), eq(doubaoAccount.version, row.version),
        lt(doubaoAccount.refreshLockUntil, Date.now()))).returning();
    if (!locked) throw new ConflictException('授权正在刷新，请稍后重试');
    const fence = and(this.owner(userId), eq(doubaoAccount.version, row.version),
      eq(doubaoAccount.refreshLockUntil, lockUntil));
    try {
      const next = this.credential(await this.exchange({ grant_type: 'refresh_token',
        refresh_token: token.refreshToken }), token, token);
      const config = this.requiredConfig();
      const saved = await this.db.update(doubaoAccount).set({
        encryptedToken: seal(next, config.key, `${config.appId}:${userId}`), refreshLockUntil: 0,
        version: sql`${doubaoAccount.version} + 1`,
      }).where(fence).returning({ id: doubaoAccount.id });
      if (!saved.length) throw new UnauthorizedException('账号状态已改变，请重新授权');
      return next.accessToken;
    } catch {
      // Refresh rotation may have succeeded upstream: don't reuse an uncertain old refresh token.
      await this.db.update(doubaoAccount).set({ encryptedToken: null, refreshLockUntil: 0,
        authStatus: 'failed', version: sql`${doubaoAccount.version} + 1` }).where(fence);
      throw new UnauthorizedException('刷新授权未成功，请重新授权');
    }
  }
}
