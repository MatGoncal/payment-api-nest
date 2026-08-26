import { Injectable } from '@nestjs/common';

/**
 * Synthetic FX rates — never float arithmetic for money conversion.
 */
@Injectable()
export class FakeFxProvider {
  private static readonly RATES: Record<string, string> = {
    BRL_USD: '0.18500000',
    BRL_EUR: '0.17100000',
    USD_BRL: '5.42000000',
    EUR_BRL: '5.85000000',
    USD_EUR: '0.92000000',
    EUR_USD: '1.08700000',
  };

  rate(sourceCurrency: string, targetCurrency: string): string {
    const source = sourceCurrency.toUpperCase();
    const target = targetCurrency.toUpperCase();

    if (source === target) {
      return '1.00000000';
    }

    return FakeFxProvider.RATES[`${source}_${target}`] ?? '1.00000000';
  }

  convert(
    sourceAmountMinor: number,
    sourceCurrency: string,
    targetCurrency: string,
  ): { rate: string; target_amount: number } {
    const rate = this.rate(sourceCurrency, targetCurrency);
    const [intPart, decPart = ''] = rate.split('.');
    const scale = decPart.length;
    const rateScaled = BigInt(intPart + decPart.padEnd(scale, '0'));
    const product = BigInt(sourceAmountMinor) * rateScaled;
    const divisor = BigInt(10 ** scale);
    let quotient = product / divisor;
    const remainder = product % divisor;

    if (remainder * 2n >= divisor) {
      quotient += 1n;
    }

    return { rate, target_amount: Number(quotient) };
  }
}
