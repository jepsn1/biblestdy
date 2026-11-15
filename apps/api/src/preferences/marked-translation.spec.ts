import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthedRequest } from '../auth/session.guard';
import { db } from '../db';
import { user } from '../db/auth-schema';
import { annotation, highlight, note, noteAnchor } from '../db/schema';
import { InMemoryPreferencesStore } from './in-memory-store';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';
import { DrizzlePreferencesStore } from './preferences.store';

const as = (id: string) =>
  ({ user: { id, email: 'a@b.c', name: '' } }) as AuthedRequest;

describe('GET /api/preferences/marked-translation', () => {
  it("returns the account's marked translation, scoped per user", async () => {
    const store = new InMemoryPreferencesStore();
    store.marked.set('u1', 'niv');
    const controller = new PreferencesController(new PreferencesService(store));
    expect(await controller.markedTranslation(as('u1'))).toEqual({
      translationId: 'niv',
    });
    expect(await controller.markedTranslation(as('u2'))).toEqual({
      translationId: null,
    });
  });
});

/**
 * The real query against the DEV database (a throwaway user, cascaded away
 * afterwards). Runs only when DATABASE_URL names a dev/test database.
 */
const devDb = /\/[\w-]+_(dev|test)(\?|$)/.test(process.env.DATABASE_URL ?? '');

describe.runIf(devDb)('DrizzlePreferencesStore.markedTranslationId', () => {
  const store = new DrizzlePreferencesStore();
  const ids = [randomUUID(), randomUUID()];
  const span = { book: 'JHN', chapter: 3, startVerse: 16, startWord: 0 };
  const at = { ...span, endVerse: 16, endWord: 3 };
  let liveNote = '';

  beforeAll(async () => {
    await db.insert(user).values(
      ids.map((id) => ({
        id,
        name: '',
        email: `marked-${id}@example.invalid`,
      })),
    );
    const [u, other] = ids;
    // u: 2 NIV marks (highlight + annotation) vs 1 live BPH note anchor,
    // and 3 deleted BPH highlights + a deleted BPH note that must not count
    await db.insert(highlight).values([
      { userId: u, translationId: 'niv', ...at },
      ...[1, 2, 3].map(() => ({
        userId: u,
        translationId: 'bph',
        ...at,
        deletedAt: new Date(),
      })),
      // Another user's marks never count
      ...[1, 2, 3].map(() => ({ userId: other, translationId: 'web', ...at })),
    ]);
    await db
      .insert(annotation)
      .values({ userId: u, translationId: 'niv', ...at });
    const [live, gone] = await db
      .insert(note)
      .values([{ userId: u }, { userId: u, deletedAt: new Date() }])
      .returning({ id: note.id });
    await db
      .insert(noteAnchor)
      .values([
        { noteId: live.id, translationId: 'bph', ...at },
        ...[1, 2].map(() => ({ noteId: gone.id, translationId: 'bph', ...at })),
      ]);
    liveNote = live.id;
  });

  afterAll(async () => {
    for (const id of ids) await db.delete(user).where(eq(user.id, id));
  });

  it('is the translation with the most live marks', async () => {
    expect(await store.markedTranslationId(ids[0])).toBe('niv');
    expect(await store.markedTranslationId(ids[1])).toBe('web');
  });

  it('counts live note anchors', async () => {
    // Two more BPH anchors on the live note: BPH 3 vs NIV 2
    await db
      .insert(noteAnchor)
      .values(
        [1, 2].map(() => ({ noteId: liveNote, translationId: 'bph', ...at })),
      );
    expect(await store.markedTranslationId(ids[0])).toBe('bph');
  });

  it('is null for an account with no marks', async () => {
    expect(await store.markedTranslationId(randomUUID())).toBeNull();
  });
});
