import { describe, expect, it, vi } from 'vitest';
import type { AuthedRequest } from '../auth/session.guard';
import type { AnnotationsService } from '../annotations/annotations.service';
import type { HighlightsService } from '../highlights/highlights.service';
import type { NotesService } from '../notes/notes.service';
import { TrashController } from './trash.controller';
import { RESTORE_WINDOW_MS } from './purge';

const req = {
  user: { id: 'user-1', email: 'a@b.c', name: '' },
} as AuthedRequest;

describe('TrashController (#261)', () => {
  it("lists the session user's deleted notes, highlights and margin notes", async () => {
    const notes = { listDeleted: vi.fn().mockResolvedValue([{ id: 'n1' }]) };
    const highlights = {
      listDeleted: vi.fn().mockResolvedValue([{ id: 'h1' }]),
    };
    const annotations = { listDeleted: vi.fn().mockResolvedValue([]) };
    const controller = new TrashController(
      notes as unknown as NotesService,
      highlights as unknown as HighlightsService,
      annotations as unknown as AnnotationsService,
    );
    expect(await controller.list(req)).toEqual({
      notes: [{ id: 'n1' }],
      highlights: [{ id: 'h1' }],
      annotations: [],
    });
    expect(notes.listDeleted).toHaveBeenCalledWith('user-1');
    expect(highlights.listDeleted).toHaveBeenCalledWith('user-1');
    expect(annotations.listDeleted).toHaveBeenCalledWith('user-1');
  });

  it('keeps deleted study 30 days, not an hour', () => {
    expect(RESTORE_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
