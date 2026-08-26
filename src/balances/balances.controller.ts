import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { BalancesService } from './balances.service';

@ApiTags('balances')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/balances')
@UseGuards(ApiKeyGuard)
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  list(@CurrentPartner() partner: Partner) {
    return this.balancesService.listForPartner(partner);
  }
}
