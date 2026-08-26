import { PaymentStatus } from './enums';
import { PaymentStateMachine } from './payment-state-machine';

describe('PaymentStateMachine', () => {
  const closed = [
    PaymentStatus.PAID,
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ];

  it.each(closed)('lets a pending payment reach %s', (target) => {
    expect(
      PaymentStateMachine.canTransition(PaymentStatus.PENDING, target),
    ).toBe(true);
  });

  it.each(closed)('closes %s for good', (from) => {
    expect(PaymentStateMachine.isTerminal(from)).toBe(true);

    for (const target of Object.values(PaymentStatus)) {
      expect(PaymentStateMachine.canTransition(from, target)).toBe(false);
    }
  });

  it.each([
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ])('refuses to settle a payment that already ended as %s', (from) => {
    expect(PaymentStateMachine.canTransition(from, PaymentStatus.PAID)).toBe(
      false,
    );
  });

  it('treats a repeated status as a no-op rather than a transition', () => {
    expect(
      PaymentStateMachine.canTransition(
        PaymentStatus.PENDING,
        PaymentStatus.PENDING,
      ),
    ).toBe(false);
  });

  it('treats an unknown status as closed', () => {
    expect(
      PaymentStateMachine.canTransition('WHATEVER', PaymentStatus.PAID),
    ).toBe(false);
  });
});
