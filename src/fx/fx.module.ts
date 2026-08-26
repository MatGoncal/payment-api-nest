import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FakeFxProvider } from './fake-fx.provider';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

@Module({
  imports: [AuthModule],
  controllers: [FxController],
  providers: [FxService, FakeFxProvider],
  exports: [FxService, FakeFxProvider],
})
export class FxModule {}
