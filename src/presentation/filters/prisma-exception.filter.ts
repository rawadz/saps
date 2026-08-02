import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Global filter that maps Prisma KNOWN request errors to clean HTTP responses.
 * Currently handles P2002 (unique-constraint violation) → 409 Conflict, so a
 * duplicate value surfaces as a client error instead of a misleading 500.
 *
 * SECURITY: the raw Prisma message and `meta` (which name the constraint, table
 * and columns) are NEVER sent to the client — only a generic code is returned.
 * The detail is logged server-side WITHOUT the offending values (which may be
 * sensitive, e.g. a username or permit number); only the error code and the
 * column names from meta.target are logged.
 *
 * Any Prisma known error other than P2002 is RE-THROWN unchanged so existing
 * behaviour (default 500) is preserved — this filter must not swallow them.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    // Only P2002 is handled here; everything else must propagate untouched.
    if (exception.code !== 'P2002') {
      // Re-throw so Nest's default handling (500) still applies to other codes.
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // meta.target lists the column(s) that conflicted — names only, no values.
    const target = exception.meta?.target;
    this.logger.warn(
      `Unique constraint violation (P2002) on: ${JSON.stringify(target)}`,
    );

    // Generic, non-revealing payload — matches the project's error shape.
    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'CONFLICT',
    });
  }
}
