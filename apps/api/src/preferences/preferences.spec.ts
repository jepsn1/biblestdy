import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import type { AuthedRequest } from '../auth/session.guard';
import { InMemoryPreferencesStore } from './in-memory-store';
import { PreferencesController } from './preferences.controller';
import { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';

const as = (id: string) =>
  ({ user: { id, email: 'a@b.c', name: '' } }) as AuthedRequest;

function make() {
  const service = new PreferencesService(new InMemoryPreferencesStore());
  return { controller: new PreferencesController(service) };
}

describe('Preferences API (#45 reader style)', () => {
  it('a user who never chose has readerStyle null (→ onboarding chooser)', async () => {
    const { controller } = make();
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it('saves the choice and returns it on later reads (any device)', async () => {
    const { controller } = make();
    expect(await controller.update(as('u1'), { readerStyle: 'clean' })).toEqual(
      { readerStyle: 'clean', textSize: null, supportNoticeDismissed: false },
    );
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'clean',
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it('switching style overwrites the previous one', async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    await controller.update(as('u1'), { readerStyle: 'paper' });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'paper',
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it("is scoped per user: one user's choice never leaks to another", async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    expect(await controller.get(as('u2'))).toEqual({
      readerStyle: null,
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it('rejects an unknown style', async () => {
    const { controller } = make();
    await expect(
      controller.update(as('u1'), {
        readerStyle: 'neon',
      } as unknown as UpdatePreferencesDto),
    ).rejects.toThrow(BadRequestException);
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it('DTO validation accepts paper/clean only', async () => {
    const errs = async (body: unknown) =>
      (await validate(plainToInstance(UpdatePreferencesDto, body))).length;
    expect(await errs({ readerStyle: 'paper' })).toBe(0);
    expect(await errs({ readerStyle: 'clean' })).toBe(0);
    expect(await errs({ readerStyle: 'neon' })).toBeGreaterThan(0);
  });
});

describe('Preferences API (#61 text size)', () => {
  it('saves a text size and returns it on later reads', async () => {
    const { controller } = make();
    expect(await controller.update(as('u1'), { textSize: 150 })).toEqual({
      readerStyle: null,
      textSize: 150,
      supportNoticeDismissed: false,
    });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: 150,
      supportNoticeDismissed: false,
    });
  });

  it('a partial update never clobbers the other preference', async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    await controller.update(as('u1'), { textSize: 200 });
    await controller.update(as('u1'), { readerStyle: 'paper' });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'paper',
      textSize: 200,
      supportNoticeDismissed: false,
    });
  });

  it('rejects an unsupported size and an empty patch', async () => {
    const { controller } = make();
    await expect(
      controller.update(as('u1'), {
        textSize: 300,
      } as unknown as UpdatePreferencesDto),
    ).rejects.toThrow(BadRequestException);
    await expect(controller.update(as('u1'), {})).rejects.toThrow(
      BadRequestException,
    );
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: null,
      supportNoticeDismissed: false,
    });
  });

  it('DTO validation accepts the five steps only', async () => {
    const errs = async (body: unknown) =>
      (await validate(plainToInstance(UpdatePreferencesDto, body))).length;
    for (const size of [100, 125, 150, 175, 200]) {
      expect(await errs({ textSize: size })).toBe(0);
    }
    expect(await errs({ textSize: 110 })).toBeGreaterThan(0);
    expect(await errs({ textSize: '150' })).toBeGreaterThan(0);
    expect(await errs({ readerStyle: 'clean', textSize: 125 })).toBe(0);
  });

  it('support notice: dismissal is saved once and kept (one-way)', async () => {
    const { controller } = make();
    await controller.update(as('u1'), { textSize: 125 });
    expect(
      await controller.update(as('u1'), { supportNoticeDismissed: true }),
    ).toEqual({
      readerStyle: null,
      textSize: 125,
      supportNoticeDismissed: true,
    });
    expect((await controller.get(as('u2'))).supportNoticeDismissed).toBe(false);
  });

  it('support notice: only `true` validates', async () => {
    const errs = async (body: object) =>
      (await validate(plainToInstance(UpdatePreferencesDto, body))).length;
    expect(await errs({ supportNoticeDismissed: true })).toBe(0);
    expect(await errs({ supportNoticeDismissed: false })).toBeGreaterThan(0);
    await expect(
      make().controller.update(as('u1'), {
        supportNoticeDismissed: false,
      } as unknown as UpdatePreferencesDto),
    ).rejects.toThrow(BadRequestException);
  });
});
