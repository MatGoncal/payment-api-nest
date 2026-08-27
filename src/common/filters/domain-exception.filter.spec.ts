import { ArgumentsHost, BadGatewayException } from '@nestjs/common';
import { GlobalExceptionFilter } from './domain-exception.filter';

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('maps BadGatewayException to the bad_gateway envelope', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new BadGatewayException('PIX provider unavailable.'), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 502,
        name: 'bad_gateway',
        message: 'PIX provider unavailable.',
        details: {},
      },
    });
  });
});
