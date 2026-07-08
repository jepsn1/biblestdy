import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '@biblestdy/shared';
import type { AuthedRequest } from '../auth/session.guard';
import { NotesController } from './notes.controller';
import type { NotesService } from './notes.service';

const req = {
  user: { id: 'user-1', email: 'a@b.c', name: '' },
} as AuthedRequest;

function make(overrides: Partial<NotesService> = {}) {
  const service = {
    listForChapter: vi.fn(),
    create: vi.fn(),
    updateText: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
  return { service, controller: new NotesController(service) };
}

describe('NotesController', () => {
  it('lists scoped to the session user', async () => {
    const { service, controller } = make({
      listForChapter: vi.fn().mockResolvedValue([]),
    });
    await controller.list(req, 'WEB', 'JHN', '3');
    expect(service.listForChapter).toHaveBeenCalledWith(
      'user-1',
      'WEB',
      'JHN',
      3,
    );
  });

  it('rejects a list request missing params', async () => {
    const { controller } = make();
    await expect(controller.list(req, '', 'JHN', '3')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates a note for the session user', async () => {
    const created = { id: 'n1' } as Note;
    const { service, controller } = make({
      create: vi.fn().mockResolvedValue(created),
    });
    const dto = {
      translationId: 'WEB',
      text: 'a thought',
      book: 'JHN',
      chapter: 3,
      startVerse: 16,
      startWord: 0,
      endVerse: 16,
      endWord: 2,
    };
    expect(await controller.create(req, dto)).toBe(created);
    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('updates an owned note', async () => {
    const updated = { id: 'n1', text: 'edited' } as Note;
    const { service, controller } = make({
      updateText: vi.fn().mockResolvedValue(updated),
    });
    expect(await controller.update(req, 'n1', { text: 'edited' })).toBe(
      updated,
    );
    expect(service.updateText).toHaveBeenCalledWith('user-1', 'n1', 'edited');
  });

  it('404s updating a note the user does not own', async () => {
    const { controller } = make({
      updateText: vi.fn().mockResolvedValue(null),
    });
    await expect(controller.update(req, 'nope', { text: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s deleting a note the user does not own', async () => {
    const { controller } = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(controller.remove(req, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});
