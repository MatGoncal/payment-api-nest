import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['x-acmepay-signature'];

    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing webhook signature');
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
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
