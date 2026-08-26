/** Serialize Prisma BigInt money fields to JSON-safe integers. */
export function toMinorUnits(value: bigint | number): number {
  return Number(value);
}

export function assertPositiveMinor(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer in minor units');
  }
}
