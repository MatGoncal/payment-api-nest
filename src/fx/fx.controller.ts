import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { CreateFxQuoteDto } from './dto/create-fx-quote.dto';
import { FxService } from './fx.service';

@ApiTags('fx')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/fx/quotes')
@UseGuards(ApiKeyGuard)
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Post()
  async create(
    @CurrentPartner() partner: Partner,
    @Body() dto: CreateFxQuoteDto,
  ) {
    return this.fxService.createQuote(partner, dto);
  }
}
