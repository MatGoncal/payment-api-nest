import { FakeFxProvider } from './fake-fx.provider';

describe('FakeFxProvider money conversion', () => {
  const provider = new FakeFxProvider();

  it('returns rate as decimal string', () => {
    expect(provider.rate('BRL', 'USD')).toBe('0.18500000');
  });

  it('converts BRL to USD with integer minor units (half-up)', () => {
    const result = provider.convert(10000, 'BRL', 'USD');
    expect(result.rate).toBe('0.18500000');
    expect(result.target_amount).toBe(1850);
    expect(Number.isInteger(result.target_amount)).toBe(true);
  });

  it('returns 1.00000000 for same currency', () => {
    const result = provider.convert(5000, 'EUR', 'EUR');
    expect(result.rate).toBe('1.00000000');
    expect(result.target_amount).toBe(5000);
  });
});
