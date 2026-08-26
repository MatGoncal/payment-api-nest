import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Partner } from '@prisma/client';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentPartner } from '../auth/current-partner.decorator';
import { CreateSplitsDto } from './dto/create-splits.dto';
import { SplitsService } from './splits.service';

@ApiTags('splits')
@ApiBearerAuth()
@ApiSecurity('ApiKeyAuth')
@Controller('v1/payments/:id/splits')
@UseGuards(ApiKeyGuard)
export class SplitsController {
  constructor(private readonly splitsService: SplitsService) {}

  @Post()
  define(
    @CurrentPartner() partner: Partner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSplitsDto,
  ) {
    return this.splitsService.define(partner, id, dto);
  }
}
