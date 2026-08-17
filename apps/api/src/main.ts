import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import {
  API_PREFIX,
  CSRF_HEADER,
  IDEMPOTENCY_HEADER,
  STEP_UP_HEADER,
  TRACE_HEADER,
} from '@reliance/contracts';

import { AppModule } from './app.module.js';
import { AppConfigService } from './config/config.service.js';

/**
 * Bootstrap.
 *
 * Order matters: proxy trust before anything can read `request.ip`, security headers
 * before anything can respond, cookies before any guard reads one, and the version prefix
 * before routes are mapped. Startup is deliberately fail-fast — a bad environment aborts
 * here rather than surfacing later as a 500.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  // Before anything reads `request.ip`. Off unless the operator opts in: an untrusted
  // `X-Forwarded-For` is caller-controlled, and treating it as an identity hands anyone
  // who rotates it a fresh rate-limit budget on every request.
  app.set('trust proxy', config.network.trustProxy);

  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.use(compression());
  app.use(cookieParser(config.cookies.csrfSecret));

  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      IDEMPOTENCY_HEADER,
      CSRF_HEADER,
      STEP_UP_HEADER,
      TRACE_HEADER,
    ],
    exposedHeaders: [TRACE_HEADER, 'Retry-After'],
  });

  app.setGlobalPrefix(API_PREFIX.slice(1));
  // The chat module's gateway speaks raw WebSocket; without this adapter the upgrade
  // request falls through to Express and the stream never opens. The global prefix
  // above does not apply to gateways — the gateway declares its own `/v1` path.
  app.useWebSocketAdapter(new WsAdapter(app.getHttpServer()));
  // No global ValidationPipe: validation is Zod, applied per-argument from the shared
  // contract schemas, so the API and the browser enforce the identical rule.
  app.enableShutdownHooks();

  if (!config.isProduction) mountOpenApi(app, config);

  await app.listen(config.port);

  logger.log(`Reliance Bank API listening on ${config.port} (${config.nodeEnv})`);
  logger.log(
    `Base currency ${config.bank.baseCurrency} · ${config.bank.currencies.length} currencies`,
  );
  if (config.simulation.clockEnabled) logger.warn('Simulated clock is ENABLED — time can be moved');
  if (config.network.trustProxy === true) {
    // Trusting every hop means a caller reachable directly can still choose their own
    // address. A hop count or an address list is the safe way to sit behind a proxy.
    logger.warn('TRUST_PROXY=true trusts every hop — prefer a hop count or an address list');
  }
  if (!config.email.enabled)
    logger.warn('RESEND_API_KEY is unset — emails will be logged, not sent');
  if (!config.media.enabled)
    logger.warn('Cloudinary is unconfigured — uploads will use the local fake');
}

function mountOpenApi(
  app: Parameters<typeof SwaggerModule.createDocument>[0],
  config: AppConfigService,
): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Reliance Bank API')
      .setDescription(
        'Core banking API. Every movement of value is a balanced double-entry journal ' +
          'entry; no real money is ever transferred.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('rb.at')
      .addServer(config.isProduction ? '/' : `http://localhost:${config.port}`)
      .build(),
  );

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Reliance Bank API',
  });
}

void bootstrap();
