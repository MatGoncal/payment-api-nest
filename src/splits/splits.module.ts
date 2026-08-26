import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SplitsController } from './splits.controller';
import { SplitsService } from './splits.service';

@Module({
  imports: [AuthModule],
  controllers: [SplitsController],
  providers: [SplitsService],
  exports: [SplitsService],
})
export class SplitsModule {}
