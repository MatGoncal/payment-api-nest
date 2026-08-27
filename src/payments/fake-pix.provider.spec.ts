import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePixProvider } from './fake-pix.provider';

const QR = '00020126ACMEPAY.FAKE.PIX.BRL.1500.1.demo';
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function testConfig(): ConfigService {
  return new ConfigService({
    FAKE_PIX_BASE_URL: 'http://127.0.0.1:8080',
    FAKE_PIX_API_KEY: 'fake-pix-demo',
    FAKE_PIX_CALLBACK_URL: 'http://127.0.0.1:3001/v1/webhooks/payment',
  });
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  return Promise.resolve({
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('FakePixProvider', () => {
  const provider = new FakePixProvider(testConfig());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts integer amount payment_id and callback_url to fake pix provider', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResponse(201, {
        id: 'chg_http',
        status: 'PENDING',
        qr_code: QR,
        copy_paste: QR,
        provider_tx_id: 'pix_tx_http',
      }),
    );

    const charge = await provider.createCharge(1500, 'BRL', PAYMENT_ID);

    expect(charge.qr_code).toMatch(/^00020126ACMEPAY\.FAKE\.PIX/);
    expect(charge.copy_paste).toMatch(/^00020126ACMEPAY\.FAKE\.PIX/);
    expect(charge.provider).toBe('fake_pix');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/charges');
    expect(init.method).toBe('POST');

    const rawBody = init.body;
    if (typeof rawBody !== 'string') {
      throw new Error('expected string body');
    }
    const data = JSON.parse(rawBody) as {
      amount: number;
      currency: string;
      payment_id: string;
      callback_url: string;
    };
    expect(data.amount).toBe(1500);
    expect(Number.isInteger(data.amount)).toBe(true);
    expect(data.currency).toBe('BRL');
    expect(data.payment_id).toBe(PAYMENT_ID);
    expect(data.callback_url).toBe('http://127.0.0.1:3001/v1/webhooks/payment');
  });

  it('throws 502 when fetch is refused', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      provider.createCharge(1500, 'BRL', PAYMENT_ID),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws 502 when provider returns non-201', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        jsonResponse(400, { error: 'invalid_currency' }),
      );

    await expect(
      provider.createCharge(1500, 'USD', PAYMENT_ID),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
