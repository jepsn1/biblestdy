import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('reports api health', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    const controller = module.get(AppController);
    expect(controller.getHealth()).toEqual({ status: 'ok', service: 'api' });
  });
});
