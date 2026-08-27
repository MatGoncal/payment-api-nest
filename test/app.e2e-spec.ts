import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { signWebhookBody } from '../src/common/webhook-signature';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'dev-webhook-secret';
const WEBHOOK_BODY = {
  event_id: 'evt_e2e',
  provider: 'fake_pix',
  type: 'payment.paid',
  payment_id: '550e8400-e29b-41d4-a716-446655440000',
  occurred_at: '2026-08-26T18:00:00Z',
  data: { amount: 1500, currency: 'BRL' },
};

function expectErrorCode(body: unknown, code: number, name?: string): void {
  expect(JSON.stringify(body)).toContain(`"code":${code}`);
  if (name !== undefined) {
    expect(JSON.stringify(body)).toContain(`"name":"${name}"`);
  }
}

describe('App smoke (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        partner: { findFirst: jest.fn().mockResolvedValue(null) },
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(
      json({
        verify: (req, _res, buf) => {
          (req as { rawBody?: Buffer }).rawBody = buf;
        },
      }),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/payments without API key returns 401', () => {
    return request(app.getHttpServer())
      .post('/v1/payments')
      .send({ amount: 1500, currency: 'BRL' })
      .expect(401);
  });

  it('POST /v1/webhooks/payment with an old timestamp returns 401/1044', async () => {
    const raw = JSON.stringify(WEBHOOK_BODY);
    const signature = signWebhookBody(
      raw,
      WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000) - 301,
    );

    const response = await request(app.getHttpServer())
      .post('/v1/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-AcmePay-Signature', signature)
      .send(WEBHOOK_BODY)
      .expect(401);

    expectErrorCode(response.body, 1044, 'webhook_timestamp_expired');
  });

  it('POST /v1/webhooks/payment with a future timestamp beyond the window returns 401', async () => {
    const raw = JSON.stringify(WEBHOOK_BODY);
    const signature = signWebhookBody(
      raw,
      WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000) + 301,
    );

    await request(app.getHttpServer())
      .post('/v1/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-AcmePay-Signature', signature)
      .send(WEBHOOK_BODY)
      .expect(401);
  });

  it('POST /v1/webhooks/payment with a valid t and wrong v1 returns 401', async () => {
    const raw = JSON.stringify(WEBHOOK_BODY);
    const signature = `t=${Math.floor(Date.now() / 1000)},v1=${'ab'.repeat(32)}`;

    const response = await request(app.getHttpServer())
      .post('/v1/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-AcmePay-Signature', signature)
      .send(raw)
      .expect(401);

    expectErrorCode(response.body, 401);
  });
});
