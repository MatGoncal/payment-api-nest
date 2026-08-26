import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(
    @CurrentPartner() partner: Partner,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(partner, dto);
  }

  @Get(':id')
  async findOne(
    @CurrentPartner() partner: Partner,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.findForPartner(partner, id);
  }
}
