import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BalancesModule } from '../balances/balances.module';
import { PROCESS_PAYOUT_QUEUE, PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { ProcessPayoutProcessor } from './process-payout.processor';

@Module({
  imports: [
    AuthModule,
    BalancesModule,
    BullModule.registerQueue({ name: PROCESS_PAYOUT_QUEUE }),
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, ProcessPayoutProcessor],
  exports: [PayoutsService],
})
export class PayoutsModule {}
