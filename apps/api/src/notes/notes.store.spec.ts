import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { formatScriptureHref } from '@biblestdy/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { user } from '../db/auth-schema';
import { annotation, highlight } from '../db/schema';
import { NotesService } from './notes.service';
import { DrizzleNoteStore } from './notes.store';

/**
 * DrizzleNoteStore against the DEV database (#216): the note_ref mark
 * columns (2026-11-17-note-ref-mark.sql) and the join that says where a
 * tagged mark lives. A throwaway user, deleted after (its rows cascade).
 * Runs only when DATABASE_URL names a dev/test database; skipped in CI.
 */
const url = process.env.DATABASE_URL ?? '';
const devDb = /\/[\w-]+_(dev|test)(\?|$)/.test(url);

describe.runIf(devDb)('Postgres note store: mark-tagged refs', () => {
  const ids = [randomUUID(), randomUUID()];
  const svc = new NotesService(new DrizzleNoteStore());
  const at = { book: 'JHN', chapter: 3, startWord: 0, endWord: 2 };

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, ids));
  });

  it('stores mark_kind/mark_id; live marks name their translation, erased or foreign ones null', async () => {
    const [me, other] = ids;
    for (const id of ids)
      await db
        .insert(user)
        .values({ id, name: 't', email: `${id}@test.invalid` });
    const [hl] = await db
      .insert(highlight)
      .values({
        userId: me,
        translationId: 'WEB',
        ...at,
        startVerse: 16,
        endVerse: 16,
      })
      .returning();
    const [pen] = await db
      .insert(annotation)
      .values({
        userId: me,
        translationId: 'BPH',
        ...at,
        startVerse: 3,
        endVerse: 3,
      })
      .returning();
    const [foreign] = await db
      .insert(highlight)
      .values({
        userId: other,
        translationId: 'WEB',
        ...at,
        startVerse: 17,
        endVerse: 17,
      })
      .returning();
    const body = [
      `[a](bible:JHN.3.16 "mark:hl:${hl.id}")`,
      `[b](bible:JHN.3.3 "mark:pen:${pen.id}")`,
      `[c](bible:JHN.3.17 "mark:hl:${foreign.id}")`,
      `[d](bible:JHN.3.18)`,
    ].join(' ');
    const note = await svc.create(me, { body });
    expect(
      note.refs.map((r) => [formatScriptureHref(r), r.mark ?? null]),
    ).toEqual([
      [
        'bible:JHN.3.16',
        { kind: 'highlight', id: hl.id, translationId: 'WEB' },
      ],
      [
        'bible:JHN.3.3',
        { kind: 'annotation', id: pen.id, translationId: 'BPH' },
      ],
      [
        'bible:JHN.3.17',
        { kind: 'highlight', id: foreign.id, translationId: null },
      ],
      ['bible:JHN.3.18', null],
    ]);

    // Erased (soft delete): the ref stays, its mark's home is gone
    await db
      .update(highlight)
      .set({ deletedAt: new Date() })
      .where(eq(highlight.id, hl.id));
    const [listed] = await svc.listForChapter(me, 'WEB', 'JHN', 3);
    expect(listed.refs[0].mark).toEqual({
      kind: 'highlight',
      id: hl.id,
      translationId: null,
    });
    // Undo of the erase brings it back
    await db
      .update(highlight)
      .set({ deletedAt: null })
      .where(eq(highlight.id, hl.id));
    const [back] = await svc.listAll(me);
    expect(back.refs[0].mark?.translationId).toBe('WEB');

    // An old body (no titles) stores no mark
    const plain = await svc.update(me, note.id, {
      body: '[a](bible:JHN.3.16)',
    });
    expect(plain?.refs.map((r) => r.mark ?? null)).toEqual([null]);
  });
});
