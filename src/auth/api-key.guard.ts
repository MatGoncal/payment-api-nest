import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      partner?: unknown;
    }>();

    const rawKey = this.extractApiKey(request.headers);
    if (!rawKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const hash = createHash('sha256').update(rawKey).digest('hex');
    const partner = await this.prisma.partner.findFirst({
      where: { apiKeyHash: hash, isActive: true },
    });

    if (!partner) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.partner = partner;
    return true;
  }

  private extractApiKey(
    headers: Record<string, string | undefined>,
  ): string | null {
    const apiKeyHeader = headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    const auth = headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7).trim();
    }

    return null;
  }
}
