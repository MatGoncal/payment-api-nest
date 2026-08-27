import {
  parseWebhookSignature,
  signWebhookBody,
  verifyWebhookSignature,
} from './webhook-signature';

const SECRET = 'test-webhook-secret';
const BODY = '{"event_id":"evt_1"}';
const NOW = 1_724_000_000;
const TOLERANCE = 300;

describe('webhook-signature', () => {
  it('parses t and v1 in either order', () => {
    expect(parseWebhookSignature('t=123,v1=abc')).toEqual({
      t: 123,
      v1: 'abc',
    });
    expect(parseWebhookSignature('v1=abc,t=123')).toEqual({
      t: 123,
      v1: 'abc',
    });
  });

  it('rejects a malformed header', () => {
    expect(parseWebhookSignature('sha256=deadbeef')).toBeNull();
    expect(parseWebhookSignature('t=nope,v1=abc')).toBeNull();
    expect(parseWebhookSignature('')).toBeNull();
  });

  it('accepts a signature inside the tolerance window', () => {
    const header = signWebhookBody(BODY, SECRET, NOW - 10);

    expect(
      verifyWebhookSignature(header, BODY, SECRET, NOW, TOLERANCE),
    ).toEqual({ ok: true, timestamp: NOW - 10 });
  });

  it('rejects a timestamp older than the window', () => {
    const header = signWebhookBody(BODY, SECRET, NOW - TOLERANCE - 1);

    expect(
      verifyWebhookSignature(header, BODY, SECRET, NOW, TOLERANCE),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a timestamp in the future beyond the window', () => {
    const header = signWebhookBody(BODY, SECRET, NOW + TOLERANCE + 1);

    expect(
      verifyWebhookSignature(header, BODY, SECRET, NOW, TOLERANCE),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a valid t with the wrong v1', () => {
    const header = `t=${NOW},v1=${'ab'.repeat(32)}`;

    expect(
      verifyWebhookSignature(header, BODY, SECRET, NOW, TOLERANCE),
    ).toEqual({ ok: false, reason: 'invalid' });
  });

  it('treats a missing header as missing, not expired', () => {
    expect(
      verifyWebhookSignature(undefined, BODY, SECRET, NOW, TOLERANCE),
    ).toEqual({ ok: false, reason: 'missing' });
  });
});
