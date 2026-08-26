import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FakePixProvider } from './fake-pix.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, FakePixProvider],
  exports: [PaymentsService, FakePixProvider],
})
export class PaymentsModule {}
