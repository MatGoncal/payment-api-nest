import { Injectable } from '@nestjs/common';
import { Partner, Payment, PaymentSplit } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DomainException } from '../common/exceptions/domain.exception';
import { PaymentStateMachine } from '../common/payment-state-machine';
import { toMinorUnits } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSplitsDto } from './dto/create-splits.dto';

@Injectable()
export class SplitsService {
  constructor(private readonly prisma: PrismaService) {}

  async define(partner: Partner, paymentId: string, dto: CreateSplitsDto) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, partnerId: partner.id },
      });

      if (!payment) {
        throw new DomainException(
          404,
          'not_found',
          'Payment not found.',
          {},
          404,
        );
      }

      // Splits are the allocation rule applied at settlement, so they are only
      // editable while the payment can still settle. Rewriting them after the
      // money moved would leave the ledger describing a split that never
      // happened.
      if (PaymentStateMachine.isTerminal(payment.status)) {
        throw new DomainException(
          1015,
          'settlement_failed',
          'Cannot define splits on a payment that is no longer open.',
          { payment_id: payment.id, status: payment.status },
        );
      }

      const sum = dto.splits.reduce((acc, line) => acc + line.amount, 0);

      if (sum !== toMinorUnits(payment.amount)) {
        throw new DomainException(
          1015,
          'settlement_failed',
          'Split amounts must equal payment amount.',
          {
            payment_amount: toMinorUnits(payment.amount),
            splits_sum: sum,
          },
        );
      }

      await tx.paymentSplit.deleteMany({ where: { paymentId: payment.id } });

      const created: PaymentSplit[] = [];
      for (const line of dto.splits) {
        created.push(
          await tx.paymentSplit.create({
            data: {
              id: randomUUID(),
              paymentId: payment.id,
              party: line.party,
              amount: BigInt(line.amount),
            },
          }),
        );
      }

      return {
        payment_id: payment.id,
        splits: created.map((s) => ({
          party: s.party,
          amount: toMinorUnits(s.amount),
        })),
      };
    });
  }

  async assertValidForSettlement(payment: Payment): Promise<void> {
    const lines = await this.prisma.paymentSplit.findMany({
      where: { paymentId: payment.id },
    });

    if (lines.length === 0) {
      return;
    }

    const sum = lines.reduce((acc, line) => acc + toMinorUnits(line.amount), 0);

    if (sum !== toMinorUnits(payment.amount)) {
      throw new DomainException(
        1015,
        'settlement_failed',
        'Split allocation invalid at settlement.',
        {
          payment_id: payment.id,
          payment_amount: toMinorUnits(payment.amount),
          splits_sum: sum,
        },
      );
    }
  }
}
