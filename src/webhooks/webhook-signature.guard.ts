import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DomainException } from '../common/exceptions/domain.exception';
import { verifyWebhookSignature } from '../common/webhook-signature';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['x-acmepay-signature'];

    if (Array.isArray(signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException(
        'Missing raw body for signature verification',
      );
    }

    const secret = this.config.get<string>(
      'WEBHOOK_SECRET',
      'dev-webhook-secret',
    );
    const tolerance = parseInt(
      this.config.get<string>('WEBHOOK_TOLERANCE_SECONDS', '300') ?? '300',
      10,
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = verifyWebhookSignature(
      signature,
      rawBody,
      secret,
      nowSeconds,
      Number.isFinite(tolerance) ? tolerance : 300,
    );

    if (!result.ok && result.reason === 'expired') {
      throw new DomainException(
        1044,
        'webhook_timestamp_expired',
        'Webhook timestamp is outside the allowed tolerance.',
        {},
        401,
      );
    }

    if (!result.ok) {
      throw new UnauthorizedException(
        result.reason === 'missing'
          ? 'Missing webhook signature'
          : 'Invalid webhook signature',
      );
    }

    return true;
  }
}
