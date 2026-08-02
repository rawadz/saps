import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './presentation/filters/prisma-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Security headers on every response — set as the FIRST middleware so they apply
  // to all routes and error responses. Defaults suit a JSON API (no web UI served).
  app.use(helmet());

  const config = app.get(ConfigService);

  // CORS: enabled only when CORS_ORIGINS is set (production, cross-origin SPA). In dev
  // the Vite proxy keeps the browser same-origin, so this stays off. Auth is via the
  // Authorization header (no cookies), so credentials are not enabled.
  const corsOrigins = config.get<string[]>('cors.origins') ?? [];
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }

  // Validate and sanitise every incoming DTO before it reaches a controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared on the DTO
      forbidNonWhitelisted: true, // reject requests carrying unexpected fields
      transform: true, // coerce payloads into their DTO classes
    }),
  );

  // Map Prisma P2002 (unique-constraint violation) to a clean 409 instead of a
  // misleading 500 — a global backstop behind the use-cases' fast-path pre-checks.
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Close the Postgres pool and Redis connection cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);

  new Logger('Bootstrap').log(`e-SAPS API listening on port ${port}`);
}

void bootstrap();
