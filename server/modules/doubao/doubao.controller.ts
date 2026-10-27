import { Body, Controller, Get, Headers, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CreateSessionRequest, SendMessageRequest, InterruptRequest, SessionQuery } from '../../../shared/api.interface';
import { DoubaoService } from './doubao.service';
import { DoubaoAuthService } from './doubao-auth.service';
class PageDto implements SessionQuery { @IsOptional() @IsString() @MaxLength(2048) pageToken?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}
class CreateDto implements CreateSessionRequest {
  @IsString() @MaxLength(36) uuid!: string;
  @IsString() @MaxLength(256) name!: string;
}
class SendDto implements SendMessageRequest {
  @IsString() @MaxLength(36) uuid!: string;
  @IsString() @MaxLength(32000) text!: string;
}
class InterruptDto implements InterruptRequest {
  @IsString() @MaxLength(36) uuid!: string;
  @IsOptional() @IsString() @MaxLength(256) messageId?: string;
}
@Controller('api/doubao')
@NeedLogin()
export class DoubaoController {
  constructor(private readonly service: DoubaoService, private readonly auth: DoubaoAuthService) {}
  private user(req: Request): string {
    if (!req.userContext?.userId || req.userContext.isSystemAccount) throw new UnauthorizedException('请先登录妙搭');
    return req.userContext.userId;
  }
  @Get('auth') info(@Req() req: Request) { return this.auth.info(this.user(req)); }
  @Post('auth/start') start(@Req() req: Request) { return this.auth.start(this.user(req)); }
  @Post('auth/complete') complete(@Req() req: Request,
    @Headers('x-doubao-oauth-code') code: string | undefined,
    @Headers('x-doubao-oauth-state') state: string | undefined) {
    // The platform traces bodies; keep short-lived OAuth secrets out of body logs.
    return this.auth.complete(this.user(req), { code: code || '', state: state || '' });
  }
  @Post('auth/cancel') cancel(@Req() req: Request) { return this.auth.cancel(this.user(req)); }
  @Post('auth/logout') logout(@Req() req: Request) { return this.auth.logout(this.user(req)); }
  @Get('sessions') sessions(@Req() req: Request, @Query() query: PageDto) {
    return this.service.sessions(this.user(req), query.pageToken);
  }
  @Post('sessions') create(@Req() req: Request, @Body() input: CreateDto) {
    return this.service.create(this.user(req), input);
  }
  @Get('sessions/:id') detail(@Req() req: Request, @Param('id') id: string) {
    return this.service.detail(this.user(req), id);
  }
  @Get('sessions/:id/messages') messages(@Req() req: Request, @Param('id') id: string, @Query() query: PageDto) {
    return this.service.messages(this.user(req), id, query.pageToken, query.order);
  }
  @Post('sessions/:id/events') send(@Req() req: Request, @Param('id') id: string, @Body() input: SendDto) {
    return this.service.send(this.user(req), id, input);
  }
  @Post('sessions/:id/interrupt') interrupt(@Req() req: Request, @Param('id') id: string, @Body() input: InterruptDto) {
    return this.service.interrupt(this.user(req), id, input);
  }
}
