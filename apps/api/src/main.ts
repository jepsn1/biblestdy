import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { configureClientIp, trustProxyFrom } from './http/client-ip';

async function bootstrap() {
  // Body parsing is re-added below — Better Auth must see the raw stream
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  // req.ip = real visitor behind Caddy; must run before the auth handler
  configureClientIp(
    app.getHttpAdapter().getInstance(),
    trustProxyFrom(process.env.TRUST_PROXY),
  );

  const authHandler = toNodeHandler(auth);
  // Better Auth owns /api/auth/*; everything else falls through to Nest
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api/auth/')) {
      void authHandler(req, res);
      return;
    }
    next();
  });
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
