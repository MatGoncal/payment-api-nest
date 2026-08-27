import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

describe('CreatePaymentDto', () => {
  it('rejects currency other than BRL', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      amount: 1500,
      currency: 'USD',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'currency')).toBe(true);
  });

  it('accepts BRL', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      amount: 1500,
      currency: 'BRL',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
