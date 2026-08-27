import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../prisma/prisma.service';

export type IdempotencyRunParams<T> = {
  partnerId: string;
  key: string | string[] | undefined;
  method: string;
  path: string;
  rawBody: string;
  execute: () => Promise<T>;
  responseCode: number;
};

@Injectable()
export class IdempotencyService {
  private static readonly WAIT_TIMEOUT_MS = 10_000;
  private static readonly WAIT_INTERVAL_MS = 50;

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(params: IdempotencyRunParams<T>): Promise<T> {
    const key = this.readKey(params.key);
    if (!key) {
      return params.execute();
    }

    const requestHash = createHash('sha256')
      .update(params.rawBody)
      .digest('hex');

    let row: { id: string };
    try {
      row = await this.prisma.idempotencyKey.create({
        data: {
          partnerId: params.partnerId,
          key,
          method: params.method,
          path: params.path,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return this.waitForSnapshot<T>(params.partnerId, key, requestHash);
      }
      throw error;
    }

    try {
      const result = await params.execute();
      await this.prisma.idempotencyKey.update({
        where: { id: row.id },
        data: {
          responseCode: params.responseCode,
          responseBody: result as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyKey.delete({ where: { id: row.id } });
      throw error;
    }
  }

  private readKey(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || value.trim() === '') {
      return null;
    }
    return value;
  }

  private async waitForSnapshot<T>(
    partnerId: string,
    key: string,
    requestHash: string,
  ): Promise<T> {
    const deadline = Date.now() + IdempotencyService.WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const snapshot = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT 1 FROM idempotency_keys
          WHERE partner_id = ${partnerId}::uuid AND key = ${key}
          FOR UPDATE
        `;

        const existing = await tx.idempotencyKey.findUnique({
          where: { partnerId_key: { partnerId, key } },
        });

        if (!existing) {
          return null;
        }

        if (existing.requestHash !== requestHash) {
          throw new DomainException(
            1043,
            'idempotency_conflict',
            'Idempotency-Key was reused with a different request body.',
            { key },
            409,
          );
        }

        if (existing.responseCode === null || existing.responseBody === null) {
          return undefined;
        }

        return existing.responseBody as T;
      });

      if (snapshot !== undefined && snapshot !== null) {
        return snapshot;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, IdempotencyService.WAIT_INTERVAL_MS),
      );
    }

    throw new DomainException(
      1043,
      'idempotency_conflict',
      'Idempotency-Key request is still in progress.',
      { key },
      409,
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
