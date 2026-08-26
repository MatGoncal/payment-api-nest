export class DomainException extends Error {
  constructor(
    public readonly errorCode: number,
    public readonly errorName: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly httpStatus = 422,
  ) {
    super(message);
    this.name = 'DomainException';
  }
}
