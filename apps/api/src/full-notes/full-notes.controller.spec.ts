import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { FullNote } from '@biblestdy/shared';
import type { AuthedRequest } from '../auth/session.guard';
import { FullNotesController } from './full-notes.controller';
import type { FullNotesService } from './full-notes.service';

const req = {
  user: { id: 'user-1', email: 'a@b.c', name: '' },
} as AuthedRequest;

function make(overrides: Partial<FullNotesService> = {}) {
  const service = {
    listForChapter: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
  return { service, controller: new FullNotesController(service) };
}

describe('FullNotesController', () => {
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

  it('creates an empty document on the anchor', async () => {
    const created = { id: 'f1', title: '', body: '' } as FullNote;
    const { service, controller } = make({
      create: vi.fn().mockResolvedValue(created),
    });
    const dto = {
      translationId: 'WEB',
      book: 'JHN',
      chapter: 3,
      startVerse: 16,
      startWord: 0,
      endVerse: 17,
      endWord: 4,
    };
    expect(await controller.create(req, dto)).toBe(created);
    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('updates title and body', async () => {
    const updated = { id: 'f1', title: 'Grace', body: '# Grace' } as FullNote;
    const { service, controller } = make({
      update: vi.fn().mockResolvedValue(updated),
    });
    const dto = { title: 'Grace', body: '# Grace' };
    expect(await controller.update(req, 'f1', dto)).toBe(updated);
    expect(service.update).toHaveBeenCalledWith('user-1', 'f1', dto);
  });

  it('rejects an empty update', async () => {
    const { controller } = make();
    await expect(controller.update(req, 'f1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s updating a document the user does not own', async () => {
    const { controller } = make({ update: vi.fn().mockResolvedValue(null) });
    await expect(controller.update(req, 'nope', { body: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s deleting a document the user does not own', async () => {
    const { controller } = make({ remove: vi.fn().mockResolvedValue(false) });
    await expect(controller.remove(req, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});
