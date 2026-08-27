import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Partner, Payout } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { DomainException } from '../common/exceptions/domain.exception';
import { PayoutStatus } from '../common/enums';
import { toMinorUnits } from '../common/utils/money.util';
import { BalancesService } from '../balances/balances.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayoutDto } from './dto/create-payout.dto';

export const PROCESS_PAYOUT_QUEUE = 'process-payout';

/**
 * BullMQ deduplicates on job id, so a retried create request or a redelivered
 * enqueue collapses into the one job that already exists for this payout.
 * Custom ids may not contain `:`, which BullMQ reserves for its own keys.
 */
export function payoutJobId(payoutId: string): string {
  return `payout-${payoutId}`;
}

export type PayoutResponse = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  external_id: string | null;
  created_at: string;
};

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    @InjectQueue(PROCESS_PAYOUT_QUEUE) private readonly payoutQueue: Queue,
  ) {}

  async create(
    partner: Partner,
    dto: CreatePayoutDto,
  ): Promise<PayoutResponse> {
    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          id: randomUUID(),
          partnerId: partner.id,
          status: PayoutStatus.QUEUED,
          amount: BigInt(dto.amount),
          currency: dto.currency.toUpperCase(),
          destinationType: dto.destination.type,
          destinationValue: dto.destination.value,
          externalId: dto.external_id ?? null,
        },
      });

      await this.balances.reserve(
        tx,
        partner.id,
        dto.currency.toUpperCase(),
        BigInt(dto.amount),
      );

      return created;
    });

    await this.payoutQueue.add(
      'process',
      { payoutId: payout.id },
      { jobId: payoutJobId(payout.id) },
    );

    return this.toResponse(payout);
  }

  async process(payoutId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT 1 FROM "payouts" WHERE "id" = ${payoutId}::uuid FOR UPDATE
        `;

        const payout = await tx.payout.findUnique({ where: { id: payoutId } });

        if (!payout || payout.status !== 'QUEUED') {
          return;
        }

        await tx.payout.update({
          where: { id: payoutId },
          data: { status: PayoutStatus.PROCESSING },
        });

        try {
          await this.balances.confirmDebit(
            tx,
            payout.partnerId,
            payout.currency,
            payout.amount,
            'payout',
            payout.id,
            'Payout debit on confirm',
          );

          await tx.payout.update({
            where: { id: payoutId },
            data: {
              status: PayoutStatus.COMPLETED,
              completedAt: new Date(),
              failureCode: null,
              failureMessage: null,
            },
          });
        } catch (error) {
          // A domain failure is a business outcome: release the hold (if it
          // is still there) and record FAILED in the same commit.
          if (error instanceof DomainException) {
            try {
              await this.balances.release(
                tx,
                payout.partnerId,
                payout.currency,
                payout.amount,
              );
            } catch (releaseError) {
              if (!(releaseError instanceof DomainException)) {
                throw releaseError;
              }
            }

            await tx.payout.update({
              where: { id: payoutId },
              data: {
                status: PayoutStatus.FAILED,
                failureCode: String(error.errorCode),
                failureMessage: error.message,
              },
            });
            return;
          }
          throw error;
        }
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
  }

  toResponse(payout: Payout): PayoutResponse {
    return {
      id: payout.id,
      status: payout.status,
      amount: toMinorUnits(payout.amount),
      currency: payout.currency,
      external_id: payout.externalId,
      created_at: payout.createdAt.toISOString(),
    };
  }
}
