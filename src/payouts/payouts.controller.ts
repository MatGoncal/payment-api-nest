import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { Request } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('payouts')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/payouts')
@UseGuards(ApiKeyGuard)
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @HttpCode(202)
  create(
    @CurrentPartner() partner: Partner,
    @Body() dto: CreatePayoutDto,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    return this.idempotency.run({
      partnerId: partner.id,
      key: request.headers['idempotency-key'],
      method: 'POST',
      path: '/v1/payouts',
      rawBody: request.rawBody?.toString('utf8') ?? JSON.stringify(dto),
      execute: () => this.payoutsService.create(partner, dto),
      responseCode: 202,
    });
  }
}
