import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Partner, FxQuote, Prisma } from '@prisma/client';
import { DomainException } from '../common/exceptions/domain.exception';
import { toMinorUnits } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFxQuoteDto } from './dto/create-fx-quote.dto';
import { FakeFxProvider } from './fake-fx.provider';

export type FxQuoteResponse = {
  quote_id: string;
  source_currency: string;
  target_currency: string;
  source_amount: number;
  target_amount: number;
  rate: string;
  expires_at: string;
  created_at: string;
};

@Injectable()
export class FxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fxProvider: FakeFxProvider,
    private readonly config: ConfigService,
  ) {}

  async createQuote(
    partner: Partner,
    dto: CreateFxQuoteDto,
  ): Promise<FxQuoteResponse> {
    const source = dto.source_currency.toUpperCase();
    const target = dto.target_currency.toUpperCase();
    const converted = this.fxProvider.convert(dto.amount, source, target);
    const lockSeconds = this.config.get<number>('FX_RATE_LOCK_SECONDS', 300);

    const quote = await this.prisma.fxQuote.create({
      data: {
        partnerId: partner.id,
        sourceCurrency: source,
        targetCurrency: target,
        sourceAmount: BigInt(dto.amount),
        targetAmount: BigInt(converted.target_amount),
        rate: converted.rate,
        expiresAt: new Date(Date.now() + lockSeconds * 1000),
      },
    });

    return this.toResponse(quote);
  }

  /**
   * A rate lock is single use: claiming it stamps `consumed_at` so the same
   * quote can never price two conversions. Callers inside a transaction pass
   * their client so the claim commits with the rest of their work.
   */
  async consume(
    quoteId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<FxQuote> {
    this.assertUsable(
      await client.fxQuote.findUniqueOrThrow({ where: { id: quoteId } }),
    );

    // The guard travels with the write, so two callers racing on the same quote
    // cannot both walk away believing they claimed it.
    const claimed = await client.fxQuote.updateMany({
      where: { id: quoteId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const quote = await client.fxQuote.findUniqueOrThrow({
      where: { id: quoteId },
    });

    if (claimed.count === 0) {
      throw this.consumedException(quote);
    }

    return quote;
  }

  assertUsable(quote: FxQuote): void {
    if (quote.consumedAt !== null) {
      throw this.consumedException(quote);
    }

    if (quote.expiresAt.getTime() <= Date.now()) {
      throw new DomainException(
        1031,
        'quote_expired',
        'FX quote past expires_at (rate lock window).',
        {
          quote_id: quote.id,
          expires_at: quote.expiresAt.toISOString(),
        },
      );
    }
  }

  private consumedException(quote: FxQuote): DomainException {
    return new DomainException(
      1032,
      'quote_consumed',
      'FX quote already consumed; a rate lock can only be used once.',
      {
        quote_id: quote.id,
        consumed_at: quote.consumedAt?.toISOString() ?? null,
      },
    );
  }

  toResponse(quote: FxQuote): FxQuoteResponse {
    return {
      quote_id: quote.id,
      source_currency: quote.sourceCurrency,
      target_currency: quote.targetCurrency,
      source_amount: toMinorUnits(quote.sourceAmount),
      target_amount: toMinorUnits(quote.targetAmount),
      rate: quote.rate,
      expires_at: quote.expiresAt.toISOString(),
      created_at: quote.createdAt.toISOString(),
    };
  }
}
