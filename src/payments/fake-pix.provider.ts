import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export type FakePixCharge = {
  qr_code: string;
  copy_paste: string;
  provider: string;
};

@Injectable()
export class FakePixProvider {
  constructor(private readonly config: ConfigService) {}

  async createCharge(
    amountMinor: number,
    currency: string,
    paymentId: string,
  ): Promise<FakePixCharge> {
    const baseUrl = this.config
      .get<string>('FAKE_PIX_BASE_URL', 'http://127.0.0.1:8080')
      .replace(/\/+$/, '');
    const apiKey = this.config.get<string>('FAKE_PIX_API_KEY', 'fake-pix-demo');
    const callbackUrl = this.config.get<string>(
      'FAKE_PIX_CALLBACK_URL',
      'http://127.0.0.1:3001/v1/webhooks/payment',
    );
    const url = `${baseUrl}/v1/charges`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          amount: amountMinor,
          currency,
          payment_id: paymentId,
          callback_url: callbackUrl,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      this.failGateway();
    }

    if (response.status !== 201) {
      this.failGateway();
    }

    let payload: { qr_code?: unknown; copy_paste?: unknown };
    try {
      payload = (await response.json()) as {
        qr_code?: unknown;
        copy_paste?: unknown;
      };
    } catch {
      this.failGateway();
    }

    const qrCode = payload.qr_code;
    const copyPaste = payload.copy_paste;
    if (
      typeof qrCode !== 'string' ||
      qrCode === '' ||
      typeof copyPaste !== 'string' ||
      copyPaste === ''
    ) {
      this.failGateway();
    }

    return {
      qr_code: qrCode,
      copy_paste: copyPaste,
      provider: 'fake_pix',
    };
  }

  syntheticPaymentId(): string {
    return randomUUID();
  }

  private failGateway(): never {
    throw new BadGatewayException('PIX provider unavailable.');
  }
}
