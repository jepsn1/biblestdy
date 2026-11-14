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
      highlightLabels: {},
    });
  });

  it('saves the choice and returns it on later reads (any device)', async () => {
    const { controller } = make();
    expect(await controller.update(as('u1'), { readerStyle: 'clean' })).toEqual(
      {
        readerStyle: 'clean',
        textSize: null,
        supportNoticeDismissed: false,
        highlightLabels: {},
      },
    );
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'clean',
      textSize: null,
      supportNoticeDismissed: false,
      highlightLabels: {},
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
      highlightLabels: {},
    });
  });

  it("is scoped per user: one user's choice never leaks to another", async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    expect(await controller.get(as('u2'))).toEqual({
      readerStyle: null,
      textSize: null,
      supportNoticeDismissed: false,
      highlightLabels: {},
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
      highlightLabels: {},
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
      highlightLabels: {},
    });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: 150,
      supportNoticeDismissed: false,
      highlightLabels: {},
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
      highlightLabels: {},
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
      highlightLabels: {},
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
      highlightLabels: {},
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
        highlightLabels: {},
      } as unknown as UpdatePreferencesDto),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Preferences API (highlight colour names)', () => {
  it('every colour starts unnamed (= its colour name in the UI language)', async () => {
    expect((await make().controller.get(as('u1'))).highlightLabels).toEqual({});
  });

  it('saves renamed colours (cleaned), and a later save replaces the map', async () => {
    const { controller } = make();
    const saved = await controller.update(as('u1'), {
      highlightLabels: { blue: '  God  speaking ', rose: 'Sin', green: '' },
    });
    expect(saved.highlightLabels).toEqual({
      blue: 'God speaking',
      rose: 'Sin',
    });
    await controller.update(as('u1'), { highlightLabels: { blue: 'Jesus' } });
    expect((await controller.get(as('u1'))).highlightLabels).toEqual({
      blue: 'Jesus',
    });
    // other preferences untouched, other users unaffected
    expect((await controller.get(as('u1'))).readerStyle).toBeNull();
    expect((await controller.get(as('u2'))).highlightLabels).toEqual({});
  });

  it('rejects unknown colours, non-strings and over-long names', async () => {
    const { controller } = make();
    for (const highlightLabels of [
      { teal: 'x' },
      { blue: 1 },
      { blue: 'x'.repeat(31) },
    ]) {
      await expect(
        controller.update(as('u1'), {
          highlightLabels,
        }),
      ).rejects.toThrow(BadRequestException);
    }
    expect((await controller.get(as('u1'))).highlightLabels).toEqual({});
  });

  it('DTO validation wants an object', async () => {
    const errs = async (body: object) =>
      (await validate(plainToInstance(UpdatePreferencesDto, body))).length;
    expect(await errs({ highlightLabels: { blue: 'God speaking' } })).toBe(0);
    expect(await errs({ highlightLabels: 'blue' })).toBeGreaterThan(0);
  });
});
