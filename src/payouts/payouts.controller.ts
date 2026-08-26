import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('payouts')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/payouts')
@UseGuards(ApiKeyGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  @HttpCode(202)
  create(@CurrentPartner() partner: Partner, @Body() dto: CreatePayoutDto) {
    return this.payoutsService.create(partner, dto);
  }
}
