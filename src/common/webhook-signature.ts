import { createHmac, timingSafeEqual } from 'crypto';

export type VerifyWebhookSignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' };

export type ParsedWebhookSignature = {
  t: number;
  v1: string;
};

export function signWebhookBody(
  rawBody: string | Buffer,
  secret: string,
  timestamp: number,
): string {
  const v1 = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString()}`)
    .digest('hex');

  return `t=${timestamp},v1=${v1}`;
}

export function parseWebhookSignature(
  header: string,
): ParsedWebhookSignature | null {
  const parts: Record<string, string> = {};

  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=');
    if (eq === -1) {
      continue;
    }
    parts[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim();
  }

  const t = Number(parts.t);
  const v1 = parts.v1;

  if (!Number.isInteger(t) || t <= 0 || !v1 || !/^[0-9a-f]+$/i.test(v1)) {
    return null;
  }

  return { t, v1 };
}

export function verifyWebhookSignature(
  header: string | undefined,
  rawBody: string | Buffer,
  secret: string,
  nowSeconds: number,
  toleranceSeconds: number,
): VerifyWebhookSignatureResult {
  if (!header) {
    return { ok: false, reason: 'missing' };
  }

  const parsed = parseWebhookSignature(header);
  if (!parsed) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedHex = createHmac('sha256', secret)
    .update(`${parsed.t}.${rawBody.toString()}`)
    .digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(parsed.v1, 'hex');

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (Math.abs(nowSeconds - parsed.t) > toleranceSeconds) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, timestamp: parsed.t };
}
