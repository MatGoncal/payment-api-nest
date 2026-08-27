import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { FakePixProvider } from './fake-pix.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, IdempotencyModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, FakePixProvider],
  exports: [PaymentsService, FakePixProvider],
})
export class PaymentsModule {}
