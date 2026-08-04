import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
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

import { AppModule } from '../src/app.module.js';
import { AppConfigService } from '../src/config/config.service.js';

type NodeHandler = (req: unknown, res: unknown) => unknown | Promise<unknown>;

let cachedHandler: NodeHandler | null = null;

async function createHandler(): Promise<NodeHandler> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

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
  await app.init();

  return app.getHttpAdapter().getInstance<NodeHandler>();
}

export default async function handler(req: unknown, res: unknown): Promise<unknown> {
  if (!cachedHandler) cachedHandler = await createHandler();
  return cachedHandler(req, res);
}
