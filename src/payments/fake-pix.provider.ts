import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export type FakePixCharge = {
  id: string;
  qr_code: string;
  copy_paste: string;
  provider: string;
};

@Injectable()
export class FakePixProvider {
  private readonly logger = new Logger(FakePixProvider.name);

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
    } catch (err: unknown) {
      this.logger.warn(
        `PIX provider unavailable: ${this.connectionReason(err)}`,
      );
      this.failGateway();
    }

    if (response.status !== 201 && response.status !== 200) {
      this.logger.warn(
        `PIX provider unavailable: HTTP ${response.status} ${await this.bodySnippet(response)}`,
      );
      this.failGateway();
    }

    let payload: { id?: unknown; qr_code?: unknown; copy_paste?: unknown };
    try {
      payload = (await response.json()) as {
        id?: unknown;
        qr_code?: unknown;
        copy_paste?: unknown;
      };
    } catch {
      this.logger.warn('PIX provider unavailable: invalid payload');
      this.failGateway();
    }

    const id = payload.id;
    const qrCode = payload.qr_code;
    const copyPaste = payload.copy_paste;
    if (
      typeof id !== 'string' ||
      id === '' ||
      typeof qrCode !== 'string' ||
      qrCode === '' ||
      typeof copyPaste !== 'string' ||
      copyPaste === ''
    ) {
      this.logger.warn('PIX provider unavailable: invalid payload');
      this.failGateway();
    }

    return {
      id,
      qr_code: qrCode,
      copy_paste: copyPaste,
      provider: 'fake_pix',
    };
  }

  syntheticPaymentId(): string {
    return randomUUID();
  }

  private connectionReason(err: unknown): string {
    const name = err instanceof Error ? err.name : '';
    const message =
      err instanceof Error
        ? err.message.toLowerCase()
        : String(err).toLowerCase();
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('aborted')
    ) {
      return 'timeout';
    }
    return 'connection refused';
  }

  private async bodySnippet(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 200);
    } catch {
      return '';
    }
  }

  private failGateway(): never {
    throw new BadGatewayException('PIX provider unavailable.');
  }
}
