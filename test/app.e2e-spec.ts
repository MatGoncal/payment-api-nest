import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

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
});
