import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DoubaoController } from './doubao.controller';
import { DoubaoService } from './doubao.service';
import { DoubaoAuthService } from './doubao-auth.service';
@Module({ imports: [HttpModule], controllers: [DoubaoController], providers: [DoubaoService, DoubaoAuthService] })
export class DoubaoModule {}
