import { PaymentStatus } from './enums';

/**
 * `PENDING` is the only open state. Once a charge settles, expires, fails or is
 * cancelled it is closed for good: a late or replayed provider event must never
 * be able to reopen it and move money.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<PaymentStatus, PaymentStatus[]>> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PAID,
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.PAID]: [],
  [PaymentStatus.EXPIRED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
};

/** The column is a plain string, so anything unrecognised is treated as closed. */
function allowedTransitions(from: string): PaymentStatus[] {
  return ALLOWED_TRANSITIONS[from as PaymentStatus] ?? [];
}

export const PaymentStateMachine = {
  allowedTransitions,

  canTransition(from: string, to: PaymentStatus): boolean {
    return allowedTransitions(from).includes(to);
  },

  isTerminal(from: string): boolean {
    return allowedTransitions(from).length === 0;
  },
};
