import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
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

async function bootstrap() {
  // Body parsing is re-added below — Better Auth must see the raw stream
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');

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

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
