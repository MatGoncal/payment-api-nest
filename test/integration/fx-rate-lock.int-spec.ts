import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../src/common/exceptions/domain.exception';
import { FakeFxProvider } from '../../src/fx/fake-fx.provider';
import { FxService } from '../../src/fx/fx.service';
import { createFxQuote, createPartner } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('FX rate lock is single use', () => {
  const db = withTestDb();

  let fx: FxService;

  beforeAll(() => {
    fx = new FxService(db.prisma, new FakeFxProvider(), new ConfigService());
  });

  it('stamps consumed_at when a quote is claimed', async () => {
    const partner = await createPartner(db.prisma);
    const quote = await createFxQuote(db.prisma, partner);

    expect(quote.consumedAt).toBeNull();

    const consumed = await fx.consume(quote.id);

    expect(consumed.consumedAt).not.toBeNull();
  });

  it('refuses to consume the same rate lock twice', async () => {
    const partner = await createPartner(db.prisma);
    const quote = await createFxQuote(db.prisma, partner);

    await fx.consume(quote.id);

    await expect(fx.consume(quote.id)).rejects.toMatchObject({
      errorCode: 1032,
      errorName: 'quote_consumed',
    });
  });

  it('keeps the original consumption timestamp when a reuse is rejected', async () => {
    const partner = await createPartner(db.prisma);
    const quote = await createFxQuote(db.prisma, partner);

    const claimedAt = (await fx.consume(quote.id)).consumedAt;

    await expect(fx.consume(quote.id)).rejects.toThrow(DomainException);

    const stored = await db.prisma.fxQuote.findUniqueOrThrow({
      where: { id: quote.id },
    });

    expect(stored.consumedAt).toEqual(claimedAt);
  });

  it('lets only one of two simultaneous claims through', async () => {
    const partner = await createPartner(db.prisma);
    const quote = await createFxQuote(db.prisma, partner);

    const results = await Promise.allSettled([
      fx.consume(quote.id),
      fx.consume(quote.id),
    ]);

    // Both callers read an unconsumed quote; only the conditional update decides.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('refuses to consume a quote past its rate lock window', async () => {
    const partner = await createPartner(db.prisma);
    const quote = await createFxQuote(db.prisma, partner, {
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(fx.consume(quote.id)).rejects.toMatchObject({
      errorCode: 1031,
      errorName: 'quote_expired',
    });

    const stored = await db.prisma.fxQuote.findUniqueOrThrow({
      where: { id: quote.id },
    });

    expect(stored.consumedAt).toBeNull();
  });
});
