import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class FakePixProvider {
  createCharge(
    amountMinor: number,
    currency: string,
    paymentId: string,
  ): { qr_code: string; copy_paste: string; provider: string } {
    const emv = `00020126ACMEPAY.FAKE.PIX.${currency.toUpperCase()}.${amountMinor}.${Math.floor(Date.now() / 1000)}.${paymentId.slice(0, 8).toLowerCase()}`;

    return {
      qr_code: emv,
      copy_paste: emv,
      provider: 'fake_pix',
    };
  }

  syntheticPaymentId(): string {
    return randomUUID();
  }
}
