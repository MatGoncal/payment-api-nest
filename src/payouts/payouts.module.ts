import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BalancesModule } from '../balances/balances.module';
import { MONEY_JOB_OPTIONS } from '../common/queue.config';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PROCESS_PAYOUT_QUEUE, PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { ProcessPayoutProcessor } from './process-payout.processor';

@Module({
  imports: [
    AuthModule,
    BalancesModule,
    IdempotencyModule,
    BullModule.registerQueue({
      name: PROCESS_PAYOUT_QUEUE,
      defaultJobOptions: MONEY_JOB_OPTIONS,
    }),
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, ProcessPayoutProcessor],
  exports: [PayoutsService],
})
export class PayoutsModule {}
