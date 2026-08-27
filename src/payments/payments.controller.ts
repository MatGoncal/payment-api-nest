import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { Request } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  async create(
    @CurrentPartner() partner: Partner,
    @Body() dto: CreatePaymentDto,
    @Req() request: Request & { rawBody?: Buffer },
  ) {
    return this.idempotency.run({
      partnerId: partner.id,
      key: request.headers['idempotency-key'],
      method: 'POST',
      path: '/v1/payments',
      rawBody: request.rawBody?.toString('utf8') ?? JSON.stringify(dto),
      execute: () => this.paymentsService.create(partner, dto),
      responseCode: 201,
    });
  }

  @Get()
  async list(
    @CurrentPartner() partner: Partner,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentsService.listForPartner(partner, query);
  }

  @Get(':id')
  async findOne(
    @CurrentPartner() partner: Partner,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.findForPartner(partner, id);
  }
}
