import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../exceptions/domain.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainException) {
      return response.status(exception.httpStatus).json({
        error: {
          code: exception.errorCode,
          name: exception.errorName,
          message: exception.message,
          details: exception.details,
        },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (status === 401) {
        return response.status(status).json({
          error: {
            code: status,
            name: 'unauthorized',
            message:
              typeof body === 'string'
                ? body
                : ((body as { message?: string | string[] }).message ??
                  'Unauthorized'),
            details: {},
          },
        });
      }

      if (status === 404) {
        return response.status(status).json({
          error: {
            code: 404,
            name: 'not_found',
            message:
              typeof body === 'string'
                ? body
                : ((body as { message?: string | string[] }).message ??
                  'Not found'),
            details: {},
          },
        });
      }

      if (status === 400) {
        const messages = this.extractMessages(body);
        return response.status(status).json({
          error: {
            code: 422,
            name: 'validation_error',
            message: messages.join('; ') || 'Validation failed',
            details: { fields: messages },
          },
        });
      }

      return response.status(status).json({
        error: {
          code: status,
          name: 'http_error',
          message: exception.message,
          details: {},
        },
      });
    }

    console.error(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 500,
        name: 'internal_error',
        message: 'Internal server error',
        details: {},
      },
    });
  }

  private extractMessages(body: unknown): string[] {
    if (typeof body === 'string') {
      return [body];
    }
    const msg = (body as { message?: string | string[] }).message;
    if (Array.isArray(msg)) {
      return msg;
    }
    if (typeof msg === 'string') {
      return [msg];
    }
    return [];
  }
}
