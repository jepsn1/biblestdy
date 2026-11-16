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
      highlightLabels: {},
      singleKeyShortcuts: true,
    });
  });

  it('saves the choice and returns it on later reads (any device)', async () => {
    const { controller } = make();
    expect(await controller.update(as('u1'), { readerStyle: 'clean' })).toEqual(
      {
        readerStyle: 'clean',
        textSize: null,
        highlightLabels: {},
        singleKeyShortcuts: true,
      },
    );
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'clean',
      textSize: null,
      highlightLabels: {},
      singleKeyShortcuts: true,
    });
  });

  it('switching style overwrites the previous one', async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    await controller.update(as('u1'), { readerStyle: 'paper' });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: 'paper',
      textSize: null,
      highlightLabels: {},
      singleKeyShortcuts: true,
    });
  });

  it("is scoped per user: one user's choice never leaks to another", async () => {
    const { controller } = make();
    await controller.update(as('u1'), { readerStyle: 'clean' });
    expect(await controller.get(as('u2'))).toEqual({
      readerStyle: null,
      textSize: null,
      highlightLabels: {},
      singleKeyShortcuts: true,
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
      highlightLabels: {},
      singleKeyShortcuts: true,
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
      highlightLabels: {},
      singleKeyShortcuts: true,
    });
    expect(await controller.get(as('u1'))).toEqual({
      readerStyle: null,
      textSize: 150,
      highlightLabels: {},
      singleKeyShortcuts: true,
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
      highlightLabels: {},
      singleKeyShortcuts: true,
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
      highlightLabels: {},
      singleKeyShortcuts: true,
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

  it('the retired support-notice field is no longer part of the API', async () => {
    const { controller } = make();
    expect(await controller.get(as('u1'))).not.toHaveProperty(
      'supportNoticeDismissed',
    );
    // An old client's field is ignored, never stored
    const saved = await controller.update(as('u1'), {
      supportNoticeDismissed: true,
      textSize: 125,
    } as unknown as UpdatePreferencesDto);
    expect(saved).not.toHaveProperty('supportNoticeDismissed');
    expect(saved.textSize).toBe(125);
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

describe('Preferences API (#145 single-key shortcuts)', () => {
  it('on until turned off; turned off follows the account', async () => {
    const { controller } = make();
    expect((await controller.get(as('u1'))).singleKeyShortcuts).toBe(true);
    await controller.update(as('u1'), { singleKeyShortcuts: false });
    expect((await controller.get(as('u1'))).singleKeyShortcuts).toBe(false);
    expect((await controller.get(as('u2'))).singleKeyShortcuts).toBe(true);
    await controller.update(as('u1'), { singleKeyShortcuts: true });
    expect((await controller.get(as('u1'))).singleKeyShortcuts).toBe(true);
  });

  it('wants a boolean', async () => {
    const errs = async (body: object) =>
      (await validate(plainToInstance(UpdatePreferencesDto, body))).length;
    expect(await errs({ singleKeyShortcuts: false })).toBe(0);
    expect(await errs({ singleKeyShortcuts: 'off' })).toBeGreaterThan(0);
    await expect(
      make().controller.update(as('u1'), {
        singleKeyShortcuts: 'off',
      } as unknown as UpdatePreferencesDto),
    ).rejects.toThrow(BadRequestException);
  });
});
